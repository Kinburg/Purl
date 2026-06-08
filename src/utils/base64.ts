/**
 * Encode a byte array as a base64 string. Chunked (8 KB) to avoid blowing the
 * call stack on large inputs — `String.fromCharCode(...hugeArray)` throws.
 *
 * Extracted from AvatarGenModal / ImageBoundGenPanel so image- and video-gen
 * flows share one implementation.
 */
export function bytesToBase64(bytes: number[]): string {
  const uint8 = new Uint8Array(bytes);
  const chunks: string[] = [];
  for (let i = 0; i < uint8.length; i += 8192) {
    chunks.push(String.fromCharCode(...uint8.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(''));
}
