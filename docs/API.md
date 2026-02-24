# API Documentation

**Base URL**: `http://localhost:9999`
**Title**: AIA Media Manager API

## Endpoints

### System
#### `GET /ping`
Checks if the API is online.
- **Response**: `{"status": "ok", "message": "AIA API Online"}`

### System & Monitor (v7.6.5)

#### `GET /monitor/status`
Checks the current status of the background `monitor.py` process.
- **Response**: `{"running": true|false}`

#### `POST /monitor/start`
Starts the background monitor process if deemed safe.
- **Response**: `{"success": true, "message": "Monitor iniciado"}`

#### `POST /monitor/stop`
Stops the background monitor process forcefully.
- **Response**: `{"success": true, "message": "Monitor detenido"}`
- **Note**: The API manages the PID to ensure clean shutdown.

### Search
#### `GET /search`
Semantic search for videos using the ChromaDB vector store.
- **Query Parameters**:
    - `query` (str): Natural language query (e.g., "woman cooking").
    - `min_score` (float, default=0.2): Threshold for similarity (0.0 to 1.0).
- **Response**: List of video objects found.
    ```json
    [
        {
            "type": "visual|segment",
            "id": "string",
            "filename": "string",
            "path": "string", 
            "proxy_path": "string",  // Cleaned basename only (v1.0.2)
            "original_path": "string",
            "score": float, 
            "vision": "string",
            "audio": "string",
            "seconds": float, // Timestamp in seconds (0 for visual)
            "start_time": "HH:MM:SS" // Timestamp formatted
        }
    ]
    ```
    > **v1.0.2**: Para segmentos, el campo `seconds` usa fallback `start` → `start_time` para compatibilidad con datos legacy.


#### `GET /thumbnail`
Returns the `.jpg` thumbnail associated with a video proxy.
- **Query Parameters**:
    - `path` (str): Path reference to the proxy video file.
- **Security (v2.1)**:
    - Extracts **only the basename** from the path parameter (`os.path.basename`).
    - Forces lookup **exclusively within `./proxies/`** directory.
    - Prevents path traversal attacks (e.g., `../../etc/passwd` → resolves to `proxies/passwd.jpg`).
- **Response**: Image file (`image/jpeg`).
- **Errors**:
    - 400: Empty path parameter.
    - 404: Thumbnail not found in proxies directory.

---

## Security Configuration

### CORS Policy (v2.1)
The API restricts cross-origin requests to a whitelist of trusted origins:

```python
allow_origins=[
    "http://localhost:9999",
    "http://127.0.0.1:9999", 
    "null"  # Required for file:// protocol
]
```

| Origin | Purpose |
|--------|---------|
| `localhost:9999` | Local development server |
| `127.0.0.1:9999` | Alternative localhost |
| `null` | Browser requests from local HTML files (`file://`) |

> **Note**: External origins are blocked. If you need to access the API from another host, add the origin to the whitelist in `src/api.py`.

---

#### `GET /assets`
Retrieves a list of all indexed media assets with filtering and sorting.
- **Query Parameters**:
    - `limit` (int, default=50): Max number of assets to return.
    - `page` (int, default=1): Pagination index (1-based).
    - `search` (str, optional): Filter by filename substring.
    - `type` (str, optional): Filter by media type. Values: `"video"`, `"image"`. If omitted, returns all types.
    - `sort` (str, default=`"date_desc"`): Sorting order.
        - `"date_desc"`: Newest files first (by modification date).
        - `"name_asc"`: Alphabetically A-Z by filename.
- **Response**: List of asset objects.
    ```json
    [
        {
            "filename": "my_video.mp4",
            "proxy_path": "/proxies/my_video.mp4",
            "original_path": "E:/input/my_video.mp4",
            "vision": "AI visual description...",
            "media_type": "video"
        }
    ]
    ```

### Staging Area (Pre-Ingestion)

#### `GET /raw-content/{filename}`
Streams a file from the staging area (`./brutos`) for preview/playback in the browser.
- **Path Parameter**:
    - `filename` (str): URL-encoded filename (spaces as `%20`).
- **Behavior**:
    - Decodes URL-encoded characters using `urllib.parse.unquote`.
    - Applies path traversal security (blocks `..` and absolute paths).
    - Preserves original filename with spaces (no sanitization).
- **Response**: Direct file stream (`FileResponse`).
- **Errors**:
    - 400: Invalid filename (path traversal attempt).
    - 404: File not found in staging.
- **Example**: `GET /raw-content/my%20video.mp4` → streams `./brutos/my video.mp4`

#### `GET /raw-files`
Lists files in the staging area (`./brutos`) with **server-side pagination** (v2.0).
- **Query Parameters**:
    - `page` (int, default=`1`): Page number to retrieve (1-indexed).
    - `limit` (int, default=`50`): Number of files per page.
    - `filter_type` (str, optional): Filter by media type. Values: `"video"`, `"audio"`, `"image"`. Omit for all types.
    - `search` (str, optional): Filter by filename substring (case-insensitive).
    - `sort` (str, default=`"date_desc"`): Sorting order.
        - `"date_desc"`: Newest files first.
        - `"date_asc"`: Oldest files first.
        - `"name_asc"`: Alphabetically A-Z.
        - `"name_desc"`: Alphabetically Z-A.
- **Response**: Paginated object with metadata.
    ```json
    {
        "files": [
            {
                "filename": "raw_video.mp4",
                "size": "15.23 MB",
                "type": "video",
                "path": "brutos/raw_video.mp4",
                "created": 1706380800.0
            }
        ],
        "total_files": 1234,
        "total_pages": 25,
        "current_page": 1,
        "has_more": true
    }
    ```
- **Performance Note**: Designed for large file collections (100k+ files). Frontend uses infinite scroll to fetch pages incrementally.

#### `POST /raw-files/rename`
Renames a file in the staging area.
- **Request Body**:
    ```json
    {
        "old_name": "C001.mp4",
        "new_name": "Interview_Final.mp4"
    }
    ```
- **Response**:
    ```json
    {
        "success": true,
        "message": "Renamed 'C001.mp4' to 'Interview_Final.mp4'"
    }
    ```
- **Errors**:
    - 404: Source file not found.
    - 400: Target file already exists or invalid filename.
    - **Note v6.6**: Supports filenames with spaces (inputs are automatically URL-decoded).

#### `POST /ingest/trim`
Trims a file **without re-encoding** (lossless) using `ffmpeg -c copy`.
- **Description**: Lossless trim using ffmpeg.
- **Warning**: This is a **BLOCKING** operation. The request may take up to 5 minutes to complete, during which the API worker is blocked.
- **Request Body**:
    ```json
    {
        "filename": "long_video.mp4",
        "start": 10.5,
        "end": 45.0,
        "target_name": "clip_final"
    }
    ```
- **Smart Extension**: If `target_name` has no extension, the source file's extension is auto-appended (e.g., `"clip_final"` → `"clip_final.mp4"`).
- **Response**:
    ```json
    {
        "success": true,
        "message": "Trim completed: clip_final.mp4",
        "output_file": "clip_final.mp4"
    }
    ```
- **Notes**: Output remains in `./brutos` for preview. Uses stream copy for instant processing.
- **Space Support**: Filenames with spaces are allowed and decoded server-side (e.g., "my%20video.mp4" → "my video.mp4").


#### `POST /ingest/move`
Moves files from staging (`./brutos`) to input (`./input`) for AI processing.
- **Request Body**:
    ```json
    {
        "files": ["file1.mp4", "subfolder/file2.jpg"]
    }
    ```
- **Response**:
    ```json
    {
        "success": true,
        "moved": ["file1.mp4", "subfolder/file2.jpg"],
        "errors": [],
        "message": "Moved 2 file(s) to input"
    }
    ```

#### `POST /raw-files/sanitize` (v7.6)
Batch sanitizes ALL files in the staging area recursively.
- **Operations**:
    - Converts to lowercase.
    - Replaces special chars/spaces with underscores.
    - Handles collisions with `_1`, `_2` suffixes.
    - Preserves file extensions robustly.
- **Response**:
    ```json
    {
        "success": true,
        "renamed_count": 12,
        "details": ["old.mp4 -> old.mp4", "My File.MOV -> my_file.mov"],
        "message": "Sanitized 12 files."
    }
    ```

### Folder Management (v7.6)

#### `GET /folders`
Lists all subdirectories in the target source.
- **Query**: `source=input` (default) or `source=raw`
- **Response**: `{"folders": ["folder1", "folder1/subfolder"]}`

#### `POST /folders`
Creates a new directory.
- **Body**: `{"folder_path": "new_folder"}`
- **Behavior**: Auto-sanitizes name (lowercase, no spaces).

#### `DELETE /folders`
Recursively deletes a folder and its contents.
- **Body**: `{"folder_path": "trash_folder"}`
- **Security**: Prevents deleting root.

#### `DELETE /raw-files`
Permanently deletes a file from staging.
- **Request Body**:
    ```json
    {
        "filename": "unwanted.mp4"
    }
    ```
- **Response**:
    ```json
    {
        "success": true,
        "message": "File 'unwanted.mp4' deleted"
    }
    ```

## Data Models
### Video Object
(Implicit in search response)
- **id**: Unique identifier in vector DB.
- **vision**: AI generated description of the video visual content.
- **audio**: AI generated transcription of the video audio.
