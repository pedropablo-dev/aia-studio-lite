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


@app.get("/thumbnail")
async def get_thumbnail(path: str):
    if not path:
        raise HTTPException(status_code=400, detail="Path required")

    clean_path = path.replace("file:///", "").replace("file://", "")

    # [MIGRATION v7.0] Flat Proxy Strategy for Recursive Files
    safe_name = clean_path.replace("/", "_").replace("\\", "_")
    base_name, _ = os.path.splitext(safe_name)

    thumb_path = PROXIES_DIR / f"{base_name}.jpg"

    if thumb_path.exists():
        return FileResponse(thumb_path)

    # Fallback: Try original basename logic for legacy compatibility
    legacy_name = os.path.basename(clean_path)
    legacy_base, _ = os.path.splitext(legacy_name)
    legacy_path = PROXIES_DIR / f"{legacy_base}.jpg"

    if legacy_path.exists():
        return FileResponse(legacy_path)

    raise HTTPException(status_code=404, detail="Thumbnail not found")


# === CORE LITE ENDPOINT ===

@app.get("/lite/files")
async def list_lite_files():
    """
    Scans INPUT_DIR recursively and returns all media files.
    Allowed: video (mp4, mov, mxf, avi, webm), audio (mp3, wav, aac),
             image (jpg, jpeg, png, webp).
    Hidden files are skipped.
    Relative paths are always returned with forward slashes.
    """
    input_dir_str = os.environ.get("INPUT_DIR")

    # Prefer env var; fall back to the utils-imported constant
    if input_dir_str:
        scan_root = Path(input_dir_str)
    else:
        scan_root = INPUT_DIR

    if not scan_root or not scan_root.is_dir():
        logger.warning(f"/lite/files: INPUT_DIR '{scan_root}' is not a valid directory.")
        return {"status": "success", "files": []}

    files = []
    try:
        for entry in scan_root.rglob("*"):
            if not entry.is_file():
                continue
            # Skip hidden files (starting with a dot)
            if entry.name.startswith("."):
                continue
            # Only allow whitelisted extensions
            ext = entry.suffix.lower()
            if ext not in ALLOWED_EXTENSIONS:
                continue

            # Relative path, always forward slashes
            try:
                rel_path = entry.relative_to(scan_root)
            except ValueError:
                continue

            rel_str = rel_path.as_posix()  # guaranteed forward slashes on all OS

            media_type = get_media_type(entry.name)

            files.append({
                "path": rel_str,
                "type": media_type,
                "name": entry.name,
            })

    except Exception as e:
        logger.error(f"Error scanning INPUT_DIR for /lite/files: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning media directory: {str(e)}")

    return {"status": "success", "files": files}


# === RAW FILES (STAGING AREA) ===

@app.get("/raw-files")
async def list_raw_files(sort: str = "date_desc", page: int = 1, limit: int = 50, filter_type: Optional[str] = None, search: Optional[str] = None, folder: Optional[str] = None):
    try:
        if not RAW_DIR.exists():
            return {"files": [], "total_files": 0, "total_pages": 0, "current_page": page, "has_more": False}

        files_info = []
        for entry in RAW_DIR.rglob('*'):
            if not entry.is_file(): continue
            if entry.name.startswith('.') or entry.name.lower() in ['thumbs.db', 'desktop.ini']: continue

            try:
                rel_path = entry.relative_to(RAW_DIR)
                filename_str = rel_path.as_posix()
            except ValueError:
                continue

            # [v7.6] FOLDER FILTERING (ALL vs ROOT vs SUB)
            if folder is not None:
                if folder == "":
                    if "/" in filename_str: continue
                else:
                    if not filename_str.startswith(folder + "/"): continue

            stat = entry.stat()
            size_mb = stat.st_size / (1024 * 1024)
            media_type = get_media_type(entry.name)

            if filter_type and filter_type != 'all' and media_type != filter_type: continue
            if search and search.lower() not in filename_str.lower(): continue

            files_info.append({
                "filename": filename_str,
                "size": f"{size_mb:.2f} MB",
                "type": media_type,
                "path": str(entry),
                "created": stat.st_ctime
            })

        if sort == "date_desc": files_info.sort(key=lambda x: x["created"], reverse=True)
        elif sort == "date_asc": files_info.sort(key=lambda x: x["created"], reverse=False)
        elif sort == "name_asc": files_info.sort(key=lambda x: x["filename"].lower())
        elif sort == "name_desc": files_info.sort(key=lambda x: x["filename"].lower(), reverse=True)

        total_files = len(files_info)
        total_pages = (total_files + limit - 1) // limit if limit > 0 else 1
        start = (page - 1) * limit
        end = start + limit

        return {
            "files": files_info[start:end],
            "total_files": total_files,
            "total_pages": total_pages,
            "current_page": page,
            "has_more": end < total_files
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")


@app.post("/raw-files/rename")
async def rename_raw_file(old_name: str = Body(...), new_name: str = Body(...)):
    try:
        old_name = unquote(old_name)
        new_name = unquote(new_name)
        old_clean = sanitize_filename(old_name)
        new_clean = sanitize_filename(new_name)

        old_path = RAW_DIR / old_clean
        new_path = RAW_DIR / new_clean

        if not old_path.exists():
            raise HTTPException(status_code=404, detail=f"File '{old_name}' not found")
        if new_path.exists():
            raise HTTPException(status_code=400, detail=f"File '{new_name}' already exists")

        old_path.rename(new_path)
        return {"success": True, "message": f"Renamed '{old_name}' to '{new_name}'"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error renaming file: {str(e)}")


@app.post("/raw-files/move")
async def move_raw_files(payload: RawMoveRequest):
    """
    Moves files within RAW_DIR to a target folder.
    """
    try:
        moved_files = []
        errors = []

        target_folder_clean = sanitize_filename(payload.target_folder)
        target_dir = RAW_DIR / target_folder_clean

        if not target_dir.exists():
            target_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Target folder created: {target_dir}")

        for filename in payload.files:
            try:
                source_clean = sanitize_filename(filename)
                source_path = RAW_DIR / source_clean

                if not source_path.exists():
                    errors.append(f"File '{filename}' not found")
                    continue

                file_basename = os.path.basename(source_clean)
                target_path = target_dir / file_basename

                if target_path.exists() and target_path != source_path:
                    stem, ext = os.path.splitext(file_basename)
                    counter = 1
                    while target_path.exists():
                        target_path = target_dir / f"{stem}_{counter}{ext}"
                        counter += 1

                if target_path != source_path:
                    shutil.move(str(source_path), str(target_path))
                    moved_files.append(filename)
                else:
                    logger.info(f"File {filename} is already in target folder.")

            except Exception as e:
                errors.append(f"{filename}: {str(e)}")

        return {
            "success": len(moved_files) > 0 or not errors,
            "moved": moved_files,
            "errors": errors,
            "message": f"Moved {len(moved_files)} file(s) to {payload.target_folder or 'root'}"
        }
    except Exception as e:
        logger.exception(f"Error moving raw files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/trim")
async def trim_file(filename: str = Body(...), start: float = Body(...), end: float = Body(...), target_name: str = Body(...)):
    try:
        filename = unquote(filename)
        target_name = unquote(target_name)
        source_clean = sanitize_filename(filename)
        target_clean = sanitize_filename(target_name)

        source_ext = os.path.splitext(source_clean)[1]
        if not os.path.splitext(target_clean)[1] and source_ext:
            target_clean = target_clean + source_ext

        source_path = RAW_DIR / source_clean
        target_path = RAW_DIR / target_clean

        if not source_path.exists():
            raise HTTPException(status_code=404, detail=f"Source file '{filename}' not found")
        if target_path.exists():
            raise HTTPException(status_code=400, detail=f"Target file '{target_name}' already exists")
        if start < 0 or end <= start:
            raise HTTPException(status_code=400, detail="Invalid time range")

        cmd = [
            "ffmpeg", "-ss", str(start), "-to", str(end),
            "-i", str(source_path), "-c", "copy", "-avoid_negative_ts", "1",
            str(target_path)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"FFmpeg error: {result.stderr}")

        return {"success": True, "message": f"Trim completed: {target_name}", "output_file": target_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error trimming file: {str(e)}")


@app.post("/ingest/move")
async def move_to_input(payload: FileMoveRequest):
    try:
        moved_files = []
        errors = []

        for filename in payload.files:
            try:
                p = Path(filename)
                flat_name = p.name

                clean_name = sanitize_filename(flat_name)
                source_path = RAW_DIR / filename
                target_path = INPUT_DIR / clean_name

                if not source_path.exists():
                    errors.append(f"File '{filename}' not found in staging")
                    continue

                if target_path.exists():
                    errors.append(f"File '{clean_name}' already exists in Input root")
                    continue

                if not INPUT_DIR.exists(): INPUT_DIR.mkdir(parents=True)

                shutil.move(str(source_path), str(target_path))
                moved_files.append(filename)
            except Exception as e:
                errors.append(f"{filename}: {str(e)}")

        return {"success": len(moved_files) > 0, "moved": moved_files, "errors": errors, "message": f"Moved {len(moved_files)} file(s) to input"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error moving files: {str(e)}")


@app.delete("/raw-files")
async def delete_raw_file(payload: RawFileRequest):
    try:
        filename = payload.filename
        clean_name = sanitize_filename(filename)
        filepath = RAW_DIR / clean_name

        if not filepath.exists():
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

        os.remove(filepath)
        return {"success": True, "message": f"File '{filename}' deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")


@app.post("/raw-files/sanitize")
async def sanitize_all_raw_files():
    """
    Recursively scans RAW_DIR and renames files to a safe format:
    - Lowercase
    - Spaces/Special chars -> Underscore
    - Keeps: a-z, 0-9, ., -, _
    Handles collisions by appending suffix.
    """
    try:
        renamed_count = 0
        details = []

        all_files = [f for f in RAW_DIR.rglob('*') if f.is_file()]

        for file_path in all_files:
            original_name = file_path.name
            parent_dir = file_path.parent

            new_name_base = original_name.lower()
            new_name_clean = re.sub(r'[^a-z0-9._-]', '_', new_name_base)

            if new_name_clean == original_name:
                continue

            target_path = parent_dir / new_name_clean

            if target_path.exists() and target_path.resolve() != file_path.resolve():
                stem, ext = os.path.splitext(new_name_clean)
                counter = 1
                while target_path.exists():
                    target_path = parent_dir / f"{stem}_{counter}{ext}"
                    counter += 1

            try:
                file_path.rename(target_path)
                renamed_count += 1
                try:
                    rel_old = file_path.relative_to(RAW_DIR)
                    rel_new = target_path.relative_to(RAW_DIR)
                    details.append(f"{rel_old} -> {rel_new}")
                except Exception:
                    details.append(f"{original_name} -> {target_path.name}")
            except Exception as e:
                logger.error(f"Failed to rename {file_path}: {e}")

        return {
            "success": True,
            "renamed_count": renamed_count,
            "details": details,
            "message": f"Sanitized {renamed_count} files."
        }

    except Exception as e:
        logger.exception(f"Sanitization error: {e}")
        raise HTTPException(status_code=500, detail=f"Sanitization failed: {str(e)}")


# === FOLDER MANAGEMENT ===

@app.get("/folders")
async def list_folders(source: str = "input"):
    """
    Returns a list of all subdirectories.
    source: "input" (default) or "raw" (for ingest)
    """
    try:
        target_dir = RAW_DIR if source == "raw" else INPUT_DIR

        folders = []
        if target_dir.exists():
            for root, dirs, _ in os.walk(target_dir):
                for d in dirs:
                    if d.startswith(".") or d == "__pycache__": continue

                    full_path = Path(root) / d
                    try:
                        rel_path = full_path.relative_to(target_dir)
                        folders.append(rel_path.as_posix())
                    except Exception:
                        continue
        return {"folders": sorted(folders)}
    except Exception as e:
        logger.error(f"Error listing folders (source={source}): {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/folders")
async def create_folder(payload: FolderRequest, source: str = "input"):
    """
    Creates a new folder.
    source: "input" (default) or "raw" (for ingest)
    """
    try:
        raw_name = payload.folder_path.strip().lower()
        safe_name = re.sub(r'[^a-z0-9]', '_', raw_name)
        safe_name = re.sub(r'_+', '_', safe_name).strip('_')

        if not safe_name:
            raise HTTPException(status_code=400, detail="Invalid folder name after sanitization")

        target_root = RAW_DIR if source == "raw" else INPUT_DIR
        target_path = target_root / safe_name

        try:
            target_path_resolved = target_path.resolve()
            root_resolved = target_root.resolve()
            if not str(target_path_resolved).startswith(str(root_resolved)):
                raise HTTPException(status_code=403, detail="Access denied: path escape attempt")
        except HTTPException:
            raise
        except Exception:
            pass

        if target_path.exists():
            if not target_path.is_dir():
                raise HTTPException(status_code=400, detail="Path exists and is not a folder")
            return {"success": True, "message": f"Folder '{safe_name}' already exists", "created": False, "folder": safe_name}

        os.makedirs(target_path, exist_ok=True)
        return {"success": True, "message": f"Folder '{safe_name}' created", "created": True, "folder": safe_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {str(e)}")


@app.delete("/folders")
async def delete_folder(payload: FolderRequest, source: str = "input"):
    """
    Deletes a folder and all contents.
    source: "input" (default) or "raw" (for ingest)
    """
    try:
        if not payload.folder_path or payload.folder_path.strip() in [".", "/", ""]:
            raise HTTPException(status_code=400, detail=f"Cannot delete root {source} directory")

        clean_path = sanitize_filename(payload.folder_path)
        target_root = RAW_DIR if source == "raw" else INPUT_DIR
        target_path = (target_root / clean_path).resolve()
        root_resolved = target_root.resolve()

        if not str(target_path).startswith(str(root_resolved)) or target_path == root_resolved:
            raise HTTPException(status_code=403, detail="Access denied")

        if not target_path.exists():
            raise HTTPException(status_code=404, detail="Folder not found")

        if not target_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a folder")

        shutil.rmtree(target_path)
        return {"success": True, "message": f"Folder '{clean_path}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete folder: {str(e)}")


# === ASSET MANAGEMENT (INPUT DIR) ===

def move_asset_logic(old_rel_path: str, new_rel_path: str, move_file_on_disk: bool = True):
    """
    Helper to move a single asset:
    1. Move File on disk (if requested)
    2. Rename Proxy files (if they exist)
    """
    try:
        abs_old = INPUT_DIR / old_rel_path
        abs_new = INPUT_DIR / new_rel_path

        # 1. File Move
        if move_file_on_disk:
            abs_new.parent.mkdir(parents=True, exist_ok=True)
            if abs_old.exists() and not abs_new.exists():
                shutil.move(str(abs_old), str(abs_new))

        # 2. Proxy Rename (flattened path strategy)
        def get_flat_proxy(rel_p, ext):
            clean = rel_p.replace("\\", "/").replace("/", "_")
            return PROXIES_DIR / f"{os.path.splitext(clean)[0]}{ext}"

        for ext in [".jpg", ".mp4", ".mp3"]:
            old_proxy = get_flat_proxy(old_rel_path, ext)
            new_proxy = get_flat_proxy(new_rel_path, ext)
            if old_proxy.exists():
                if new_proxy.exists():
                    os.remove(new_proxy)
                old_proxy.rename(new_proxy)

        return True
    except Exception as e:
        logger.error(f"Error moving asset {old_rel_path}: {e}")
        return False


@app.post("/assets/move")
async def move_assets(payload: MoveRequest):
    """Moves selected files to a target folder."""
    base_target = sanitize_filename(payload.target_folder)
    success_count = 0
    errors = []

    for filename in payload.files:
        try:
            clean_filename = filename.replace("\\", "/")
            file_name_only = os.path.basename(clean_filename)
            new_rel = os.path.join(base_target, file_name_only)

            if new_rel.replace("\\", "/") == clean_filename:
                continue

            if move_asset_logic(clean_filename, new_rel, move_file_on_disk=True):
                success_count += 1
            else:
                errors.append(filename)

        except Exception as e:
            errors.append(f"{filename}: {e}")

    return {"success": True, "moved": success_count, "errors": errors}


@app.post("/assets/rename")
async def rename_asset(payload: AssetRenameRequest):
    """
    Renames a single asset file.
    Payload: { "old_path": "folder/video.mp4", "new_name": "video_final.mp4" }
    """
    try:
        old_rel = sanitize_filename(payload.old_path)
        new_name = sanitize_filename(payload.new_name)

        if not new_name:
            raise HTTPException(status_code=400, detail="New name cannot be empty")

        old_full_path = INPUT_DIR / old_rel
        if not old_full_path.exists():
            raise HTTPException(status_code=404, detail="Source file not found")

        _, old_ext = os.path.splitext(old_rel)
        _, new_ext = os.path.splitext(new_name)

        if old_ext.lower() != new_ext.lower():
            raise HTTPException(status_code=400, detail=f"Extension mismatch: cannot change {old_ext} to {new_ext}")

        parent_dir = Path(old_rel).parent
        new_rel = (parent_dir / new_name).as_posix()

        new_full_path = INPUT_DIR / new_rel

        if new_full_path.exists():
            raise HTTPException(status_code=409, detail="Target file already exists")

        result = move_asset_logic(old_rel, new_rel, move_file_on_disk=True)

        if not result:
            raise HTTPException(status_code=500, detail="Failed to rename asset internal error")

        return {"success": True, "message": f"Renamed to {new_name}", "new_path": new_rel}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Rename error: {e}")
        raise HTTPException(status_code=500, detail=f"Rename failed: {str(e)}")


@app.delete("/assets")
async def delete_asset(payload: AssetDeleteRequest):
    """
    Deletes an asset from the filesystem and its associated proxies.
    Payload: { "path": "folder/video.mp4" }
    """
    try:
        rel_path = sanitize_filename(payload.path)
        rel_path_id = rel_path.replace("\\", "/")

        full_path = INPUT_DIR / rel_path

        # 1. Filesystem Deletion
        if full_path.exists():
            try:
                os.remove(full_path)
            except Exception as e:
                logger.error(f"Failed to delete physical file {rel_path}: {e}")
        else:
            logger.warning(f"File {rel_path} not found on disk, cleaning up proxies only.")

        # 2. Proxy Deletion (flattened path)
        flat_name_base = os.path.splitext(rel_path_id.replace("/", "_"))[0]

        for ext in [".jpg", ".mp4", ".mp3", ".wav", ".png"]:
            proxy_path = PROXIES_DIR / f"{flat_name_base}{ext}"
            if proxy_path.exists():
                try:
                    os.remove(proxy_path)
                except Exception:
                    pass

        # Legacy proxy check (basename only)
        legacy_base = os.path.splitext(os.path.basename(rel_path))[0]
        if legacy_base != flat_name_base:
            for ext in [".jpg", ".mp4", ".mp3"]:
                p = PROXIES_DIR / f"{legacy_base}{ext}"
                if p.exists():
                    try:
                        os.remove(p)
                    except Exception:
                        pass

        return {"success": True, "message": f"Deleted {rel_path}"}

    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


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
