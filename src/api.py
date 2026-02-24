"""
API SERVER
Refactored for v7.0 External Media Root using src.utils
"""
import sys
import os
import shutil
import subprocess
import logging
from urllib.parse import unquote
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from pathlib import Path

# [MIGRATION v7.0] Import Centralized Paths
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# [LITE] import db_engine  # REMOVED: no DB in Lite version
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


# [LITE] DB = None  # REMOVED: no DB in Lite version
# [LITE] MONITOR_PROCESS = None  # REMOVED: no Monitor in Lite version

# CLASE FILTRO PARA SILENCIAR ENDPOINTS ESPECÍFICOS
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/monitor/status") == -1

# Extension mappings
EXT_VIDEO = {'.mp4', '.mov', '.mkv', '.avi', '.mxf'}
EXT_AUDIO = {'.mp3', '.wav', '.m4a', '.flac', '.aac'}
EXT_IMAGE = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}

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
    
    # Normalize separators if needed, but Path objects usually handle it. 
    # We return the string as-is (clean) to be joined with RAW_DIR.
    return clean

def get_media_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in EXT_VIDEO: return "video"
    elif ext in EXT_AUDIO: return "audio"
    elif ext in EXT_IMAGE: return "image"
    return "unknown"

class SearchResult(BaseModel):
    type: str
    filename: str
    proxy_path: str
    original_path: str
    score: float
    text: Optional[str] = None
    start_time: Optional[str] = None
    seconds: Optional[float] = 0.0

class RawFileRequest(BaseModel):
    filename: str

class FolderRequest(BaseModel):
    folder_path: str

class FileMoveRequest(BaseModel):
    files: List[str]

class RawMoveRequest(BaseModel):
    files: List[str]
    target_folder: str

@app.on_event("startup")
async def startup_event():
    # Silenciar logs de acceso para /monitor/status
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
    
    # [LITE] DB connection removed — no ChromaDB in Lite version
    # global DB
    # try:
    #     DB = db_engine.VideoDatabase()
    #     logger.info("Base de datos conectada correctamente")
    # except Exception as e:
    #     logger.exception(f"Error conectando DB: {e}")
    
    # Verify Staging Area from Utils
    if not RAW_DIR.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"Carpeta de staging verificada: {RAW_DIR}")

# [MIGRATION v7.0] Mount Proxies from External Drive
# We use str() to ensure compatibility with Windows Paths in FastAPI
# [MIGRATION v7.5] Custom Proxy Serving (Subfolder Support)
# Replaces StaticFiles to handle flattened filenames (e.g., "Folder/video.mp4" -> "Folder_video.mp4")
@app.get("/proxies/{file_path:path}")
async def get_proxy_file(file_path: str):
    # 1. Try exact match (Legacy behavior)
    exact_path = PROXIES_DIR / file_path
    if exact_path.exists() and exact_path.is_file():
        return FileResponse(exact_path)

    # 2. Try Flattened Filename (New behavior)
    # Replace directory separators with underscores
    flat_name = file_path.replace("/", "_").replace("\\", "_")
    flat_path = PROXIES_DIR / flat_name
    
    if flat_path.exists() and flat_path.is_file():
        return FileResponse(flat_path)

    # 3. Not Found
    raise HTTPException(status_code=404, detail="Proxy not found")

@app.get("/raw-content/{filename:path}")
async def get_raw_content(filename: str):
    try:
        real_filename = unquote(filename)
        safe_filename = sanitize_filename(real_filename)
        # Use RAW_DIR from utils
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
    
    # Clean file protocol if present
    clean_path = path.replace("file:///", "").replace("file://", "")
    
    # [MIGRATION v7.0] Flat Proxy Strategy for Recursive Files
    # "subfolder/video.mp4" -> "subfolder_video.jpg"
    # We replace directory separators with underscores to match potential flat proxy structure
    safe_name = clean_path.replace("/", "_").replace("\\", "_")
    base_name, _ = os.path.splitext(safe_name)
    
    # Use PROXIES_DIR from utils
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

@app.get("/assets")
async def get_assets(limit: int = 50, page: int = 1, type: Optional[str] = None, sort: str = "date_desc", search: Optional[str] = None, folder: Optional[str] = None):
    # [LITE] if not DB: raise HTTPException(status_code=503, detail="DB not initialized")
    
    # [MIGRATION v7.0] Source of Truth = Filesystem (Recursive)
    # We scan INPUT_DIR to find all available assets, then overlay DB metadata.
    
    fs_assets = []
    
    try:
        if INPUT_DIR.exists():
            for entry in INPUT_DIR.rglob('*'):
                if not entry.is_file(): continue
                if entry.name.startswith('.') or entry.name.lower() in ['thumbs.db', 'desktop.ini']: continue
                
                # Relative Path (ID)
                try:
                    rel_path = entry.relative_to(INPUT_DIR)
                    filename_id = str(rel_path).replace(os.sep, '/') # Force forward slash
                except:
                    continue
                    
                # Basic Stats
                stat = entry.stat()
                media_type = get_media_type(entry.name)
                
                # Filter early (by type or search) to save resources
                if type is not None and media_type != type: continue
                if search and search.lower() not in filename_id.lower(): continue
                
                # [v7.6] FOLDER FILTERING (ALL vs ROOT vs SUB)
                if folder is not None:
                    if folder == "":
                        # Show only files in root (no slashes)
                        if "/" in filename_id: continue
                    else:
                        # Show files in subfolder
                        if not filename_id.startswith(folder + "/"): continue
                
                fs_assets.append({
                    "id": filename_id,
                    "path": str(entry),
                    "mtime": stat.st_mtime,
                    "media_type": media_type
                })
    except Exception as e:
        logger.error(f"Error scanning assets: {e}")
        return []

    # [LITE] Get Metadata from DB — removed in Lite version, db_map is always empty
    # db_data = DB.get_all_videos(limit=5000)
    db_map = {}
    # if db_data and "ids" in db_data:
    #     for i, id_val in enumerate(db_data["ids"]):
    #         db_map[id_val] = db_data["metadatas"][i] if db_data["metadatas"] else {}

    # Merge FS + DB
    final_items = []
    for asset in fs_assets:
        meta = db_map.get(asset["id"], {})
        
        # Proxy Logic (Flattened)
        # If DB says nothing, we predict the path
        flat_name = asset["id"].replace("/", "_")
        predicted_proxy = f"/proxies/{os.path.splitext(flat_name)[0]}.mp4" # Video proxy usually mp4? Or we link to original if image?
        # Actually /thumbnails endpoint handles images, specific proxies needed for video.
        # Just passing the ID to frontend allows frontend to construct the URL or logic.
        
        final_items.append({
            "filename": asset["id"], # Relative path "sub/file.mp4"
            "proxy_path": meta.get("path", predicted_proxy),
            "original_path": str(asset["path"]),
            "vision": meta.get("vision", ""),
            "media_type": asset["media_type"],
            "mtime": asset["mtime"]
        })

    # Sorting
    if sort == "date_desc":
        final_items.sort(key=lambda x: x["mtime"], reverse=True)
    elif sort == "name_asc":
        final_items.sort(key=lambda x: x["filename"].lower())
    
    # Pagination
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    return final_items[start_idx:end_idx]

@app.get("/search", response_model=List[SearchResult])
async def search(query: str, min_score: float = 0.2, scope: str = "all"):
    # [LITE] if not DB: raise HTTPException(status_code=503, detail="DB not initialized")
    final_results = []
    
    # Search logic remains largely unchanged, relying on DB paths
    # 0. FILENAME SEARCH
    # [LITE] Filename search via DB removed — DB not available in Lite version
    # if scope in ["all", "filename"]:
    #     try:
    #         all_vids = DB.get_all_videos(limit=5000)
    #         ...
    #     except Exception as e: logger.exception(f"Filename search error: {e}")

    # 1. VISUAL & 2. SEGMENTOS (Logic delegated to DB Engine)
    # ... (Keeping existing logic for brevity, assuming DB engine handles queries) ...
    # We re-implement the visual/audio search blocks to ensure no regressions
    
    # [LITE] Visual search via DB.collection.query removed — no ChromaDB in Lite version
    # if scope in ["all", "visual"]:
    #     ...

    # [LITE] Audio/segment search via DB.segment_collection.query removed
    # if scope in ["all", "audio"]:
    #     ...

    final_results.sort(key=lambda x: x["score"], reverse=True)
    return final_results[:50]

@app.get("/raw-files")
async def list_raw_files(sort: str = "date_desc", page: int = 1, limit: int = 50, filter_type: Optional[str] = None, search: Optional[str] = None, folder: Optional[str] = None):
    try:
        # Use RAW_DIR from utils
        if not RAW_DIR.exists():
            return {"files": [], "total_files": 0, "total_pages": 0, "current_page": page, "has_more": False}
        
        files_info = []
        # [MIGRATION v7.0] Recursive scan using rglob
        for entry in RAW_DIR.rglob('*'):
            # Skip directories, only list files
            if not entry.is_file(): continue
            if entry.name.startswith('.') or entry.name.lower() in ['thumbs.db', 'desktop.ini']: continue
            
            # Calculate relative path (e.g., "subfolder/file.mp4")
            try:
                rel_path = entry.relative_to(RAW_DIR)
                # Force forward slashes for API consistency
                filename_str = str(rel_path).replace(os.sep, '/')
            except ValueError:
                continue # Should not happen with rglob

            # [v7.6] FOLDER FILTERING (ALL vs ROOT vs SUB)
            if folder is not None:
                if folder == "":
                    # Show only files in root (no slashes)
                    if "/" in filename_str: continue
                else:
                    # Show files in subfolder
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
                "path": str(entry), # Absolute path for debugging/display if needed
                "created": stat.st_ctime
            })
        
        # Sorting
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
        
        # Use RAW_DIR from utils
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
    Logic:
    - Iterate through payload.files.
    - Source: RAW_DIR / file_path
    - Target: RAW_DIR / payload.target_folder / filename
    """
    try:
        moved_files = []
        errors = []
        
        # Ensure target_folder is safe and absolute within RAW_DIR
        target_folder_clean = sanitize_filename(payload.target_folder)
        target_dir = RAW_DIR / target_folder_clean
        
        if not target_dir.exists():
            target_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Target folder created: {target_dir}")

        for filename in payload.files:
            try:
                # Source path (can be nested in RAW_DIR)
                source_clean = sanitize_filename(filename)
                source_path = RAW_DIR / source_clean
                
                if not source_path.exists():
                    errors.append(f"File '{filename}' not found")
                    continue
                
                # We move files TO the target_dir, maintaining their basename
                file_basename = os.path.basename(source_clean)
                target_path = target_dir / file_basename
                
                if target_path.exists() and target_path != source_path:
                    # Append counter if collision
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
        
        # Use RAW_DIR from utils
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
                # [FLATTEN] Get just the filename, ignoring parents
                p = Path(filename)
                flat_name = p.name
                
                clean_name = sanitize_filename(flat_name)
                source_path = RAW_DIR / filename
                # Use INPUT_DIR from utils - DIRECT TO ROOT
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

# [MIGRATION v7.0] Batch Sanitizer
@app.post("/raw-files/sanitize")
async def sanitize_all_raw_files():
    """
    Recursively scans RAW_DIR and renames files to a safe format:
    - Lowercase
    - Spaces/Special chars -> Underscore
    - Keeps: a-z, 0-9, ., -, _, /
    Handles collisions by appending suffix.
    """
    try:
        import re
        renamed_count = 0
        details = []
        
        # Safe char regex (allowing subfolder structure)
        # Note: We process names relative to RAW_DIR, but sanitize the 'name' part, not the whole path at once usually,
        # OR we just sanitize the filename component. 
        # Strategy: Iterate depth-first to rename files before parents (though we only rename files here).
        
        # We'll use rglob returning files, then process each.
        # Warning: Changing filenames while iterating can cause issues if not careful, 
        # but rglob generates an iterator. We should collect list first.
        all_files = [f for f in RAW_DIR.rglob('*') if f.is_file()]
        
        for file_path in all_files:
            original_name = file_path.name
            parent_dir = file_path.parent
            
            # RULE: Lowercase + Sub unsafe chars
            # 1. Lowercase
            new_name_base = original_name.lower()
            # 2. Replace spaces and unsafe chars with _
            # Keep only alphanumeric, dot, hypen, underscore
            new_name_clean = re.sub(r'[^a-z0-9._-]', '_', new_name_base)
            
            # Avoid redundant rename
            if new_name_clean == original_name:
                continue
                
            # Collision Check
            target_path = parent_dir / new_name_clean
            
            # If target exists and is not the file itself (case-insensitive FS check)
            if target_path.exists() and target_path.resolve() != file_path.resolve():
                # Append counter
                stem, ext = os.path.splitext(new_name_clean)
                counter = 1
                while target_path.exists():
                    target_path = parent_dir / f"{stem}_{counter}{ext}"
                    counter += 1
            
            # Perform Rename
            try:
                file_path.rename(target_path)
                renamed_count += 1
                # Record relative path change for logging
                try:
                    rel_old = file_path.relative_to(RAW_DIR)
                    rel_new = target_path.relative_to(RAW_DIR)
                    details.append(f"{rel_old} -> {rel_new}")
                except:
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

class FolderRequest(BaseModel):
    folder_path: str

# [MIGRATION v7.5] Folder Management Endpoints
@app.get("/folders")
async def list_folders(source: str = "input"):
    """
    Returns a list of all subdirectories.
    source: "input" (default) or "raw" (for ingest)
    """
    try:
        # Determine root based on source
        target_dir = RAW_DIR if source == "raw" else INPUT_DIR
        
        folders = []
        if target_dir.exists():
            for root, dirs, _ in os.walk(target_dir):
                for d in dirs:
                    # Logic to skip hidden folders
                    if d.startswith(".") or d == "__pycache__": continue
                    
                    full_path = Path(root) / d
                    try:
                        rel_path = full_path.relative_to(target_dir)
                        folders.append(str(rel_path).replace(os.sep, "/"))
                    except: continue
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
        import re
        # Strict Sanitization: lowercase and alphanumeric only (replaced by _)
        raw_name = payload.folder_path.strip().lower()
        safe_name = re.sub(r'[^a-z0-9]', '_', raw_name)
        safe_name = re.sub(r'_+', '_', safe_name).strip('_')
        
        if not safe_name:
            raise HTTPException(status_code=400, detail="Invalid folder name after sanitization")

        # Determine target root
        target_root = RAW_DIR if source == "raw" else INPUT_DIR
        target_path = target_root / safe_name
        
        # Security check
        try:
            target_path_resolved = target_path.resolve()
            root_resolved = target_root.resolve()
            if not str(target_path_resolved).startswith(str(root_resolved)):
                raise HTTPException(status_code=403, detail="Access denied: path escape attempt")
        except Exception:
             pass

        if target_path.exists():
             if not target_path.is_dir():
                 raise HTTPException(status_code=400, detail="Path exists and is not a folder")
             return {"success": True, "message": f"Folder '{safe_name}' already exists", "created": False, "folder": safe_name}
        
        os.makedirs(target_path, exist_ok=True)
        return {"success": True, "message": f"Folder '{safe_name}' created", "created": True, "folder": safe_name}
    except HTTPException: raise
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
        # Prevent deleting root or empty path
        if not payload.folder_path or payload.folder_path.strip() in [".", "/", ""]:
             raise HTTPException(status_code=400, detail=f"Cannot delete root {source} directory")

        clean_path = sanitize_filename(payload.folder_path)
        target_root = RAW_DIR if source == "raw" else INPUT_DIR
        target_path = target_root / clean_path
        
        # Security resolve
        target_path = target_path.resolve()
        root_resolved = target_root.resolve()
        
        if not str(target_path).startswith(str(root_resolved)) or target_path == root_resolved:
             raise HTTPException(status_code=403, detail="Access denied")

        if not target_path.exists():
             raise HTTPException(status_code=404, detail="Folder not found")
        
        if not target_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a folder")

        import shutil
        shutil.rmtree(target_path)
        return {"success": True, "message": f"Folder '{clean_path}' deleted"}
    except HTTPException: raise
    except Exception as e:
        logger.error(f"Error deleting folder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete folder: {str(e)}")

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

def move_asset_logic(old_rel_path: str, new_rel_path: str, move_file_on_disk: bool = True):
    """
    Helper to move a single asset:
    1. Migrate DB Record
    2. Move File (if requested)
    3. Rename Proxy (if exists)
    """
    try:
        abs_old = INPUT_DIR / old_rel_path
        abs_new = INPUT_DIR / new_rel_path
        
        # [LITE] 1. DB Migration removed — no DB in Lite version
        # if DB:
        #     old_id = old_rel_path.replace("\\", "/")
        #     new_id = new_rel_path.replace("\\", "/")
        #     DB.move_video_record(old_id, new_id, str(abs_new))

        # 2. File Move
        if move_file_on_disk:
            # Ensure parent exists
            abs_new.parent.mkdir(parents=True, exist_ok=True)
            if abs_old.exists() and not abs_new.exists():
                shutil.move(str(abs_old), str(abs_new))
        
        # 3. Proxy Rename
        # Logic: Flattened path "folder/sub/file.mp4" -> "folder_sub_file.jpg"
        def get_flat_proxy(rel_p, ext):
            clean = rel_p.replace("\\", "/").replace("/", "_")
            return PROXIES_DIR / f"{os.path.splitext(clean)[0]}{ext}"

        # Try renaming .jpg proxy
        old_proxy_jpg = get_flat_proxy(old_rel_path, ".jpg")
        new_proxy_jpg = get_flat_proxy(new_rel_path, ".jpg")
        
        if old_proxy_jpg.exists():
            if new_proxy_jpg.exists(): os.remove(new_proxy_jpg) # Overwrite?
            old_proxy_jpg.rename(new_proxy_jpg)
            
        # Try renaming .mp4 proxy (if audio/video proxy)
        old_proxy_mp4 = get_flat_proxy(old_rel_path, ".mp4")
        new_proxy_mp4 = get_flat_proxy(new_rel_path, ".mp4")
         
        if old_proxy_mp4.exists():
            old_proxy_mp4.rename(new_proxy_mp4)
            
        # Try renaming .mp3 proxy
        old_proxy_mp3 = get_flat_proxy(old_rel_path, ".mp3")
        new_proxy_mp3 = get_flat_proxy(new_rel_path, ".mp3")
         
        if old_proxy_mp3.exists():
            old_proxy_mp3.rename(new_proxy_mp3)

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
            # Filename comes as "folder/file.mp4" (relative ID)
            clean_filename = filename.replace("\\", "/") # Normalize
            file_name_only = os.path.basename(clean_filename)
            
            new_rel = os.path.join(base_target, file_name_only)
            
            # Avoid self-move
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
        
        # 1. Validation
        if not new_name:
            raise HTTPException(status_code=400, detail="New name cannot be empty")
            
        old_full_path = INPUT_DIR / old_rel
        if not old_full_path.exists():
            raise HTTPException(status_code=404, detail="Source file not found")
            
        # Extension Check
        _, old_ext = os.path.splitext(old_rel)
        _, new_ext = os.path.splitext(new_name)
        
        if old_ext.lower() != new_ext.lower():
             raise HTTPException(status_code=400, detail=f"Extension mismatch: cannot change {old_ext} to {new_ext}")

        # Construct New Path
        # old_rel is "folder/file.mp4". We want "folder/new_name.mp4"
        # Use pathlib to be safe
        parent_dir = Path(old_rel).parent
        new_rel = str(parent_dir / new_name).replace("\\", "/")
        
        new_full_path = INPUT_DIR / new_rel
        
        if new_full_path.exists():
            raise HTTPException(status_code=409, detail="Target file already exists")

        # 2. Execute Rename using Move Logic
        # move_asset_logic handles DB, FS move, and Proxy rename
        result = move_asset_logic(old_rel, new_rel, move_file_on_disk=True)
        
        if not result:
            raise HTTPException(status_code=500, detail="Failed to rename asset internal error")
            
        return {"success": True, "message": f"Renamed to {new_name}", "new_path": new_rel}

    except HTTPException: raise
    except Exception as e:
        logger.error(f"Rename error: {e}")
        raise HTTPException(status_code=500, detail=f"Rename failed: {str(e)}")

@app.delete("/assets")
async def delete_asset(payload: AssetDeleteRequest):
    """
    Deletes an asset from DB, Filesystem, and Proxies.
    Payload: { "path": "folder/video.mp4" }
    """
    try:
        rel_path = sanitize_filename(payload.path)
        rel_path_id = rel_path.replace("\\", "/") # DB ID
        
        full_path = INPUT_DIR / rel_path
        
        # [LITE] 1. DB Deletion removed — no DB in Lite version
        # if DB:
        #     DB.delete_video_record(rel_path_id)

        # 2. FS Deletion
        if full_path.exists():
            try:
                os.remove(full_path)
            except Exception as e:
                 logger.error(f"Failed to delete physical file {rel_path}: {e}")
                 # We continue to cleanup proxies even if FS fails (likely permission or open file)
                 # But we might want to warn user. For now, we assume critical success if DB is clean.
        else:
            logger.warning(f"File {rel_path} not found on disk, cleaning up DB/Proxies only.")

        # 3. Proxy Deletion
        # Logic: Flattened path "folder/sub/file.mp4" -> "folder_sub_file.jpg"
        flat_name_base = rel_path_id.replace("/", "_")
        flat_name_base = os.path.splitext(flat_name_base)[0]
        
        # Possible extensions for proxies
        for ext in [".jpg", ".mp4", ".mp3", ".wav", ".png"]:
            proxy_path = PROXIES_DIR / f"{flat_name_base}{ext}"
            if proxy_path.exists():
                try:
                    os.remove(proxy_path)
                except: pass
                
        # Legacy Proxy Check (basename only) if different
        legacy_name = os.path.basename(rel_path)
        legacy_base = os.path.splitext(legacy_name)[0]
        if legacy_base != flat_name_base:
             for ext in [".jpg", ".mp4", ".mp3"]:
                p = PROXIES_DIR / f"{legacy_base}{ext}"
                if p.exists():
                    try: os.remove(p)
                    except: pass

        return {"success": True, "message": f"Deleted {rel_path}"}
        
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@app.post("/folders/rename")
async def rename_folder(payload: RenameFolderRequest):
    """Renames a folder and updates all contained assets in DB/Proxies."""
    old_rel = sanitize_filename(payload.old_path)
    new_rel = sanitize_filename(payload.new_path)
    
    abs_old = INPUT_DIR / old_rel
    abs_new = INPUT_DIR / new_rel
    
    if not abs_old.exists():
        raise HTTPException(status_code=404, detail="Source folder not found")
    
    if abs_new.exists():
         raise HTTPException(status_code=400, detail="Target folder already exists (Merge not supported yet)")
         
    # 1. SCAN & MIGRATE DB + PROXIES
    # We scan abs_old recursively
    migrated_count = 0
    try:
        # We collect files first to avoid iterator issues if we moved files (we won't move files yet, just DB)
        files_to_migrate = []
        for root, _, files in os.walk(abs_old):
            for file in files:
                full_path = Path(root) / file
                rel_from_input = full_path.relative_to(INPUT_DIR) # e.g. "Old/sub/file.mp4"
                
                # Calc new relative path
                # e.g. "Old/sub/file.mp4" -> "New/sub/file.mp4"
                # Remove prefix 'Old' and prepend 'New'
                try:
                    rel_suffix = full_path.relative_to(abs_old)
                    new_rel_path = abs_new / rel_suffix # This is absolute new
                    new_rel_from_input = new_rel_path.relative_to(INPUT_DIR)
                    
                    files_to_migrate.append((str(rel_from_input), str(new_rel_from_input)))
                except: continue

        # Apply Migration Logic (DB + Proxy ONLY)
        for old_p, new_p in files_to_migrate:
            # We set move_file_on_disk=False because we will rename the PARENT folder at the end
            move_asset_logic(old_p, new_p, move_file_on_disk=False)
            migrated_count += 1
            
        # 2. PHYSICAL RENAME
        os.rename(abs_old, abs_new)
        
        return {"success": True, "message": f"Renamed folder and {migrated_count} assets", "renamed_assets": migrated_count}
        
    except Exception as e:
        logger.error(f"Folder Rename Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# === MONITOR MANAGEMENT === [LITE: Stubs — monitor removed] ===

@app.get("/monitor/status")
async def get_monitor_status():
    # [LITE] Monitor not available in Lite version
    return {"running": False}

@app.post("/monitor/start")
async def start_monitor():
    # [LITE] Monitor not available in Lite version
    return {"success": False, "message": "Monitor no disponible en versión Lite"}

@app.post("/monitor/stop")
async def stop_monitor():
    # [LITE] Monitor not available in Lite version
    return {"success": False, "message": "Monitor no disponible en versión Lite"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9999)
