# API Documentation — AIA Studio Lite

**Base URL**: `http://localhost:9999`

## Endpoints

### System

#### `GET /ping`
Health check.
- **Response**: `{"status": "ok", "message": "AIA API Online"}`

---

### Lite Core

#### `GET /lite/files`
Scans a directory recursively and returns all media files (video, audio, image).
- **Query Parameters**:
  - `folder` (str, optional): Absolute path to scan. Falls back to `INPUT_DIR` env var → `utils.INPUT_DIR`.
- **Response**:
  ```json
  {
    "status": "success",
    "files": [
      {"path": "subfolder/clip.mp4", "type": "video", "name": "clip.mp4"},
      {"path": "photo.jpg", "type": "image", "name": "photo.jpg"}
    ]
  }
  ```
- **Notes**: Hidden files (`.`) are skipped. Paths use forward slashes on all OS.

#### `GET /thumbnail`
Returns a thumbnail for a media file.
- **Query Parameters**:
  - `path` (str, required): Relative path as returned by `/lite/files`.
  - `folder` (str, optional): Absolute root directory. Same fallback as `/lite/files`.
- **Behavior**:
  | Type | Action |
  |------|--------|
  | Image (`.jpg`, `.png`, `.webp`) | Returned directly via `FileResponse` |
  | Video (`.mp4`, `.mov`, `.mxf`…) | FFmpeg extracts frame at `00:00:01`, caches as JPEG in `.lite_cache/`, returns cached file |
  | Audio (`.mp3`, `.wav`, `.aac`) | Returns `404` |
- **Cache**: `.lite_cache/` directory at project root. Filenames are flattened (`/` → `_`).
- **Errors**: 400 (missing path), 404 (file not found / audio / generation failed), 504 (FFmpeg timeout).

---

### Staging Area

#### `GET /raw-files`
Lists files in the staging area (`brutos/`) with server-side pagination.
- **Query Parameters**: `page`, `limit`, `filter_type`, `search`, `sort`, `folder`.

#### `POST /raw-files/rename`
Renames a file in staging. Supports URL-encoded filenames with spaces.

#### `POST /raw-files/move`
Moves files within `brutos/` to a target subfolder.

#### `DELETE /raw-files`
Permanently deletes a file from staging.

#### `POST /raw-files/sanitize`
Batch sanitizes all filenames in staging (lowercase, underscores, collision handling).

#### `GET /raw-content/{filename}`
Streams a file from staging for preview. URL-decodes `%20` for space support.

#### `POST /ingest/trim`
Lossless FFmpeg trim (`-c copy`). Blocking operation.

#### `POST /ingest/move`
Moves files from staging (`brutos/`) to input (`input/`).

---

### Folder Management

#### `GET /folders`
Lists subdirectories. `?source=input` (default) or `?source=raw`.

#### `POST /folders`
Creates a new directory (auto-sanitized name).

#### `DELETE /folders`
Recursively deletes a folder. Prevents deleting root.

---

### Asset Management

#### `POST /assets/move`
Moves assets between folders within `input/`.

#### `POST /assets/rename`
Renames an asset file.

#### `POST /assets/delete`
Deletes an asset file.

---

## Security
- **CORS**: Restricted to `localhost:9999`, `127.0.0.1:9999`, and `null` (for `file://`).
- **Path Traversal**: `sanitize_filename` blocks `..` and absolute path injection.
