import type { Scene } from '../../types';
import type { LLMProvider } from './types';

/** Options bag for an LLM text-generation call — shared by the image and audio
 *  prompt builders (imageGen/llmPrompt, audioGen/llmPrompt). */
export interface LlmOptions {
  provider: LLMProvider;
  urlOrApiKey: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

/** Collect unique character IDs that appear as dialogue speakers before the target block. */
export function getCharacterIdsInScene(scene: Scene, targetBlockId: string): Set<string> {
  const ids = new Set<string>();
  for (const block of scene.blocks) {
    if (block.id === targetBlockId) break;
    if (block.type === 'dialogue' && block.characterId) {
      ids.add(block.characterId);
    }
  }
  return ids;
}
