# Architecture Documentation — AIA Studio Lite

## Overview
AIA Studio Lite is a lightweight, local-first video pre-production toolkit focused on **scriptwriting, timeline building, and DaVinci Resolve export**, backed by a **hierarchical file manager** with full CRUD and **FFmpeg-powered** media thumbnails. All AI/DB/monitoring dependencies have been removed from the original AIA Studio.

## System Architecture

```
User → browser opens builder.html (served via FastAPI on port 9999)
         │
         ├─ Frontend (13 ES6 Modules)
         │    ├─ state.js           → Centralized projectState (encapsulated singleton)
         │    ├─ ui-renderer.js     → render(), DOM reconciliation, event delegation, thumbnail polling
         │    ├─ ui-modals.js       → Configuration modals (colors, sections, speakers, tech)
         │    ├─ scene-operations.js → Scene CRUD (createBaseScene, reset, insert, move)
         │    ├─ app.js             → Init, Undo/Redo, global input/change → debouncedSave
         │    ├─ storage.js         → SQLite sync, debouncedSaveState (3000ms), schema migration
         │    ├─ api-client.js      → API abstraction (Lite CRUD, projects, route verification)
         │    ├─ lite-explorer.js   → Hierarchical file browser modal
         │    ├─ drag-drop.js       → Timeline card drag-and-drop reordering
         │    ├─ shortcuts.js       → Keyboard shortcut registration
         │    ├─ exporters.js       → DaVinci XML, EDL, SRT, TXT, MD exports (client-side)
         │    ├─ projectManager.js  → Project load/save/create/delete UI
         │    └─ projectState.js    → Legacy compatibility shim
         │
         └─ FastAPI Backend (api.py, port 9999)
              ├─ GET  /lite/files             — hierarchical directory listing + recursive search
              ├─ POST /lite/files/*           — rename, delete, move files
              ├─ POST /lite/folders/*         — create, delete, rename folders
              ├─ POST /lite/verify_routes     — bulk dead-link file verification
              ├─ GET  /thumbnail              — image passthrough or async FFmpeg extraction (HTTP 202)
              ├─ POST /api/projects           — upsert project (SQLite ORM)
              ├─ GET  /api/projects           — list all projects
              ├─ GET  /api/projects/{id}      — load full project
              ├─ DELETE /api/projects/{id}    — delete project
              ├─ POST /optimize_storage       — SQLite VACUUM (defragment DB)
              ├─ @startup                     — DB init + cleanup_orphan_thumbnails()
              └─ @shutdown                    — kill FFmpeg tasks + final GC
```

## Decoupled Storage Pattern
- **Codebase**: Contains only logic (`src/`), docs, and lightweight resources.
- **Media Assets**: Reside at an **External Media Root** defined by `AIA_MEDIA_ROOT` in `.env`, or configured at runtime via the 📁 button in the UI.
- **Path Resolution**: `src/utils.py` handles all path mapping using `pathlib` and `python-dotenv`.

## Thumbnail Cache (`.lite_cache/`)
- **Location**: Project root → `.lite_cache/` (auto-created).
- **Strategy**: When `/thumbnail` receives a video path, it checks for a cached JPEG. If not found, FFmpeg extracts a single frame at `00:00:01` at **native resolution** with quality `-q:v 2` and stores it with a flattened filename (slashes → underscores). The endpoint returns HTTP `202 Accepted` while FFmpeg processes, enabling the frontend to poll asynchronously.
- **Images**: Served directly without caching.
- **Audio**: Returns 404 (no visual thumbnail).
- **Cache Invalidation**: Lite write endpoints (`rename`, `delete`, `move`) automatically evict stale cache entries via `_delete_cache_entry()`.
- **Garbage Collection**: `cleanup_orphan_thumbnails()` runs at server startup and shutdown, comparing cached `.jpg` files against active `linkedFile` entries in SQLite. Orphaned files are automatically deleted.

## Persistence (SQLite ORM)
- **Database Engine**: SQLAlchemy over SQLite. Database file `aia_studio.db` is stored cleanly in the external `AIA_MEDIA_ASSETS` root.
- **Auto-Save Mechanism**: Silent, non-blocking `debouncedSaveState()` (**3000ms** delay) pushes the current memory state to `POST /api/projects`. Global `input` and `change` event listeners on `document` trigger this automatically.
- **Media Linking Pattern**: No Base64 data is stored in the database. Scenes persist only relative paths (`linkedFile`).
- **Manual Export**: `Ctrl+S` forces an immediate commit + a downloadable, sanitized JSON file strictly following the new schema.
- **Undo/Redo**: In-memory stack (max 50 states), tracks flat scene lists.
- **Storage Optimization**: `POST /optimize_storage` executes `VACUUM;` on the SQLite database to reclaim disk space after mass deletions.

## Backend Lifecycle Events

### Startup (`@app.on_event("startup")`)
1. Initializes SQLite database tables.
2. Creates cache directories.
3. Runs `cleanup_orphan_thumbnails()` to purge stale cached thumbnails.

### Shutdown (`@app.on_event("shutdown")`)
1. Terminates all in-flight FFmpeg processes registered in `active_tasks`.
2. Runs a final round of `cleanup_orphan_thumbnails()`.
3. Logs clean shutdown confirmation.

## DOM Reconciliation (Zero-Flicker)
The `render()` function in `ui-renderer.js` uses a **surgical DOM patching** strategy:
1. **Orphan Purging**: Cards for deleted scenes are removed from the DOM.
2. **Attribute Diffing**: Existing cards are mutated in-place — only changed attributes are updated.
3. **Image Stability** (`data-current-media`): Before touching a thumbnail `src` or resetting opacity, the renderer compares `img.dataset.currentMedia` against the scene's `linkedFile`. If identical, no mutation occurs.
4. **Scroll-Safe Reordering**: `container.insertBefore()` replaces `container.appendChild()` — cards are only moved in the DOM tree if they are out of order, preserving the user's scroll position.

## Event Delegation
All inline event handlers have been **fully eradicated** from `builder.html`. A single delegated listener on `#timeline-container` handles all card-level events (click, change, input, dragstart, dragover, drop) via `event.target.closest()` pattern matching.

## Dialog Systems
The frontend uses **two coexisting** dialog systems:

### `sysDialog()` (Primary)
Async Promise-based modal rendered into `#sys-dialog-overlay` in `builder.html`. Supports `confirm`, `prompt`, and `alert` modes with custom icons, labels, and button classes. Used by the Lite File Explorer for all CRUD confirmation dialogs.

### `Modal.confirm/prompt/alert` (Secondary)
Object-based dialog system using `#modal-overlay`. Supports `confirm`, `prompt`, and `alert` modes. Used by secondary modules for confirmation and input dialogs.

## Zero-Flicker Selection
- **Mechanism**: `toggleSelection(event, id)` does **not** call `render()`. Instead, it toggles `.selected` on `.scene-card` elements and `.active` on `.outline-item` elements via direct `classList.toggle()`, eliminating DOM reconstruction flicker.
- **Scroll Sync**: After toggling, the active `.outline-item` is scrolled into view with `scrollIntoView({ block: 'center', behavior: 'smooth' })`.

## File-Type Color System
Scene cards emit a `data-type` attribute (`video`, `image`, `audio`) based on the linked file extension. CSS rules in `style.css` apply neon colors:
- **Video**: `#00ff41` (electric green)
- **Image**: `#00d4ff` (cyan blue)
- **Audio**: `#d500f9` (electric magenta)

The Timeline Outline sidebar uses softer variants: `#a5d6a7`, `#81d4fa`, `#ce93d8`.

## Security
- **Path Traversal Protection**: `is_safe_path()` validates all incoming file paths against the configured root using `os.path.abspath` + `os.path.commonprefix`.
- **Lite Write Guard**: `_validate_lite_path()` ensures all write operations are confined within the Media Root and never touch the software installation directory (`_SW_ROOT`).
- **CORS**: Restricted to `localhost:9999`, `127.0.0.1:9999`, and `null` (for `file://`).

## Logging
Python `logging` module → `app.log` (persistent, UTF-8) + console stream.
