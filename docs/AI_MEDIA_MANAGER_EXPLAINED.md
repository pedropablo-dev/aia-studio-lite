# AI Media Manager & Video Builder: Project Explanation for AI Agents

**Version**: v7.x
**Date**: February 2026
**Context**: This document is designed to provide an Artificial Intelligence with a complete, structured understanding of the "AI_Media_Manager" project.

---

## 1. Project Identity & Purpose

**What is it?**
`AI_Media_Manager` (formerly *AIA Video Builder*) is a local-first, full-stack web application designed for **advanced video asset management** and **pre-production**. It serves as a bridge between raw media files and post-production workflows, leveraging local AI engines to index, search, and manipulate media content.

**Core Problem Solved**:
Traditional file explorers are "blind" to media content. They only see filenames. This project solves that by using AI to "see" and "hear" every video, image, and audio file, allowing a user to search for *content* (e.g., "find the clip where he talks about quantum physics" or "show me a red sports car") rather than just filenames.

**Primary User Persona**: 
Video Editors, Content Creators, and Archivists who manage terabytes of local footage and need rapid retrieval based on semantic meaning.

---

## 2. High-Level Architecture

The system follows a **Decoupled Client-Server Architecture** with a clear separation between the lightweight application logic and the heavy media assets.

### A. The "Decoupled Storage" Pattern (Crucial Context)
*   **Codebase**: Lives in one location (e.g., `C:/Projects/AI_Media_Manager`). Contains strict logic, API, and frontend code.
*   **Media Assets**: Live in an **External Media Root** (defined by `AIA_MEDIA_ROOT` in `.env`), typically a high-speed SSD or RAID.
    *   *Why?* To prevent LSP crashes, Git lag, and IDE indexing issues caused by terabytes of binary data.
    *   *Path Resolution*: `src/utils.py` handles all path mapping between the codebase and the external root. **AI Agents modifying code must always use `utils.get_media_root()` instead of hardcoded paths.**

### B. Tech Stack
*   **Backend**: Python 3.1x (Flask).
*   **Frontend**: Vanilla HTML/CSS/JS (Modular, Component-based).
*   **Database**: 
    *   **ChromaDB** (Vector Store): For semantic search capabilities.
    *   **SQLite** (via Metadata Store): For structured file metadata.
    *   **IndexedDB** (Browser-side): For caching heavy image blobs (Staging Area).
*   **AI Engines**:
    *   **Whisper** (Local): Automated Speech-to-Text (transcription).
    *   **Vision Engine** (Local): Image/Video scene description.
*   **Processing**: `ffmpeg` (installed on host) for proxy generation and lossless trimming.

---

## 3. Key functional Modules

The application is divided into specific "studios" or workspaces:

### 1. The Ingest Studio (`/ingest`)
*   **Purpose**: The "Mudroom" or Staging Area.
*   **Location**: Maps to `AIA_MEDIA_ROOT/brutos`.
*   **Workflow**:
    1.  User dumps raw files into `brutos`.
    2.  User opens Ingest Studio to **Preview**, **Rename** (sanitize), and **Trim** files.
    3.  **Sanitization**: Filenames are cleaned to be filesystem-safe (snake_case internally, though spaces are visually supported in newer versions).
    4.  **"Move to Input"**: Validated files are moved to `AIA_MEDIA_ROOT/input`.

### 2. The Monitor (Background Agent)
*   **Purpose**: An automated watchdog that observes `AIA_MEDIA_ROOT/input`.
*   **Behavior**:
    *   Detects new files moved from Ingest.
    *   **Generates Proxies**: Low-res (720p) versions for smooth web playback (stored in `proxies/`).
    *   **Extracts Metadata**: Runs Whisper (Audio) and Vision (Image) analysis.
    *   **Indexing**: Vectors are stored in ChromaDB.
    *   **Interlock**: Controlled via API (`/monitor/start`, `/monitor/stop`) to prevent resource contention.

### 3. The Media Pool (`/assets`)
*   **Purpose**: The "Library" or Search Engine.
*   **Features**:
    *   **Infinite Scroll**: Handles thousands of assets efficiently.
    *   **Unified Folder Tree**: Mirrors the OS directory structure of the media root.
    *   **Smart Search**:
        *   *Visual Scope*: Searches image descriptions.
        *   *Audio Scope*: Searches transcribed speech.
        *   *Filename Scope*: Traditional substring match.
    *   **Playback**: Uses Native HTML5 Audio/Video elements for stability (avoiding complex waveform libraries like WaveSurfer which proved unstable).

### 4. The Builder / Editor
*   **Purpose**: assembling clips into a narrative.
*   **Features**: Timeline-based sequencing (mostly deprecated/in-flux in favor of external export).

---

## 4. Data Structures & Schemas

AI Agents generating code or queries should adhere to these data models.

### A. Asset Metadata (Global)
Each ingested file has a corresponding JSON-like structure in the database:
```json
{
  "path": "proxies/video_name.mp4",        // Relative path to proxy
  "original_path": "E:/input/video.mxf",   // Absolute path to source (High Res)
  "media_type": "video|audio|image",
  "vision": "A visual description of the scene...",
  "audio": "Full transcription of the spoken content...",
  "checksum": "sha256_hash..."
}
```

### B. Segment Data (RAG)
For precise searching, videos are chunked into segments:
```json
{
  "origin_file": "video_name.mp4",
  "start": 12.5,  // Seconds
  "end": 15.2,    // Seconds
  "text": "The exact phrase spoken in this timeframe."
}
```

---

## 5. Coding & Contribution Rules

When modifying this project, stricter rules apply:

1.  **Do Not Encode Absolute Paths**: Always use `os.getenv("AIA_MEDIA_ROOT")` or the helper `src.utils`.
2.  **Respect "SafeStorage"**: The project state uses an A/B slot system (`slot_A`, `slot_B`) to prevent data corruption during writes. Never write directly to a single definition file.
3.  **Frontend Vanilla Constraint**: Do not introduce React, Vue, or heavy frameworks. The project uses "Vanilla JS" with a custom Component-like architecture (`app.js`, `builder.html`).
4.  **Logging**: Use the configured `logging` module. Do not use `print()` in backend code.
5.  **Sanitization**: Use the `sanitize_filename` utility before filesystem operations. Note that while newer versions *allow* spaces for UX, internal paths often prefer snake_case.

## 6. API Interface Quick Reference

The backend runs on `http://localhost:9999`. Key endpoints for an AI to know:

*   `GET /raw-files`: List staging content (paginated).
*   `POST /ingest/trim`: Lossless ffmpeg trim.
*   `POST /monitor/start`: Wake up the ingestion engine.
*   `GET /search?query=...`: Semantic search entry point.
*   `GET /assets`: Main library retrieval.

---

**Summary for the AI**: 
You are working on a **Local-First AI Asset Manager**. Your goal is usually to improve the pipeline between "Raw File" -> "Indexed Asset", optimize the search retrieval, or enhance the vanilla JS frontend. Respect the external storage separation and the stability-first approach (e.g., native audio over libraries).
