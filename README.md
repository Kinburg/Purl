# Purl

A visual desktop editor designed to simplify building interactive stories with [SugarCube 2](https://www.motoslave.net/sugarcube/2/). It allows you to create complex narratives without writing code, exporting directly to a playable HTML file or standard `.twee` source code.

## Features

### Scene Editor

The core of Purl is its visual scene editor, where you build your story from 20 content block types grouped by category:

**Content**
- **Text** — story text with optional live updates that re-render on state change.
- **Dialogue** — character lines with dynamic avatars driven by state variables and per-character LLM settings.
- **Image** — static, or bound to a variable + mapping.
- **Video** — embed video files; volume slider can sync with audio.
- **Audio** — immediate or delayed playback, loop, stop-on-leave, autoplay-unlock overlay for browser policies.
- **Table** — inline-styled HTML table with cell types (text, image, button, progress bar, list, audio volume).
- **Divider** — visual separator with customizable color, thickness, margin.
- **Note** — editor-only comments; never exported.

**Interaction**
- **Choice** — branching options.
- **Button** — actions, navigation, variable updates, popup triggers, function calls.
- **Link** — inline link to scene or back; same styling system as buttons.
- **Function** — call a `[func]`-tagged scene; state changes persist.
- **Input Field** — capture text into a variable.
- **Checkbox** — flags mode (one bool var per option) or array mode (single array var).
- **Radio Button** — pick one option, write the value into a string variable.
- **Include** — embed another scene's content inline (optionally bordered/styled).
- **Popup** — modal dialogs powered by `[popup]`-tagged scenes.

**Logic**
- **Condition (IF / ELSE IF / ELSE)** — visual branching with nested blocks inside each branch. Operators include `==`, `!=`, `>`, `<`, range (`a ≤ x ≤ b`), `contains`, `!contains`, `empty`, `!empty`.
- **Variable Set** — manual, random, expression, or dynamic mode (variable + mapping → result).

**System**
- **Raw SugarCube Code** — escape hatch for arbitrary SugarCube/JS.

**Editor features across all blocks:**
- **Drag-and-drop** sorting for blocks and scenes.
- **Nested blocks** inside condition branches and dialogue bubbles.
- **Block effects**: per-block delay, entrance animation (fade + offset), and typewriter effect (Text and Dialogue).
- **Search** by text and variable usage with click-to-navigate to scene + block.
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y), 100-step history.
- **AI text generation** for any text/dialogue field — KoboldCPP, Google Gemini, or OpenAI-compatible providers with streaming, history navigation, and per-character temperature.

### Project Management

- **Characters** — names, colors, dynamic avatars (multiple states / expressions / generated images).
- **Variables** — number, string, boolean, and array types. Hierarchical groups compile to real SugarCube objects with dot-path access (`$chars.developer.name`); inline `$` picker in every text field.
- **Items + Inventory + Containers + Paperdoll** — full item system: wearables (with paperdoll slots), consumables (auto-generated use-effect scenes), and misc items. Static or AI-generated icons. Custom per-item properties.
- **Watchers** — background variable tracking. Conditions fire on rising edge (`false → true`) and run actions or navigate to a scene. Unconditional watchers run on every state change.
- **Background styles** — per-scene and per-panel backgrounds in static, variable-bound, or AI-generated modes.
- **Block styles cascade** — three-tier styling per block type (standard / common custom / spot custom).
- **Media Assets** — image, video, audio organized in folders. Full bidirectional disk sync; delete from app deletes from disk. Asset Info modal with previews and metadata.
- **Sidebar Panel (StoryCaption)** — visual editor for the sidebar area with text, variables, progress bars, images, buttons, and audio volume controls. Cell-width auto-balance to 100%.
- **Resizable sidebar** with drag handle (220–600 px).
- **Workspace presets** — six built-in window layouts + user-defined. Window positions persist as screen-relative percentages.
- **Export**: projects save as `.purl` JSON. Export to playable `index.html` (with assets) or standard `.twee` source for Twine compatibility.

### Tools (split panels in main window)

- **Scene Graph** — interactive node map of passage transitions with drag-and-drop nodes; popup scenes shown as isolated nodes.
- **Code Preview** — live-updating `.twee` output for the active scene.
- **Twine import** — bring `.twee` or `.html` (SugarCube) projects into Purl with block recognition (conditions with raw-expression fallback, loops, object assignment, expression-mode variables) and a `RawBlock` safety net for anything unparseable.
- **Localization** — UI available in English and Ukrainian.

## Installation

Download the latest release from the [Releases](../../releases) page:

- `Purl-Setup-x.x.x.exe` — installer with custom install directory
- `Purl-x.x.x-win.zip` — portable version

## Setup for Exporting

To enable exporting to `.html` and `.twee`, you must first provide the SugarCube 2 runtime to the application. This is a one-time setup process.

1. **Download SugarCube 2**: Go to the official [SugarCube 2 website](https://www.motoslave.net/sugarcube/2/) and download the latest version.
2. **Extract the Archive**: Unzip the downloaded file to a location on your computer.
3. **Import the Runtime**:
    - In Purl, locate and click the **"+SC Runtime"** button in the application header.
    - In the file dialog that opens, navigate to the folder where you extracted SugarCube and select the `format.js` file.

Once imported, the export functionality will be fully enabled.

## Development

```bash
# Install dependencies
npm install

# Start in development mode (Electron + Vite HMR)
npm run dev

# Build installer
npm run dist
```

**Requirements:** Node.js 20+

## Stack

| Layer     | Technologies                                     |
|-----------|--------------------------------------------------|
| UI        | React 19, TypeScript, Tailwind CSS 4             |
| State     | Zustand 5                                        |
| Desktop   | Electron 40, vite-plugin-electron                |
| Build     | Vite 7, esbuild                                  |
| Graph     | @xyflow/react, @dagrejs/dagre                    |
| LLM       | @google/genai (Gemini), KoboldCPP, OpenAI-compat |
| Packaging | electron-builder (NSIS + ZIP)                    |

## Branching Model

Two long-lived branches:

- **`master`** — production. Receives only merges from `pre-release`. Every merge triggers a release.
- **`pre-release`** — staging. All feature/fix work lands here.

Three GitHub Actions workflows wire everything together:

| Workflow | Triggered by | What it does |
|---|---|---|
| `version.yml` | push → `pre-release` | Parses commit message and bumps `package.json` (commits `chore: bump version to X.Y.Z`). |
| `release.yml` | push → `master` | Creates tag `vX.Y.Z`, builds for macOS / Linux / Windows, publishes a GitHub Release with notes generated from `feat:`/`fix:` commits. |
| `sync-back.yml` | push → `master` | Opens a PR `master → pre-release` so the two branches stay aligned after release. |

## Commit Convention

[Husky](https://typicode.github.io/husky/) enforces conventional commit prefixes (`.husky/commit-msg`). The version bump rule is the one applied by `version.yml`:

| Prefix | Bump | Use for |
|---|---|---|
| `feat: ...` | minor (`1.X.0`) | New feature |
| `fix: ...` | patch (`1.2.X`) | Bug fix or improvement |
| `site: ...` | — | Landing-page edits |
| `chore: ...` | — | Tooling, dependencies, refactoring |
| `test: ...` | — | Tests |

Merge commits and bot commits (`chore: bump version to ...`) are skipped by the validator.

## Releasing

Releases are fully automated. To ship:

1. Make sure everything you want is on `pre-release` with the right `feat:`/`fix:` prefixes — CI has already bumped the version for you.
2. Open a PR `pre-release → master` and use **Rebase and merge**.
3. CI takes over: creates the tag, builds installers on all three platforms, publishes the GitHub Release, and opens the sync-back PR.

No manual `npm version` or `git tag` needed.

## License

MIT
