# Architecture Documentation — AIA Studio Lite

## Overview
AIA Studio Lite is a stripped-down version of AIA Studio focused exclusively on **video pre-production** (scriptwriting, timeline building, DaVinci export) and **local file management** with FFmpeg-powered thumbnails. All AI, database, and monitoring components have been removed.

## System Architecture

```
User → browser opens builder.html (file:// or served via FastAPI)
         │
         ├─ Timeline (app.js)
         │    ├─ Scene CRUD, Undo/Redo, SafeStorage (A/B Slot)
         │    ├─ ⚡ Zero-Flicker Selection → direct DOM class toggle (no full re-render)
         │    ├─ 🔗 Lite File Explorer → hierarchical browse via GET /lite/files
         │    │    ├─ CRUD: rename, delete, move, create/delete/rename folders
         │    │    ├─ Drag & Drop with dynamic auto-scroll (40% hitbox) + drop-to-parent (..)
         │    │    ├─ Depth-memory navigation (liteDeepestPath)
         │    │    └─ 📁 Modo Organización (Alt+E) → browse without scene context
         │    ├─ Thumbnails → <img src="/thumbnail?path=...&folder=...">
         │    ├─ 🎨 Neon file-type coloring via data-type CSS attributes
         │    ├─ 🔍 Timeline Navigator → search, jump, |< >| buttons
         │    ├─ 🚩 Timeline Outline Sidebar → blobCache + /thumbnail API (Ctrl+Enter)
         │    ├─ 📤 Export System V3 → unified modal (TXT/MD) with speaker checkboxes
         │    ├─ 🗨️ sysDialog() → async custom dialogs (confirm/prompt/alert)
         │    └─ 🗨️ Modal.confirm/prompt/alert → secondary async dialog system
         │
         ├─ Ingest Studio (app.js)
         │    ├─ IngestStore (state management pattern)
         │    ├─ Pagination, filtering, search, trim
         │    └─ Folder tree navigation
         │
         ├─ Media Pool (app.js)
         │    ├─ Folder tree with drag-and-drop asset management
         │    └─ Link-from-pool modal for direct scene attachment
         │
         └─ FastAPI Backend (api.py, port 9999)
              ├─ GET  /lite/files        — hierarchical directory listing + recursive search
              ├─ POST /lite/files/*      — rename, delete, move files
              ├─ POST /lite/folders/*    — create, delete, rename folders
              ├─ GET  /thumbnail         — image passthrough or FFmpeg frame extraction (native res, -q:v 2)
              ├─ GET  /raw-files         — staging area listing (paginated)
              ├─ POST /ingest/*          — trim, move to input
              ├─ Folder CRUD             — /folders (input & raw)
              └─ Asset CRUD              — /assets/* (move, rename, delete, rename folder)
```

## Decoupled Storage Pattern
- **Codebase**: Contains only logic (`src/`), docs, and lightweight resources.
- **Media Assets**: Reside at an **External Media Root** defined by `AIA_MEDIA_ROOT` in `.env`, or configured at runtime via the 📁 button in the UI.
- **Path Resolution**: `src/utils.py` handles all path mapping using `pathlib` and `python-dotenv`.

## Thumbnail Cache (`.lite_cache/`)
- **Location**: Project root → `.lite_cache/` (auto-created).
- **Strategy**: When `/thumbnail` receives a video path, it checks for a cached JPEG. If not found, FFmpeg extracts a single frame at `00:00:01` at **native resolution** with quality `-q:v 2` and stores it with a flattened filename (slashes → underscores).
- **Images**: Served directly without caching.
- **Audio**: Returns 404 (no visual thumbnail).
- **Cache Invalidation**: Lite write endpoints (`rename`, `delete`, `move`) automatically evict stale cache entries via `_delete_cache_entry()`.

## Persistence (SafeStorage v6.6)
- **A/B Slot System**: Two LocalStorage keys alternate to prevent corruption during writes.
- **Image Bank**: Binary image data stored in IndexedDB (`AIA_VideoBuilder_Images`), decoupled from the lightweight JSON state.
- **blobCache**: In-memory `{}` mapping `imageId → objectURL`. Converts Base64 data URIs from `imageBank` to lightweight `Blob URLs` via `URL.createObjectURL()` for use in the Timeline Outline sidebar. Cleared on project load/reset via `clearBlobCache()`.
- **Manual Backup**: `Ctrl+S` forces an immediate commit + downloadable JSON.
- **Undo/Redo**: In-memory stack (max 50 states), excludes image data.

## Dialog Systems
The frontend uses **two coexisting** dialog systems:

### `sysDialog()` (Primary)
Async Promise-based modal rendered into `#sys-dialog-overlay` in `builder.html`. Supports `confirm`, `prompt`, and `alert` modes with custom icons, labels, and button classes. Used by the Lite File Explorer for all CRUD confirmation dialogs.

### `Modal.confirm/prompt/alert` (Secondary)
Object-based dialog system using `#modal-overlay`. Supports `confirm`, `prompt`, and `alert` modes. Used by Ingest Studio and other modules for confirmation and input dialogs.

## Timeline Outline Sidebar
- **Toggle**: 🚩 Esquema button in footer, or `Ctrl+Enter` keyboard shortcut.
- **Behavior**: Fixed sidebar sliding from the right. Renders a scrollable list of all scene cards with thumbnail, section color, title, linked file name (neon-colored by type), and script preview.
- **Thumbnail Priority** (in order):
  1. `linkedFile` exists → `/thumbnail` API for video/image, 🎵 icon for audio.
  2. `tempThumbnail` → direct URL from camera capture.
  3. `imageId` + `blobCache` → Base64 converted to lightweight `Blob URL` via `URL.createObjectURL()`.
  4. Fallback → 🎬 icon on dark background.
- **Reactivity**: Re-renders via `renderTimelineOutline()` when the outline is open. Selection highlighting uses **Zero-Flicker** direct DOM class toggling + `scrollIntoView({ block: 'center', behavior: 'smooth' })` — no full `render()` call required.
- **Memory**: `blobCache` stores converted Blob URLs. `clearBlobCache()` is called on `loadProject()` and `resetProject()` to revoke all object URLs and prevent memory leaks.

## Zero-Flicker Selection
- **Mechanism**: `toggleSelection(event, id)` does **not** call `render()`. Instead, it toggles `.selected` on `.scene-card` elements and `.active` on `.outline-item` elements via direct `classList.toggle()`, eliminating DOM reconstruction flicker.
- **Scroll Sync**: After toggling, the active `.outline-item` is scrolled into view with `scrollIntoView({ block: 'center', behavior: 'smooth' })`.
- **Impact**: Selection changes are instantaneous with zero visual flicker, regardless of project size.

## Modo Organización (Global Explorer)
- **Trigger**: 📂 Explorador button in footer, or `Alt+E` keyboard shortcut.
- **Behavior**: Opens `openQuickFileModal(null, '')` without a `sceneId`. A badge **📁 Modo Organización** (orange) is injected into the breadcrumb bar.
- **Guard**: `selectLiteFile()` checks `currentFileSceneId`; if null, it aborts with a toast instead of linking.
- **Context Preservation**: All file CRUD operations (rename, delete, move, create/delete folder) pass `currentFileSceneId` on refresh to retain card context.

## File-Type Color System
Scene cards in the timeline emit a `data-type` attribute (`video`, `image`, `audio`) based on the linked file extension. CSS rules in `style.css` apply neon colors:
- **Video**: `#00ff41` (electric green)
- **Image**: `#00d4ff` (cyan blue)
- **Audio**: `#d500f9` (electric magenta)

The Timeline Outline sidebar uses softer variants for inline spans: `#a5d6a7` (video), `#81d4fa` (image), `#ce93d8` (audio).

## Naming Convention
| Allowed | Example |
|---------|---------|
| Spaces in filenames | `my video.mp4` |
| Snake case | `my_video.mp4` |

The API URL-decodes `%20` automatically. `sanitize_filename` only blocks path traversal (`..`, absolute paths).

## Logging
Python `logging` module → `app.log` (persistent, UTF-8) + console stream.
