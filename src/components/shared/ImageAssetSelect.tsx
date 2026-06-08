/**
 * Compact single dropdown for adding / replacing an input image in generation
 * blocks (image-gen input, video-gen input & keyframes). Picks a project image
 * asset by relative path; optionally offers a "from file…" entry that triggers
 * a file picker. Renders nothing when there are no image assets AND no file
 * option — so empty gen-input slots stay clean.
 *
 * This is intentionally separate from `ImageAssetPicker` (ImageMappingEditor),
 * which is a value-bound picker for choosing/displaying an already-set asset.
 */
export interface FlatImageAsset {
  id: string;
  name: string;
  relativePath: string;
}

export function ImageAssetSelect({
  assets,
  label,
  onPick,
  fileLabel,
  onFile,
  className,
}: {
  assets: FlatImageAsset[];
  label: string;
  onPick: (relPath: string) => void;
  /** When set, prepends a "from file…" option that calls `onFile`. */
  fileLabel?: string;
  onFile?: () => void;
  className?: string;
}) {
  if (assets.length === 0 && !onFile) return null;
  return (
    <select
      className={
        className ??
        'flex-1 min-w-0 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer'
      }
      value=""
      onChange={(e) => {
        const v = e.currentTarget.value;
        e.currentTarget.value = ''; // reset so the same option can be re-picked
        if (v === '__file') { onFile?.(); return; }
        const a = assets.find((x) => x.id === v);
        if (a) onPick(a.relativePath);
      }}
    >
      <option value="">{label}</option>
      {onFile && <option value="__file">{fileLabel}</option>}
      {assets.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );
}
