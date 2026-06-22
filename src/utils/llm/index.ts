import type {Project, Scene} from '../../types';
import type {LLMProvider, LLMProviderImpl, ProviderConfig, GenerationParams, LLMMode} from './types';
import {buildTranslatePrompt} from './promptBuilder';

// --- Provider Registry (lazy) ---
//
// Providers are dynamically imported on first use so the heavy @google/genai SDK
// (the gemini provider's dependency, ~279 KB) is NOT pulled into the startup bundle.
// utils/llm is statically reachable from the editor entry, so a static provider
// import would eagerly load the SDK on every launch even when no AI feature is used.
// The dynamic import defers it to the first generation (the lazy LLM-settings modal
// imports geminiProvider directly for its model listing).

async function getProvider(provider: LLMProvider): Promise<LLMProviderImpl> {
    switch (provider) {
        case 'koboldcpp': return (await import('./koboldcppProvider')).koboldcppProvider;
        case 'gemini':    return (await import('./geminiProvider')).geminiProvider;
        case 'openai':    return (await import('./openaiProvider')).openaiProvider;
        default:          throw new Error(`Unknown LLM provider: ${provider}`);
    }
}

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
    const impl = await getProvider(provider);

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
    let impl: LLMProviderImpl;
    try { impl = await getProvider(provider); } catch { return; }
    await impl.abort({url: genUrl, apiKey: '', model: ''});
}

// --- Re-exports ---

export type {LLMMode, LLMProvider, GenerationParams} from './types';
export type {GeminiModelWithTier} from './geminiProvider';
