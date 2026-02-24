# AIA Studio Lite

**AIA Studio Lite** is a lightweight, local-first video pre-production toolkit. It strips away all AI/DB dependencies from the original AIA Studio, keeping only the core builder and a fast FFmpeg-powered media browser.

## Key Features
- 🎬 **Video Builder**: Timeline-based scriptwriting with shot types, speakers, sections, and DaVinci Resolve export (XML, EDL, SRT).
- 🔗 **Lite File Linker**: Browse and link local media files (video, audio, image) to scene cards via a modal backed by the `/lite/files` API endpoint.
- 🖼️ **Auto-Thumbnails**: FFmpeg generates JPEG thumbnails on-the-fly for videos, cached in `.lite_cache/`. Images are served directly.
- 📂 **Configurable Media Root**: Point to any directory on your system — no environment variable required (though `INPUT_DIR` is supported as fallback).
- 💾 **SafeStorage**: Atomic A/B persistence with Manual Backup (`Ctrl+S`).
- ⌨️ **Keyboard Shortcuts**: Undo/Redo, Manual Backup, and more.

## Documentation
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Setup Guide](docs/SETUP.md)
- [API Documentation](docs/API.md)
- [Frontend Documentation](docs/FRONTEND.md)

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
