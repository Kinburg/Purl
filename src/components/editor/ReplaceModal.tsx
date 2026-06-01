import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import { extractSceneStrings, translateSceneBlocks } from '../../utils/i18nUtils';
import {
  ModalShell, ModalHeader, ModalBody, ModalFooter,
  PrimaryButton, SecondaryButton, INPUT_CLS,
} from '../shared/ModalShell';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find & Replace across the current scene or the whole project. Operates on the same
 * block text fields the translator touches (via i18nUtils) — scene names are NOT touched,
 * so navigation can't break. Replace runs in one undo step (reorderBlocks / reorderScenes).
 */
export function ReplaceModal() {
  const t = useT();
  const r = t.replace;
  const setReplaceOpen = useEditorStore(s => s.setReplaceOpen);
  const scenes         = useProjectStore(s => s.project.scenes);
  const activeSceneId  = useProjectStore(s => s.activeSceneId);
  const reorderBlocks  = useProjectStore(s => s.reorderBlocks);
  const reorderScenes  = useProjectStore(s => s.reorderScenes);

  const [search, setSearch]               = useState('');
  const [replaceWith, setReplaceWith]     = useState('');
  const [regex, setRegex]                 = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [scope, setScope]                 = useState<'scene' | 'project'>('scene');

  const close = () => setReplaceOpen(false);

  // Compiled search regex (null when empty; regexError when the pattern is invalid).
  const { re, regexError } = useMemo<{ re: RegExp | null; regexError: boolean }>(() => {
    if (!search) return { re: null, regexError: false };
    try {
      const flags = 'g' + (caseSensitive ? '' : 'i');
      return { re: new RegExp(regex ? search : escapeRegExp(search), flags), regexError: false };
    } catch {
      return { re: null, regexError: true };
    }
  }, [search, regex, caseSensitive]);

  // Apply the search/replace to one string. Literal mode uses a function replacer so `$`
  // in the replacement is not treated as a backreference; regex mode keeps `$1` support.
  const applyTo = (v: string): string =>
    !re ? v : (regex ? v.replace(re, replaceWith) : v.replace(re, () => replaceWith));

  const scopeScenes = () => (scope === 'project' ? scenes : scenes.filter(sc => sc.id === activeSceneId));

  // Match count (independent of the replacement text). `String.match` with a /g/ regex
  // returns every match and leaves no lastIndex state, so it's safe to reuse `re`.
  const { matchCount, fieldCount } = useMemo(() => {
    let matches = 0, fields = 0;
    if (re) {
      for (const sc of scopeScenes()) {
        for (const v of Object.values(extractSceneStrings(sc))) {
          const found = v.match(re);
          if (found) { matches += found.length; fields += 1; }
        }
      }
    }
    return { matchCount: matches, fieldCount: fields };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [re, scope, scenes, activeSceneId]);

  const canReplace = !!re && matchCount > 0;

  const handleReplace = () => {
    if (!canReplace) return;
    const buildMap = (sc: typeof scenes[number]) => {
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(extractSceneStrings(sc))) {
        const replaced = applyTo(v);
        if (replaced !== v) map[k] = replaced;
      }
      return map;
    };
    if (scope === 'project') {
      reorderScenes(scenes.map(sc => ({ ...sc, blocks: translateSceneBlocks(sc.blocks, buildMap(sc)) })));
    } else {
      const sc = scenes.find(s => s.id === activeSceneId);
      if (sc) reorderBlocks(sc.id, translateSceneBlocks(sc.blocks, buildMap(sc)));
    }
    toast.success(r.done(matchCount));
    close();
  };

  const toggleCls = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
      active ? 'bg-indigo-600 border-indigo-500 text-white'
             : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
    }`;
  const scopeCls = (active: boolean) =>
    `flex-1 text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer ${
      active ? 'bg-indigo-600 border-indigo-500 text-white'
             : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
    }`;

  return (
    <ModalShell onClose={close} width={460}>
      <ModalHeader title={r.title} onClose={close} />
      <ModalBody>
        {/* Find */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400">{r.find}</label>
            <div className="flex gap-1">
              <button type="button" className={toggleCls(caseSensitive)} title={r.caseLabel} onClick={() => setCaseSensitive(v => !v)}>Aa</button>
              <button type="button" className={toggleCls(regex)} title={r.regexLabel} onClick={() => setRegex(v => !v)}>.*</button>
            </div>
          </div>
          <textarea
            autoFocus
            className={`${INPUT_CLS} resize-y min-h-[56px] font-mono`}
            placeholder={r.findPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Replace with */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">{r.replaceWith}</label>
          <textarea
            className={`${INPUT_CLS} resize-y min-h-[56px] font-mono`}
            placeholder={r.replacePlaceholder}
            value={replaceWith}
            onChange={e => setReplaceWith(e.target.value)}
          />
        </div>

        {/* Scope */}
        <div className="flex gap-1.5">
          <button type="button" className={scopeCls(scope === 'scene')} onClick={() => setScope('scene')}>{r.scopeScene}</button>
          <button type="button" className={scopeCls(scope === 'project')} onClick={() => setScope('project')}>{r.scopeProject}</button>
        </div>

        {/* Status line */}
        <div className="text-xs min-h-[16px]">
          {regexError
            ? <span className="text-red-400">{r.invalidRegex}</span>
            : search
              ? (matchCount > 0
                  ? <span className="text-slate-400">{r.matchCount(matchCount, fieldCount)}</span>
                  : <span className="text-slate-500">{r.noMatches}</span>)
              : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <SecondaryButton onClick={close}>{t.common.cancel}</SecondaryButton>
        <PrimaryButton onClick={handleReplace} disabled={!canReplace}>{r.replaceBtn}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
