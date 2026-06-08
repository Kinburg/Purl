import { useEffect, useState } from 'react';
import { fsApi, resolveAssetPath } from '../lib/fsApi';

/**
 * MIME map for blob-URL construction. Like audio, the `localfile://` protocol
 * can't stream video (no Range support), so `<video>` errors out on a
 * `localfile://` source — we read the bytes via IPC and wrap them as a `blob:`
 * URL. Animated `gif`/`webp` outputs (common from VHS) are included so they can
 * be previewed in an `<img>`.
 */
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', ogv: 'video/ogg',
  gif: 'image/gif', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

/**
 * Resolve a project-relative path (`history/.../foo.mp4` or `assets/video/foo.mp4`)
 * into a `blob:` URL suitable for `<video src>` / `<img src>`. Mirrors
 * `useAudioBlobUrl`. Non-local paths pass through unchanged; empty → null.
 * Revokes the blob URL on unmount / src change.
 */
export function useVideoBlobUrl(src: string | undefined | null, projectDir: string | undefined | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src) { setBlobUrl(null); return; }
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
        const ext = src.split('.').pop()?.toLowerCase() ?? 'mp4';
        const mime = VIDEO_MIME[ext] || 'video/mp4';
        createdUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
        if (cancelled) { URL.revokeObjectURL(createdUrl); return; }
        setBlobUrl(createdUrl);
      } catch (err) {
        console.warn('[useVideoBlobUrl] failed to load video preview:', err);
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
