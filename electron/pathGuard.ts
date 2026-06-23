import path from 'node:path';

/**
 * Path-confinement helpers for the main-process IPC surface.
 *
 * Every `fs:*` handler, the `localfile://` protocol, and the binary HTTP proxy
 * accept absolute paths coming from the renderer. Without a guard a compromised
 * renderer context (e.g. story / LLM JS that reaches `electronAPI` through the
 * Play iframe) could read or destroy ANY file on disk. These helpers confine
 * those operations to an explicit allow-list of roots.
 *
 * Pure (only `node:path`) so the logic is unit-tested without an Electron runtime.
 */

/**
 * True if `target` resolves to `root` itself or a descendant of it.
 *
 * Uses `path.relative` rather than string-prefix matching so that:
 *   - `..` traversal (`root/a/../../etc`) is rejected, and
 *   - sibling-prefix collisions (`/proj` vs `/proj-evil`) are NOT treated as
 *     "inside" — a naive `startsWith(root)` check gets this wrong.
 *
 * Platform-aware via `node:path` (separator + Windows case handling match the
 * host OS, which is where the guard actually runs).
 */
export function isInsideRoot(target: string, root: string): boolean {
  if (!target || !root) return false;
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRoot) return true;
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** True if `target` is inside ANY of the allowed roots. */
export function isInsideAnyRoot(target: string, roots: Iterable<string>): boolean {
  for (const root of roots) {
    if (isInsideRoot(target, root)) return true;
  }
  return false;
}
