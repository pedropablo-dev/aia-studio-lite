# Frontend Documentation — AIA Studio Lite

**Type**: Modular SPA (HTML + CSS + ES6 Modules, no framework)

## File Structure
```
src/
├── builder.html          # Main HTML shell (modals, nav bar, footer, outline sidebar)
├── css/
│   └── style.css         # All CSS (dark theme, neon colors, outline panel, disabled states)
└── js/
    ├── state.js           # ES Module — Centralized projectState (encapsulated global state)
    ├── projectState.js    # Legacy compatibility shim for projectState
    ├── ui-renderer.js     # ES Module — render(), renderTimelineOutline(), sysDialog(), Modal
    ├── ui-modals.js       # Configuration modals (colors, sections, speakers, tech, checklist)
    ├── scene-operations.js # Scene CRUD, reset, insert, duplicate (via createBaseScene)
    ├── app.js             # Initialization, Undo/Redo, global event listeners (debounced save)
    ├── storage.js         # SQLite sync, debouncedSaveState (3000ms), load/save pipeline
    ├── api-client.js      # API abstraction layer (Lite CRUD, project persistence, route verification)
    ├── lite-explorer.js   # Lite File Modal — hierarchical navigation, drag-and-drop, search
    ├── drag-drop.js       # Timeline card drag-and-drop reordering
    ├── shortcuts.js       # Keyboard shortcut registration and guards
    ├── exporters.js       # DaVinci XML, EDL, SRT, TXT, MD exports (pure client-side)
    └── projectManager.js  # Project load/save/create/delete UI (SQLite Projects API)
```

## Module Architecture (ES6)
All inline event handlers (`onclick`, `onchange`, `oninput`, etc.) have been **eradicated** from `builder.html`. Event binding is handled exclusively via:
1. **Event Delegation** — A single listener on `#timeline-container` in `ui-renderer.js` handles all card-level clicks, changes, inputs, and drag events via `event.target.closest()`.
2. **DOMContentLoaded Listeners** — Each module registers its own listeners on page load.
3. **Global Window Exports** — Functions needed cross-module are exposed via `window.functionName = ...`.

### State Management
- `state.js` exports a singleton `projectState` object containing all mutable state (scenes, config, zoom, history).
- The legacy `blobCache` has been encapsulated inside `projectState.setBlobCache()` with automatic `URL.revokeObjectURL()` cleanup.
- The legacy `imageBank` has been **fully erased** from the codebase (constructor, window alias, render lookup, and outline renderer). All thumbnails are served via `/thumbnail` API.
- No bare `let data = []` globals exist — all state is accessed via `projectState.propertyName`.
- `recentColors` is capped at **20 entries** via FIFO eviction (`shift()` on overflow) to prevent unbounded heap growth.

---

## UI Structure

### Header
- **Project Title**: Inline editable input.
- **History Controls**: Undo / Redo buttons.
- **Checklist**: Interactive production step tracker (customizable items).
- **Zoom**: Timeline zoom slider + fit/reset/focus buttons.

### Timeline (Viewport)
Flexbox container holding **Scene Cards**, each with:
- **Drop Zone**: 16:9 area for drag-and-drop images, or auto-populated thumbnails from `/thumbnail` API. Click disabled — only drag-and-drop or 🔗 button.
- **Linked File Label**: Shows the linked file name with neon color based on type (via `data-type` attribute and `.linked-file-name` class). Click copies filename (basename only) to clipboard. **Dead Link Detection**: If the file no longer exists on disk, the icon changes from 🔗 to ⚠️ and the path is displayed in red with strikethrough.
- **Scene Stats**: Number, Title, Duration.
- **Script Area**: Textarea for voiceover/dialogue.
- **Visual Tags**: Shot type tab (top), Section color bar (bottom).
- **Speaker Badge**: Assignable speaker with color.
- **Timing Mode**: Auto (word count) / Manual (locked) / Video (synced via FFprobe).
- **🔗 Link Button**: Opens the **Lite File Modal** to browse and link media files.

### DOM Reconciliation (Zero-Flicker Rendering)
The `render()` function in `ui-renderer.js` uses **surgical DOM patching** instead of full innerHTML rebuilds:
1. **Orphan Purging**: Cards for deleted scenes are removed.
2. **O(1) Node Lookup**: A `Map<id, Element>` (`cardMap`) is pre-built before the scene loop. Each card is retrieved with `cardMap.get(scene.id)` — O(1) instead of the previous O(n²) `querySelector` inside the loop.
3. **Attribute Diffing**: Existing cards are mutated in-place — only changed attributes are updated.
4. **Image Stability** (`data-current-media`): Before touching a thumbnail's `src` or opacity, the renderer compares `img.dataset.currentMedia` against `scene.linkedFile`. If identical, the image is left untouched. This prevents flickering during Undo/Redo or text edits.
5. **Geometric Reordering**: `container.insertBefore()` is used instead of `container.appendChild()` to preserve scroll position. Cards are only moved if they are out of order.

### Async Thumbnail Polling (Timeline)
When the `/thumbnail` API returns HTTP `202 Accepted` (FFmpeg still processing), the frontend:
1. Shows a CSS `.loading-spinner` on the thumbnail container.
2. Retries via `setTimeout` every 800ms (max 5 retries).
3. On HTTP `200`, **revokes the previous blob URL** (`URL.revokeObjectURL(img.src)`) to prevent memory leaks, then creates a new Object URL and fades in the image with `opacity: 0 → 1` transition (0.4s ease-in).
4. **Fallback on exhaustion**: If all retries are consumed (e.g., video too large, FFmpeg timeout), the spinner is removed and a definitive 🎬 fallback icon is injected into the container.

### Async Thumbnail Polling (Explorer)
The Lite File Modal uses an identical polling pattern via `loadExplorerThumbnail()` in `lite-explorer.js`:
1. Each media card renders with `data-explorer-thumb-url` (no static `src`). A `.loading-spinner` is applied by default.
2. `_kickExplorerThumbnailPolling()` runs after each grid render (browse and search modes), initiating async polling for all visible thumbnails.
3. Polling retries every 1000ms (max 10 retries). Same `revokeObjectURL` + blob URL pattern.
4. Fallback 🎬 icon on exhaustion. Guard prevents duplicate `pollingStarted` assignment.

### DB Sync Integrity Badge
If `saveState()` in `storage.js` throws (disk full, server down, network error):
- A **persistent** `#db-sync-warning` badge appears at bottom-right: "⚠️ Sin guardar (Error de Disco)".
- Badge auto-disappears when the next save succeeds (`hideDbSyncWarning()`).
- Guard `getElementById` prevents duplicate badges.

### Dead Link Verification (Phase 9)
After each `render()`, a debounced (1000ms) async function `triggerRouteVerification()`:
1. Collects all unique `linkedFile` paths from scenes.
2. Sends them to `POST /lite/verify_routes`.
3. Any paths returned as `missing` flag the scene with `scene._isMissing = true`.
4. On next render, the label shows ⚠️ in red with strikethrough instead of 🔗.

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
  3. Fallback → 🎬 icon.
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
3. **Toolbar row**: View toggle (Grid/List), Sort selector (Name/Type), Search input, ✕ Clear button, **↻ Refresh button** (reloads current directory), File counter, ◀ Back / ▶ Forward buttons.
4. **File grid** (`#quick-file-list`) with draggable file/folder cards. Thumbnails load asynchronously via `loadExplorerThumbnail()` polling.

### Navigation Flow
1. `openQuickFileModal(sceneId)` is called from a scene card's 🔗 button, or `openQuickFileModal(null, '')` for Modo Organización.
2. **Contextual Open**: If the modal is closed and the scene has a `linkedFile`, the modal opens directly in the file's parent folder (extracted via `lastIndexOf('/')`). This guard only fires when `modal.style.display !== 'flex'` to avoid overriding internal navigation.
3. `GET /lite/files?folder=<root>&subpath=<path>` fetches items for the current level.
4. Results are rendered as card elements with type badges, thumbnails, and direct interaction buttons.
5. Clicking a file calls `selectLiteFile(path)` → sets `scene.linkedFile` → re-renders.

### File Management (CRUD)
All operations use `sysDialog()` for confirmation and `_litePost()` for API calls:
- **Rename** (`liteRenameFile`): Prompt for new name → `POST /lite/files/rename`.
- **Delete** (`liteDeleteFile`): Confirm dialog → `POST /lite/files/delete`.
- **Move** (`liteMoveFileTo`): Drag & Drop → `POST /lite/files/move`.
- **Rename Folder** (`liteRenameFolder`): Prompt → `POST /lite/folders/rename`. Syncs all child `linkedFile` references.
- **Create Folder** (`liteCreateFolder`): Prompt → `POST /lite/folders/create`.
- **Delete Folder** (`liteDeleteFolder`): Confirm → `POST /lite/folders/delete`.
- **Sync**: `_syncLinkedFile(oldPath, newPath)` updates all scenes referencing a moved/renamed/deleted file.

---

## Neon File-Type Color System
Scene cards in the timeline emit a `data-type` attribute based on the linked file extension:
| Extension Group | `data-type` | Timeline Color | Outline Color |
|-----------------|-------------|----------------|---------------|
| `.mp4`, `.mov`, `.avi`, `.mkv`, `.mxf`, `.webm` | `video` | `#00ff41` | `#a5d6a7` |
| `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp` | `image` | `#00d4ff` | `#81d4fa` |
| `.mp3`, `.wav`, `.aac`, `.flac`, `.ogg`, `.m4a` | `audio` | `#d500f9` | `#ce93d8` |

---

## State & Persistence
- **SQLite ORM**: Projects are auto-saved to `aia_studio.db` in the External Media Root via `POST /api/projects`.
- **Debounced Save**: `debouncedSaveState()` waits **3000ms** after user input before pushing to SQLite, preventing API spam. Global `input` and `change` listeners on `document` trigger this automatically.
- **Cold Boot Sync**: `loadFromLocal()` fetches the database payload and blocks initial UI rendering until the DOM is synchronized.
- **Clean JSON Export**: `Ctrl+S` → `manualBackup()` downloads a schema-compliant JSON (no legacy `imageId`/`imageBank` pollution).
- **Undo/Redo**: In-memory stack with **dynamic cap** — 50 states for projects ≤300 scenes, 10 for larger projects (prevents OOM at scale).
- **Global State**: `projectState.selectedId` tracks the currently selected scene card (used by outline + timeline).

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
