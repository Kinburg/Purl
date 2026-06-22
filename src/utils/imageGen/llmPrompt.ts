import type { Project, Scene } from '../../types';
import { generateText } from '../llm';
import { buildSceneContext } from '../llm/promptBuilder';
import type { LLMMode } from '../llm';
import { getCharacterIdsInScene, type LlmOptions } from '../llm/genShared';

export type { LlmOptions };

/** Build a mode-specific user prompt for image prompt generation. */
function buildImageGenUserPrompt(currentPrompt: string, mode: LLMMode): string {
  const trimmed = currentPrompt.trim();

  if (mode === 'rephrase') {
    return `Improve and refine the following image prompt. Make it more vivid and visually specific. Return ONLY the improved prompt.\n\nOriginal prompt:\n${trimmed}`;
  }

  if (mode === 'continue' && trimmed) {
    return `Expand and complete the following image prompt with more visual details. Return ONLY the full expanded prompt.\n\nCurrent prompt:\n${trimmed}`;
  }

  // 'hint' mode, or 'continue' with empty prompt (fresh generation)
  if (trimmed) {
    return `Generate a detailed image prompt based on the following creative direction.\n\nCreative direction:\n${trimmed}`;
  }

  return 'Generate a detailed image prompt for this scene based on the context provided.';
}

/**
 * Generates a text-to-image prompt for a scene illustration using an LLM.
 *
 * @param llmMode  - 'continue' = generate from scratch (or continue if prompt non-empty)
 *                   'rephrase' = improve / rephrase the existing prompt
 *                   'hint'     = use the current prompt as a creative hint
 * @param styleHints - selected style tags; when non-empty, LLM is told NOT to include style
 */
export async function generateImagePromptWithLlm(
  options: LlmOptions,
  project: Project,
  scene: Scene,
  blockId: string,
  currentPrompt: string,
  llmMode: LLMMode = 'hint',
  _styleHints: string[] = [],
  signal?: AbortSignal,
): Promise<string> {
  const sysParts: string[] = [
    'You are an expert at writing text-to-image prompts for visual novel scene illustrations.',
    'Describe a single scene as it would appear in a visual novel CG.',
    'Focus on visual elements only: environment, character appearances, age, gender, poses, facial expressions, clothing, lighting, color palette, camera angle, and composition.',
    'Be specific and concrete — use precise visual details rather than abstract concepts.',
    'Do NOT include any art style, rendering style, or medium descriptions in the prompt — style tags are appended separately by the user.',
    'Keep the prompt between 2–5 sentences.',
    'Output ONLY the prompt text in English. No markdown, no quotes, no commentary.',
  ];

  if (project.lore?.trim()) {
    sysParts.push(`World/Setting:\n${project.lore.trim()}`);
  }

  const charIds = getCharacterIdsInScene(scene, blockId);
  const charsInScene = project.characters.filter(c => charIds.has(c.id) && c.llm_descr?.trim());
  if (charsInScene.length > 0) {
    const charLines = charsInScene.map(c => `  ${c.name}: ${c.llm_descr!.trim()}`).join('\n');
    sysParts.push(`Characters in scene:\n${charLines}`);
  }

  const context = buildSceneContext(scene, project.characters, blockId);
  if (context) {
    sysParts.push(`Scene narrative context:\n${context}`);
  }

  const systemPrompt = sysParts.join('\n\n');

  // For 'continue' mode with an empty field, switch to 'hint' so we get a fresh generation
  const effectiveMode: LLMMode = llmMode === 'continue' && !currentPrompt.trim() ? 'hint' : llmMode;
  const userPrompt = buildImageGenUserPrompt(currentPrompt, effectiveMode);

  // Pass a stripped-down project (context already embedded in systemPrompt above)
  const strippedProject = { ...project, lore: '' };

  // Dummy scene — scene context is already embedded in systemPrompt
  const dummyScene: Scene = { id: '__img_gen__', name: '', tags: [], blocks: [] };

  const result = await generateText(
    options.provider,
    options.urlOrApiKey,
    options.model,
    systemPrompt,
    strippedProject,
    dummyScene,
    '__no_block__',
    currentPrompt,
    { maxTokens: options.maxTokens, temperature: options.temperature, filterThought: true, rawUserPrompt: userPrompt },
    effectiveMode,
    signal,
    undefined,
    options.apiKey,
  );
  return (result ?? '').trim();
}

/**
 * Generates a text-to-image prompt for a character avatar using an LLM.
 * Uses character name + description + world setting as context.
 *
 * @param llmMode        - 'continue' = generate from scratch (or continue if prompt non-empty)
 *                         'rephrase' = improve / rephrase the existing prompt
 *                         'hint'     = use the current prompt as a creative hint
 * @param _styleHints    - reserved (style tags are appended by the user after generation)
 * @param referencePrompt - default slot's generated prompt; when provided the LLM keeps all
 *                          physical descriptors identical and only applies the hint on top
 */
export async function generateAvatarPromptWithLlm(
  options: LlmOptions,
  project: Project,
  charName: string,
  charDescr: string | undefined,
  slotLabel: string,
  currentPrompt: string,
  llmMode: LLMMode = 'hint',
  _styleHints: string[] = [],
  signal?: AbortSignal,
  referencePrompt?: string,
  entityKind: 'character' | 'item' | 'paperdoll-slot' | 'container' = 'character',
): Promise<string> {
  const isDefaultOrStatic = !slotLabel || slotLabel === 'default' || slotLabel === 'static';

  let sysParts: string[];

  if (entityKind === 'paperdoll-slot') {
    sysParts = [
      'You are an expert at writing text-to-image prompts for paperdoll body part illustrations in visual novels.',
      'Write a prompt for a single isolated body part or clothing slot — the kind used in a character outfit/paperdoll overlay system.',
      'Focus on: the specific body region, clothing or skin detail, texture, material, color, lighting, and how it fits the character.',
      'Do NOT describe the full character body — only the relevant slot area.',
      'Do NOT include any art style, rendering style, or medium descriptions — style tags are appended separately by the user.',
      'Keep the prompt between 1–3 sentences.',
      'Output ONLY the prompt text in English. No markdown, no quotes, no commentary.',
    ];
    if (project.lore?.trim()) {
      sysParts.push(`World setting (for visual context): ${project.lore.trim()}`);
    }
    sysParts.push(`Character name: ${charName}`);
    if (charDescr?.trim()) {
      sysParts.push(`Character description: ${charDescr.trim()}`);
    }
    if (isDefaultOrStatic) {
      sysParts.push(`Paperdoll slot: ${slotLabel || 'body part'}. Show the neutral/default state — no special effects or damage.`);
    } else {
      if (referencePrompt?.trim()) {
        sysParts.push(
          'This is a visual variant of the same body part slot.\n' +
          'Keep the base shape and body region IDENTICAL to the reference — only apply the visual change described by the hint.\n' +
          `Reference slot:\n${referencePrompt.trim()}`,
        );
      }
      sysParts.push(`Slot variant: ${slotLabel}`);
    }
  } else if (entityKind === 'container') {
    sysParts = [
      'You are an expert at writing text-to-image prompts for background environments in visual novels and RPGs.',
      'Write a prompt for a background scene used as the backdrop of a container UI — a shop, a chest room, or a loot area.',
      'Focus on: the type of location (tavern, dungeon, market stall, etc.), architectural details, furniture, lighting mood, atmosphere, depth, and color palette.',
      'The scene should feel like a painted background plate — no characters, no UI elements, no text.',
      'Do NOT include any art style, rendering style, or medium descriptions — style tags are appended separately by the user.',
      'Keep the prompt between 2–4 sentences.',
      'Output ONLY the prompt text in English. No markdown, no quotes, no commentary.',
    ];
    if (project.lore?.trim()) {
      sysParts.push(`World setting (for visual context): ${project.lore.trim()}`);
    }
    sysParts.push(`Container name: ${charName}`);
    if (charDescr?.trim()) {
      sysParts.push(`Container description: ${charDescr.trim()}`);
    }
    if (isDefaultOrStatic) {
      sysParts.push('This is the reference/default background. Show the location in its neutral daytime or standard lighting state.');
    } else {
      if (referencePrompt?.trim()) {
        sysParts.push(
          'This is an atmospheric variant of the same background.\n' +
          'Keep the location, architecture, and composition IDENTICAL to the reference — only apply the atmospheric change described by the hint.\n' +
          `Reference background:\n${referencePrompt.trim()}`,
        );
      }
      sysParts.push(`Atmosphere variant: ${slotLabel}`);
    }
  } else if (entityKind === 'item') {
    sysParts = [
      'You are an expert at writing text-to-image prompts for game items and objects.',
      'Write a prompt for an item icon — a clean, well-lit close-up of the object suitable for a game inventory.',
      'Focus on: shape, material, texture, color, surface details, and lighting. No characters or people.',
      'Do NOT include any art style, rendering style, or medium descriptions — style tags are appended separately by the user.',
      'Keep the prompt between 1–3 sentences.',
      'Output ONLY the prompt text in English. No markdown, no quotes, no commentary.',
    ];
    if (project.lore?.trim()) {
      sysParts.push(`World setting (for visual context): ${project.lore.trim()}`);
    }
    sysParts.push(`Item name: ${charName}`);
    if (charDescr?.trim()) {
      sysParts.push(`Item description: ${charDescr.trim()}`);
    }
    if (isDefaultOrStatic) {
      sysParts.push('This is the reference/default state. Show the item in a neutral, clean, well-lit presentation.');
    } else {
      if (referencePrompt?.trim()) {
        sysParts.push(
          'This is a visual variant of the same item.\n' +
          'Keep the item\'s base shape and form IDENTICAL to the reference — only apply the visual change described by the hint.\n' +
          `Reference icon:\n${referencePrompt.trim()}`,
        );
      }
      sysParts.push(`Item variant: ${slotLabel}`);
    }
  } else {
    sysParts = [
      'You are an expert at writing text-to-image prompts for character portraits in visual novels.',
      'Write a prompt for a portrait illustration (head and upper body) suitable as a character avatar.',
      'Focus on: face, facial expression, hairstyle, eye details, skin tone, visible clothing, lighting, and background.',
      'Be specific and concrete — describe exact visual details.',
      'Do NOT include any art style, rendering style, or medium descriptions in the prompt — style tags are appended separately by the user.',
      'Keep the prompt between 2–4 sentences.',
      'Output ONLY the prompt text in English. No markdown, no quotes, no commentary.',
    ];
    if (project.lore?.trim()) {
      sysParts.push(`World setting (for visual context): ${project.lore.trim()}`);
    }
    sysParts.push(`Character name: ${charName}`);
    if (charDescr?.trim()) {
      sysParts.push(`Character description: ${charDescr.trim()}`);
    }
    if (isDefaultOrStatic) {
      sysParts.push('This is the reference/default portrait. The character must have a neutral, expressionless face: mouth closed, lips together and relaxed, jaw unclenched, eyes open and calm. Stoic, blank reference pose — no smile, no raised eyebrows, no emotional expression of any kind.');
    } else {
      if (referencePrompt?.trim()) {
        sysParts.push(
          'This is a variant portrait of the same character.\n' +
          'Keep ALL physical descriptors IDENTICAL to the reference (face shape, hair, skin, clothing, body).\n' +
          'Only change what the hint specifies — typically the facial expression, eye state, or emotional cues.\n' +
          `Reference portrait:\n${referencePrompt.trim()}`,
        );
      }
      sysParts.push(`Avatar variant / emotional state: ${slotLabel}`);
    }
  }

  const systemPrompt = sysParts.join('\n\n');

  const effectiveMode: LLMMode = llmMode === 'continue' && !currentPrompt.trim() ? 'hint' : llmMode;
  const userPrompt = buildImageGenUserPrompt(currentPrompt, effectiveMode);

  // Pass a stripped project — no lore, no characters (context embedded in systemPrompt)
  const strippedProject = { ...project, lore: '', characters: [] };
  const dummyScene: Scene = { id: '__avatar_gen__', name: '', tags: [], blocks: [] };

  const result = await generateText(
    options.provider,
    options.urlOrApiKey,
    options.model,
    systemPrompt,
    strippedProject,
    dummyScene,
    '__no_block__',
    currentPrompt,
    { maxTokens: options.maxTokens, temperature: options.temperature, filterThought: true, rawUserPrompt: userPrompt },
    effectiveMode,
    signal,
    undefined,
    options.apiKey,
  );
  return (result ?? '').trim();
}

/**
 * Expands / improves the story description using an LLM.
 */
export async function expandDescriptionWithLlm(
  options: LlmOptions,
  project: Project,
  currentDescription: string,
  currentLore?: string,
  signal?: AbortSignal,
): Promise<string> {
  const sysParts: string[] = [
    'You are a creative writing assistant helping craft compelling visual novel story descriptions.',
    'Expand and improve the given story description to be more engaging, atmospheric, and evocative.',
    'Keep it concise — 2 to 4 sentences — suitable as a brief blurb or back-cover text.',
    'Output ONLY the improved description. No markdown, no quotes, no preamble.',
  ];

  if (currentLore?.trim()) {
    sysParts.push(`World/Setting context:\n${currentLore.trim()}`);
  }

  const systemPrompt = sysParts.join('\n\n');
  const userPrompt = currentDescription.trim()
    ? `Expand and improve this story description:\n${currentDescription.trim()}`
    : 'Write a compelling story description based on the world context provided.';

  const dummyScene: Scene = { id: '__desc_expand__', name: '', tags: [], blocks: [] };

  const result = await generateText(
    options.provider, options.urlOrApiKey, options.model,
    systemPrompt, project, dummyScene, '__no_block__', currentDescription,
    { maxTokens: options.maxTokens, temperature: options.temperature, filterThought: true, rawUserPrompt: userPrompt },
    'hint', signal, undefined, options.apiKey,
  );
  return (result ?? '').trim();
}

/**
 * Generates lore / world-building notes from a story description using an LLM.
 */
export async function generateLoreFromDescriptionWithLlm(
  options: LlmOptions,
  project: Project,
  description: string,
  currentLore?: string,
  signal?: AbortSignal,
): Promise<string> {
  const sysParts: string[] = [
    'You are a world-building assistant for visual novel authors.',
    'Based on the story description, generate detailed notes about the world, setting, atmosphere, and key narrative facts.',
    'Cover: setting/location, time period, tone, key factions or entities, relevant backstory, and facts that would help an AI generate scene descriptions or images.',
    'Be concrete and specific. Write 3–6 short paragraphs or a concise structured list.',
    'Output ONLY the lore notes. No meta commentary.',
  ];

  const systemPrompt = sysParts.join('\n\n');
  const existingPart = currentLore?.trim() ? `\n\nExisting notes (expand or improve):\n${currentLore.trim()}` : '';
  const userPrompt = `Story description:\n${description.trim()}${existingPart}`;

  const dummyScene: Scene = { id: '__lore_gen__', name: '', tags: [], blocks: [] };

  const result = await generateText(
    options.provider, options.urlOrApiKey, options.model,
    systemPrompt, project, dummyScene, '__no_block__', currentLore ?? '',
    { maxTokens: Math.max(options.maxTokens, 600), temperature: options.temperature, filterThought: true, rawUserPrompt: userPrompt },
    'hint', signal, undefined, options.apiKey,
  );
  return (result ?? '').trim();
}
