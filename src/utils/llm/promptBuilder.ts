import type {Scene, Character, Project} from '../../types';
import type {LLMMode, StructuredPrompt} from './types';

/**
 * Builds context from scene blocks up to the specified target block.
 * Concatenates text and dialogue content.
 */
export function buildSceneContext(scene: Scene, characters: Character[], targetBlockId: string): string {
    let context = "";

    for (const block of scene.blocks) {
        if (block.id === targetBlockId) break;

        if (block.type === 'text') {
            context += block.content + "\n\n";
        } else if (block.type === 'dialogue') {
            const char = characters.find(c => c.id === block.characterId);
            const name = char ? char.name : "???";
            context += `${name}: ${block.text}\n\n`;
        }
    }

    return context.trim();
}

/**
 * Constructs a structured prompt for LLM generation.
 * Returns separate system instruction, user prompt, and continuation prefix
 * so that each provider can use them appropriately.
 */
export function constructGenerationPrompt(
    systemPrompt: string,
    project: Project,
    scene: Scene,
    blockId: string,
    currentValue: string,
    mode: LLMMode,
    translationLanguage?: string
): StructuredPrompt {
    const context = buildSceneContext(scene, project.characters, blockId);
    const targetBlock = scene.blocks.find(b => b.id === blockId);

    // --- System Instruction: system prompt + lore + character info ---
    let systemInstruction = systemPrompt.trim();

    if (project.lore) {
        systemInstruction += `\n\n### Story Lore:\n${project.lore}`;
    }

    if (targetBlock?.type === 'dialogue') {
        const char = project.characters.find(c => c.id === targetBlock.characterId);
        if (char) {
            systemInstruction += `\n\n### Character Info:\nName: ${char.name}`;
            if (char.llm_descr) {
                systemInstruction += `\nPersonality/Description: ${char.llm_descr}`;
            }
        }
    }

    // --- User Prompt: context + task ---
    let userPrompt = "";

    if (context) {
        userPrompt += `### Story Context (Previous events):\n${context}\n\n`;
    }

    userPrompt += `### Current Task:\n`;

    // Block-type-specific writing style instruction
    let styleInstruction: string;
    if (targetBlock?.type === 'dialogue') {
        const char = project.characters.find(c => c.id === targetBlock?.characterId);
        const charName = char?.name || 'the character';
        styleInstruction = `Write ${charName}'s dialogue line, staying in character. Output only the spoken words — no name prefix, no quotation marks.`;
    } else {
        styleInstruction = `Write narrative prose — no dialogue or direct speech. Focus on actions, surroundings, and plot progression.`;
    }

    // Continuation prefix (used by completion-style models like KoboldCPP)
    let continuationPrefix = "";

    if (mode === 'translate') {
        const lang = translationLanguage?.trim() || 'English';
        userPrompt += `Translate the following text to ${lang}. Return ONLY the translated text, preserving the original formatting.\n\nText to translate:\n${currentValue.trim()}\n`;
    } else if (mode === 'rephrase') {
        userPrompt += `Rephrase, improve, and enrich the following text — add vivid details where appropriate. `;
        if (targetBlock?.type === 'dialogue') {
            userPrompt += `Make sure the speech strictly matches the character's personality and style. `;
        }
        userPrompt += styleInstruction;
        userPrompt += ` Return ONLY the improved text.\n\nOriginal text:\n${currentValue.trim()}\n`;
    } else if (mode === 'hint') {
        userPrompt += `Generate text based on the following creative direction. `;
        userPrompt += styleInstruction;
        userPrompt += ` Return ONLY the generated text.\n\nCreative direction:\n${currentValue.trim()}\n`;
    } else {
        // continue
        userPrompt += `Continue the story seamlessly from the end of the existing text. `;
        userPrompt += styleInstruction;
        userPrompt += ` Match the existing tone and style. Write only new content — do not repeat any of the existing text.\n\n`;
        userPrompt += `### Existing text:\n${currentValue.trim()}\n\n`;
        userPrompt += `### Continuation:\n`;

        continuationPrefix = currentValue.trim();
    }

    return {
        systemInstruction,
        userPrompt,
        continuationPrefix,
    };
}
