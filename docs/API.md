# API Documentation — AIA Studio Lite

**Base URL**: `http://localhost:9999`

## Endpoints

### Lite File Explorer

#### `GET /lite/files`
Lists directory contents for the hierarchical file explorer.
- **Query Parameters**:
  - `folder` (str, optional): Absolute path to the Media Root. Falls back to `INPUT_DIR` env var → `utils.INPUT_DIR`.
  - `subpath` (str, optional): Relative subdirectory to list. Default `""` (root). Only one level is listed per call.
  - `search` (str, optional): If provided, performs a recursive `rglob` search across the entire tree, filtering by filename.
- **Response**:
  ```json
  {
    "status": "success",
    "items": [
      {"name": "subfolder", "type": "folder", "path": "subfolder"},
      {"name": "clip.mp4", "type": "video", "path": "subfolder/clip.mp4"},
      {"name": "photo.jpg", "type": "image", "path": "photo.jpg"}
    ],
    "current": ""
  }
  ```
- **Notes**: Hidden files (`.`) are skipped. Paths use forward slashes. Folder items have `type: "folder"`.

#### `GET /thumbnail`
Returns a thumbnail for a media file.
- **Query Parameters**:
  - `path` (str, required): Relative path as returned by `/lite/files`.
  - `folder` (str, optional): Absolute root directory. Same fallback as `/lite/files`.
- **Behavior**:
  | Type | Action |
  |------|--------|
  | Image (`.jpg`, `.jpeg`, `.png`, `.webp`) | Returned directly via `FileResponse` |
  | Video (`.mp4`, `.mov`, `.mxf`, `.avi`, `.webm`) | FFmpeg extracts frame at `00:00:01` at native resolution with `-q:v 2`, caches as JPEG in `.lite_cache/`, returns cached file |
  | Audio (`.mp3`, `.wav`, `.aac`) | Returns `404` |
- **FFmpeg Settings**: Native resolution (no scale filter), quality `-q:v 2`, 30s timeout.
- **Cache**: `.lite_cache/` directory at project root. Filenames are flattened (`/` → `_`).
- **Errors**: 400 (missing path), 404 (file not found / audio / generation failed), 504 (FFmpeg timeout).

---

### Lite File Write Operations

All write endpoints validate path confinement via `_validate_lite_path()` — prevents path traversal, escaping the Media Root, and writes to the software directory.

#### `POST /lite/files/rename`
Renames a media file.
- **Body**: `{ "folder": "...", "old_path": "rel/file.mp4", "new_name": "new_name.mp4" }`
- **Validation**: Extension must match. No path separators in `new_name`.
- **Side-effects**: Evicts old thumbnail cache entry.

#### `POST /lite/files/delete`
Permanently deletes a media file.
- **Body**: `{ "folder": "...", "file_path": "rel/file.mp4" }`
- **Side-effects**: Evicts thumbnail cache entry.

#### `POST /lite/files/move`
Moves a media file to a different subdirectory.
- **Body**: `{ "folder": "...", "file_path": "rel/file.mp4", "target_directory": "dest/folder" }`
- **Side-effects**: Evicts old cache entry.

#### `POST /lite/folders/create`
Creates a new subdirectory.
- **Body**: `{ "folder": "...", "new_dir": "relative/new_folder" }`

#### `POST /lite/folders/delete`
Recursively deletes a directory and all its contents. Cannot delete root.
- **Body**: `{ "folder": "...", "dir_path": "relative/folder" }`

#### `POST /lite/folders/rename`
Renames a directory.
- **Body**: `{ "folder": "...", "old_dir_path": "old/name", "new_name": "new_name" }`

---

### Static File Serving

#### `GET /proxies/{file_path:path}`
Serves proxy files from the proxy directory. Supports both exact and flattened filename lookups.

#### `GET /raw-content/{filename:path}`
Streams a file from staging for preview. URL-decodes `%20` for space support.


## Security
- **CORS**: Restricted to `localhost:9999`, `127.0.0.1:9999`, and `null` (for `file://`).
- **Path Traversal**: `sanitize_filename` blocks `..` and absolute path injection.
- **Lite Write Guard**: `_validate_lite_path()` ensures all write operations are confined within the Media Root and never touch the software installation directory (`_SW_ROOT`).
