import { describe, it, expect } from 'vitest';
import { computeStats } from '../utils/storyStats';
import { makeProject, scene, choice, text } from './fixtures';
import { START_TAG } from '../types';

describe('computeStats', () => {
  it('counts words from text content', () => {
    const p = makeProject([scene('s1', 'Start', [text('t', 'one two three')], [START_TAG])]);
    const s = computeStats(p);
    expect(s.totalWords).toBe(3);
    expect(s.scenes).toBe(1);
    expect(s.perScene[0]).toMatchObject({ name: 'Start', words: 3 });
  });

  it('counts blocks and choice options', () => {
    const p = makeProject([
      scene('s1', 'Start', [text('t', 'hi'), choice('c', [{ target: 's1' }, { target: 's1' }])], [START_TAG]),
    ]);
    const s = computeStats(p);
    expect(s.blocks).toBe(2);
    expect(s.choiceOptions).toBe(2);
  });

  it('reports unreachable scenes', () => {
    const p = makeProject([scene('s1', 'Start', [], [START_TAG]), scene('s2', 'Island')]);
    expect(computeStats(p).unreachable).toBe(1);
  });

  it('reading time scales with word count (~200 wpm)', () => {
    const words = Array.from({ length: 450 }, (_, i) => `w${i}`).join(' ');
    const p = makeProject([scene('s1', 'Start', [text('t', words)], [START_TAG])]);
    expect(computeStats(p).readingMinutes).toBe(3); // ceil(450/200)
  });

  it('passes through the plugin count', () => {
    const p = makeProject([scene('s1', 'Start', [], [START_TAG])]);
    expect(computeStats(p, 4).plugins).toBe(4);
  });
});
