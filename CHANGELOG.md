# Changelog

All notable changes to this project will be documented in this file.


## [7.6.5] - 2026-01-31 - Monitor Control & Safety
### Added
- **[Ingest Studio]** **Remote Monitor Control**: New toggle switch in footer to Start/Stop the background ingestion process (`monitor.py`).
- **[Safety]** **Interlock System**: "Procesar Selección" button is now disabled when the monitor is offline.
- **[UI]** **Status LED**: Visual indicator (Green/Red/Yellow) for real-time monitor status.
- **[API]** **Monitor Endpoints**: `/monitor/start`, `/monitor/stop`, `/monitor/status`.

## [7.6.4] - 2026-01-30 - Folder Tree & Protection
### Added
- **[UI]** **Unified Folder Tree**: Sidebar matching Media Pool style for Ingest Studio.
- **[Logic]** **Extension Protection**: Renaming files now automatically safely handles extensions (prevents double extensions).

## [7.6.0] - 2026-01-29 - External Media Root
### Changed
- **[Architecture]** **External Root**: Shifted all heavy media storage to `E:/AIA_MEDIA_ASSETS` (configured via `.env` in `src/utils.py`).
- **[Performance]** **Decoupled Storage**: VS Code performance restored by excluding terabytes of media from workspace indexing.

## [6.6.0] - 2026-01-28 - Stability & Scalability Overhaul


### Stability (Core)
- **[Persistence]** **SafeStorage System**: Implemented Atomic A/B Slot architecture (`slot_A` / `slot_B`) with metadata validation to prevent data loss.
- **[Audio]**- **Audio Strategy**: Replaced WaveSurfer with Native HTML5 Audio for stability.
- **Audit Certified (Jan 2026)**: System passed "Hard-Compliance" Audit. Known limitations documented in `FULL_SYSTEM_AUDIT_JAN_2026.md`.

### Added
- **Infinite Scroll**: Media Pool and Ingest Studio now support 100k+ assets via lazy loading.
- **[Filesystem]** **Relaxed Sanitization**: Filenames with spaces are now fully supported and URL-decoded across all API endpoints.

### Scalability (Architecture)
- **[Pagination]** **Real Infinite Scroll**: implemented server-side `limit`/`page` params in `/assets` & `/raw-files`. Frontend lists now support 100k+ items without DOM lag.
- **[Memory]** **VRAM Management**: Strategic garbage collection during multimodal analysis pipeline.

### UX
- **[Backup]** **Manual Save**: `Ctrl+S` now forces an immediate commit to the active SafeStorage slot.
- **[Media Pool]** **Visuals**: Static iconography (`🎵`) replaces expensive waveform rendering in grid views.

---

## [2.8.0] - 2026-01-28 - UI/UX Overhaul & Optimization

### Added
- **[Frontend]** **Media Pool 2.0**: Split-View layout with Asset Grid (left) and Inspector (right) for better usability.
- **[Frontend]** **WaveSurfer Integration**: Unified waveform visualization for audio assets in both Ingestor and Media Pool (`#pool-waveform`, `#ingest-waveform`).
- **[Frontend]** **Audio Thumbnails**: Static SVG icons (🎵) for audio files in grid views, fixing broken image links.
- **[Frontend]** **Smart Linking**: "Use Full Video" logic automatically persists duration from proxy metadata.

### Changed
- **[Backend]** **VRAM Optimization**: `vision_engine.py` now downscales large images (>1280px) and limits video analysis (360p) to prevent OOM.
- **[Backend]** **Audio Proxy**: Enforced `.mp3` conversion for consistency across `.wav`, `.flac`, etc.
- **[Frontend]** **UI Unification**: Media Pool and Ingest Studio now share identical color schemes (Blue/Red) and WaveSurfer configurations.

### Fixed
- **[Frontend]** **ID Conflict**: Resolved DOM ID collision between Ingestor and Media Pool waveforms.
- **[Frontend]** **UX**: Auto-selection of cards upon action button click.

---

### Fixed
- **[AI Search]** Footer button now works without scene selection (Exploration mode with fallback to `selectedId`).
- **[Media Pool]** Audio files (`.wav`, `.mp3`, `.flac`, etc.) now display with `<audio>` player in inspector.
- **[Media Pool]** Time capture works for both audio and video assets.
- **[Ingestor]** Zero-flicker selection: `toggleFileSelection()` updates DOM directly instead of re-rendering.

---

## [2.7.1] - 2026-01-28 - Linking Logic Hotfix

### Fixed
- **[Linking]** Clean reset on link: `startTime=0`, `duration=auto`, `timingMode=auto` to prevent phantom data.
- **[Linking]** Async metadata sniffing in `linkVideoToCard()` fetches video duration from proxy when not provided.
- **[Linking]** `handleVideoSelect()` now explicitly resets all temporal state before capturing new metadata.

---

## [2.7.0] - 2026-01-28 - Media Pool Redesign

### Added
- **[Builder]** New "✨ Buscar IA" button in footer for quick semantic search access.
- **[Builder]** New "🎛️ Media Pool" button on each scene card for direct media linking.
- **[Media Pool]** Master-Detail layout with asset grid (left) and inspector panel (right).
- **[Media Pool]** Search bar for filtering assets by filename.
- **[Media Pool]** Video preview in inspector with "Capture Time" button for offset selection.
- **[Media Pool]** Duration display for videos (enables "Use Full Video" in time menu).

### Changed
- **[Builder]** Action buttons (🔗, ✨, 🎛️) now auto-select their scene card when clicked.
- **[Video Link]** `linkVideoToCard()` now accepts optional `totalDuration` parameter for video metadata persistence.

---

## [2.6.0] - 2026-01-28 - VRAM Optimization

### Added
- **[Utils]** New `src/utils.py` with `limpiar_vram()` function for GPU memory garbage collection.
- **[Monitor]** Strategic VRAM cleanup between processing stages (Audio → Vision → DB).

### Fixed
- **[Vision]** Implemented automatic downscaling (max 1280px) for images to prevent OOM on 4K content.
- **[Vision]** Reduced video `max_pixels` to 360×360 for memory-safe processing.

---

## [3.0.0] - 2026-01-28 - Brain Transplant (BGE-M3)

### Changed
- **[DB Engine]** Upgraded embedding model to `BAAI/bge-m3` (1024 dims, 8k context, Multilingual).

### Breaking
- **[Database]** Previous database is incompatible due to dimension change (384 → 1024). Requires fresh `db_storage/`.

---

## [2.4.0] - 2026-01-28 - Qwen2-VL Vision Engine

### Changed
- **[Vision Engine]** Replaced Florence-2 with Qwen2-VL-2B-Instruct (Native support, robust OCR, Video-ready).
- **[Deps]** Added `qwen-vl-utils`, `av`. Downgraded Transformers to 4.46.3 (Stable).

### Added
- **[Vision Engine]** New `analizar_video()` function for native video analysis (up to 8 frames).

---

## [2.3.4] - 2026-01-28 - Vision Hybrid Mode

### Fixed
- **[Vision]** Implemented Hybrid Loading: Enabled `trust_remote_code=True` for tokenizer correctness, but forced `attn_implementation="eager"` to bypass SDPA compatibility issues.

---

## [2.3.3] - 2026-01-28 - Native Transformers 5.0

### Changed
- **[Vision]** Upgraded to Native Transformers 5.0 implementation. Switched back to official `microsoft/Florence-2-large` with `trust_remote_code=False`.

---

## [2.3.2] - 2026-01-28 - Vision Config Fix

### Fixed
- **[Vision Engine]** Re-enabled `trust_remote_code=True` to correctly load Florence-2 architecture from community repo (required for `Florence2Config`).

---

## [2.3.1] - 2026-01-28 - Vision Hotfix

### Fixed
- **[Vision Engine]** Switched to `florence-community/Florence-2-large` with native Transformers implementation (`trust_remote_code=False`) to fix `_supports_sdpa` compatibility error.

---

## [2.3.0] - 2026-01-28 - Vision Engine Upgrade

### Changed
- **[Vision Engine]** Replaced BLIP with Microsoft Florence-2 Large for dense captioning and OCR capabilities. Uses `<MORE_DETAILED_CAPTION>` prompt for rich descriptions.
- **[Deps]** Added `timm` and `einops` dependencies for Florence-2 support.
- **[Performance]** Enabled `torch.float16` optimization for reduced VRAM usage on RTX 3090.

---

## [2.2.3] - 2026-01-28 - Memory Leak Fix

### Fixed
- **[AI Engine]** Optimized FFmpeg execution to avoid RAM overflow on large files (removed `capture_output=True`). Added `-stats` flag for visual progress feedback.

---

## [2.2.2] - 2026-01-28 - Stability Patch

### Fixed
- **[Monitor]** Implemented file stability check (`wait_for_file_stability`) to prevent processing incomplete large file uploads. Waits until file size remains constant for 3 seconds before processing, with 10-minute timeout.

---

## [2.2.1] - 2026-01-28 - Bugfix 422

### Fixed
- **[API]** Fixed 422 error on `/ingest/move` by implementing `FileMoveRequest` Pydantic model for file list payload. Frontend sends `{ "files": [...] }`, not a raw array.

---

## [2.2.0] - 2026-01-28 - Phase 1 Ultra Mode

### Changed
- **[Engine]** Upgraded default Whisper model to `large-v3` (Phase 1 Ultra Mode). Configurable via `WHISPER_MODEL_SIZE` constant in `src/ai_engine.py`.
- **[System]** Added `TF_CPP_MIN_LOG_LEVEL=3` to silence TensorFlow/Keras library noise, improving log observability for real errors.

---

## [2.1.0] - 2026-01-27 - Security & Robustness Update

### Security
- **Path Traversal Fix**: `/thumbnail` endpoint now uses `os.path.basename()` to extract only the filename and forces lookup within `./proxies/` directory. Attackers cannot access arbitrary system files.
- **CORS Restriction**: Changed `allow_origins` from wildcard (`"*"`) to explicit whitelist:
  - `http://localhost:9999`
  - `http://127.0.0.1:9999`
  - `"null"` (for `file://` protocol support)

### Robustness
- **Professional Logging**: Replaced all `print()` statements with Python `logging` module:
  - Dual output: Console (StreamHandler) + File (`app.log`)
  - Format: `%(asctime)s [%(levelname)s] %(message)s`
  - `logger.exception()` for full stack traces on errors
- **Log File**: New `app.log` file created for persistent audit trail

### Documentation
- Updated `docs/API.md` with `/thumbnail` security notes and CORS policy
- Updated `docs/ARCHITECTURE.md` with Logging & Observability section

---

## [2.0.0] - 2026-01-27 - Ingest Studio Refactor (Architecture & Performance)

### Breaking Changes
- **Modular Frontend**: `builder.html` no longer contains embedded CSS/JS. Now imports:
  - `src/css/style.css` (all styles)
  - `src/js/app.js` (all logic + IngestStore)
- **API Response Change**: `GET /raw-files` now returns paginated object instead of flat array.

### Added
- **State Management**: Implemented `IngestStore` pattern in `app.js`:
  - Centralized state object with mutation methods
  - Convenience getters for common values (`files`, `selectedCount`, `hasMore`)
  - Configurable constants (`PAGE_LIMIT`, `SCROLL_THRESHOLD`, `SEARCH_DEBOUNCE_MS`)
- **Backend Pagination**: `GET /raw-files` endpoint now supports:
  - `page` (int): Page number (default: 1)
  - `limit` (int): Items per page (default: 50)
  - `filter_type` (str): Server-side type filtering
  - `search` (str): Server-side filename search
  - Response includes: `total_files`, `total_pages`, `current_page`, `has_more`
- **Infinite Scroll**: Frontend loads files incrementally on scroll (100px threshold)
- **Debounced Search**: 300ms delay before triggering API call

### Changed
- **Refactor**: Extracted all CSS from `<style>` blocks to `src/css/style.css`
- **Refactor**: Extracted all JS from `<script>` blocks to `src/js/app.js`
- **Cleanup**: Removed 9 global variables (`rawFiles`, `ingestPage`, `selectedFiles`, etc.)
  - All state now lives in `IngestStore.state`

### Performance
- **Scalability**: Supports 100k+ files with lazy loading
- **Reduced Memory**: Only 50 files loaded at a time (configurable)
- **Server-Side Processing**: Filtering/sorting done in Python, not JS

### Documentation
- Updated `docs/FRONTEND.md` with modular architecture and IngestStore
- Updated `docs/API.md` with pagination parameters
- Updated `docs/ARCHITECTURE.md` with v2.0 flow diagram

---

## [1.7.4] - 2026-01-27 - Ingest Studio Stable

### Added
- **Feat**: Ingest Studio Grid View with real video/image thumbnails
- **Feat**: Audio waveform visualization (WaveSurfer.js integration)
- **Feat**: View toggle buttons (📜 List / 田 Grid) with persistent state
- **Feat**: Search clear button (×) for quick filter reset
- **Feat**: Refresh button (🔄) to reload file list
- **API**: `GET /raw-content/{filename}` - Streaming endpoint for media preview

### Fixed
- **Critical**: Backend URL decoding for filenames with spaces (`%20` → real space)
- **Fix**: Smart extension appending in `/ingest/trim` (auto-detects from source)
- **Fix**: Video player 16:9 aspect ratio with `object-fit: contain`
- **Fix**: Grid thumbnails use `#t=1.0` to avoid black frames

### Security
- **Hardening**: Path traversal prevention in streaming endpoint without filename modification

## [1.7.0] - 2026-01-27 - The Omni-Update

### Added - Multimodal Ingestion
- **Feat**: Full multimodal support (Video, Audio, Image) in `monitor.py`
- **Feat**: Extension-based file type detection and processing bifurcation
- **Feat**: Image proxy generation (720p .jpg) with Vision analysis
- **Feat**: Audio proxy generation (.mp3, 192k) with Whisper transcription

### Added - Staging Area (Pre-Ingestion)
- **Feat**: `./brutos` staging directory for file management
- **API**: `GET /raw-files` - List files with metadata (type, size, date)
- **API**: `POST /raw-files/rename` - Rename with conflict detection
- **API**: `POST /ingest/trim` - Lossless video trimming (`ffmpeg -c copy`)
- **API**: `POST /ingest/move` - Batch move to input (triggers AI processing)
- **API**: `DELETE /raw-files` - Permanent file deletion
- **UI**: Ingest Studio modal in `builder.html` (~420 lines)
  - 2-column layout (file list + inspector)
  - Real-time preview (video/audio/image)
  - Live rename with space sanitization
  - Trim controls with IN/OUT markers
  - Multi-selection batch operations

### Added - Smart Search
- **Feat**: Search scopes in API `/search` endpoint (visual, audio, filename, all)
- **UI**: Scope filter buttons in AI Match Modal
- **Feat**: Filename-based search with exact matching

### Added - Media Pool Enhancements
- **Feat**: Media type filters (All/Video/Image) in Media Pool modal
- **Feat**: Sorting options (date desc/asc, name A-Z)
- **UI**: Scene start time badges in AI Match results

### Security
- **Hardening**: Enforced filename sanitization (spaces → underscores) on all ingest operations
- **Validation**: Path traversal prevention in all file operations

### Documentation
- **Updated**: README.md with key features and workflow diagram
- **Updated**: ARCHITECTURE.md with complete ingestion flow and multimodal dispatch logic
- **Updated**: API.md with staging area endpoints

### Technical Improvements
- **Performance**: Multi-focal vision analysis (15%, 50%, 85% frames)
- **Reliability**: Robust error handling for proxy generation failures
- **Architecture**: Clean separation of staging → processing → indexing

## [1.0.2] - 2026-01-26
### Fixed
- **AI Engine (Whisper)**: Ajustados parámetros para vídeos largos — `no_speech_threshold=0.4` (captura audio tenue) y `condition_on_previous_text=False` (evita bucles de silencio). Activado `word_timestamps=True` para tiempos precisos.
- **API RAG Search**: Lógica de fallback para tiempos en segmentos (`start` → `start_time`). Limpieza de `proxy_path` para usar solo nombre de archivo.
- **Monitor Pipeline**: Validación de segmentos con campos `start`/`end` antes de indexar.

### Added
- **Infraestructura DB**: Sincronización activa de colecciones `video_metadata` (assets globales) y `asset_segments` (fragmentos granulares RAG).

### Documentation
- **REGLA DE ORO**: Los nombres de archivo deben usar guiones bajos (`_`) exclusivamente. Los espacios provocan fallos de carga en navegadores (ej: `mi_video.mp4` ✓, `mi video.mp4` ✗).

---

## [1.5.0] - 2026-01-26
### Added
- **Deep Linking**: Frontend now supports linking videos with a specific start time (`data-start-time`).
- **Granular Search**: API `/search` now returns specific audio segments (`type: "segment"`) alongside full videos.
- **Hybrid Search UI**: AI Match Modal now shows timestamp badges and allows previewing/linking specific moments.
- **Media Pool**: Added "Link from here" capability to capture current time from preview player.

## [1.1.0] - 2026-01-26
### Added
- **RAG Architecture**: Implemented granular audio segmentation indexing in ChromaDB (`asset_segments` collection).
- **Multi-Media Support**: Database now supports `media_type` field (Video/Audio).
- **Architecture Docs**: Added `docs/ARCHITECTURE.md` explaining the dual indexing strategy.
- **AI Engine**: Updated to return both full text and specific timestamps segments.

## [1.0.1] - 2026-01-26
### Changed
- Refactored `monitor.py` and `db_engine.py` to store both Original and Proxy paths.
- Updated API `/search` to return `original_path` and `proxy_path`.
- Implemented `/thumbnail` endpoint in API to serve lightweight images.
- Updated `builder.html` Modal to use thumbnails instead of video iframes (performance fix).
- `builder.html` now links to `original_path` for higher quality exports.
- **UX Improvement**: Separated "Preview" (Play) from "Link" actions in AI Modal.
- **Bugfix**: `linkedFile` now stores only the filename to ensure DaVinci Conform compatibility.
- **Performance**: Integrated `tempThumbnail` logic to show images immediately after linking without re-fetching.

### Added
- **AI Search**: Precision Control Slider to filter results by confidence (`min_score`).
- **Media Pool**: New Modal Library to browse all indexed assets (Replaced initial Drawer approach).
- **API**: New endpoints `/assets` and `/thumbnail` for media management.

## [1.0.0] - 2026-01-26
### Added
- Created `documentation-architect` skill structure.
- Bootstrapped initial documentation: `ARCHITECTURE.md`, `SETUP.md`.
- Added `README.md` and `CHANGELOG.md`.
