# Architecture Documentation — AIA Studio Lite

## Overview
AIA Studio Lite is a stripped-down version of AIA Studio focused exclusively on **video pre-production** (scriptwriting, timeline building, DaVinci export) and **local file management** with FFmpeg-powered thumbnails. All AI, database, and monitoring components have been removed.

## System Architecture

```
User → browser opens builder.html (file:// or served via FastAPI)
         │
         ├─ Timeline (app.js)
         │    ├─ Scene CRUD, Undo/Redo, SafeStorage (A/B Slot)
         │    ├─ 🔗 Lite File Explorer → hierarchical browse via GET /lite/files
         │    │    ├─ CRUD: rename, delete, move, create/delete/rename folders
         │    │    ├─ Drag & Drop with dynamic auto-scroll (40% hitbox)
         │    │    └─ Depth-memory navigation (liteDeepestPath)
         │    ├─ Thumbnails → <img src="/thumbnail?path=...&folder=...">
         │    ├─ 🎨 Neon file-type coloring via data-type CSS attributes
         │    ├─ 🔍 Timeline Navigator → search, jump, |< >| buttons
         │    ├─ 🚩 Timeline Outline Sidebar → scrollable card list (Ctrl+Enter toggle)
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
- **Reactivity**: Re-renders on every `render()` call if open. `timelineNavGoTo(sceneId)` sets `selectedId` and calls `render()`.

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
