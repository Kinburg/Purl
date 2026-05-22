import type {Project, Scene} from '../../types';
import type {LLMProviderImpl, ProviderConfig, GenerationParams, LLMMode} from './types';
import {constructGenerationPrompt} from './promptBuilder';
import {filterThought} from './utils';

/**
 * Parses OpenAI-compatible SSE stream (works with OpenAI, Ollama, LM Studio, etc.)
 * Format: `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`
 * Ends with: `data: [DONE]\n\n`
 */
async function* parseOpenAISSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    signal?: AbortSignal
): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            if (signal?.aborted) break;
            const {done, value} = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, {stream: true});
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') return;
                if (!payload) continue;
                try {
                    const data = JSON.parse(payload);
                    const content = data.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
                    }
                } catch {
                    // skip malformed JSON chunks
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

export const openaiProvider: LLMProviderImpl = {
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

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const requestBody = {
            model: config.model,
            messages: [
                {role: 'system', content: sysInstruction},
                {role: 'user', content: userContent},
            ],
            max_tokens: params.maxTokens,
            temperature: params.temperature,
            top_p: 0.95,
            stream: true,
        };

        try {
            const response = await fetch(config.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.statusText} ${JSON.stringify(errorData)}`);
            }

            const prefix = mode === 'continue' ? currentValue.trim() : '';
            let accumulated = '';

            if (response.body) {
                const reader = response.body.getReader();
                for await (const token of parseOpenAISSEStream(reader, signal)) {
                    accumulated += token;
                    onChunk?.(prefix + accumulated);
                }
            } else {
                // Fallback: non-streaming response
                const data = await response.json();
                accumulated = data.choices?.[0]?.message?.content ?? '';
            }

            let generatedText = accumulated;

            if (params.filterThought) {
                generatedText = filterThought(generatedText);
            }

            return prefix ? prefix + generatedText : generatedText;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return "";
            }
            console.error("Failed to generate text from OpenAI-compatible API:", error);
            throw error;
        }
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async abort(_config: ProviderConfig): Promise<void> {
        console.log("Abort request for OpenAI-compatible API is handled by AbortController.");
    }
};
