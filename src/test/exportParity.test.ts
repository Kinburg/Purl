import { describe, it, expect } from 'vitest';
import { buildDemoProject } from './demoProject';
import { exportToTwee } from '../utils/exportToTwee';
import { buildPassages } from '../utils/exportToHtml';

// Safety net for the compileStory unification (roadmap 3.1). The two exporters
// (exportToTwee + buildPassages/generateStandaloneHtml) duplicate the story
// orchestration; before collapsing them into one compileStory() these golden-master
// snapshots pin the CURRENT byte output so the refactor's diff can be audited
// (only the intended convergences — twee gaining globalCSS/blockTypesCSS, the
// audio+video volume restore, canonical script order — may change). The parity
// tests assert the two formats already agree on passage set + start, which the
// unification must keep true.

const demo = buildDemoProject();

describe('export golden master (demo) — guards the compileStory refactor', () => {
  it('exportToTwee(demo) is byte-stable', () => {
    expect(exportToTwee(demo)).toMatchSnapshot();
  });

  it('buildPassages(demo) is byte-stable', () => {
    expect(buildPassages(demo)).toMatchSnapshot();
  });
});

describe('cross-format parity (must survive unification)', () => {
  it('twee and buildPassages emit the same scene/system/plugin passage names', () => {
    const twee = exportToTwee(demo);
    // Twee passage headers: lines beginning `::Name`. Exclude the twee-only format
    // containers (StoryTitle/StoryData/StoryStylesheet/StoryScript) that HTML encodes
    // as element attributes / external files rather than passages.
    const tweeOnly = new Set(['StoryTitle', 'StoryData', 'StoryStylesheet', 'StoryScript']);
    const tweeNames = [...twee.matchAll(/^::(\S+)/gm)].map(m => m[1]).filter(n => !tweeOnly.has(n));
    const htmlNames = buildPassages(demo).passages.map(p => p.name);
    expect(new Set(tweeNames)).toEqual(new Set(htmlNames));
  });

  it('both formats reference the same start passage', () => {
    const startName = exportToTwee(demo).match(/"start":\s*"([^"]+)"/)?.[1];
    const { passages, startPid } = buildPassages(demo);
    const htmlStart = passages.find(p => p.pid === startPid)?.name;
    expect(startName).toBeTruthy();
    expect(startName).toBe(htmlStart);
  });

  it('twee now emits the CSS/script the HTML path always had (the 3.1 convergence)', () => {
    const twee = exportToTwee(demo);
    const css = buildPassages(demo).combinedCSS;
    // globalCSS (settings.bgColor) — was missing from .twee before unification.
    expect(twee).toContain('background-color: #0f172a !important');
    // blockTypesCSS base rules — were missing from .twee before unification.
    expect(twee).toContain('.tg-image img');
    expect(twee).toContain('.tg-table {');
    // audio-volume restore now covers video in both formats.
    expect(twee).toContain('querySelectorAll("video")');
    // and the two formats now carry the identical stylesheet text.
    expect(twee).toContain(css);
  });
});
