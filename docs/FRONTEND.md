# Frontend Documentation — AIA Studio Lite

**Type**: Monolithic SPA (HTML + CSS + JS, no framework)

## File Structure
```
src/
├── builder.html      # Main HTML shell (modals, nav bar, footer)
├── css/
│   └── style.css     # All CSS (dark theme, neon colors, disabled states)
└── js/
    └── app.js        # All JavaScript logic (~5100 lines)
```

## UI Structure

### Header
- **Project Title**: Inline editable input.
- **History Controls**: Undo / Redo buttons.
- **Checklist**: Interactive production step tracker (customizable items).
- **Zoom**: Timeline zoom slider + fit/reset/focus buttons.

### Timeline (Viewport)
Flexbox container holding **Scene Cards**, each with:
- **Drop Zone**: 16:9 area for drag-and-drop images, or auto-populated thumbnails from `/thumbnail` API.
- **Linked File Label**: Shows the linked file name with neon color based on type (via `data-type` attribute and `.linked-file-name` class). Clickable 🔗 icon to copy path.
- **Scene Stats**: Number, Title, Duration.
- **Script Area**: Textarea for voiceover/dialogue.
- **Visual Tags**: Shot type tab (top), Section color bar (bottom).
- **Speaker Badge**: Assignable speaker with color.
- **Timing Mode**: Auto (word count) / Manual (locked) / Video (synced via FFprobe).
- **🔗 Link Button**: Opens the **Lite File Modal** to browse and link media files.

### Timeline Navigator Bar (`#timeline-nav-bar`)
Fixed at the bottom of the viewport. Contains:
- `|<` / `>|` buttons → jump to first/last scene.
- `IR A` label + text input → search by scene number or script text.
- `⏎` button → jump to match.
- `✕` button (`#lite-nav-clear`) → clear search and hide dropdown.
- Dropdown results panel (`#timeline-nav-results`) appears below with clickable matches.

### Footer
- **⌨️ Shortcuts**: Opens the keyboard shortcuts modal.
- **+ Nueva Escena**: Creates a new scene card (`Alt+Enter`).
- **Config Buttons**: Tipo Visual, Secciones, Hablantes, Técnica.
- **Export**: Copiar Diálogo, Markdown, Guardar JSON, Cargar JSON.
- **DaVinci Tools**: 📁 Media Root Config, 🎬 XML Export, 📍 EDL Markers, 📝 SRT Subtitles.

---

## Lite File Modal (`#quick-file-modal`)

### Layout
Opened via the 🔗 button on each scene card. Contains:
1. **Title bar** with close button (`×`).
2. **Breadcrumb bar** (`#lite-breadcrumb`) showing hierarchical path.
3. **Toolbar row**: View toggle (Grid/List), Sort selector (Name/Type), Search input, File counter, ◀ Back / ▶ Forward buttons.
4. **File grid** (`#quick-file-list`) with draggable file/folder cards.

### Navigation Flow
1. `openQuickFileModal(sceneId)` is called from a scene card's 🔗 button.
2. **Contextual Open**: If the modal is closed and the scene has a `linkedFile`, the modal opens directly in the file's parent folder (extracted via `lastIndexOf('/')`). This guard only fires when `modal.style.display !== 'flex'` to avoid overriding internal navigation.
3. `GET /lite/files?folder=<root>&subpath=<path>` fetches items for the current level.
4. Results are rendered as card elements with type badges, thumbnails, and context menus.
5. Clicking a file calls `selectLiteFile(path)` → sets `scene.linkedFile` → re-renders.

### Hierarchical Navigation (◀ / ▶)
Instead of a temporal history stack, the system uses **depth memory**:
- **Global**: `liteDeepestPath` — tracks the deepest folder ever visited in the current session.
- **◀ Back**: Navigates to the parent of `currentBrowsePath` (via `lastIndexOf('/')`).
- **▶ Forward**: Calculates the next child folder along `liteDeepestPath` from `currentBrowsePath`.
- **Button state**: Managed by `updateHistoryButtons()` — disabled via explicit `.disabled` property + CSS `opacity: 0.3`.
- **Reset**: `closeLiteFileModal()` clears `liteDeepestPath` to `''`.

### File Management (CRUD)
All operations use `sysDialog()` for confirmation and `_litePost()` for API calls:
- **Rename** (`liteRenameFile`): Prompt for new name → `POST /lite/files/rename`.
- **Delete** (`liteDeleteFile`): Confirm dialog → `POST /lite/files/delete`.
- **Move** (`liteMoveFileTo`): Drag & Drop → `POST /lite/files/move`.
- **Rename Folder** (`liteRenameFolder`): Prompt → `POST /lite/folders/rename`. Syncs all child `linkedFile` references.
- **Create Folder** (`liteCreateFolder`): Prompt → `POST /lite/folders/create`.
- **Delete Folder** (`liteDeleteFolder`): Confirm → `POST /lite/folders/delete`.
- **Sync**: `_syncLinkedFile(oldPath, newPath)` updates all scenes referencing a moved/renamed/deleted file.

### Drag & Drop Auto-Scroll
The `_onFolderDragOver` handler uses **dynamic geometry** for auto-scroll:
- `hitbox = rect.height * 0.40` — 40% of the visible area at each edge.
- Only 20% of the center is a neutral (no-scroll) zone.
- Speed: `40px` per interval tick (20ms).

---

## Neon File-Type Color System
Scene cards in the timeline emit a `data-type` attribute based on the linked file extension:
| Extension Group | `data-type` | Color |
|-----------------|-------------|-------|
| `.mp4`, `.mov`, `.avi`, `.mkv`, `.mxf`, `.webm` | `video` | `#00ff41` (electric green) |
| `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp` | `image` | `#00d4ff` (cyan blue) |
| `.mp3`, `.wav`, `.aac`, `.flac`, `.ogg`, `.m4a` | `audio` | `#d500f9` (electric magenta) |

CSS applies `!important` color overrides to `.linked-file-name` and the chain icon (`🔗` span) via `style.css`.

---

## Custom Dialog System (`sysDialog`)
Replaces all native browser dialogs. Rendered into `#sys-dialog-overlay` in `builder.html`.
- **Modes**: `confirm`, `prompt`, `alert`.
- **Returns**: `Promise<{ confirmed: boolean, value: string|null }>`.
- **Options**: `title`, `message`, `icon`, `defaultValue`, `confirmLabel`, `cancelLabel`, `confirmClass`.
- **Keyboard**: `Enter` confirms, dialog is modal and blocks interaction.

---

## Thumbnails on Cards
If `scene.linkedFile` is a video or image, the card's drop-zone `<img>` points to:
```
/thumbnail?path=<linkedFile>&folder=<media-root>
```
For audio files, a 🎵 icon is displayed instead.

---

## CSS System
Dark mode by default using CSS Variables:
- `--bg-color`: `#121212`
- `--accent`: `#2979ff`
- `--card-width`: `360px`
- `--color-video`: `#00ff41`
- `--color-image`: `#00d4ff`
- `--color-audio`: `#d500f9`

### Notable Rules
- `#btn-hist-back:disabled, #btn-hist-forward:disabled`: `opacity: 0.3; pointer-events: none; cursor: not-allowed` (all `!important`).
- `.scene-card[data-type="..."] .linked-file-name`: neon color overrides.
- `.file-card[data-type="..."]`: type-based badge backgrounds and hover glows.

---

## State & Persistence
- **SafeStorage**: A/B slot rotation in LocalStorage (debounced 2s).
- **Image Bank**: IndexedDB store (`AIA_VideoBuilder_Images`) for heavy image blobs.
- **Manual Backup**: `Ctrl+S` → `manualBackup()`.
- **Undo/Redo**: In-memory stack (max 50 states), excludes image data.

## Key Interactions
- **Drag & Drop (Cards)**: Native API for images into drop zones. Drag handle (⋮⋮) for card reordering in timeline.
- **Drag & Drop (Files)**: Drag files between folders in the Lite File Modal. Auto-scroll activates at 40% edge zones.
- **Shortcuts**: `Ctrl+Z` (Undo), `Ctrl+Y` (Redo), `Ctrl+S` (Backup), `Alt+Enter` (New Scene), `Shift+?` (Shortcuts modal).
