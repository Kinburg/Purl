import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { Asset, AssetGroup, AssetTreeNode } from '../../types';
import { fsApi, joinPath, safeName, toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { flattenAssets } from '../../utils/treeUtils';
import { useT } from '../../i18n';
import { useConfirm } from '../shared/ConfirmModal';
import { AssetInfoModal } from './AssetInfoModal';

import { EmojiIcon } from '../shared/EmojiIcons';
// ─── Video extensions ─────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'weba']);
const MEDIA_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif',
  'mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv',
  'mp3', 'wav', 'flac', 'm4a', 'aac', 'weba',
]);

function getAssetType(filename: string): 'image' | 'video' | 'audio' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'image';
}

function isMediaFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_EXTS.has(ext);
}

// ─── Tree lookup ──────────────────────────────────────────────────────────────

function findNodeById(nodes: AssetTreeNode[], id: string): AssetTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.kind === 'group') {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ─── Filesystem ↔ asset tree full sync ────────────────────────────────────────

/**
 * Recursively sync the asset tree with what's actually on disk.
 * - Files/folders on disk but missing from store → added
 * - Files/folders in store but missing from disk → removed
 * - Existing nodes keep their IDs
 */
async function syncWithDisk(
  existing: AssetTreeNode[],
  absDir: string,
  relDir: string,
): Promise<{ result: AssetTreeNode[]; changed: boolean }> {
  let entries: { name: string; isDir: boolean }[];
  try { entries = await fsApi.listDir(absDir); } catch { return { result: [], changed: existing.length > 0 }; }

  // Index existing children by relativePath for quick lookup
  const existingByRel = new Map<string, AssetTreeNode>();
  for (const n of existing) existingByRel.set(n.relativePath, n);

  // Track which disk entries we've seen (to detect store-only nodes later)
  const diskPaths = new Set<string>();

  let changed = false;
  const result: AssetTreeNode[] = [];

  for (const entry of entries) {
    const childRel = `${relDir}/${entry.name}`;
    const childAbs = joinPath(absDir, entry.name);
    diskPaths.add(childRel);

    if (entry.isDir) {
      const existingGroup = existingByRel.get(childRel);
      if (existingGroup && existingGroup.kind === 'group') {
        // Existing group — recurse to sync children
        const sub = await syncWithDisk(existingGroup.children, childAbs, childRel);
        if (sub.changed) {
          result.push({ ...existingGroup, children: sub.result });
          changed = true;
        } else {
          result.push(existingGroup);
        }
      } else {
        // New folder on disk — create group and scan contents
        const sub = await syncWithDisk([], childAbs, childRel);
        result.push({
          kind: 'group', id: crypto.randomUUID(),
          name: entry.name, relativePath: childRel,
          children: sub.result,
        } satisfies AssetGroup);
        changed = true;
      }
    } else {
      // File — only track media files
      if (isMediaFile(entry.name)) {
        const existingAsset = existingByRel.get(childRel);
        if (existingAsset && existingAsset.kind === 'asset') {
          result.push(existingAsset); // keep existing ID
        } else {
          result.push({
            kind: 'asset', id: crypto.randomUUID(),
            name: entry.name, assetType: getAssetType(entry.name),
            relativePath: childRel,
          } satisfies Asset);
          changed = true;
        }
      }
    }
  }

  // Detect store nodes that no longer exist on disk → removed
  for (const n of existing) {
    if (!diskPaths.has(n.relativePath)) {
      changed = true; // node was in store but not on disk — it's dropped
    }
  }

  return { result, changed };
}

// ─── Pending "add group" state ────────────────────────────────────────────────

interface PendingGroup {
  parentGroupId: string | null;
  parentRelPath: string;   // e.g. "" for root, "assets/chars" for subgroup
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AssetManager() {
  const t = useT();
  const project         = useProjectStore(s => s.project);
  const projectDir      = useProjectStore(s => s.projectDir);
  const setProjectDir   = useProjectStore(s => s.setProjectDir);
  const addAssetGroup   = useProjectStore(s => s.addAssetGroup);
  const addAsset        = useProjectStore(s => s.addAsset);
  const deleteAssetNode = useProjectStore(s => s.deleteAssetNode);
  const syncAssets      = useProjectStore(s => s.syncAssets);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [inspectedAsset, setInspectedAsset] = useState<Asset | null>(null);

  // State for the inline "new group" input
  const [pendingGroup, setPendingGroup] = useState<PendingGroup | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const groupInputRef = useRef<HTMLInputElement>(null);

  // Focus the input whenever pendingGroup changes
  useEffect(() => {
    if (pendingGroup) {
      setGroupNameDraft('');
      setTimeout(() => groupInputRef.current?.focus(), 0);
    }
  }, [pendingGroup]);

  // ── Sync asset tree with filesystem ────────────────────────────────────────
  const runSync = async () => {
    if (!projectDir) return;
    const assetsAbs = joinPath(projectDir, 'release', 'assets');
    const exists = await fsApi.exists(assetsAbs);
    if (!exists) return;
    const { result, changed } = await syncWithDisk(
      useProjectStore.getState().project.assetNodes, assetsAbs, 'assets',
    );
    if (changed) syncAssets(result);
  };


  // ── Helpers ────────────────────────────────────────────────────────────────

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  /** Ensures project dir + release/assets/ subfolder exist. Returns project dir path. */
  async function ensureDir(): Promise<string> {
    const dir = projectDir ?? await (async () => {
      const base = await fsApi.getProjectsDir();
      const d = joinPath(base, safeName(project.title));
      await fsApi.mkdir(d);
      setProjectDir(d);
      return d;
    })();
    await fsApi.mkdir(joinPath(dir, 'release', 'assets'));
    return dir;
  }

  // ── Add group: open inline input ──────────────────────────────────────────

  function startAddGroup(parentGroupId: string | null, parentRelPath: string) {
    setPendingGroup({ parentGroupId, parentRelPath });
  }

  function cancelAddGroup() {
    setPendingGroup(null);
    setGroupNameDraft('');
  }

  async function confirmAddGroup() {
    const raw = groupNameDraft.trim();
    setPendingGroup(null);
    setGroupNameDraft('');
    if (!raw || !pendingGroup) return;

    const folderName = safeName(raw);
    const relPath = pendingGroup.parentRelPath
      ? `${pendingGroup.parentRelPath}/${folderName}`
      : `assets/${folderName}`;

    try {
      const dir = await ensureDir();
      await fsApi.mkdir(joinPath(dir, 'release', relPath));
      addAssetGroup(pendingGroup.parentGroupId, raw, relPath);
      // Auto-expand the parent so user sees the new group
      if (pendingGroup.parentGroupId) {
        setExpandedIds(prev => new Set(prev).add(pendingGroup.parentGroupId!));
      }
    } catch (e) {
      alert(t.assets.errorCreateFolder(e));
    }
  }

  // ── Add files ──────────────────────────────────────────────────────────────

  async function handleAddFiles(parentGroupId: string | null, groupRelPath: string) {
    const files = await fsApi.openFilesDialog({
      title: t.assets.titleSelectFiles,
      filters: [
        {
          name: t.assets.filterMedia,
          extensions: [
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif',
            'mp4', 'webm', 'ogg', 'ogv', 'mov',
            'mp3', 'wav', 'flac', 'm4a', 'aac', 'weba',
          ],
        },
        { name: t.assets.filterImages, extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'] },
        { name: t.assets.filterVideos, extensions: ['mp4', 'webm', 'ogg', 'ogv', 'mov'] },
        { name: t.assets.filterAudio, extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'weba'] },
      ],
    });
    if (!files || files.length === 0) return;

    try {
      const dir = await ensureDir();
      // Target folder: groupRelPath is e.g. "assets/chars", or "" for root → "assets"
      const targetRel = groupRelPath || 'assets';
      const targetAbs = joinPath(dir, 'release', targetRel);
      await fsApi.mkdir(targetAbs);

      // Collect existing relative paths to skip duplicates
      const existing = new Set(
        flattenAssets(useProjectStore.getState().project.assetNodes)
          .map(a => a.relativePath),
      );

      for (const srcPath of files) {
        const filename = srcPath.replace(/\\/g, '/').split('/').pop()!;
        const relPath  = `${targetRel}/${filename}`;

        // Skip if this asset is already in the tree
        if (existing.has(relPath)) continue;

        const destAbs = joinPath(targetAbs, filename);
        await fsApi.copyFile(srcPath, destAbs);
        addAsset(parentGroupId, {
          name: filename,
          assetType: getAssetType(filename),
          relativePath: relPath,
        });
        existing.add(relPath);
      }

      // Auto-expand parent group
      if (parentGroupId) setExpandedIds(prev => new Set(prev).add(parentGroupId));
    } catch (e) {
      alert(t.assets.errorAddFiles(e));
    }
  }

  // ── Delete (from store + disk) ─────────────────────────────────────────────

  async function handleDelete(id: string) {
    const node = findNodeById(project.assetNodes, id);
    if (node && projectDir) {
      const absPath = resolveAssetPath(projectDir, node.relativePath);
      try {
        if (node.kind === 'group') await fsApi.deleteDir(absPath);
        else                       await fsApi.deleteFile(absPath);
      } catch { /* file may already be gone */ }
    }
    deleteAssetNode(id);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const { assetNodes } = project;

  return (
    <div className="p-2 flex flex-col gap-1">

      {/* Inline "new group" input — shown at top when active */}
      {pendingGroup && (
        <div className="flex items-center gap-1 mb-1 bg-slate-800 rounded px-2 py-1 border border-indigo-600">
          <span className="text-xs inline-flex"><EmojiIcon name="folder" size={20} /></span>
          <input
            ref={groupInputRef}
            className="flex-1 bg-transparent text-xs text-white outline-none min-w-0"
            placeholder={t.assets.groupNamePlaceholder}
            value={groupNameDraft}
            onChange={e => setGroupNameDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmAddGroup();
              if (e.key === 'Escape') cancelAddGroup();
            }}
          />
          <button
            className="text-indigo-400 hover:text-indigo-200 text-xs cursor-pointer px-0.5"
            onClick={confirmAddGroup}
          >
            <EmojiIcon name="check" size={20} />
          </button>
          <button
            className="text-slate-500 hover:text-red-400 text-xs cursor-pointer px-0.5"
            onClick={cancelAddGroup}
          >
            <EmojiIcon name="close" size={20} />
          </button>
        </div>
      )}

      {/* Root-level toolbar */}
      <div className="flex gap-1 pb-1 border-b border-slate-800 mb-1">
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          title={t.assets.addGroupTitle}
          onClick={() => startAddGroup(null, '')}
        >
          {t.assets.addGroup}
        </button>
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          title={t.assets.addFilesRootTitle}
          onClick={() => handleAddFiles(null, '')}
        >
          {t.assets.addFiles}
        </button>
        <button
          className="text-xs text-slate-500 hover:text-indigo-300 hover:bg-slate-800 rounded px-1.5 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          title={t.assets.refresh}
          onClick={runSync}
        >
          ↻
        </button>
      </div>

      {assetNodes.length === 0 && !pendingGroup && (
        <p className="text-xs text-slate-600 italic px-1 py-2">
          {t.assets.empty}
        </p>
      )}

      {assetNodes.map(node => (
        <AssetNodeView
          key={node.id}
          node={node}
          depth={0}
          expandedIds={expandedIds}
          onToggle={toggleExpand}
          onStartAddGroup={startAddGroup}
          onAddFiles={handleAddFiles}
          onDelete={handleDelete}
          onInspect={setInspectedAsset}
          projectDir={projectDir}
        />
      ))}

      {inspectedAsset && projectDir && (
        <AssetInfoModal
          asset={inspectedAsset}
          projectDir={projectDir}
          onClose={() => setInspectedAsset(null)}
        />
      )}
    </div>
  );
}

// ─── Tree node view ───────────────────────────────────────────────────────────

interface NodeViewProps {
  node: AssetTreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onStartAddGroup: (parentId: string | null, parentRelPath: string) => void;
  onAddFiles: (parentId: string | null, groupRelPath: string) => void;
  onDelete: (id: string) => void;
  onInspect: (asset: Asset) => void;
  projectDir: string | null;
}

function AssetNodeView(props: NodeViewProps) {
  if (props.node.kind === 'asset') {
    return <AssetRow {...props} asset={props.node} />;
  }
  return <GroupRow {...props} group={props.node} />;
}

// ─── Group row ────────────────────────────────────────────────────────────────

function GroupRow({
  group, depth, expandedIds, onToggle,
  onStartAddGroup, onAddFiles, onDelete, onInspect, projectDir,
}: NodeViewProps & { group: AssetGroup }) {
  const t = useT();
  const { ask, modal: confirmModal } = useConfirm();
  const isOpen = expandedIds.has(group.id);
  const indent = depth * 14;

  return (
    <div>
      {/* Group header */}
      <div
        className="flex items-center gap-1 rounded hover:bg-slate-800 py-1 group/row"
        style={{ paddingLeft: `${indent + 4}px`, paddingRight: '4px' }}
      >
        {/* Toggle arrow */}
        <button
          className="text-slate-600 hover:text-slate-300 text-[10px] w-3 shrink-0 cursor-pointer select-none"
          onClick={() => onToggle(group.id)}
        >
          <EmojiIcon name={isOpen ? 'caret-down' : 'caret-right'} size={15} />
        </button>

        {/* Icon + name */}
        <span className="text-xs inline-flex select-none"><EmojiIcon name="folder" size={20} /></span>
        <span
          className="text-xs text-slate-300 flex-1 truncate cursor-pointer"
          title={group.relativePath}
          onClick={() => onToggle(group.id)}
        >
          {group.name}
        </span>

        {/* Actions (shown on hover) */}
        <div className="flex gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
          <ActionBtn
            title={t.assets.addSubgroupTitle}
            onClick={() => onStartAddGroup(group.id, group.relativePath)}
          >
            <span className="inline-flex items-center gap-0.5"><EmojiIcon name="folder" size={20} />+</span>
          </ActionBtn>
          <ActionBtn
            title={t.assets.addFilesToGroupTitle}
            onClick={() => onAddFiles(group.id, group.relativePath)}
          >
            <span className="inline-flex items-center gap-0.5"><EmojiIcon name="document" size={20} />+</span>
          </ActionBtn>
          <ActionBtn
            title={t.assets.deleteGroupTitle}
            danger
            onClick={() => ask(
              { message: t.assets.confirmDeleteGroup(group.name), variant: 'danger' },
              () => onDelete(group.id),
            )}
          >
            <EmojiIcon name="close" size={20} />
          </ActionBtn>
        </div>
      </div>

      {/* Children */}
      {isOpen && (
        <div>
          {group.children.length === 0 ? (
            <div
              className="text-xs text-slate-700 italic py-0.5"
              style={{ paddingLeft: `${indent + 22}px` }}
            >
              {t.assets.emptyGroup}
            </div>
          ) : (
            group.children.map(child => (
              <AssetNodeView
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onStartAddGroup={onStartAddGroup}
                onAddFiles={onAddFiles}
                onDelete={onDelete}
                onInspect={onInspect}
                projectDir={projectDir}
              />
            ))
          )}
        </div>
      )}
      {confirmModal}
    </div>
  );
}

// ─── Asset (file) row ─────────────────────────────────────────────────────────

function AssetRow({
  asset, depth, onDelete, onInspect, projectDir,
}: NodeViewProps & { asset: Asset }) {
  const t = useT();
  const { ask, modal: confirmModal } = useConfirm();
  const indent = depth * 14;
  const isVideo = asset.assetType === 'video';
  const isAudio = asset.assetType === 'audio';

  const previewSrc = projectDir
    ? toLocalFileUrl(resolveAssetPath(projectDir, asset.relativePath))
    : null;

  return (
    <div
      className="flex items-center gap-1.5 rounded hover:bg-slate-800 py-1 group/row cursor-pointer"
      style={{ paddingLeft: `${indent + 18}px`, paddingRight: '4px' }}
      onDoubleClick={() => onInspect(asset)}
    >
      {/* Thumbnail / icon */}
      {isAudio ? (
        <span className="text-sm shrink-0 select-none inline-flex" title={t.assets.audioTitle}><EmojiIcon name="speaker" size={20} /></span>
      ) : isVideo ? (
        <span className="text-sm shrink-0 select-none inline-flex" title={t.assets.videoTitle}><EmojiIcon name="video" size={20} /></span>
      ) : previewSrc ? (
        <img
          src={previewSrc}
          className="w-5 h-5 object-cover rounded border border-slate-700 shrink-0"
          draggable={false}
          onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }}
        />
      ) : (
        <span className="text-sm shrink-0 select-none inline-flex"><EmojiIcon name="image" size={20} /></span>
      )}

      {/* Name */}
      <span
        className="text-xs text-slate-300 flex-1 truncate"
        title={asset.relativePath}
      >
        {asset.name}
      </span>

      {/* Delete */}
      <button
        className="opacity-0 group-hover/row:opacity-100 text-slate-600 hover:text-red-400 text-xs cursor-pointer transition-opacity shrink-0 px-0.5"
        title={t.assets.removeTitle}
        onClick={e => { e.stopPropagation(); ask(
          { message: t.assets.confirmDeleteFile(asset.name), variant: 'danger' },
          () => onDelete(asset.id),
        ); }}
      >
        <EmojiIcon name="close" size={20} />
      </button>
      {confirmModal}
    </div>
  );
}

// ─── Tiny action button ───────────────────────────────────────────────────────

function ActionBtn({
  children, title, onClick, danger = false,
}: {
  children: React.ReactNode;
  title?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`text-[10px] px-0.5 cursor-pointer transition-colors ${
        danger
          ? 'text-slate-600 hover:text-red-400'
          : 'text-slate-600 hover:text-indigo-400'
      }`}
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
  );
}
