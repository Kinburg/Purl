import {GoogleGenAI, ThinkingLevel, type ThinkingConfig, HarmCategory, HarmBlockThreshold} from '@google/genai';
import type {Project, Scene} from '../../types';
import type {LLMProviderImpl, ProviderConfig, GenerationParams, LLMMode, GeminiModel} from './types';
import {constructGenerationPrompt} from './promptBuilder';
import {filterThought} from './utils';

export const geminiProvider: LLMProviderImpl = {
    async generate(
        config: ProviderConfig,
        systemPrompt: string,
        project: Project,
        scene: Scene,
        blockId: string,
        currentValue: string,
        params: GenerationParams,
        mode: LLMMode,
        signal?: AbortSignal,
        onChunk?: (accumulated: string) => void
    ): Promise<string> {
        const ai = new GoogleGenAI({apiKey: config.apiKey});
        const modelName = config.model.startsWith('models/') ? config.model.slice(7) : config.model;

        let sysInstruction: string;
        let userContent: string;

        if (params.rawUserPrompt) {
            sysInstruction = systemPrompt.trim();
            userContent = params.rawUserPrompt;
        } else {
            const structured = constructGenerationPrompt(systemPrompt, project, scene, blockId, currentValue, mode, params.translationLanguage);
            sysInstruction = structured.systemInstruction;
            userContent = structured.userPrompt;
        }

        // Gemini models use thinkingBudget, Gemma models use thinkingLevel
        const thinkingConfig: ThinkingConfig = modelName.includes('gemma')
            ? {includeThoughts: false, thinkingLevel: ThinkingLevel.MINIMAL}
            : {includeThoughts: false, thinkingBudget: 0};

        const requestConfig = {
            model: modelName,
            contents: userContent,
            safetySettings: {
                category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
                threshold: HarmBlockThreshold.OFF,
            },
            config: {
                systemInstruction: sysInstruction,
                maxOutputTokens: params.maxTokens,
                temperature: params.temperature,
                topP: 0.95,
                topK: 40,
                thinkingConfig,
            },
        };

        try {
            const prefix = mode === 'continue' ? currentValue.trim() : '';
            let accumulated = '';

            const stream = await ai.models.generateContentStream(requestConfig);

            for await (const chunk of stream) {
                if (signal?.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }
                const text = chunk.text ?? '';
                accumulated += text;
                onChunk?.(prefix + accumulated);
            }

            let generatedText = accumulated;

            if (params.filterThought) {
                generatedText = filterThought(generatedText);
            }

            return prefix ? prefix + " " + generatedText : generatedText;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return "";
            }
            console.error("Failed to generate text from Gemini:", error);
            throw error;
        }
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async abort(_config: ProviderConfig): Promise<void> {
        console.log("Abort request for Gemini is handled by AbortController.");
    }
};

// Known free / free-with-limits Gemini model name fragments (lowercase, without 'models/' prefix).
// Used for UI grouping — not authoritative, just best-effort.
const FULLY_FREE_FRAGMENTS = ['flash-lite', 'flash-8b', 'gemma'];
const FREE_LIMITED_FRAGMENTS = ['flash'];

export type GeminiModelTier = 'free' | 'free-limited' | 'paid' | 'experimental';

export interface GeminiModelWithTier extends GeminiModel {
    tier: GeminiModelTier;
}

export function classifyModel(name: string): GeminiModelTier {
    const key = name.replace('models/', '').toLowerCase();
    if (key.includes('exp') || key.includes('preview') || key.includes('latest')) return 'experimental';
    if (FULLY_FREE_FRAGMENTS.some(f => key.includes(f))) return 'free';
    if (FREE_LIMITED_FRAGMENTS.some(f => key.includes(f))) return 'free-limited';
    return 'paid';
}

// Name fragments that identify non-text-generation models to exclude.
const NON_TEXT_FRAGMENTS = [
    'embed',      // text-embedding-*, embedding-*
    'imagen',     // image generation
    'veo',        // video generation
    'lyria',      // music generation
    'music',      // any other music models
    'aqa',        // attributed question answering (retrieval, not generative)
    'tts',        // text-to-speech
    'transcri',   // transcription / speech-to-text
    'audio',      // audio processing models
    'nano',       // on-device only, not callable via API
    'banana',     // internal/experimental non-text codename
];

// Only include models from known text-generation families.
const TEXT_MODEL_PREFIXES = ['gemini-', 'gemma-', 'learnlm', 'text-'];

/** Returns true for text-generation models only (excludes embeddings, image, video, audio, etc.) */
function isTextGenerationModel(name: string): boolean {
    const key = (name ?? '').replace('models/', '').toLowerCase();
    if (NON_TEXT_FRAGMENTS.some(f => key.includes(f))) return false;
    return TEXT_MODEL_PREFIXES.some(p => key.startsWith(p));
}

/**
 * Fetches available text-generation models from Gemini API.
 * Filters out embeddings, image-gen, and other non-text models.
 * Returns models annotated with a billing tier for UI grouping.
 */
export async function fetchGeminiModels(apiKey: string): Promise<GeminiModelWithTier[]> {
    try {
        const ai = new GoogleGenAI({apiKey});
        const pager = await ai.models.list({config: {pageSize: 100}});

        const models: GeminiModelWithTier[] = [];
        for await (const model of pager) {
            const actions = model.supportedActions ?? [];
            const name = model.name ?? '';
            if (actions.includes('generateContent') && isTextGenerationModel(name)) {
                models.push({
                    name,
                    version: model.version ?? '',
                    displayName: model.displayName ?? name.replace('models/', ''),
                    description: model.description ?? '',
                    supportedGenerationMethods: actions,
                    tier: classifyModel(name),
                });
            }
        }
        return models;
    } catch (error) {
        console.error("Error fetching Gemini models:", error);
        throw error;
    }
}
