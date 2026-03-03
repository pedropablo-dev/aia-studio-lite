# AIA Studio Lite

**AIA Studio Lite** is a lightweight, local-first video pre-production toolkit. It strips away all AI/DB dependencies from the original AIA Studio, keeping only the core builder, a hierarchical file manager with full CRUD, and an FFmpeg-powered media browser.

## Key Features
- 🎬 **Video Builder**: Timeline-based scriptwriting with shot types, speakers, sections, and DaVinci Resolve export (XML, EDL, SRT).
- 📂 **Hierarchical File Explorer**: Browse, link, rename, delete, and drag-and-drop media files into folders via the Lite File Modal backed by `/lite/files` and `/lite/files/*` API endpoints.
- 🔗 **Contextual Open**: When opening the explorer from a card with a linked file, the modal navigates directly to the file's parent folder.
- ◀▶ **Depth-Memory Navigation**: Hierarchical back/forward buttons powered by `liteDeepestPath` — no history stack, pure tree traversal.
- 🖼️ **Auto-Thumbnails**: FFmpeg generates JPEG thumbnails asynchronously for videos at native resolution (`-q:v 2`), cached in `.lite_cache/`. Frontend polls via HTTP 202 with fade-in transitions.
- 🎨 **Neon File-Type Colors**: Linked file names in the timeline use vibrant neon tinting — green for video, blue for image, magenta for audio — via CSS `data-type` attribute selectors.
- 🚩 **Timeline Outline**: Sidebar panel listing all scenes with thumbnails (via `/thumbnail` API), sections, titles, and script previews. Toggled via `Ctrl+Enter` or footer button. Uses **Zero-Flicker** selection (no full DOM re-render).
- 🗨️ **Custom Async Dialogs**: `sysDialog()` and `Modal.*` replace all native `alert`/`confirm`/`prompt` with styled, Promise-based modal dialogs.
- 🔍 **Timeline Navigator**: Fixed search bar with scene search, `|<` / `>|` start/end buttons, and a clear button.
- 💾 **SQLite Persistence & Dual Save**: Robust relational database storage (`aia_studio.db`) with 3000ms debounced auto-save. Manual `Ctrl+S` forces a backup save.
- ⚠️ **Dead Link Detection**: Automatic background verification of linked files via `POST /lite/verify_routes`. Missing files are flagged with a ⚠️ icon and red strikethrough.
- 🧹 **Garbage Collection**: Automatic cleanup of orphan thumbnails at server startup/shutdown. `POST /optimize_storage` for SQLite VACUUM.
- ⌨️ **Keyboard Shortcuts (Hotkeys 10/10)**: Comprehensive, input-protected system.
  - **Navigation**: `Home/End` (First/Last), `←/→` (Select Prev/Next), `Ctrl+←/→` (Move Card).
  - **Viewport**: `F` (Center), `Shift+F` (Fit All), `0` (Restore Zoom).
  - **Scenes**: `Alt+Enter` (New), `Delete` (Remove), `Ctrl+D` (Duplicate), `Shift+O` (Edit Modal), `Shift+Space` (Toggle Check).
  - **Modals & Global**: `Ctrl+O` (Projects), `Ctrl+E` (Export TXT), `Ctrl+L` (Link), `Alt+E` (Explorer), `Shift+?` (Help).
  - **Master Escape**: `Esc` closes any active modal; if none, it clears the current selection and resets the view.
- 📂 **Global Explorer (Organization Mode)**: Browse and manage files independently via the 📂 button or `Alt+E`.
- 📤 **Export System V3**: Unified modals for TXT (dialogue) and MD (technical script) with per-speaker checkboxes (`Alt+D` / `Alt+G`). DaVinci Resolve (FCPXML), EDL Markers, and SRT Subtitles.

## Documentation
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Architecture Decisions](docs/ARCHITECTURE_DECISIONS.md)
- [Setup Guide](docs/SETUP.md)
- [API Documentation](docs/API.md)
- [Frontend Documentation](docs/FRONTEND.md)
- [Export System V3](docs/EXPORT_SYSTEM.md)

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
- FFmpeg installed and available on PATH (for thumbnail generation and proxy video transcoding).
