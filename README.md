# AI Media Manager & Video Builder

**AIA Video Builder** is an advanced tool for video pre-production and asset management with AI-powered multimodal analysis.

## Key Features
- 🎬 **Multimodal Support**: Process videos, audio files, and images
- 📥 **Staging Area**: Pre-ingestion file management (rename, trim, preview)
- 🔍 **Smart Search**: Scope-based search (visual, audio, filename, combined)
- 🤖 **AI Analysis**: Whisper transcription + Vision descriptions
- 📊 **RAG Architecture**: Segment-level search with precise timestamps
- ✂️ **Lossless Trim**: Instant video trimming (Spaces supported)
- 🎛️ **Media Pool 2.0**: Split-view asset manager with Infinite Scroll
- 📱 **Remote Monitor**: Start/Stop ingestion background process from UI
- 📂 **Unified Folder Tree**: Hierarchical view matching OS structure
- 🔒 **Safety Interlocks**: Prevents processing when monitor is offline
- 🎵 **Native Audio**: HTML5 Audio stack for maximum stability (No WaveSurfer)
- 💾 **SafeStorage**: Atomic A/B persistence with Manual Backup (`Ctrl+S`)

## Documentation
- [Architecture Overview](docs/ARCHITECTURE.md): Technical deep dive into the system's core.
- [Setup Guide](docs/SETUP.md): Installation and running instructions.
- [API Documentation](docs/API.md): Backend endpoints.
- [Frontend Documentation](docs/FRONTEND.md): UI/UX logic.

## Quick Start
1. **Set up Environment**:
   Copy `.env.example` to `.env` (or create it) and set your external media path:
   ```ini
   AIA_MEDIA_ROOT="E:/Your/External/Drive"
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   # Ensure python-dotenv is installed
   pip install python-dotenv
   ```

3. **Run Studio**:
   ```bash
   python src/start_studio.py
   ```

## Workflow (v7.6)
```
`AIA_MEDIA_ROOT/brutos` (Staging/Drag&Drop) → Ingest Studio (Sanitize/Trim) → `AIA_MEDIA_ROOT/input` (Auto-Monitor) → AI Analysis → `AIA_MEDIA_ROOT/proxies` + DB
```

## AI Capabilities
- **Multimodal Ingestion**: Automatic detection and processing of video/audio/image files
- **Smart Search**: Semantic search with visual, audio, and filename scopes using `src/app.py`
- **Builder**: Time-aware scriptwriter and scalable editor using `src/builder.html`
