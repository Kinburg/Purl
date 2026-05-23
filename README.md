# Purl

A visual desktop editor designed to simplify building interactive stories with [SugarCube 2](https://www.motoslave.net/sugarcube/2/). It allows you to create complex narratives without writing code, exporting directly to a playable HTML file or standard `.twee` source code.

## Features

### Scene Editor
The core of Purl is its intuitive scene editor, where you build your story using a variety of content blocks.
- **Content blocks**:
    - **Text**: Standard story text with formatting options.
    - **Character Dialogue**: Assign dialogue to characters, with support for dynamic avatar changes based on character states (e.g., emotions).
    - **Choice**: Create branching paths with interactive options for the player.
    - **Condition (IF/ELSE IF/ELSE)**: Visually manage complex logic branches, nesting other blocks inside conditions.
    - **Variable Set**: Easily modify numerical, string, or boolean variables.
    - **Image**: Embed images, with options for variable binding.
    - **Video**: Embed video files.
    - **Button**: Interactive buttons that can trigger actions or navigate.
    - **Input Field**: Allow players to input text, which can be stored in variables.
    - **HTML Table**: For structured data presentation.
    - **Raw SugarCube Code**: For advanced users who need to insert custom SugarCube macros or JavaScript directly.
    - **Note**: Editor-only comments for your workflow, not included in the final story.
    - **Divider**: A visual separator within a scene.
    - **Checkbox**: Interactive checkboxes to manage boolean variables or flags.
    - **Radio Button**: Allow players to select one option from a group, updating a variable.
    - **Include**: Embed content from another scene directly into the current one.
    - **Function Call Button**: A button to trigger specific functions or logic.
- **Drag-and-drop** sorting for blocks and scenes.
- **Nested blocks** inside condition branches for clear logic flow.
- **Search** by text and variable usage — click results to navigate to the scene and block.
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y), with a 100-step history.

### Project Management
- **Characters**: Define characters with customizable names, colors, and dynamic avatars (multiple states/expressions).
- **Variables**: Manage number, string, and boolean variables with types and default values.
- **Media Assets**: Organize images and video files, with support for variable bindings.
- **Sidebar Panel (StoryCaption)**: A visual editor for the StoryCaption area, allowing you to display text, variables, progress bars, images, or raw code.
- **Export**: Projects are saved in a `.purl` JSON format and can be exported as a playable `index.html` file (with assets) or as standard `.twee` source code.

### Tools
- **Scene Graph**: An interactive node-based map visualizing transitions between passages, with drag-and-drop nodes (separate window).
- **Code Preview**: A live-updating `.twee` output for the active scene (separate window), showing the generated code in real-time.
- **Localization**: UI available in English and Ukrainian.

## Installation

Download the latest release from the [Releases](../../releases) page:

- `Purl-Setup-x.x.x.exe` — installer with custom install directory
- `Purl-x.x.x-win.zip` — portable version

## Setup for Exporting

To enable exporting to `.html` and `.twee`, you must first provide the SugarCube 2 runtime to the application. This is a one-time setup process.

1.  **Download SugarCube 2**: Go to the official [SugarCube 2 website](https://www.motoslave.net/sugarcube/2/) and download the latest version.
2.  **Extract the Archive**: Unzip the downloaded file to a location on your computer.
3.  **Import the Runtime**:
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

| Layer     | Technologies                         |
|-----------|--------------------------------------|
| UI        | React 19, TypeScript, Tailwind CSS 4 |
| State     | Zustand 5                            |
| Desktop   | Electron 40, vite-plugin-electron    |
| Build     | Vite 7, esbuild                      |
| Graph     | @xyflow/react, @dagrejs/dagre        |
| Packaging | electron-builder (NSIS + ZIP)        |

## Releasing

```bash
npm version patch   # 1.0.0 → 1.0.1  (or minor / major)
git push
git push --tags
```

GitHub Actions will automatically build the installer and create a Release with artifacts.


## License

MIT