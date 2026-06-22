import {
  type ComfyProgress,
  buildComfyViewUrl,
  normalizeBaseUrl,
  runComfyWorkflow,
  withTemplateInjected,
  pickOutputFile,
} from '../comfy/client';

export type { ComfyProgress };

export interface VideoGenerateParams {
  baseUrl: string;
  workflow: Record<string, any>;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  genWidth?: number;
  genHeight?: number;
  duration?: number;   // seconds
  fps?: number;
  /** image mode — single reference image, base64 (only when ${base64Image} present). */
  imageBase64?: string;
  /** image mode — single reference image, absolute path (${imagePath}). */
  imagePath?: string;
  /** keyframes mode — ordered absolute paths, newline-joined (${keyframePaths}). */
  keyframePaths?: string;
  /** keyframes mode — per-gap transition hints, newline-joined (${keyframePrompts}). */
  keyframePrompts?: string;
  /** keyframes mode — per-gap transition durations (sec), newline-joined (${keyframeDurations}). */
  keyframeDurations?: string;
  /** ComfyUI output folder, injected as ${outputDir} (same drive as ComfyUI). */
  outputDir?: string;
  onProgress?: (progress: ComfyProgress) => void;
}

export interface VideoGenerateResult {
  /** ComfyUI /view URL — fallback when the file can't be read from disk. */
  viewUrl?: string;
  /** Raw output descriptor — lets the caller copy the file straight off disk. */
  filename?: string;
  subfolder?: string;
  outputType?: string;
  /** Best-effort extension (mp4, webm, gif, …). */
  extHint?: string;
}

/**
 * Pull the produced video from a ComfyUI execution result. Video nodes report
 * under different keys (`gifs` for VHS_VideoCombine, `videos`, sometimes `images`),
 * so we scan known keys then any filename-bearing array. A saved file (type
 * "output") is always preferred over a temp/preview one.
 */
function extractFirstVideo(outputs: Record<string, any>): { filename: string; subfolder?: string; type?: string } | null {
  // 1) Known video/image output keys.
  const known: any[] = [];
  for (const out of Object.values(outputs)) {
    if (!out || typeof out !== 'object') continue;
    for (const key of ['gifs', 'videos', 'video', 'images']) {
      if (Array.isArray((out as any)[key])) known.push(...(out as any)[key]);
    }
  }
  const fromKnown = pickOutputFile(known);
  if (fromKnown) return fromKnown;
  // 2) Fallback: any reported file descriptor under any key (custom save nodes).
  const any: any[] = [];
  for (const out of Object.values(outputs)) {
    if (!out || typeof out !== 'object') continue;
    for (const val of Object.values(out)) if (Array.isArray(val)) any.push(...val);
  }
  return pickOutputFile(any);
}

function detectVideoExt(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : 'mp4';
}

async function generateWithComfy(params: VideoGenerateParams, signal?: AbortSignal): Promise<VideoGenerateResult> {
  const baseUrl = normalizeBaseUrl(params.baseUrl || 'http://127.0.0.1:8188');
  const promptWorkflow = withTemplateInjected(params.workflow, {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    seed: params.seed,
    genWidth: params.genWidth,
    genHeight: params.genHeight,
    duration: params.duration,
    fps: params.fps,
    base64Image: params.imageBase64,
    imagePath: params.imagePath,
    keyframePaths: params.keyframePaths,
    keyframePrompts: params.keyframePrompts,
    keyframeDurations: params.keyframeDurations,
    outputDir: params.outputDir,
  });

  console.log('[VideoGen] Submitting prompt to ComfyUI:', promptWorkflow);

  const video = await runComfyWorkflow(baseUrl, promptWorkflow, extractFirstVideo, params.onProgress, signal);
  return {
    viewUrl: buildComfyViewUrl(baseUrl, video),
    filename: video.filename,
    subfolder: video.subfolder,
    outputType: video.type,
    extHint: detectVideoExt(video.filename),
  };
}

/** Reserved for future provider support — currently only ComfyUI is wired up. */
export type VideoGenProvider = 'comfyui';

export async function generateVideoWithProvider(
  provider: VideoGenProvider,
  params: VideoGenerateParams,
  signal?: AbortSignal,
): Promise<VideoGenerateResult> {
  if (provider === 'comfyui') return generateWithComfy(params, signal);
  throw new Error(`Unsupported video provider: ${provider}`);
}
