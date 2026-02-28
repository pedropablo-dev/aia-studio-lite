# Frontend Documentation — AIA Studio Lite

**Type**: Monolithic SPA (HTML + CSS + JS, no framework)

## File Structure
```
src/
├── builder.html      # Main HTML shell (modals, nav bar, footer, outline sidebar)
├── css/
│   └── style.css     # All CSS (dark theme, neon colors, outline panel, disabled states)
└── js/
    └── app.js        # All JavaScript logic (~5400+ lines)
```

## UI Structure

### Header
- **Project Title**: Inline editable input.
- **History Controls**: Undo / Redo buttons.
- **Checklist**: Interactive production step tracker (customizable items).
- **Zoom**: Timeline zoom slider + fit/reset/focus buttons.

### Timeline (Viewport)
Flexbox container holding **Scene Cards**, each with:
- **Drop Zone**: 16:9 area for drag-and-drop images, or auto-populated thumbnails from `/thumbnail` API. Click disabled — only drag-and-drop or 🔗 button.
- **Linked File Label**: Shows the linked file name with neon color based on type (via `data-type` attribute and `.linked-file-name` class). Click copies filename (basename only) to clipboard.
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
- `timelineNavGoTo(sceneId)` scrolls to the card, highlights it, and sets `selectedId`. Selection highlighting uses **Zero-Flicker** direct DOM class toggling (no full `render()` call).

### Timeline Outline Sidebar (`#timeline-outline-sidebar`)
Slide-in panel from the right edge. Toggled via:
- 🚩 **Esquema** button in the footer.
- **Ctrl+Enter** (⌘+Enter on Mac) keyboard shortcut.

Each item displays:
- **Thumbnail** (priority order):
  1. `linkedFile` → `/thumbnail` API (video/image) or 🎵 icon (audio).
  2. `tempThumbnail` → direct URL.
  3. `imageId` + `blobCache` → Base64 converted to lightweight Blob URL via `URL.createObjectURL()`.
  4. Fallback → 🎬 icon.
- **Section strip**: Colored bar with section name.
- **Title line**: Scene number + title.
- **Color + File**: Scene color dot + color name + linked file (neon-colored by type, bold).
- **Script preview**: First line of script/description.

Active item (matching `selectedId`) is highlighted via **Zero-Flicker** class toggle and auto-scrolled into view with `scrollIntoView({ block: 'center', behavior: 'smooth' })`. Clicking an item calls `timelineNavGoTo()`.

### Footer
- **⌨️ Shortcuts**: Opens the keyboard shortcuts modal.
- **+ Nueva Escena**: Creates a new scene card (`Alt+Enter`).
- **Config Buttons**: Tipo Visual, Secciones, Hablantes, Técnica.
- **Export**: 📄 Diálogos (.txt), ⬇️ Guion (.md) — both open the unified Export V3 modal with speaker checkboxes.
- **💾 Exportar** / **📥 Cargar**: JSON pure backup export and intelligent retro-compatible import.
- **📂 Explorador**: Opens the Lite File Modal in **Modo Organización** (no scene context). Also via `Alt+E`.
- **🚩 Esquema**: Opens the Timeline Outline sidebar.
- **DaVinci Tools**: 📁 Media Root Config, 🎬 XML Export, 📍 EDL Markers, 📝 SRT Subtitles.

---

## Lite File Modal (`#quick-file-modal`)

### Layout
Opened via the 🔗 button on each scene card, the 📂 Explorador button in the footer, or `Alt+E`. Contains:
1. **Title bar** with close button (`×`).
2. **Breadcrumb bar** (`#lite-breadcrumb`) showing hierarchical path.
3. **Toolbar row**: View toggle (Grid/List), Sort selector (Name/Type), Search input, File counter, ◀ Back / ▶ Forward buttons.
4. **File grid** (`#quick-file-list`) with draggable file/folder cards.

### Navigation Flow
1. `openQuickFileModal(sceneId)` is called from a scene card's 🔗 button, or `openQuickFileModal(null, '')` for Modo Organización.
2. **Contextual Open**: If the modal is closed and the scene has a `linkedFile`, the modal opens directly in the file's parent folder (extracted via `lastIndexOf('/')`). This guard only fires when `modal.style.display !== 'flex'` to avoid overriding internal navigation.
3. `GET /lite/files?folder=<root>&subpath=<path>` fetches items for the current level.
4. Results are rendered as card elements with type badges, thumbnails, and direct interaction buttons.
5. Clicking a file calls `selectLiteFile(path)` → sets `scene.linkedFile` → re-renders.

### Hierarchical Navigation (◀ / ▶)
Instead of a temporal history stack, the system uses **depth memory**:
- **Global**: `liteDeepestPath` — tracks the deepest folder ever visited in the current session.
- **◀ Back**: Navigates to the parent of `currentBrowsePath` (via `lastIndexOf('/')`).
- **▶ Forward**: Calculates the next child folder along `liteDeepestPath` from `currentBrowsePath`.
- **Button state**: Managed by `updateHistoryButtons()` — disabled via explicit `.disabled` property + CSS `opacity: 0.3`.
- **Reset**: `closeLiteFileModal()` clears `liteDeepestPath` to `''`.
- **Drop to Parent**: The `..` card supports `ondrop="_onFolderDrop(event, '..')"`. The `_onFolderDrop` function dynamically resolves the parent path from `currentBrowsePath` at runtime.

### Modo Organización
When the modal is opened without a `sceneId` (via 📂 button or `Alt+E`):
- `currentFileSceneId` is set to `null`.
- An orange badge **📁 Modo Organización** is injected into the breadcrumb bar.
- `selectLiteFile()` checks `currentFileSceneId`: if null, it shows a toast and aborts (no linking).
- File CRUD refresh calls pass `currentFileSceneId` (not `null`) to preserve context when a card was the entry point.

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
| Extension Group | `data-type` | Timeline Color | Outline Color |
|-----------------|-------------|----------------|---------------|
| `.mp4`, `.mov`, `.avi`, `.mkv`, `.mxf`, `.webm` | `video` | `#00ff41` | `#a5d6a7` |
| `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp` | `image` | `#00d4ff` | `#81d4fa` |
| `.mp3`, `.wav`, `.aac`, `.flac`, `.ogg`, `.m4a` | `audio` | `#d500f9` | `#ce93d8` |

CSS applies `!important` color overrides to `.linked-file-name` and the chain icon (`🔗` span) via `style.css`.

---

## Thumbnails on Cards
If `scene.linkedFile` is a video or image, the card's drop-zone `<img>` points to:
```
/thumbnail?path=<linkedFile>&folder=<media-root>
```
For audio files, a 🎵 icon is displayed instead. The drop-zone `onclick` is disabled — thumbnails are non-interactive.

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
- `#timeline-outline-sidebar`: fixed right panel, slide-in via `transform: translateX`.
- `.outline-item`: 72px height, `flex-shrink: 0`, scrollable flex column.

---

## State & Persistence
- **SQLite ORM**: Projects are auto-saved to `aia_studio.db` in the External Media Root via `POST /api/projects`.
- **Debounced Save**: `debouncedSaveState()` waits 1500ms after user input before pushing to SQLite, preventing API spam.
- **Cold Boot Sync**: `loadFromLocal()` fetches the database payload and blocks initial UI rendering until the DOM is synchronized.
- **Clean JSON Export**: `Ctrl+S` → `manualBackup()` strips all Base64 traces (`imageId`) before downloading the schema-compliant JSON.
- **Undo/Redo**: In-memory stack (max 50 states).
- **Global State**: `selectedId` tracks the currently selected scene card (used by outline + timeline).

## Key Interactions
- **Drag & Drop (Cards)**: Native API for images into drop zones. Drag handle (⋮⋮) for card reordering in timeline.
- **Drag & Drop (Files)**: Drag files between folders in the Lite File Modal. Auto-scroll activates at 40% edge zones. Files can be dropped on the `..` parent card.
- **Shortcuts (Hotkeys V1.2 - 10/10)**:
  - **Navegación espacial**: `Home` / `End` (Saltan al inicio/fin), `←` / `→` (Seleccionan tarjeta anterior/siguiente).
  - **Mover Escenas**: `Ctrl + ←` / `Ctrl + →` (Mueve la tarjeta seleccionada a la izquierda/derecha).
  - **Viewport**: `F` (Centrar selección), `Shift + F` (Ver todas/Fit), `0` (Reset zoom).
  - **Acciones sobre Escena**: `Alt + Enter` (Nueva), `Shift + O` (Modal de Edición), `Shift + Space` (Toggle Completado), `Delete` (Solo Supr borra tarjeta), `Ctrl + D` (Duplicar).
  - **Archivos y Globales**: `Ctrl + S` (Guardar), `Ctrl + O` (Proyectos), `Ctrl + E` (Exportar TXT), `Ctrl + L` (Vincular Media), `Alt + E` (Explorador Global), `Ctrl+Enter` (Ver Esquema), `Shift+?` (Ayuda).
  - **Escape Master**: `Esc` evalúa cierres jerárquicos (1. Cierra Modales activos -> 2. Limpia Selección actual).
