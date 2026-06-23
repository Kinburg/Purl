import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isInsideRoot, isInsideAnyRoot } from '../../electron/pathGuard';

// Inputs are relative strings — `isInsideRoot` runs `path.resolve` on both the
// root and the target against the same cwd, so the comparison is deterministic
// across win32 / posix without hard-coding an absolute prefix.
const root = path.join('proj', 'game');

describe('isInsideRoot', () => {
  it('accepts the root itself', () => {
    expect(isInsideRoot(root, root)).toBe(true);
  });

  it('accepts a direct child file', () => {
    expect(isInsideRoot(path.join(root, 'game.purl'), root)).toBe(true);
  });

  it('accepts a deeply nested descendant', () => {
    expect(isInsideRoot(path.join(root, 'release', 'assets', 'a.png'), root)).toBe(true);
  });

  it('rejects `..` traversal that escapes the root', () => {
    expect(isInsideRoot(path.join(root, '..', '..', 'etc', 'passwd'), root)).toBe(false);
  });

  it('rejects the parent directory', () => {
    expect(isInsideRoot('proj', root)).toBe(false);
  });

  it('rejects a sibling whose name shares the root as a prefix', () => {
    // The classic startsWith() bug: "proj/game-evil" is NOT inside "proj/game".
    expect(isInsideRoot(path.join('proj', 'game-evil', 'secret'), root)).toBe(false);
  });

  it('rejects an unrelated absolute path', () => {
    expect(isInsideRoot(path.resolve(path.sep, 'etc', 'passwd'), root)).toBe(false);
  });

  it('rejects empty inputs', () => {
    expect(isInsideRoot('', root)).toBe(false);
    expect(isInsideRoot(path.join(root, 'x'), '')).toBe(false);
  });

  it('normalizes redundant segments that stay inside', () => {
    expect(isInsideRoot(path.join(root, 'a', '..', 'b', 'c'), root)).toBe(true);
  });
});

describe('isInsideAnyRoot', () => {
  const roots = [path.join('proj', 'game'), path.join('home', 'comfy', 'workflows')];

  it('accepts a target inside the second root', () => {
    expect(isInsideAnyRoot(path.join('home', 'comfy', 'workflows', 'wf.json'), roots)).toBe(true);
  });

  it('accepts a target inside the first root', () => {
    expect(isInsideAnyRoot(path.join('proj', 'game', 'release', 'x'), roots)).toBe(true);
  });

  it('rejects a target outside every root', () => {
    expect(isInsideAnyRoot(path.join('home', 'secrets', 'id_rsa'), roots)).toBe(false);
  });

  it('rejects against an empty root set', () => {
    expect(isInsideAnyRoot(path.join('proj', 'game', 'x'), [])).toBe(false);
  });
});
