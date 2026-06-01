import type {Project, Scene} from '../../types';
import type {LLMProvider, LLMProviderImpl, ProviderConfig, GenerationParams, LLMMode} from './types';
import {koboldcppProvider} from './koboldcppProvider';
import {geminiProvider} from './geminiProvider';
import {openaiProvider} from './openaiProvider';
import {buildTranslatePrompt} from './promptBuilder';

// --- Provider Registry ---

const providers: Record<LLMProvider, LLMProviderImpl> = {
    koboldcpp: koboldcppProvider,
    gemini: geminiProvider,
    openai: openaiProvider,
};

// --- Main Dispatcher ---

/**
 * Dispatches text generation to the appropriate LLM provider.
 */
export async function generateText(
    provider: LLMProvider,
    urlOrApiKey: string,
    model: string,
    systemPrompt: string,
    project: Project,
    scene: Scene,
    blockId: string,
    currentValue: string,
    params: GenerationParams,
    mode: LLMMode = 'continue',
    signal?: AbortSignal,
    onChunk?: (accumulated: string) => void,
    apiKey?: string
): Promise<string> {
    const impl = providers[provider];
    if (!impl) throw new Error(`Unknown LLM provider: ${provider}`);

    const config: ProviderConfig = {
        url: urlOrApiKey,
        apiKey: apiKey ?? urlOrApiKey,
        model,
    };

    return impl.generate(config, systemPrompt, project, scene, blockId, currentValue, params, mode, signal, onChunk);
}

/**
 * Translates a single string to `language` via the active provider.
 * Sets params.rawUserPrompt so providers skip scene-context construction entirely —
 * `project`/`scene` are passed only to satisfy generateText's signature (unused here).
 */
export async function translateString(
    provider: LLMProvider,
    urlOrApiKey: string,
    model: string,
    systemPrompt: string,
    project: Project,
    scene: Scene,
    text: string,
    language: string,
    params: GenerationParams,
    signal?: AbortSignal,
    apiKey?: string
): Promise<string> {
    return generateText(
        provider,
        urlOrApiKey,
        model,
        systemPrompt,
        project,
        scene,
        '',
        '',
        {...params, rawUserPrompt: buildTranslatePrompt(text, language)},
        'translate',
        signal,
        undefined,
        apiKey,
    );
}

/**
 * Sends a stop/abort request to the specified LLM provider.
 */
export async function abortGeneration(provider: LLMProvider, genUrl: string) {
    const impl = providers[provider];
    if (!impl) return;
    await impl.abort({url: genUrl, apiKey: '', model: ''});
}

// --- Re-exports ---

export type {LLMMode, LLMProvider, GeminiModel, GenerationParams, ProviderConfig} from './types';
export {fetchGeminiModels, classifyModel} from './geminiProvider';
export type {GeminiModelWithTier, GeminiModelTier} from './geminiProvider';
export {filterThought} from './utils';
export {buildSceneContext, buildTranslatePrompt} from './promptBuilder';
