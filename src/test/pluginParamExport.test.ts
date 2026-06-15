import { describe, it, expect } from 'vitest';
import { exportToTwee } from '../utils/exportToTwee';
import { buildPassages } from '../utils/exportToHtml';
import { makeProject, scene } from './fixtures';
import { START_TAG } from '../types';
import type { Block, PluginBlockDef } from '../types';

// A plugin whose body references its `skin` param via a bound ImageBlock. That binding
// resolves through the generic varPath -> emits `$__tgParam__skin`, which only becomes a
// valid temp-var (`_skin`) after rewriteParamRefs runs. The twee exporter always did this;
// the HTML/Play exporter used to skip it (regression this test guards).
const pluginDef: PluginBlockDef = {
  id: 'skinplug',
  name: 'Skin',
  color: '#888',
  params: [{ key: 'skin', label: 'Skin', kind: 'text', default: '' }],
  blocks: [
    {
      id: 'img1', type: 'image', mode: 'bound', variableId: 'param:skin',
      mapping: [{ matchType: 'exact', value: 'red', src: 'red.png' }],
      defaultSrc: '', src: '', alt: '', width: 0,
    } as Block,
  ],
};

const project = makeProject([
  scene('s1', 'Start', [
    { id: 'pb', type: 'plugin', pluginId: 'skinplug', values: { skin: 'red' } } as Block,
  ], [START_TAG]),
]);

function tweePluginBody(twee: string): string {
  const m = twee.match(/::__plug_skinplug \[nobr\]\n([\s\S]*?)(?=\n::|$)/);
  return (m?.[1] ?? '').trim();
}

describe('plugin-param export parity (twee vs HTML/Play)', () => {
  it('rewrites $__tgParam__ refs to temp vars in BOTH exporters and they agree', () => {
    const tweeBody = tweePluginBody(exportToTwee(project, [pluginDef]));
    const { passages } = buildPassages(project, [pluginDef]);
    const htmlBody = (passages.find(p => p.name === '__plug_skinplug')?.content ?? '').trim();

    // Both bodies must reference the scoped temp var and never leak the path marker.
    expect(tweeBody).toContain('_skin');
    expect(tweeBody).not.toContain('__tgParam__');
    expect(htmlBody).toContain('_skin');
    expect(htmlBody).not.toContain('__tgParam__'); // ← failed before the shared-helper fix

    // The two exporters must produce identical plugin-passage markup.
    expect(htmlBody).toBe(tweeBody);
    expect(tweeBody.length).toBeGreaterThan(0);
  });
});
