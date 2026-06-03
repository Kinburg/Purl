import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { SYSTEM_TAGS } from '../../types';
import type { Project, PluginBlockDef } from '../../types';
import { useProjectStore } from '../../store/projectStore';
import { usePluginStore } from '../../store/pluginStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { useDebouncedValue } from '../../utils/useDebouncedValue';
import { generateStandaloneHtml } from '../../utils/exportToHtml';
import { getSCTemplate } from '../../utils/scRuntime';
import { toLocalFileUrl, joinPath } from '../../lib/fsApi';

type BuildResult = { doc: string } | { noTemplate: true };
type PlayError = { message: string; source?: string; line?: number };

/**
 * Bridge injected into the iframe (runs alongside SugarCube, same origin):
 *  - forwards window errors / unhandled rejections to the parent via postMessage;
 *  - polls `SugarCube.State` and pushes a JSON snapshot of `variables` + the
 *    current passage whenever it changes.
 *
 * NB: we POLL rather than hook the `:passagedisplay` jQuery event, because
 * SugarCube calls `jQuery.noConflict(true)` — `window.jQuery` is gone, so a
 * jQuery-based listener never binds. `window.SugarCube` (frozen API) is the
 * reliable global. The parent (PlayPanel) renders whatever it receives.
 */
const PLAY_BRIDGE = `
(function(){
  function send(m){try{parent.postMessage(m,'*');}catch(e){}}
  window.addEventListener('error',function(e){send({__purlPlay:'error',message:(e.error&&e.error.stack)||e.message||'Error',source:e.filename,line:e.lineno});});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;send({__purlPlay:'error',message:'Unhandled rejection: '+((r&&(r.stack||r.message))||String(r))});});
  var last='';
  function pushState(){
    try{
      var SC=window.SugarCube||{};
      var St=SC.State||window.State;
      if(St&&St.variables){
        var json=JSON.stringify(St.variables);
        var passage=(St.passage!=null?St.passage:(St.active&&St.active.title))||'';
        var key=passage+'|'+json;
        if(key!==last){last=key;send({__purlPlay:'state',vars:JSON.parse(json),passage:passage});}
      }
    }catch(e){}
  }
  setInterval(pushState,400);
})();
`;

/** Active scene's passage name for "play from current scene" — undefined for
 *  system/chrome scenes (not normal navigable passages) → falls back to start. */
function sceneNameOf(project: Project, id: string | null): string | undefined {
  const s = project.scenes.find(sc => sc.id === id);
  if (!s) return undefined;
  if (s.tags.some(t => (SYSTEM_TAGS as readonly string[]).includes(t))) return undefined;
  return s.name;
}

/** Build a self-contained HTML doc for the sandboxed iframe. */
function buildPlayDoc(
  project: Project,
  activeSceneId: string | null,
  plugins: PluginBlockDef[],
  fromCurrent: boolean,
  projectDir: string | null,
): BuildResult {
  const template = getSCTemplate();
  if (!template) return { noTemplate: true };
  const startName = fromCurrent ? sceneNameOf(project, activeSceneId) : undefined;
  const { html, css } = generateStandaloneHtml(project, template, plugins, startName);
  let doc = html
    .replace(/<link rel="stylesheet" href="story\.css">/, `<style>${css}</style>`)
    .replace(/<link rel="stylesheet" href="addon\.css">/, '');
  // Inject into <head>, in order: (1) clear sessionStorage so SugarCube starts
  // FRESH each build/reload instead of resuming the previous play session (shared
  // origin → would otherwise ignore Config.passages.start); (2) the inspector/error
  // bridge; (3) a <base> at release/ so relative `assets/…` resolve via localfile://.
  const freshScript  = `<script>try{window.sessionStorage&&window.sessionStorage.clear();}catch(e){}</script>`;
  const bridgeScript = `<script>${PLAY_BRIDGE}</script>`;
  const baseTag = projectDir ? `<base href="${toLocalFileUrl(joinPath(projectDir, 'release'))}/">` : '';
  doc = doc.replace(/<head([^>]*)>/i, `<head$1>\n${freshScript}${bridgeScript}${baseTag}`);
  return { doc };
}

/**
 * Playable-preview panel. Renders the story in a sandboxed <iframe> built from
 * generateStandaloneHtml + the loaded SugarCube format. Honors `compileMode`
 * (live debounced rebuild / manual Build). Includes a variable inspector + a
 * runtime-error capture (fed by an in-iframe bridge over postMessage) in a
 * resizable bottom pane.
 */
export function PlayPanel() {
  const project       = useProjectStore(s => s.project);
  const activeSceneId = useProjectStore(s => s.activeSceneId);
  const projectDir    = useProjectStore(s => s.projectDir);
  const plugins       = usePluginStore(s => s.plugins);
  const compileMode   = useEditorPrefsStore(s => s.compileMode);
  const inspectorPx   = useEditorPrefsStore(s => s.playInspectorSizePx) ?? 220;
  const setPrefs      = useEditorPrefsStore(s => s.setPrefs);
  const t = useT();

  const [fromCurrent, setFromCurrent] = useState(false);
  const [reloadKey, setReloadKey]     = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const debouncedProject       = useDebouncedValue(project, 400);
  const debouncedActiveSceneId = useDebouncedValue(activeSceneId, 400);

  const live = useMemo(
    () => (compileMode === 'live' ? buildPlayDoc(debouncedProject, debouncedActiveSceneId, plugins, fromCurrent, projectDir) : null),
    [compileMode, debouncedProject, debouncedActiveSceneId, plugins, fromCurrent, projectDir],
  );

  const [snap, setSnap] = useState<{ result: BuildResult; project: Project; sceneId: string | null; fromCurrent: boolean } | null>(null);
  const build = useCallback(() => {
    setSnap({ result: buildPlayDoc(project, activeSceneId, plugins, fromCurrent, projectDir), project, sceneId: activeSceneId, fromCurrent });
    setReloadKey(k => k + 1);
  }, [project, activeSceneId, plugins, fromCurrent, projectDir]);

  const result: BuildResult | null = compileMode === 'live' ? live : (snap?.result ?? null);
  const noTemplate = !!result && 'noTemplate' in result;
  const doc        = result && 'doc' in result ? result.doc : null;
  const ranManual  = compileMode === 'manual' && snap !== null;
  const showBuilt  = compileMode === 'live' || ranManual;
  const stale      = compileMode === 'manual' && snap !== null &&
    (snap.project !== project || snap.fromCurrent !== fromCurrent || (fromCurrent && snap.sceneId !== activeSceneId));

  const [docVersion, setDocVersion] = useState(0);
  useEffect(() => { if (doc) setDocVersion(v => v + 1); }, [doc]);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  // ── Inspector / error capture (fed by the in-iframe bridge) ────────────────
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab]   = useState<'vars' | 'errors'>('vars');
  const [vars, setVars]             = useState<unknown>(null);
  const [curPassage, setCurPassage] = useState('');
  const [errors, setErrors]         = useState<PlayError[]>([]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      const d = e.data as { __purlPlay?: string; vars?: unknown; passage?: string; message?: string; source?: string; line?: number };
      if (!d || typeof d !== 'object') return;
      if (d.__purlPlay === 'state') { setVars(d.vars); setCurPassage(d.passage ?? ''); }
      else if (d.__purlPlay === 'error') {
        setErrors(prev => [...prev, { message: String(d.message), source: d.source, line: d.line }].slice(-100));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Each (re)build/reload is a fresh run → drop stale state + errors.
  useEffect(() => { setVars(null); setCurPassage(''); setErrors([]); }, [reloadKey, docVersion]);

  const varsJson = useMemo(() => {
    try { return vars == null ? '' : JSON.stringify(vars, null, 2); } catch { return String(vars); }
  }, [vars]);

  // ── Resizable inspector (manual handle, so the iframe never remounts) ──────
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const onHandleDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const body = bodyRef.current;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      const h = Math.max(100, Math.min(rect.height - 140, rect.bottom - ev.clientY));
      setPrefs({ playInspectorSizePx: Math.round(h) });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragging(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [setPrefs]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950">
      {/* Toolbar */}
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.header.play}</span>
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer select-none" title={t.play.fromCurrent}>
          <input
            type="checkbox"
            className="accent-emerald-500 cursor-pointer"
            checked={fromCurrent}
            onChange={e => setFromCurrent(e.target.checked)}
          />
          {t.play.fromCurrent}
        </label>
        {doc && (
          <button
            type="button"
            onClick={() => setInspectorOpen(o => !o)}
            className={`relative text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
              inspectorOpen ? 'bg-indigo-700 text-indigo-100 hover:bg-indigo-600' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            }`}
          >
            {t.play.inspector}
            {errors.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold align-middle">
                {errors.length}
              </span>
            )}
          </button>
        )}
        {compileMode === 'manual' && (
          <button
            type="button"
            onClick={build}
            className={`text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
              stale ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-emerald-700 text-emerald-100 hover:bg-emerald-600'
            }`}
          >
            {ranManual ? t.play.rebuild : t.play.build}
          </button>
        )}
        {doc && (
          <button
            type="button"
            onClick={reload}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-700 text-slate-200 hover:bg-slate-600 cursor-pointer transition-colors"
          >
            {t.play.reload}
          </button>
        )}
      </div>

      {/* Body + inspector. Manual vertical resize keeps the iframe in a stable
          container so toggling/resizing the inspector never remounts (restarts) it. */}
      <div ref={bodyRef} className="flex-1 min-h-0 flex flex-col relative">
        <div className="flex-1 min-h-0">
          {noTemplate ? (
            <div className="h-full flex items-center justify-center px-4 text-center text-slate-500 text-xs">
              {t.play.noTemplate}
            </div>
          ) : !showBuilt ? (
            <div className="h-full flex items-center justify-center px-4 text-center text-slate-500 text-xs">
              {t.play.notBuilt}
            </div>
          ) : doc ? (
            <iframe
              ref={iframeRef}
              key={`${reloadKey}-${docVersion}`}
              title="play"
              srcDoc={doc}
              sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms"
              className="w-full h-full border-0 bg-white"
            />
          ) : null}
        </div>

        {doc && inspectorOpen && (
          <>
            <div
              onMouseDown={onHandleDown}
              className="h-1.5 shrink-0 cursor-row-resize bg-slate-800 hover:bg-indigo-600/40 active:bg-indigo-600/60 transition-colors"
            />
            <div className="shrink-0 flex flex-col min-h-0 bg-slate-900" style={{ height: inspectorPx }}>
              {/* Tabs */}
              <div className="h-7 shrink-0 flex items-center gap-1 px-2 border-b border-slate-800">
                {(['vars', 'errors'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setInspectorTab(tab)}
                    className={`text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      inspectorTab === tab ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab === 'vars' ? t.play.variables : t.play.errors}
                    {tab === 'errors' && errors.length > 0 && (
                      <span className="ml-1 text-red-400 font-semibold">{errors.length}</span>
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                {inspectorTab === 'errors' && errors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setErrors([])}
                    className="text-[11px] px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {t.play.clear}
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-auto p-2">
                {inspectorTab === 'vars' ? (
                  varsJson ? (
                    <>
                      {curPassage && (
                        <div className="text-[11px] text-slate-500 mb-1">
                          {t.play.passage}: <span className="text-slate-300">{curPassage}</span>
                        </div>
                      )}
                      <pre className="text-[11px] leading-snug font-mono text-slate-200 whitespace-pre-wrap break-all">{varsJson}</pre>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500">{t.play.noState}</div>
                  )
                ) : errors.length === 0 ? (
                  <div className="text-xs text-slate-500">{t.play.noErrors}</div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {errors.map((err, i) => (
                      <li key={i} className="text-[11px] font-mono text-red-300 whitespace-pre-wrap break-all border-l-2 border-red-500/60 pl-2">
                        {err.message}
                        {err.source && (
                          <span className="block text-slate-500">{err.source}{err.line ? `:${err.line}` : ''}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {/* Transparent overlay during drag — keeps mouse events off the iframe so
            the handle doesn't lose the cursor while resizing. */}
        {dragging && <div className="absolute inset-0 z-50 cursor-row-resize" />}
      </div>
    </div>
  );
}
