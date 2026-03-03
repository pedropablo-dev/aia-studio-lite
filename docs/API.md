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
  - `skip` (int, optional): Number of items to skip (pagination). Default `0`.
  - `limit` (int, optional): Maximum items to return. Default `500`.
- **Response**:
  ```json
  {
    "status": "success",
    "items": [
      {"name": "subfolder", "type": "folder", "path": "subfolder"},
      {"name": "clip.mp4", "type": "video", "path": "subfolder/clip.mp4"}
    ],
    "current": "",
    "total_in_page": 2,
    "has_more": false
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
  | Video (`.mp4`, `.mov`, `.mxf`, `.avi`, `.webm`) | FFmpeg extracts frame at `00:00:01` at native resolution with `-q:v 2`. Returns `202 Accepted` while processing, cached JPEG on completion |
  | Audio (`.mp3`, `.wav`, `.aac`) | Returns `404` |
- **Concurrency**: Controlled by `THUMBNAIL_SEMAPHORE` (max 4 concurrent FFmpeg processes).
- **Cache**: `.lite_cache/` directory at project root. Filenames are flattened (`/` → `_`).
- **Errors**: 400 (missing path), 404 (file not found / audio / generation failed), 202 (processing), 504 (FFmpeg timeout).

#### `POST /lite/verify_routes`
Bulk verification of file existence on disk.
- **Body**: `{ "folder": "...", "paths": ["file1.mp4", "subdir/file2.jpg"] }`
- **Response**: `{ "status": "success", "missing": ["subdir/file2.jpg"] }`
- **Use Case**: Frontend dead-link auditing — flags scenes whose `linkedFile` no longer exists on disk.

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

### Project Persistence (SQLite)

These endpoints handle the atomic saving and loading of the `aia_studio.db` SQLite repository.

#### `POST /api/projects`
Saves or updates a project state.
- **Body**: `ProjectSchema` containing `id`, `title`, `metadata_config` and an array of flat `scenes`.
- **Behavior**: The backend dynamically translates the flat scene dicts into the normalized relational `Scene` model before committing.
- **Response**: `200 OK` with `project_id` and `scenes_saved` count.

#### `GET /api/projects`
Lists all persisted projects.
- **Response**: Array of lightweight project metadata objects (without full scenes).

#### `GET /api/projects/{project_id}`
Loads a full project schema.
- **Response**: Complete project data. `scene_data` json columns are nested within the scene objects (frontend handles flattening).

#### `DELETE /api/projects/{project_id}`
Deletes a project and all associated scenes from the database.

---

### Maintenance & Optimization

#### `POST /optimize_storage`
Executes `VACUUM;` on the SQLite database to reclaim disk space and defragment the file after mass deletions.
- **Response**: `{ "status": "success", "message": "Storage optimized." }`

---

## Lifecycle Events

### Startup
1. Initializes SQLite tables via SQLAlchemy.
2. Creates cache directories (`.cache`, `.lite_cache`).
3. Runs `cleanup_orphan_thumbnails()` — compares cached `.jpg` files against active `linkedFile` entries in SQLite, deleting orphans.

### Shutdown
1. Terminates all in-flight FFmpeg processes from `active_tasks`.
2. Runs a final `cleanup_orphan_thumbnails()` pass.
3. Logs clean shutdown confirmation.

## Security
- **CORS**: Restricted to `localhost:9999`, `127.0.0.1:9999`, and `null` (for `file://`).
- **Path Traversal**: `is_safe_path()` blocks `..` traversal and verifies `os.path.commonprefix` against the allowed root.
- **Lite Write Guard**: `_validate_lite_path()` ensures all write operations are confined within the Media Root and never touch the software installation directory (`_SW_ROOT`).
