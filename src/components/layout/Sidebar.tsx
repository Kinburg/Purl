import { lazy, Suspense, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
// SceneList stays eager — it's the default-active tab and almost always the
// first thing the user sees. The rest are lazy: each is its own bundle and
// downloads on first switch to that tab.
import { SceneList } from '../scenes/SceneList';
const CharacterManager = lazy(() => import('../characters/CharacterManager').then(m => ({ default: m.CharacterManager })));
const VariableManager  = lazy(() => import('../variables/VariableManager').then(m => ({ default: m.VariableManager })));
const AssetManager     = lazy(() => import('../assets/AssetManager').then(m => ({ default: m.AssetManager })));
const WatcherManager   = lazy(() => import('../watchers/WatcherManager').then(m => ({ default: m.WatcherManager })));
const ItemManager      = lazy(() => import('../items/ItemManager').then(m => ({ default: m.ItemManager })));
const ContainerManager = lazy(() => import('../containers/ContainerManager').then(m => ({ default: m.ContainerManager })));
const QuestManager     = lazy(() => import('../quests/QuestManager').then(m => ({ default: m.QuestManager })));
const PluginManager    = lazy(() => import('../plugins/PluginManager').then(m => ({ default: m.PluginManager })));
const ValidatePanel    = lazy(() => import('../validate/ValidatePanel').then(m => ({ default: m.ValidatePanel })));
const StatsPanel       = lazy(() => import('../stats/StatsPanel').then(m => ({ default: m.StatsPanel })));
import { SIDEBAR_SVG_ICONS } from './SidebarIcons';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { YarnSpinner } from '../shared/YarnArt';

function TabFallback() {
  const knit = useEditorPrefsStore(s => s.knitTheme);
  return (
    <div className="flex items-center gap-2 px-3 py-4 text-slate-500 text-xs italic">
      {knit && <YarnSpinner className="w-4 h-4" />}
      Loading…
    </div>
  );
}

type Tab = 'scenes' | 'characters' | 'variables' | 'assets' | 'watchers' | 'items' | 'containers' | 'quests' | 'plugins' | 'validate' | 'stats';

export function Sidebar() {
  const activeSidebarTab = useProjectStore(s => s.activeSidebarTab);
  const setSidebarTab    = useProjectStore(s => s.setSidebarTab);
  const sidebarWidth     = useProjectStore(s => s.sidebarWidth);
  const t = useT();

  const TABS = useMemo<{ id: Tab; label: string }[]>(() => [
    { id: 'scenes',     label: t.sidebar.scenes },
    { id: 'characters', label: t.sidebar.characters },
    { id: 'items',      label: t.sidebar.items },
    { id: 'containers', label: t.sidebar.containers },
    { id: 'quests',     label: t.sidebar.quests },
    { id: 'plugins',    label: t.sidebar.plugins },
    { id: 'variables',  label: t.sidebar.variables },
    { id: 'assets',     label: t.sidebar.assets },
    { id: 'watchers',   label: t.sidebar.watchers },
    { id: 'validate',   label: t.sidebar.validate },
    { id: 'stats',      label: t.sidebar.stats },
  ], [t]);

  return (
    <aside
      className="flex flex-col shrink-0 bg-slate-900 border-r border-slate-700 overflow-hidden"
      style={{ width: sidebarWidth }}
    >
      {/* Tab bar */}
      <div className="flex border-b border-slate-700 h-9 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            title={tab.label}
            onClick={() => setSidebarTab(tab.id)}
            className={`flex-1 flex items-center justify-center transition-colors cursor-pointer ${
              activeSidebarTab === tab.id
                ? 'bg-slate-800 text-indigo-400'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            {SIDEBAR_SVG_ICONS[tab.id]({ className: 'w-5 h-5' })}
          </button>
        ))}
      </div>

      {/* Tab label */}
      <div className="px-3 pt-2 pb-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {TABS.find(tab => tab.id === activeSidebarTab)?.label}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
        <Suspense fallback={<TabFallback />}>
          {activeSidebarTab === 'scenes'      && <SceneList />}
          {activeSidebarTab === 'characters'  && <CharacterManager />}
          {activeSidebarTab === 'items'       && <ItemManager />}
          {activeSidebarTab === 'containers'  && <ContainerManager />}
          {activeSidebarTab === 'quests'      && <QuestManager />}
          {activeSidebarTab === 'plugins'     && <PluginManager />}
          {activeSidebarTab === 'variables'   && <VariableManager />}
          {activeSidebarTab === 'assets'      && <AssetManager />}
          {activeSidebarTab === 'watchers'    && <WatcherManager />}
          {activeSidebarTab === 'validate'    && <ValidatePanel />}
          {activeSidebarTab === 'stats'       && <StatsPanel />}
        </Suspense>
      </div>
    </aside>
  );
}
