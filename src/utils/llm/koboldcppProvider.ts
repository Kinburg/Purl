import type {Project, Scene} from '../../types';
import type {LLMProviderImpl, ProviderConfig, GenerationParams, LLMMode} from './types';
import {constructGenerationPrompt} from './promptBuilder';
import {filterThought} from './utils';

interface KoboldGenerateRequest {
    prompt: string;
    max_length?: number;
    max_context_length?: number;
    temperature?: number;
    top_p?: number;
    [key: string]: any;
}

interface KoboldGenerateResponse {
    results: { text: string }[];
}

/**
 * Parses KoboldCPP SSE stream and yields tokens.
 * KoboldCPP with stream:true sends `data: {"token": "..."}` lines.
 */
async function* parseSSEStream(
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
                if (!payload) continue;
                try {
                    const data = JSON.parse(payload);
                    if (data.token !== undefined) {
                        yield data.token;
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

export const koboldcppProvider: LLMProviderImpl = {
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
        let fullPrompt: string;

        if (params.rawUserPrompt) {
            fullPrompt = `${systemPrompt.trim()}\n\n${params.rawUserPrompt}`;
        } else {
            const structured = constructGenerationPrompt(systemPrompt, project, scene, blockId, currentValue, mode, params.translationLanguage);
            fullPrompt = `${structured.systemInstruction}\n\n${structured.userPrompt}`;
            if (mode === 'continue') {
                fullPrompt += structured.continuationPrefix;
            }
        }

        const requestBody: KoboldGenerateRequest = {
            prompt: fullPrompt,
            max_length: params.maxTokens,
            temperature: params.temperature,
            top_p: 0.95,
            typical_p: 1,
            typical: 1,
            min_p: 0.05,
            repetition_penalty: 1.1,
            frequency_penalty: 0,
            presence_penalty: 0,
            top_k: 40,
            skew: 0,
            min_length: 0,
            min_tokens: 0,
            num_beams: 1,
            length_penalty: 1,
            early_stopping: false,
            add_bos_token: true,
            smoothing_factor: 0,
            smoothing_curve: 1,
            dry_allowed_length: 2,
            dry_multiplier: 1.25,
            dry_base: 1.75,
            dry_sequence_breakers: "[\"\\n\",\":\",\"\\\"\",\"*\"]",
            dry_penalty_last_n: 0,
            max_tokens_second: 0,
            sampler_priority: [
                "repetition_penalty",
                "presence_penalty",
                "frequency_penalty",
                "dry",
                "temperature",
                "dynamic_temperature",
                "quadratic_sampling",
                "top_n_sigma",
                "top_k",
                "top_p",
                "typical_p",
                "epsilon_cutoff",
                "eta_cutoff",
                "tfs",
                "top_a",
                "min_p",
                "mirostat",
                "xtc",
                "encoder_repetition_penalty",
                "no_repeat_ngram"
            ],
            truncation_length: 8192,
            ban_eos_token: false,
            skip_special_tokens: true,
            include_reasoning: false,
            top_a: 0,
            tfs: 1,
            epsilon_cutoff: 0,
            eta_cutoff: 0,
            mirostat_mode: 0,
            mirostat_tau: 5,
            mirostat_eta: 0.1,
            custom_token_bans: "",
            banned_strings: [],
            api_type: "ooba",
            api_server: "http://127.0.0.1:5001/",
            xtc_threshold: 0.1,
            xtc_probability: 0,
            nsigma: 0,
            top_n_sigma: 0,
            min_keep: 0,
            adaptive_target: -0.01,
            adaptive_decay: 0.9,
            rep_pen: 1.1,
            rep_pen_range: 0,
            repetition_penalty_range: 0,
            encoder_repetition_penalty: 1,
            no_repeat_ngram_size: 0,
            penalty_alpha: 0,
            temperature_last: true,
            do_sample: true,
            guidance_scale: 1,
            negative_prompt: "",
            repeat_penalty: 1.1,
            repeat_last_n: 0,
            n_predict: 200,
            num_predict: 200,
            num_ctx: 8192,
            mirostat: 0,
            ignore_eos: false,
            n_probs: 10,
            rep_pen_slope: 1,
            stream: true
        };

        try {
            const response = await fetch(config.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal
            });

            if (!response.ok) {
                throw new Error(`KoboldCPP API error: ${response.statusText}`);
            }

            const prefix = mode === 'continue' ? currentValue.trim() : '';
            let accumulated = '';

            // Try streaming if body is available
            if (response.body && onChunk) {
                const reader = response.body.getReader();
                for await (const token of parseSSEStream(reader, signal)) {
                    accumulated += token;
                    onChunk(prefix + accumulated);
                }
            } else {
                // Fallback: read as JSON (non-streaming)
                const data: KoboldGenerateResponse = await response.json();
                accumulated = data.results[0]?.text || "";
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
            console.error("Failed to generate text from KoboldCPP:", error);
            throw error;
        }
    },

    async abort(config: ProviderConfig): Promise<void> {
        try {
            const url = new URL(config.url);
            const abortUrl = `${url.protocol}//${url.host}/api/extra/abort`;

            await fetch(abortUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
        } catch (e) {
            console.error("Failed to send abort request to KoboldCPP:", e);
        }
    }
};
