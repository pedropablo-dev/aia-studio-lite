# AIA Studio Lite

**AIA Studio Lite** is a lightweight, local-first video pre-production toolkit. It strips away all AI/DB dependencies from the original AIA Studio, keeping only the core builder, a hierarchical file manager with full CRUD, and an FFmpeg-powered media browser.

## Key Features
- 🎬 **Video Builder**: Timeline-based scriptwriting with shot types, speakers, sections, and DaVinci Resolve export (XML, EDL, SRT).
- 📂 **Hierarchical File Explorer**: Browse, link, rename, delete, and drag-and-drop media files into folders via the Lite File Modal backed by `/lite/files` and `/lite/files/*` API endpoints.
- 🔗 **Contextual Open**: When opening the explorer from a card with a linked file, the modal navigates directly to the file's parent folder.
- ◀▶ **Depth-Memory Navigation**: Hierarchical back/forward buttons powered by `liteDeepestPath` — no history stack, pure tree traversal.
- 🖼️ **Auto-Thumbnails**: FFmpeg generates JPEG thumbnails on-the-fly for videos, cached in `.lite_cache/`. Images served directly.
- 🎨 **Neon File-Type Colors**: Linked file names in the timeline use vibrant neon tinting — green for video, blue for image, magenta for audio — via CSS `data-type` attribute selectors.
- 🗨️ **Custom Async Dialogs**: `sysDialog()` replaces all native `alert`/`confirm`/`prompt` with styled, Promise-based modal dialogs.
- 🔍 **Timeline Navigator**: Fixed search bar with scene search, `|<` / `>|` start/end buttons, and a clear button.
- 💾 **SafeStorage**: Atomic A/B slot persistence with Manual Backup (`Ctrl+S`).
- ⌨️ **Keyboard Shortcuts**: `Alt+Enter` (new scene), `Ctrl+Z/Y` (Undo/Redo), `Ctrl+S` (Backup), `Shift+?` (Shortcuts modal).
- 📦 **Ingest Studio**: Staging area module with pagination, filtering, trim, search, and folder tree navigation.
- 🗄️ **Media Pool**: Browse and link files from the `input/` library with folder trees and drag-and-drop.

## Documentation
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Architecture Decisions](docs/ARCHITECTURE_DECISIONS.md)
- [Setup Guide](docs/SETUP.md)
- [API Documentation](docs/API.md)
- [Frontend Documentation](docs/FRONTEND.md)
- [JSON Import Spec](docs/SPEC_IMPORTACION_JSON.md)

## Quick Start
1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Run Studio**:
   ```bash
   python src/start_studio.py
   ```
3. **Configure Media Root**: Click the 📁 button in the footer to set your media directory.

## Requirements
- Python 3.8+
- FFmpeg installed and available on `PATH` (for thumbnail generation and video trimming).
