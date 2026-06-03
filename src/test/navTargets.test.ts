import { describe, it, expect } from 'vitest';
import { collectNavRefs } from '../utils/navTargets';
import { choice, link, ifBlock, text } from './fixtures';

describe('collectNavRefs', () => {
  it('collects each choice option as a choice ref', () => {
    const refs = collectNavRefs([choice('c1', [{ label: 'A', target: 's2' }, { label: 'B', target: 's3' }])]);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ kind: 'choice', targetId: 's2', label: 'A' });
    expect(refs[1]).toMatchObject({ kind: 'choice', targetId: 's3', label: 'B' });
  });

  it('collects a scene link', () => {
    const refs = collectNavRefs([link('l1', 's2')]);
    expect(refs).toEqual([expect.objectContaining({ kind: 'link', targetId: 's2' })]);
  });

  it('ignores back links (no static destination)', () => {
    expect(collectNavRefs([link('l1', null)])).toHaveLength(0);
  });

  it('recurses into condition branches', () => {
    const refs = collectNavRefs([ifBlock('if1', [[choice('c', [{ target: 's5' }])]]) ]);
    expect(refs.map(r => r.targetId)).toContain('s5');
  });

  it('returns nothing for non-navigating blocks', () => {
    expect(collectNavRefs([text('t', 'hello world')])).toHaveLength(0);
  });

  it('gives each ref a unique, source-stable viaId', () => {
    const refs = collectNavRefs([choice('c1', [{ target: 's2' }, { target: 's3' }])]);
    const ids = refs.map(r => r.viaId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
