/**
 * Shared ComfyUI client utilities — used by both imageGen and audioGen providers.
 * Extracted from imageGen/providers.ts so audio generation can reuse the same
 * HTTP/WebSocket/template-injection plumbing without duplication.
 */

export interface ComfyProgress {
  current: number;
  total: number;
}

export interface TemplateTokens {
  /** Prompt token — used by image-gen workflows (`${prompt}`). Optional because
   *  audio workflows like ACE Step use `${lyrics}` + `${tags}` instead. */
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  /** Image generation only */
  genWidth?: number;
  /** Image generation only */
  genHeight?: number;
  /** Base64-encoded reference image — image generation only */
  base64Image?: string;
  /** Audio generation — duration in seconds (`${duration}` / `${seconds}`) */
  duration?: number;
  /** Audio generation — song lyrics (`${lyrics}`) */
  lyrics?: string;
  /** Audio generation — comma-joined tag string (`${tags}`) */
  tags?: string;
  /** Audio generation — beats per minute (`${bpm}`) */
  bpm?: number;
}

export async function requestJson(url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}): Promise<{ status: number; json: any }> {
  if (typeof window !== 'undefined' && window.electronAPI?.httpRequest) {
    const res = await window.electronAPI.httpRequest({
      url,
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
    });
    let json: any = null;
    try { json = JSON.parse(res.text); } catch { json = null; }
    return { status: res.status, json };
  }
  const res = await fetch(url, init);
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function replaceTemplateTokens(value: string, tokens: TemplateTokens): string {
  const neg = tokens.negativePrompt ?? '';
  const seedText = Number.isFinite(tokens.seed) ? String(tokens.seed) : '';
  const widthText = tokens.genWidth && tokens.genWidth > 0 ? String(tokens.genWidth) : '';
  const heightText = tokens.genHeight && tokens.genHeight > 0 ? String(tokens.genHeight) : '';
  const durationText = tokens.duration && tokens.duration > 0 ? String(tokens.duration) : '';
  const bpmText = Number.isFinite(tokens.bpm) ? String(tokens.bpm) : '';

  let res = value
    .replaceAll('${prompt}', tokens.prompt ?? '')
    .replaceAll('${negative_prompt}', neg)
    .replaceAll('${base64Image}', tokens.base64Image ?? '')
    .replaceAll('${lyrics}', tokens.lyrics ?? '')
    .replaceAll('${tags}', tokens.tags ?? '');

  if (seedText) res = res.replaceAll('${seed}', seedText);
  if (widthText) res = res.replaceAll('${width}', widthText);
  if (heightText) res = res.replaceAll('${height}', heightText);
  if (durationText) {
    res = res.replaceAll('${duration}', durationText);
    res = res.replaceAll('${seconds}', durationText);
  }
  if (bpmText) res = res.replaceAll('${bpm}', bpmText);
  return res;
}

/**
 * Inject prompt / seed / dimensions / duration into a ComfyUI workflow JSON.
 * Returns a deep clone with all template tokens replaced inside node inputs.
 * If an input value is exactly "${seed}"/"${width}"/"${height}"/"${duration}",
 * the numeric token is set as a number (so the node receives a number, not a string).
 */
export function withTemplateInjected(
  workflow: Record<string, any>,
  tokens: TemplateTokens,
): Record<string, any> {
  // ComfyUI "API Format" often nested under a key or just a flat object of nodes.
  // If it's a full UI export, it has .nodes and .links which API doesn't use.
  const source = workflow.prompt || workflow;
  const clone = JSON.parse(JSON.stringify(source));

  for (const node of Object.values(clone as Record<string, any>)) {
    if (!node || typeof node !== 'object' || typeof node.inputs !== 'object') continue;
    const inputs = node.inputs as Record<string, any>;

    for (const [key, val] of Object.entries(inputs)) {
      if (typeof val !== 'string') continue;
      const hasToken =
        val.includes('${prompt}') ||
        val.includes('${negative_prompt}') ||
        val.includes('${seed}') ||
        val.includes('${width}') ||
        val.includes('${height}') ||
        val.includes('${base64Image}') ||
        val.includes('${duration}') ||
        val.includes('${seconds}') ||
        val.includes('${lyrics}') ||
        val.includes('${tags}') ||
        val.includes('${bpm}');
      if (!hasToken) continue;

      const trimmed = val.trim();
      if (trimmed === '${seed}' && Number.isFinite(tokens.seed)) {
        inputs[key] = tokens.seed;
      } else if (trimmed === '${width}' && tokens.genWidth && tokens.genWidth > 0) {
        inputs[key] = tokens.genWidth;
      } else if (trimmed === '${height}' && tokens.genHeight && tokens.genHeight > 0) {
        inputs[key] = tokens.genHeight;
      } else if ((trimmed === '${duration}' || trimmed === '${seconds}') && tokens.duration && tokens.duration > 0) {
        inputs[key] = tokens.duration;
      } else if (trimmed === '${bpm}' && Number.isFinite(tokens.bpm)) {
        inputs[key] = tokens.bpm;
      } else {
        inputs[key] = replaceTemplateTokens(val, tokens);
      }
    }
  }
  return clone;
}

export async function pollComfyHistory(
  baseUrl: string,
  promptId: string,
  signal?: AbortSignal,
): Promise<any> {
  // No hard deadline. Long audio tracks (e.g. 3-minute songs through ACE Step)
  // can legitimately take 5-10+ minutes. The user's escape hatch is the Cancel
  // button, which trips `signal.aborted` and breaks the loop. If ComfyUI itself
  // dies mid-poll, the next /history request fails with a network error and
  // propagates up to the editor's classifyGenError modal.
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { status, json } = await requestJson(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    if (status < 200 || status >= 300) throw new Error(`ComfyUI history failed: ${status}`);

    const entry = json?.[promptId];
    if (entry) {
      const statusInfo = entry.status;
      if (statusInfo && statusInfo.status_str && statusInfo.status_str !== 'success') {
        let errorMsg = '';
        if (Array.isArray(statusInfo.messages)) {
          const execError = statusInfo.messages.find((m: any) => m?.[0] === 'execution_error');
          if (execError && execError[1]) {
            const d = execError[1];
            errorMsg = `Node ${d.node_id} (${d.node_type}): ${d.exception_message}`;
          } else {
            errorMsg = statusInfo.messages.map((m: any) => m?.[1]?.message || JSON.stringify(m)).join('; ');
          }
        }
        throw new Error(`ComfyUI execution failed: ${errorMsg || statusInfo.status_str}`);
      }
      return entry.outputs;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
  }
}

export function connectComfyWebSocket(
  baseUrl: string,
  clientId: string,
  onProgress: (p: ComfyProgress) => void,
  signal?: AbortSignal,
): () => void {
  const wsUrl = baseUrl.replace(/^https?/, (m) => m === 'https' ? 'wss' : 'ws') + `/ws?clientId=${clientId}`;
  let ws: WebSocket | null = null;

  try {
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => {
      console.log('[Comfy] WebSocket connected');
    });
    ws.addEventListener('error', (err) => {
      console.warn('[Comfy] WebSocket connection failed', err);
    });
    ws.addEventListener('message', (evt) => {
      if (typeof evt.data !== 'string') return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.type === 'progress') {
          const { value, max } = msg.data ?? {};
          if (typeof value === 'number' && typeof max === 'number' && max > 0) {
            onProgress({ current: value, total: max });
          }
        }
      } catch {
        // ignore malformed messages
      }
    });
  } catch (e) {
    console.error('[Comfy] Failed to create WebSocket:', e);
  }

  const cleanup = () => { ws?.close(); ws = null; };
  signal?.addEventListener('abort', cleanup, { once: true });
  return cleanup;
}

/**
 * Submit a workflow to /prompt, poll /history until completion, extract outputs.
 * Caller provides `extractResult` to pull image / audio / etc. from outputs.
 *
 * On abort: sends /interrupt and removes the queue entry if known.
 */
export async function runComfyWorkflow<T>(
  baseUrl: string,
  workflow: Record<string, any>,
  extractResult: (outputs: Record<string, any>) => T | null,
  onProgress?: (p: ComfyProgress) => void,
  signal?: AbortSignal,
): Promise<T> {
  const url = normalizeBaseUrl(baseUrl);
  const clientId = crypto.randomUUID();
  let wsCleanup: (() => void) | null = null;
  if (onProgress) {
    wsCleanup = connectComfyWebSocket(url, clientId, onProgress, signal);
  }

  let promptId: string | undefined;
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const { status, json: submitJson } = await requestJson(`${url}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal,
    });

    if (status < 200 || status >= 300) {
      const err = submitJson?.error;
      const message = typeof err === 'object' ? (err.message || err.type) : (err || submitJson?.message);
      const details = submitJson?.node_errors ? Object.entries(submitJson.node_errors)
        .map(([id, info]: [any, any]) => `Node ${id}: ${info.errors?.map((e: any) => e.message).join(', ')}`)
        .join('; ') : '';
      throw new Error(`ComfyUI request failed: ${status}${message ? ` - ${message}` : ''}${details ? ` (${details})` : ''}`);
    }

    promptId = submitJson?.prompt_id;
    if (!promptId) throw new Error('ComfyUI did not return prompt_id');

    const outputs = await pollComfyHistory(url, promptId, signal);
    const result = extractResult(outputs);
    if (!result) {
      console.warn('[Comfy] No expected output found:', outputs);
      throw new Error('No matching output in ComfyUI result. Check workflow output nodes.');
    }
    return result;
  } catch (err) {
    if (signal?.aborted) {
      requestJson(`${url}/interrupt`, { method: 'POST', body: '{}' }).catch(() => {});
      if (promptId) {
        requestJson(`${url}/queue`, {
          method: 'POST',
          body: JSON.stringify({ delete: [promptId] }),
        }).catch(() => {});
      }
    }
    throw err;
  } finally {
    wsCleanup?.();
  }
}

/** Build a ComfyUI /view URL from a {filename, subfolder, type} descriptor. */
export function buildComfyViewUrl(
  baseUrl: string,
  desc: { filename: string; subfolder?: string; type?: string },
): string {
  const params = new URLSearchParams({
    filename: String(desc.filename),
    subfolder: String(desc.subfolder ?? ''),
    type: String(desc.type ?? 'output'),
  });
  return `${normalizeBaseUrl(baseUrl)}/view?${params.toString()}`;
}
