import type { ImageGenProvider } from '../../types';
import {
  type ComfyProgress,
  buildComfyViewUrl,
  normalizeBaseUrl,
  runComfyWorkflow,
  withTemplateInjected,
} from '../comfy/client';

export type { ComfyProgress };

export interface ImageGenerateParams {
  baseUrl: string;
  workflow: Record<string, any>;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  genWidth?: number;   // generation resolution width (0 = auto)
  genHeight?: number;  // generation resolution height (0 = auto)
  // Pollinations specific
  pollinationsModel?: string;
  pollinationsToken?: string;
  // Progress callback (ComfyUI only, via WebSocket)
  onProgress?: (progress: ComfyProgress) => void;
  /** Base64-encoded reference image injected as ${base64Image} in ComfyUI workflow nodes. */
  imageBase64?: string;
}

export interface ImageGenerateResult {
  imageUrl?: string;    // URL to download image (ComfyUI)
  bytes?: number[];     // Raw image bytes
  contentType?: string; // MIME type when bytes are present
}

function extractFirstImage(outputs: Record<string, any>): { filename: string; subfolder?: string; type?: string } | null {
  for (const out of Object.values(outputs)) {
    const images = out?.images;
    if (Array.isArray(images) && images.length > 0) {
      const first = images[0];
      if (first?.filename) return first;
    }
  }
  return null;
}

async function generateWithComfy(params: ImageGenerateParams, signal?: AbortSignal): Promise<ImageGenerateResult> {
  const baseUrl = normalizeBaseUrl(params.baseUrl || 'http://127.0.0.1:8188');
  const promptWorkflow = withTemplateInjected(params.workflow, {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    seed: params.seed,
    genWidth: params.genWidth,
    genHeight: params.genHeight,
    base64Image: params.imageBase64,
  });

  console.log('[ImageGen] Submitting prompt to ComfyUI:', promptWorkflow);

  const image = await runComfyWorkflow(baseUrl, promptWorkflow, extractFirstImage, params.onProgress, signal);
  return { imageUrl: buildComfyViewUrl(baseUrl, image) };
}

async function generateWithPollinations(params: ImageGenerateParams, signal?: AbortSignal): Promise<ImageGenerateResult> {
  const model = params.pollinationsModel?.trim() || 'flux';
  const width = params.genWidth && params.genWidth > 0 ? params.genWidth : 1024;
  const height = params.genHeight && params.genHeight > 0 ? params.genHeight : width;

  const urlParams = new URLSearchParams({ model, width: String(width), height: String(height) });
  if (Number.isFinite(params.seed)) urlParams.set('seed', String(params.seed));

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.httpRequestBinary;
  const baseUrl = isElectron ? 'https://gen.pollinations.ai' : '/pollinations';
  const url = `${baseUrl}/image/${encodeURIComponent(params.prompt)}?${urlParams}`;

  const fetchHeaders: Record<string, string> = {};
  if (params.pollinationsToken?.trim()) fetchHeaders['Authorization'] = `Bearer ${params.pollinationsToken.trim()}`;

  if (isElectron) {
    const res = await window.electronAPI!.httpRequestBinary({ url, headers: fetchHeaders });
    if (res.status < 200 || res.status >= 300) throw new Error(`Pollinations API error: ${res.status}`);
    return { bytes: res.bytes, contentType: res.headers['content-type'] ?? 'image/jpeg' };
  }

  const res = await fetch(url, { signal, headers: fetchHeaders });
  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    const errText = ct.includes('json') || ct.includes('text')
      ? await res.text().catch(() => '')
      : `(binary body, content-type: ${ct})`;
    throw new Error(`Pollinations API error: ${res.status} — ${errText}`);
  }

  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const bytes = Array.from(new Uint8Array(await res.arrayBuffer()));
  return { bytes, contentType };
}

export async function generateImageWithProvider(
  provider: ImageGenProvider,
  params: ImageGenerateParams,
  signal?: AbortSignal,
): Promise<ImageGenerateResult> {
  if (provider === 'comfyui') return generateWithComfy(params, signal);
  if (provider === 'pollinations') return generateWithPollinations(params, signal);
  throw new Error(`Unsupported image provider: ${provider}`);
}
