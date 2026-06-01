/**
 * Preset languages offered in the "Story language" combobox (Project Settings → General).
 * These are the AI-translation *targets*; the field also accepts free text for any other language.
 *
 * Values are English language names — that's what the LLM prompt consumes ("Translate ... to X").
 */
export const PRESET_TRANSLATION_LANGUAGES: readonly string[] = [
  'English', 'Ukrainian', 'German', 'French', 'Spanish', 'Italian',
  'Polish', 'Portuguese', 'Chinese', 'Japanese', 'Korean', 'Turkish', 'Arabic',
];
