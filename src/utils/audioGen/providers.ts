import {
  type ComfyProgress,
  buildComfyViewUrl,
  normalizeBaseUrl,
  runComfyWorkflow,
  withTemplateInjected,
} from '../comfy/client';

export interface AudioGenerateParams {
  baseUrl: string;
  workflow: Record<string, any>;
  /**
   * Already-joined tag string sent to the workflow's `${tags}` slot.
   * For ACE Step: `"${stylePrompt}. ${tag1}, ${tag2}"`.
   */
  tags?: string;
  lyrics?: string;
  seed?: number;
  duration?: number;
  bpm?: number;
  onProgress?: (progress: ComfyProgress) => void;
}

export interface AudioGenerateResult {
  audioUrl: string;
  /** Best-effort detected extension (e.g. "mp3", "wav", "flac"). */
  extHint?: string;
}

/**
 * Pull the first audio output from a ComfyUI execution result.
 * Looks for `out.audio` (SaveAudio / SaveAudioMP3 / SaveAudioOPUS),
 * `out.audios` (alternate node naming) and `out.audio_files` fallback.
 */
function extractFirstAudio(outputs: Record<string, any>): { filename: string; subfolder?: string; type?: string } | null {
  for (const out of Object.values(outputs)) {
    if (!out || typeof out !== 'object') continue;
    const candidates = [out.audio, out.audios, out.audio_files];
    for (const list of candidates) {
      if (Array.isArray(list) && list.length > 0) {
        const first = list[0];
        if (first?.filename) return first;
      }
    }
  }
  return null;
}

function detectAudioExt(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : 'mp3';
}

async function generateWithComfy(params: AudioGenerateParams, signal?: AbortSignal): Promise<AudioGenerateResult> {
  const baseUrl = normalizeBaseUrl(params.baseUrl || 'http://127.0.0.1:8188');
  const promptWorkflow = withTemplateInjected(params.workflow, {
    tags: params.tags,
    lyrics: params.lyrics,
    seed: params.seed,
    duration: params.duration,
    bpm: params.bpm,
  });

  console.log('[AudioGen] Submitting prompt to ComfyUI:', promptWorkflow);

  const audio = await runComfyWorkflow(baseUrl, promptWorkflow, extractFirstAudio, params.onProgress, signal);
  return {
    audioUrl: buildComfyViewUrl(baseUrl, audio),
    extHint: detectAudioExt(audio.filename),
  };
}

/** Reserved for future provider support — currently only ComfyUI is wired up. */
export type AudioGenProvider = 'comfyui';

export async function generateAudioWithProvider(
  provider: AudioGenProvider,
  params: AudioGenerateParams,
  signal?: AbortSignal,
): Promise<AudioGenerateResult> {
  if (provider === 'comfyui') return generateWithComfy(params, signal);
  throw new Error(`Unsupported audio provider: ${provider}`);
}

