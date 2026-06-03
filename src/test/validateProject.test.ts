import { describe, it, expect } from 'vitest';
import { validateProject } from '../utils/validateProject';
import { makeProject, scene, choice } from './fixtures';
import { START_TAG } from '../types';

const codes = (p: ReturnType<typeof makeProject>) => validateProject(p).map(i => i.code);

describe('validateProject', () => {
  it('flags no-start when nothing is tagged start', () => {
    expect(codes(makeProject([scene('s1', 'A')]))).toContain('no-start');
  });

  it('flags duplicate scene names', () => {
    const p = makeProject([scene('s1', 'Dup', [], [START_TAG]), scene('s2', 'Dup')]);
    expect(codes(p)).toContain('duplicate-name');
  });

  it('flags a dangling navigation target', () => {
    const p = makeProject([scene('s1', 'Start', [choice('c', [{ target: 'ghost' }])], [START_TAG])]);
    expect(codes(p)).toContain('dangling-target');
  });

  it('flags an unreachable scene', () => {
    const p = makeProject([scene('s1', 'Start', [], [START_TAG]), scene('s2', 'Island')]);
    expect(codes(p)).toContain('unreachable');
  });

  it('does NOT flag a scene reached from start', () => {
    const p = makeProject([
      scene('s1', 'Start', [choice('c', [{ target: 's2' }])], [START_TAG]),
      scene('s2', 'Reached'),
    ]);
    expect(codes(p)).not.toContain('unreachable');
  });

  it('flags a choice option with no target', () => {
    const p = makeProject([scene('s1', 'Start', [choice('c', [{ label: 'X', target: '' }])], [START_TAG])]);
    expect(codes(p)).toContain('choice-no-target');
  });

  it('a well-formed project has no error-severity issues', () => {
    const p = makeProject([
      scene('s1', 'Start', [choice('c', [{ label: 'Go', target: 's2' }])], [START_TAG]),
      scene('s2', 'Ending', [choice('c2', [{ label: 'Back to start', target: 's1' }])]),
    ]);
    expect(validateProject(p).filter(i => i.severity === 'error')).toHaveLength(0);
  });
});
