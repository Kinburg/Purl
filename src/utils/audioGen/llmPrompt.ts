import type { Project, Scene } from '../../types';
import { generateText } from '../llm';
import { buildSceneContext } from '../llm/promptBuilder';
import type { LLMProvider, LLMMode } from '../llm';
import { getCharacterIdsInScene, type LlmOptions } from '../llm/genShared';

export type { LLMProvider };
export type { LlmOptions };

function buildLyricsUserPrompt(currentText: string, mode: LLMMode): string {
  const trimmed = currentText.trim();

  if (mode === 'rephrase') {
    return `Improve and refine the following song lyrics. Keep the same intent. Return ONLY the improved song lyrics.\n\nOriginal:\n${trimmed}`;
  }

  if (mode === 'continue' && trimmed) {
    return `Expand and complete the following song lyrics. Return ONLY the full expanded song lyrics.\n\nCurrent:\n${trimmed}`;
  }

  if (trimmed) {
    return `Generate song lyrics based on the following creative direction.\n\nCreative direction:\n${trimmed}`;
  }

  return 'Generate song lyrics that fit the scene context provided in the system prompt.';
}

// ─── Format / convert existing text → ACE Step style line ──────────────────

/**
 * Takes ANY text describing musical style (prose, paragraph, mixed wording)
 * and rewrites it as a single comma-separated ACE Step v1.5 descriptor line.
 *
 * This is the ONLY LLM action for the style field — it covers both
 * "generate from scratch" (when input is empty) and "tidy up my draft"
 * (when input has content), so the older Continue/Rephrase/Hint trio was
 * removed as redundant.
 *
 * If `currentPrompt` is empty, falls back to producing a fresh style based on
 * scene context.
 */
export async function formatAudioStyleForAceStep(
  options: LlmOptions,
  project: Project,
  scene: Scene,
  blockId: string,
  currentPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = currentPrompt.trim();

  const sysParts: string[] = [
    'You are a converter from arbitrary musical-style descriptions into the exact format ACE Step v1.5 expects.',
    'Input may be prose, a paragraph, a mixed list — anything that describes how music should sound.',
    'Output: a single line of COMMA-SEPARATED descriptors (NOT prose, NOT sentences). Each descriptor 1–3 words.',
    '',
    'Cover the four dimensions, in any order:',
    '  GENRE       — lo-fi hip hop, synthwave, cinematic orchestral, folk acoustic, indie pop…',
    '  INSTRUMENTS — mellow piano, fingerpicked guitar, brass section, distorted synth…',
    '  VOCALS      — male vocals, female vocals, instrumental, choir, no vocals',
    '  MOOD/TEMPO  — melancholic, uplifting, intimate, slow tempo, mid-tempo, energetic',
    '',
    'Aim for 4–8 descriptors total. Preserve the original musical intent — do NOT invent new genres or instruments not implied by the input.',
    'Drop filler ("high quality", "studio recording", "professional"). Drop BPM/duration/key (separate fields).',
    'Output ONLY the comma-separated line in English. No markdown, no quotes, no preamble.',
    '',
    'Examples:',
    '  INPUT: "I want something calm with piano, like elevator music"',
    '  OUTPUT: easy listening, smooth jazz, mellow piano, soft strings, slow tempo, instrumental',
    '',
    '  INPUT: "epic battle music with a lot of drums and brass"',
    '  OUTPUT: cinematic orchestral, intense drums, brass section, strings, fast tempo, dramatic, instrumental',
    '',
    '  INPUT: "lo-fi hip-hop beats to study to with that classic 90s vibe"',
    '  OUTPUT: lo-fi hip hop, mellow piano, vinyl crackle, jazz samples, slow tempo, instrumental',
  ];

  if (project.lore?.trim()) {
    sysParts.push(`World/Setting (for empty-input fallback only):\n${project.lore.trim()}`);
  }

  const context = buildSceneContext(scene, project.characters, blockId);
  if (context) {
    sysParts.push(`Scene narrative context (for empty-input fallback only):\n${context}`);
  }

  const systemPrompt = sysParts.join('\n\n');

  const userPrompt = trimmed
    ? `INPUT: ${trimmed}\nOUTPUT:`
    : 'Generate an ACE Step style descriptor line that fits the scene context above.';

  const strippedProject = { ...project, lore: '' };
  const dummyScene: Scene = { id: '__audio_format__', name: '', tags: [], blocks: [] };

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
    'hint',
    signal,
    undefined,
    options.apiKey,
  );
  return (result ?? '').trim();
}

// ─── Lyrics (ACE Step v1.5) ──────────────────────────────────────────────────

/**
 * Generates SONG LYRICS for ACE Step v1.5.
 *
 * Output uses the standard section markers `[Verse 1]`, `[Chorus]`, `[Verse 2]`,
 * `[Bridge]`, etc. Each section is a few short lines. No style descriptors, no
 * BPM, no production notes — only the lyrics themselves.
 */
export async function generateLyricsWithLlm(
  options: LlmOptions,
  project: Project,
  scene: Scene,
  blockId: string,
  currentLyrics: string,
  llmMode: LLMMode = 'hint',
  stylePrompt: string = '',
  signal?: AbortSignal,
): Promise<string> {
  const sysParts: string[] = [
    'You are a songwriter writing lyrics for ACE Step v1.5 music generation.',
    'Format the output with standard section markers, each on its own line:',
    '  [Verse 1]',
    '  ...3-6 short lines...',
    '  [Chorus]',
    '  ...3-6 short lines...',
    '  [Verse 2]',
    '  ...3-6 short lines...',
    '  [Chorus]',
    '  ...3-6 short lines...',
    'You may also use [Bridge], [Pre-Chorus], [Outro] when appropriate.',
    'Keep each lyric line short (5-12 words). Use natural rhyme and rhythm.',
    'Do NOT include style descriptors, BPM, production notes, or stage directions in the lyrics.',
    'Output ONLY the lyrics text with section markers. No commentary, no markdown.',
  ];

  if (stylePrompt.trim()) {
    sysParts.push(`Musical style for context (do not repeat in lyrics):\n${stylePrompt.trim()}`);
  }

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
  const effectiveMode: LLMMode = llmMode === 'continue' && !currentLyrics.trim() ? 'hint' : llmMode;
  const userPrompt = buildLyricsUserPrompt(currentLyrics, effectiveMode);

  const strippedProject = { ...project, lore: '' };
  const dummyScene: Scene = { id: '__audio_lyrics__', name: '', tags: [], blocks: [] };

  const result = await generateText(
    options.provider,
    options.urlOrApiKey,
    options.model,
    systemPrompt,
    strippedProject,
    dummyScene,
    '__no_block__',
    currentLyrics,
    // Use larger token budget for lyrics — they're naturally longer than style prompts.
    { maxTokens: Math.max(options.maxTokens, 600), temperature: options.temperature, filterThought: true, rawUserPrompt: userPrompt },
    effectiveMode,
    signal,
    undefined,
    options.apiKey,
  );
  return (result ?? '').trim();
}
