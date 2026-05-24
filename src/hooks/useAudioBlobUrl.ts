import { useEffect, useState } from 'react';
import { fsApi, resolveAssetPath } from '../lib/fsApi';

/**
 * Audio MIME map for blob URL construction.
 *
 * The `localfile://` custom protocol in this app can't stream audio (no Range
 * support in the handler), so `<audio controls>` silently errors out when fed
 * a `localfile://` URL. The fix is to read the file via IPC and wrap the raw
 * bytes in a `blob:` URL, which the browser treats as a normal seekable source.
 */
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac',
  weba: 'audio/webm', opus: 'audio/ogg',
};

/**
 * Resolve a project-relative path (e.g. `history/.../foo.mp3` or `assets/audio/foo.mp3`)
 * into a `blob:` URL suitable for `<audio src>`.
 *
 * Pass-through behaviour for non-local paths:
 * - `''` / undefined / null → returns `null`
 * - Anything that doesn't look like a local project path (e.g. `https://...`) → returns the
 *   raw `src` unchanged so the caller can still feed it to `<audio>`.
 *
 * Cleans up the `blob:` URL on unmount / when `src` changes.
 *
 * @param src         relative path stored in the block (or empty)
 * @param projectDir  current project directory (needed to resolve assets/ and history/)
 * @returns           a `blob:` URL, a passthrough URL, or `null` while loading
 */
export function useAudioBlobUrl(src: string | undefined | null, projectDir: string | undefined | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src) { setBlobUrl(null); return; }

    // External URL (or anything that isn't a local relative path) — pass through.
    // We don't want to fetch + blob-wrap remote files; browser handles them natively.
    if (!src.startsWith('assets/') && !src.startsWith('history/')) {
      setBlobUrl(src);
      return;
    }

    if (!projectDir) { setBlobUrl(null); return; }

    let cancelled = false;
    let createdUrl: string | undefined;

    (async () => {
      try {
        const absPath = resolveAssetPath(projectDir, src);
        const bytes = await fsApi.readFileBinary(absPath);
        if (cancelled) return;
        const ext = src.split('.').pop()?.toLowerCase() ?? 'mp3';
        const mime = AUDIO_MIME[ext] || 'audio/mpeg';
        createdUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
        if (cancelled) { URL.revokeObjectURL(createdUrl); return; }
        setBlobUrl(createdUrl);
      } catch (err) {
        console.warn('[useAudioBlobUrl] failed to load audio preview:', err);
        if (!cancelled) setBlobUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src, projectDir]);

  return blobUrl;
}
