"""
API SERVER
Refactored for Lite version — no AI, no DB, no Monitor process.
"""
import sys
import os
import re
import shutil
import subprocess
import logging
from urllib.parse import unquote
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from pathlib import Path

# [MIGRATION v7.0] Import Centralized Paths
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils import INPUT_DIR, RAW_DIR, PROXIES_DIR

# === LOGGING CONFIGURATION ===
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("app.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AIA-API")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:9999",
        "http://127.0.0.1:9999",
        "null"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === EXTENSION MAPPINGS ===
EXT_VIDEO = {'.mp4', '.mov', '.mxf', '.avi', '.webm'}
EXT_AUDIO = {'.mp3', '.wav', '.aac'}
EXT_IMAGE = {'.jpg', '.jpeg', '.png', '.webp'}

# All allowed extensions for /lite/files scan
ALLOWED_EXTENSIONS = EXT_VIDEO | EXT_AUDIO | EXT_IMAGE


def sanitize_filename(filename: str) -> str:
    """
    Sanitiza nombres de archivo permitiendo rutas relativas.
    [MIGRATION v7.0] Remove os.path.basename check to allow subfolders.
    """
    clean = filename.strip()
    # Prevent directory traversal and absolute paths
    if ".." in clean:
        raise ValueError("Directory traversal detected")
    if clean.startswith("/") or clean.startswith("\\") or (":" in clean):
        raise ValueError("Absolute paths not allowed")
    return clean


def get_media_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in EXT_VIDEO: return "video"
    elif ext in EXT_AUDIO: return "audio"
    elif ext in EXT_IMAGE: return "image"
    return "unknown"


# === PYDANTIC MODELS ===

class RawFileRequest(BaseModel):
    filename: str

class FolderRequest(BaseModel):
    folder_path: str

class FileMoveRequest(BaseModel):
    files: List[str]

class RawMoveRequest(BaseModel):
    files: List[str]
    target_folder: str

class MoveRequest(BaseModel):
    files: List[str]
    target_folder: str

class RenameFolderRequest(BaseModel):
    old_path: str
    new_path: str

class AssetRenameRequest(BaseModel):
    old_path: str
    new_name: str

class AssetDeleteRequest(BaseModel):
    path: str

# --- LITE FILE MANAGER MODELS ---
class LiteRenameRequest(BaseModel):
    folder: str          # Absolute Media Root path from UI
    old_path: str        # Relative path of the file to rename
    new_name: str        # New filename (no path separators)

class LiteMoveRequest(BaseModel):
    folder: str          # Absolute Media Root path from UI
    file_path: str       # Relative path of the file to move
    target_directory: str # Relative path of target folder

class LiteDeleteRequest(BaseModel):
    folder: str          # Absolute Media Root path from UI
    file_path: str       # Relative path of the file to delete

class LiteFolderCreateRequest(BaseModel):
    folder: str          # Absolute Media Root (user-configured root)
    new_dir: str         # Relative path for the new folder to create

class LiteFolderDeleteRequest(BaseModel):
    folder: str          # Absolute Media Root
    dir_path: str        # Relative path of the folder to delete

class LiteFolderRenameRequest(BaseModel):
    folder: str
    old_dir_path: str
    new_name: str

# === STARTUP ===

@app.on_event("startup")
async def startup_event():
    # Verify Staging Area from Utils
    if not RAW_DIR.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"Carpeta de staging verificada: {RAW_DIR}")


# === STATIC FILE SERVING ===

@app.get("/proxies/{file_path:path}")
async def get_proxy_file(file_path: str):
    # 1. Try exact match (Legacy behavior)
    exact_path = PROXIES_DIR / file_path
    if exact_path.exists() and exact_path.is_file():
        return FileResponse(exact_path)

    # 2. Try Flattened Filename (New behavior)
    flat_name = file_path.replace("/", "_").replace("\\", "_")
    flat_path = PROXIES_DIR / flat_name

    if flat_path.exists() and flat_path.is_file():
        return FileResponse(flat_path)

    raise HTTPException(status_code=404, detail="Proxy not found")


@app.get("/raw-content/{filename:path}")
async def get_raw_content(filename: str):
    try:
        real_filename = unquote(filename)
        safe_filename = sanitize_filename(real_filename)
        filepath = RAW_DIR / safe_filename

        if not filepath.exists():
            raise HTTPException(status_code=404, detail=f"File '{safe_filename}' not found in staging")

        return FileResponse(filepath)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# .lite_cache directory for FFmpeg-generated thumbnails
_CACHE_DIR = Path(os.path.dirname(os.path.abspath(__file__))).parent / ".lite_cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/thumbnail")
async def get_thumbnail(path: str, folder: Optional[str] = None):
    """
    [LITE] Returns a thumbnail for a media file.

    - Images  → returned directly (FileResponse).
    - Videos  → generates a JPEG thumbnail using FFmpeg at 00:00:01
               and caches it in .lite_cache/ next to the project root.
    - Audio   → 404 (no visual thumbnail).

    Params:
      path   - Relative path of the file (forward slashes, as returned by /lite/files).
      folder - Absolute root directory that contains the file.  Falls back to
               INPUT_DIR env var, then to utils.INPUT_DIR.
    """
    if not path:
        raise HTTPException(status_code=400, detail="path parameter required")

    # --- Resolve scan root ---
    if folder and folder.strip():
        scan_root = Path(folder.strip())
    else:
        env_dir = os.environ.get("INPUT_DIR")
        scan_root = Path(env_dir) if env_dir else INPUT_DIR

    abs_path = scan_root / path

    if not abs_path.exists() or not abs_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    ext = abs_path.suffix.lower()

    # --- Images: return directly ---
    if ext in EXT_IMAGE:
        return FileResponse(str(abs_path), media_type=f"image/{ext.lstrip('.')}")

    # --- Audio: no thumbnail ---
    if ext in EXT_AUDIO:
        raise HTTPException(status_code=404, detail="No thumbnail for audio files")

    # --- Videos: generate / return cached thumbnail ---
    if ext in EXT_VIDEO:
        # Build a stable, collision-free cache filename from the relative path
        safe_name = path.replace("/", "_").replace("\\", "_")
        cache_stem = os.path.splitext(safe_name)[0]
        cache_path = _CACHE_DIR / f"{cache_stem}.jpg"

        if cache_path.exists():
            return FileResponse(str(cache_path), media_type="image/jpeg")

        # Generate with FFmpeg
        try:
            cmd = [
                "ffmpeg", "-y",
                "-ss", "00:00:01",
                "-i", str(abs_path),
                "-vframes", "1",
                "-q:v", "2",
                str(cache_path)
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=30
            )
            if result.returncode == 0 and cache_path.exists():
                return FileResponse(str(cache_path), media_type="image/jpeg")
            else:
                logger.warning(f"FFmpeg thumbnail failed for '{path}': {result.stderr.decode(errors='replace')[:300]}")
                raise HTTPException(status_code=404, detail="Thumbnail generation failed")
        except subprocess.TimeoutExpired:
            logger.error(f"FFmpeg timeout generating thumbnail for '{path}'")
            raise HTTPException(status_code=504, detail="Thumbnail generation timed out")
        except Exception as e:
            logger.error(f"Unexpected error generating thumbnail for '{path}': {e}")
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=404, detail="Unsupported media type for thumbnail")


# === CORE LITE ENDPOINT ===

@app.get("/lite/files")
async def list_lite_files(
    folder: Optional[str] = None,
    subpath: str = "",
    search: Optional[str] = None,
):
    """
    [LITE] Lists directory contents for the hierarchical file explorer.

    - Default: returns only the contents of the current level (iterdir).
    - With `search`: performs a recursive rglob scan filtered by filename.
    - Folders are returned as items with type="folder".

    Params:
      folder  - Absolute Media Root. Falls back to INPUT_DIR env var / utils.INPUT_DIR.
      subpath - Relative path within the root to browse (default = root).
      search  - If given, performs a recursive filename search in the entire tree.
    """
    if folder and folder.strip():
        scan_root = Path(folder.strip())
    else:
        env_dir = os.environ.get("INPUT_DIR")
        scan_root = Path(env_dir) if env_dir else INPUT_DIR

    if not scan_root or not scan_root.is_dir():
        logger.warning(f"/lite/files: scan_root '{scan_root}' is not a valid directory.")
        return {"status": "success", "items": [], "current": subpath}

    # Sanitize subpath to prevent traversal attacks
    safe_sub = subpath.strip().lstrip("/").lstrip("\\")
    if ".." in safe_sub.split("/") or ".." in safe_sub.split("\\"):
        raise HTTPException(status_code=400, detail="Invalid subpath")

    target = scan_root / safe_sub if safe_sub else scan_root

    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Directory not found: {subpath}")

    items = []
    try:
        # --- SEARCH MODE: recursive rglob filtered by filename ---
        if search and search.strip():
            query = search.strip().lower()
            for entry in target.rglob("*"):
                if not entry.is_file():
                    continue
                if entry.name.startswith("."):
                    continue
                if entry.suffix.lower() not in ALLOWED_EXTENSIONS:
                    continue
                if query not in entry.name.lower():
                    continue
                try:
                    rel_str = entry.relative_to(scan_root).as_posix()
                except ValueError:
                    continue
                items.append({
                    "path": rel_str,
                    "type": get_media_type(entry.name),
                    "name": entry.name,
                })

        # --- BROWSE MODE: single-level iterdir ---
        else:
            entries = sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
            for entry in entries:
                if entry.name.startswith("."):
                    continue
                try:
                    rel_str = entry.relative_to(scan_root).as_posix()
                except ValueError:
                    continue

                if entry.is_dir():
                    items.append({
                        "path": rel_str,
                        "type": "folder",
                        "name": entry.name,
                    })
                elif entry.is_file() and entry.suffix.lower() in ALLOWED_EXTENSIONS:
                    items.append({
                        "path": rel_str,
                        "type": get_media_type(entry.name),
                        "name": entry.name,
                    })

    except Exception as e:
        logger.error(f"Error scanning for /lite/files: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning media directory: {str(e)}")

    return {"status": "success", "items": items, "current": safe_sub}


# === LITE FILE WRITE ENDPOINTS ===

# software root — nothing under this path may be touched
_SW_ROOT = Path(os.path.dirname(os.path.abspath(__file__))).parent.resolve()


def _validate_lite_path(folder: str, rel_path: str) -> tuple[Path, Path]:
    """
    Security helper for Lite write operations.
    Returns (root_path, target_path) both resolved.
    Raises HTTPException 400/403 on any violation.
    """
    if not folder or not folder.strip():
        raise HTTPException(status_code=400, detail="Media Root (folder) is required for write operations")

    root = Path(folder.strip()).resolve()

    # Block writing to software directory
    try:
        root.relative_to(_SW_ROOT)
        raise HTTPException(
            status_code=403,
            detail="Write operations are not allowed within the application directory"
        )
    except ValueError:
        pass  # Good — root is NOT a subdirectory of _SW_ROOT

    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"Media Root does not exist: {folder}")

    # Sanitize relative path: strip leading slashes/backslashes, reject traversal
    clean_rel = rel_path.strip().lstrip("/").lstrip("\\")
    if ".." in clean_rel.replace("\\", "/").split("/"):
        raise HTTPException(status_code=400, detail="Path traversal detected in file_path")

    target = (root / clean_rel).resolve()

    if not target.is_relative_to(root):
        raise HTTPException(status_code=403, detail="Path escapes the configured Media Root")

    return root, target


def _delete_cache_entry(rel_path: str) -> None:
    """Remove a cached thumbnail for the given relative path (if it exists)."""
    safe_name = rel_path.replace("/", "_").replace("\\", "_")
    cache_stem = os.path.splitext(safe_name)[0]
    cache_path = _CACHE_DIR / f"{cache_stem}.jpg"
    if cache_path.exists():
        try:
            cache_path.unlink()
            logger.info(f"[Lite] Cache evicted: {cache_path.name}")
        except Exception as e:
            logger.warning(f"[Lite] Could not delete cache entry {cache_path}: {e}")


@app.post("/lite/files/rename")
async def lite_rename_file(payload: LiteRenameRequest):
    """
    [LITE] Renames a media file inside the Media Root.
    Security: validates path confinement with _validate_lite_path.
    Cache: evicts old thumbnail entry automatically.
    """
    root, target = _validate_lite_path(payload.folder, payload.old_path)

    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not target.is_file():
        raise HTTPException(status_code=400, detail="Target is not a file")

    # Validate new_name: no path separators, same extension
    new_name = payload.new_name.strip()
    if not new_name or "/" in new_name or "\\" in new_name:
        raise HTTPException(status_code=400, detail="new_name must be a plain filename (no separators)")
    if target.suffix.lower() != Path(new_name).suffix.lower():
        raise HTTPException(status_code=400, detail="Cannot change file extension during rename")

    new_path = target.parent / new_name
    if new_path.exists():
        raise HTTPException(status_code=409, detail=f"'{new_name}' already exists in this folder")

    old_rel = payload.old_path.strip().lstrip("/").lstrip("\\")
    try:
        new_path = new_path.resolve()
        if not new_path.is_relative_to(root):
            raise HTTPException(status_code=403, detail="Resulting path escapes the Media Root")
        target.rename(new_path)
    except Exception as e:
        logger.error(f"[Lite] Rename failed: {e}")
        raise HTTPException(status_code=500, detail=f"Rename failed: {e}")

    new_rel = new_path.relative_to(root).as_posix()
    _delete_cache_entry(old_rel)

    logger.info(f"[Lite] Renamed '{old_rel}' -> '{new_rel}'")
    return {"success": True, "old_path": old_rel, "new_path": new_rel}


@app.post("/lite/files/delete")
async def lite_delete_file(payload: LiteDeleteRequest):
    """
    [LITE] Permanently deletes a media file inside the Media Root.
    Security: validates path confinement with _validate_lite_path.
    Cache: evicts thumbnail entry automatically.
    """
    root, target = _validate_lite_path(payload.folder, payload.file_path)

    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not target.is_file():
        raise HTTPException(status_code=400, detail="Target is not a file — use folder endpoints to delete folders")

    rel_path = payload.file_path.strip().lstrip("/").lstrip("\\")
    try:
        target.unlink()
    except Exception as e:
        logger.error(f"[Lite] Delete failed: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")

    _delete_cache_entry(rel_path)

    logger.info(f"[Lite] Deleted '{rel_path}'")
    return {"success": True, "deleted_path": rel_path}


@app.post("/lite/files/move")
async def lite_move_file(payload: LiteMoveRequest):
    """
    [LITE] Moves a media file to a different subdirectory inside the Media Root.
    Security: both source and destination must be confined within the Media Root.
    Cache: evicts old thumbnail entry and registers new one path.
    """
    root, source = _validate_lite_path(payload.folder, payload.file_path)

    if not source.exists():
        raise HTTPException(status_code=404, detail="Source file not found")
    if not source.is_file():
        raise HTTPException(status_code=400, detail="Source is not a file")

    # Validate destination directory
    dest_dir_rel = payload.target_directory.strip().lstrip("/").lstrip("\\")
    if ".." in dest_dir_rel.replace("\\", "/").split("/"):
        raise HTTPException(status_code=400, detail="Path traversal detected in target_directory")

    dest_dir = (root / dest_dir_rel).resolve()
    if not dest_dir.is_relative_to(root):
        raise HTTPException(status_code=403, detail="Target directory escapes the Media Root")
    if not dest_dir.is_dir():
        raise HTTPException(status_code=404, detail="Target directory does not exist")

    dest_file = dest_dir / source.name
    if dest_file.exists():
        raise HTTPException(status_code=409, detail=f"'{source.name}' already exists in the target folder")

    old_rel = payload.file_path.strip().lstrip("/").lstrip("\\")
    try:
        source.rename(dest_file)
    except Exception as e:
        logger.error(f"[Lite] Move failed: {e}")
        raise HTTPException(status_code=500, detail=f"Move failed: {e}")

    new_rel = dest_file.relative_to(root).as_posix()
    _delete_cache_entry(old_rel)

    logger.info(f"[Lite] Moved '{old_rel}' -> '{new_rel}'")
    return {"success": True, "old_path": old_rel, "new_path": new_rel}


@app.post("/lite/folders/create")
async def lite_create_folder(payload: LiteFolderCreateRequest):
    """
    [LITE] Creates a new directory inside the Media Root.
    Security: validated with _validate_lite_path (is_relative_to check).
    """
    if not payload.folder or not payload.folder.strip():
        raise HTTPException(status_code=400, detail="Media Root (folder) is required")

    root = Path(payload.folder.strip()).resolve()
    try:
        root.relative_to(_SW_ROOT)
        raise HTTPException(status_code=403, detail="Write operations not allowed within the application directory")
    except ValueError:
        pass

    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"Media Root does not exist: {payload.folder}")

    clean_rel = payload.new_dir.strip().lstrip("/").lstrip("\\")
    if ".." in clean_rel.replace("\\", "/").split("/"):
        raise HTTPException(status_code=400, detail="Path traversal detected in new_dir")

    new_dir_path = (root / clean_rel).resolve()
    if not new_dir_path.is_relative_to(root):
        raise HTTPException(status_code=403, detail="new_dir escapes the Media Root")

    if new_dir_path.exists():
        raise HTTPException(status_code=409, detail=f"'{clean_rel}' already exists")

    try:
        new_dir_path.mkdir(parents=True, exist_ok=False)
    except Exception as e:
        logger.error(f"[Lite] Folder create failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {e}")

    rel_str = new_dir_path.relative_to(root).as_posix()
    logger.info(f"[Lite] Folder created: '{rel_str}'")
    return {"success": True, "created": rel_str}


@app.post("/lite/folders/delete")
async def lite_delete_folder(payload: LiteFolderDeleteRequest):
    """
    [LITE] Deletes a directory and all its contents inside the Media Root.
    Security: validated with is_relative_to. Cannot delete the root itself.
    """
    if not payload.folder or not payload.folder.strip():
        raise HTTPException(status_code=400, detail="Media Root (folder) is required")

    root = Path(payload.folder.strip()).resolve()
    try:
        root.relative_to(_SW_ROOT)
        raise HTTPException(status_code=403, detail="Write operations not allowed within the application directory")
    except ValueError:
        pass

    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"Media Root does not exist: {payload.folder}")

    clean_rel = payload.dir_path.strip().lstrip("/").lstrip("\\")
    if not clean_rel:
        raise HTTPException(status_code=400, detail="Cannot delete the Media Root itself")
    if ".." in clean_rel.replace("\\", "/").split("/"):
        raise HTTPException(status_code=400, detail="Path traversal detected in dir_path")

    target_dir = (root / clean_rel).resolve()
    if not target_dir.is_relative_to(root):
        raise HTTPException(status_code=403, detail="dir_path escapes the Media Root")
    if not target_dir.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="Target is not a folder")

    try:
        shutil.rmtree(target_dir)
    except Exception as e:
        logger.error(f"[Lite] Folder delete failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete folder: {e}")

    logger.info(f"[Lite] Folder deleted: '{clean_rel}'")
    return {"success": True, "deleted": clean_rel}


@app.post("/lite/folders/rename")
async def lite_rename_folder(payload: LiteFolderRenameRequest):
    """
    [LITE] Renames a directory inside the Media Root.
    Security: validated with is_relative_to. Cannot rename the root itself.
    """
    if not payload.folder or not payload.folder.strip():
        raise HTTPException(status_code=400, detail="Media Root (folder) is required")

    root = Path(payload.folder.strip()).resolve()
    try:
        root.relative_to(_SW_ROOT)
        raise HTTPException(status_code=403, detail="Write operations not allowed within the application directory")
    except ValueError:
        pass

    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"Media Root does not exist: {payload.folder}")

    old_rel = payload.old_dir_path.strip().lstrip("/").lstrip("\\")
    if not old_rel:
        raise HTTPException(status_code=400, detail="Cannot rename the Media Root itself")
    if ".." in old_rel.replace("\\", "/").split("/"):
        raise HTTPException(status_code=400, detail="Path traversal detected in old_dir_path")

    target_dir = (root / old_rel).resolve()
    if not target_dir.is_relative_to(root):
        raise HTTPException(status_code=403, detail="old_dir_path escapes the Media Root")
    if not target_dir.exists():
        raise HTTPException(status_code=404, detail="Folder not found")
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="Target is not a folder")

    new_name = payload.new_name.strip()
    if not new_name or "/" in new_name or "\\" in new_name:
        raise HTTPException(status_code=400, detail="new_name must be a plain folder name (no separators)")

    new_dir_path = target_dir.parent / new_name
    if new_dir_path.exists():
        raise HTTPException(status_code=409, detail=f"'{new_name}' already exists in this location")
        
    try:
        target_dir.rename(new_dir_path)
    except Exception as e:
        logger.error(f"[Lite] Folder rename failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to rename folder: {e}")

    new_rel_str = new_dir_path.relative_to(root).as_posix()
    logger.info(f"[Lite] Folder renamed: '{old_rel}' -> '{new_rel_str}'")
    return {"success": True, "old_path": old_rel, "new_path": new_rel_str}




@app.post("/folders/rename")
async def rename_folder(payload: RenameFolderRequest):
    """Renames a folder and updates proxy files for all contained assets."""
    old_rel = sanitize_filename(payload.old_path)
    new_rel = sanitize_filename(payload.new_path)

    abs_old = INPUT_DIR / old_rel
    abs_new = INPUT_DIR / new_rel

    if not abs_old.exists():
        raise HTTPException(status_code=404, detail="Source folder not found")

    if abs_new.exists():
        raise HTTPException(status_code=400, detail="Target folder already exists (Merge not supported yet)")

    migrated_count = 0
    try:
        files_to_migrate = []
        for root, _, files in os.walk(abs_old):
            for file in files:
                full_path = Path(root) / file
                try:
                    rel_suffix = full_path.relative_to(abs_old)
                    old_rel_from_input = str(full_path.relative_to(INPUT_DIR)).replace("\\", "/")
                    new_rel_from_input = (Path(new_rel) / rel_suffix).as_posix()
                    files_to_migrate.append((old_rel_from_input, new_rel_from_input))
                except Exception:
                    continue

        # Migrate proxies only; physical rename happens by renaming the parent folder
        for old_p, new_p in files_to_migrate:
            move_asset_logic(old_p, new_p, move_file_on_disk=False)
            migrated_count += 1

        os.rename(abs_old, abs_new)

        return {"success": True, "message": f"Renamed folder and updated {migrated_count} asset proxies", "renamed_assets": migrated_count}

    except Exception as e:
        logger.error(f"Folder Rename Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9999)
