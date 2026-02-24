# Architecture Documentation

## Overview
AIA Media Manager uses a hybrid approach for media indexing and retrieval, leveraging both global file-level metadata and granular segment-level data (RAG). The system supports multimodal ingestion (video, audio, images) with a **Decoupled Storage Pattern (v7.6)** to handle terabytes of media without impacting codebase performance.

**Frontend Architecture (v2.0)**: Modular design with separate HTML, CSS, and JavaScript files. State management via `IngestStore` pattern.
**Visual Unification**: The Ingest Studio and Media Pool share identical design patterns (colors, WaveSurfer configs) to reduce cognitive load.
**Monitor Control (v7.6)**: Remote management of the background ingestion process directly from the UI.

## 1. Ingestion Flow (v2.0)

```
User Files → AIA_MEDIA_ROOT/brutos (Staging Area)
         ↓
   Ingest Studio (Preview/Rename/Trim)
   [Modular Frontend: builder.html + app.js + style.css]
   [State: IngestStore | Pagination: Infinite Scroll]
   [Control: Toggle Monitor Logic]
         ↓
API Endpoints: /raw-files (paginated), /ingest/trim, /ingest/move
         ↓
AIA_MEDIA_ROOT/input (Monitored by Watchdog)
         ↓
monitor.py (Path logic via src/utils.py)
         ↓
   ├─ Video: Proxy (720p) → Whisper → Vision (multi-focal) → DB
   ├─ Audio: Proxy (.mp3) → Whisper → DB  
   └─ Image: Proxy (720p .jpg) → Vision → DB
         ↓
AIA_MEDIA_ROOT/proxies + ChromaDB
```

### Staging Area (`./brutos`)
- **Purpose**: Pre-ingestion file management
- **Operations**: List, Rename, Trim (lossless), Delete, Move to input
- **API**: `/raw-files/*` (with pagination), `/ingest/*`
- **Security**: Path traversal protection (spaces are now ALLOWED in filenames).
- **Performance**: Server-side pagination + frontend infinite scroll (100k+ files)

### Monitor Logic (`src/monitor.py`)
Multimodal dispatcher based on file extension:
- **Video** (`.mp4`, `.mov`, `.mkv`, `.avi`, `.mxf`): Full pipeline
- **Audio** (`.mp3`, `.wav`, `.m4a`, `.flac`, `.aac`): Audio-only pipeline
- **Image** (`.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`): Vision-only pipeline

**Remote Control (v7.6.5)**:
- The monitor is no longer just a standalone script; it is managed by the main API via `subprocess`.
- **Endpoints**: `/monitor/start`, `/monitor/stop`, `/monitor/status`.
- **Interlock**: The frontend disables processing actions if the monitor is offline.

### Audio Strategy ("Native Stability")
- **Problem**: External waveform libraries (WaveSurfer) caused instability and dependency issues.
- **Solution**: 
    - **Native HTML5 Audio**: We leverage the browser's native `<audio>` element for maximum stability and compatibility.
    - **Proxy Illusion**: The backend still generates compatible proxies (.mp3), but the frontend playback is purely native.
    - **Visuals**: Static iconography replaces complex waveform rendering for better performance in the Media Pool.

### Logging & Observability (v2.1)
The backend uses Python's `logging` module for professional observability:

```
┌─────────────────────────────────────────────────────────┐
│  Logger: AIA-API                                        │
│  Format: %(asctime)s [%(levelname)s] %(message)s       │
├─────────────────────────────────────────────────────────┤
│  Handlers:                                              │
│    ├─ FileHandler → app.log (persistent, UTF-8)        │
│    └─ StreamHandler → Console (real-time)              │
└─────────────────────────────────────────────────────────┘
```

**Log Levels Used**:
| Level | Usage |
|-------|-------|
| `INFO` | Startup events, successful operations |
| `EXCEPTION` | Full stack traces on caught errors |

**Benefits**:
- **Debugging**: Full exception traces with context
- **Audit Trail**: Persistent `app.log` file for forensics
- **Production-Ready**: No `print()` statements in codebase


## 2. Decoupled Storage Pattern (v7.6)

**Problem (Pre-v7.0)**: Storing heavy media assets (`input`, `proxies`) inside the project folder caused severe performance issues:
- VS Code / IDEs attempted to index terabytes of binary data.
- Language Server Protocol (LSP) crashed repeatedly (Stack Overflow / Out of Memory).
- Git status checks became slow.

**Solution**:
We moved all heavy assets to an **External Media Root** (`AIA_MEDIA_ROOT`), defined in `.env`.
- **Codebase**: Only contains logic (`src/`), docs, and lightweight resources.
- **Assets**: Reside on a high-speed external drive or separate partition.
- **Single Source of Truth**: `src/utils.py` handles path resolution using `pathlib` and `python-dotenv`. If `AIA_MEDIA_ROOT` is not found, it falls back to local legacy paths (warns user).

![Flow](External_Drive -> src/utils.py -> API/Monitor)

## 3. Dual Indexing Strategy

We use two distinct collections in ChromaDB to handle different granularity of search:

### A. Video Metadata Collection (`video_metadata`)
- **Purpose**: High-level search (e.g., "Find videos about cooking").
- **Content**: Aggregated visual description + Full audio transcription.
- **Granularity**: 1 Document per media file.
- **Use Case**: Broad discovery.
- **Supports**: video, audio, image (`media_type` field)

### B. Segment Collection (`asset_segments`)
- **Purpose**: Precise RAG (Retrieval-Augmented Generation) and specific moment finding (e.g., "Find the exact moment he says 'hello'").
- **Content**: Individual sentence/phrase from Whisper.
- **Granularity**: Many Documents per media file (N segments).
- **Use Case**: Q&A, Video Editing assistance, finding precise timestamps.

## 3. Metadata Schema

### Global Media Object
Stored in `video_metadata`:
```json
{
  "path": "/path/to/proxy.mp4",
  "original_path": "/path/to/source.mxf",
  "media_type": "video|audio|image",
  "vision": "Summary of visual content...",
  "audio": "Full transcription text..."
}
```

### Segment Object
Stored in `asset_segments`:
```json
{
  "origin_file": "media_filename.mp4",
  "original_path": "/path/to/source.mxf",
  "media_type": "video|audio",
  "start": 12.5,  // Seconds
  "end": 15.2,    // Seconds
  "text": "Exact phrase spoken here."
}
```

## 4. AI Engine Configuration (v1.0.2)

### Whisper Model
- **Model**: `medium` (balance precisión/velocidad).
- **Device**: Auto-detect (CUDA > CPU).

### Transcription Parameters (Optimized)
```python
MODEL.transcribe(
    audio_file,
    language="es",
    no_speech_threshold=0.4,       # Captura audio tenue
    condition_on_previous_text=False,  # Evita bucles de silencio
    word_timestamps=True           # Tiempos precisos por palabra
)
```

> **Nota técnica**: `condition_on_previous_text=False` es crítico para vídeos largos. Evita que Whisper entre en bucles donde predice silencio indefinidamente basándose en contexto previo.

## 6. Persistence Architecture (SafeStorage v6.6)
To prevent data loss, we implement an **Atomic A/B Slot System**:
1.  **Dual Slots**: We use two local storage keys (`aia_vb_autosave_slot_A` and `slot_B`).
2.  **Ping-Pong Write**: Each save alternates between slots. If Slot A fails or is corrupted during write, Slot B remains valid.
3.  **Metadata Validation**: We store a separate metadata key (`aia_vb_save_meta`) with timestamps and checksums to determine which slot is the valid "latest" version.
4.  **Manual Backup**: User triggered `Ctrl+S` forces a commit to the current active slot and updates the modification time.

> **⚠️ CRITICAL AUDIT NOTE (v6.6)**: 
> The **SafeStorage** system caches project *structure* (JSON) but **DOES NOT** persist heavy embedded images (Base64) in the A/B automatic slots to prevent `QuotaExceededError` (5MB Limit).
> **Images are ONLY preserved when using Manual Backup (`Ctrl+S`) or exporting to JSON.**

### Image Bank (IndexedDB Wrapper v7.6)
To solve the storage limit for images:
- **Mechanism**: Binary image data is stored in `IndexedDB` (Browser Database), decoupled from the lightweight JSON state.
- **Reference**: The SaveState JSON only stores `imageId` references.
- **Performance**: Keeps the main thread and LocalStorage free of heavy Base64 strings.

## 5. Naming Convention (REGLA DE ORO)

| ✓ Permitido       | ✓ Ahora Permitido (v6.6) |
|-------------------|------------------------------|
| `mi_video.mp4`    | `mi video.mp4`               |
| `clip_01_final.mov` | `clip 01 final.mov`        |

**Cambio v6.6**: El sistema **RESPETA** los espacios en nombres de archivo.
- **Razón**: Los sistemas de archivos modernos soportan espacios sin problemas.
- **Implementación**: El API decodifica automáticamente los caracteres URL (`%20`) en todos los endpoints (`/raw-content`, `/ingest/trim`, `/raw-files/rename`). `sanitize_filename` solo bloquea Path Traversal (`..`, `/`).

**Cambio v7.6.4**: Protección de Extensiones.
- **Regla**: Al renombrar, si el usuario omite la extensión, el sistema la restaura automáticamente.
- **Sanitización Estricta**: En Ingest y Media Pool, los nombres se convierten a `snake_case` (logically) pero visualmente soportamos espacios si la configuración lo permite, aunque internamente preferimos sin espacios para máxima compatibilidad con FFmpeg.
