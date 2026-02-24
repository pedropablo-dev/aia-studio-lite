# Architecture Documentation — AIA Studio Lite

## Overview
AIA Studio Lite is a stripped-down version of AIA Studio focused exclusively on **video pre-production** (scriptwriting, timeline building, DaVinci export) and **local file browsing** with FFmpeg-powered thumbnails. All AI, database, and monitoring components have been removed.

## System Architecture

```
User → browser opens builder.html (served by FastAPI static mount)
         │
         ├─ Timeline (app.js)
         │    ├─ Scene CRUD, Undo/Redo, SafeStorage
         │    ├─ 🔗 Lite File Linker → fetch GET /lite/files?folder=...
         │    └─ Thumbnails      → <img src="/thumbnail?path=...&folder=...">
         │
         └─ FastAPI Backend (api.py, port 9999)
              ├─ GET /lite/files   — recursive file scan
              ├─ GET /thumbnail    — image passthrough or FFmpeg frame extraction
              ├─ GET /raw-files    — staging area listing
              ├─ POST /ingest/*   — trim, move
              ├─ Folder CRUD      — /folders
              └─ Asset CRUD       — /assets/*
```

## Decoupled Storage Pattern
- **Codebase**: Contains only logic (`src/`), docs, and lightweight resources.
- **Media Assets**: Reside at an **External Media Root** defined by `AIA_MEDIA_ROOT` in `.env`, or configured at runtime via the 📁 button in the UI.
- **Path Resolution**: `src/utils.py` handles all path mapping using `pathlib` and `python-dotenv`.

## Thumbnail Cache (`.lite_cache/`)
- **Location**: Project root → `.lite_cache/` (auto-created).
- **Strategy**: When `/thumbnail` receives a video path, it checks for a cached JPEG. If not found, FFmpeg extracts a single frame at `00:00:01` and stores it with a flattened filename (slashes → underscores).
- **Images**: Served directly without caching.
- **Audio**: Returns 404 (no visual thumbnail).

## Persistence (SafeStorage v6.6)
- **A/B Slot System**: Two LocalStorage keys alternate to prevent corruption.
- **Image Bank**: Binary image data stored in IndexedDB, decoupled from the lightweight JSON state.
- **Manual Backup**: `Ctrl+S` forces an immediate commit.

## Naming Convention
| Allowed | Example |
|---------|---------|
| Spaces in filenames | `my video.mp4` |
| Snake case | `my_video.mp4` |

The API URL-decodes `%20` automatically. `sanitize_filename` only blocks path traversal (`..`, absolute paths).

## Logging
Python `logging` module → `app.log` (persistent, UTF-8) + console stream. No `print()` in codebase.
