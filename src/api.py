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
import asyncio
from urllib.parse import unquote
from fastapi import FastAPI, HTTPException, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from pathlib import Path
import uuid
import base64

# [MIGRATION v7.0] Import Centralized Paths
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils import INPUT_DIR
import database
import models
import schemas
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import Depends
from routes import projects_api

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

app.include_router(projects_api.router)

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

def is_safe_path(path: str, root: str) -> bool:
    """
    Verifica que la ruta solicitada se encuentre estrictamente dentro del directorio permitido.
    Usa os.path.abspath y os.path.commonprefix para prevenir path traversal (escalamiento de directorios).
    """
    try:
        abs_root = os.path.abspath(str(root))
        abs_path = os.path.abspath(str(path))
        prefix = os.path.commonprefix([abs_path, abs_root])
        # Aseguramos que coincide exactamente con el root (y evitamos falsos positivos tipo /usr/lib vs /usr/lib64)
        return prefix == abs_root and (len(abs_path) == len(abs_root) or abs_path[len(abs_root)] == os.path.sep)
    except Exception:
        return False



def get_media_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in EXT_VIDEO: return "video"
    elif ext in EXT_AUDIO: return "audio"
    elif ext in EXT_IMAGE: return "image"
    return "unknown"


# === GESTION DE SUBPROCESOS (FFmpeg Async) ===
active_tasks = {}

# === PYDANTIC MODELS ===

class CancelTaskRequest(BaseModel):
    task_id: str

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
    # Initialize SQLite Database
    models.Base.metadata.create_all(bind=database.engine)
    logger.info(f"Base de datos de proyectos inicializada en: {database.DB_PATH}")

    # --- CACHE DIRECTORY --- 
    global CACHE_DIR
    CACHE_DIR = database.BASE_MEDIA_PATH / ".cache"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/cache", StaticFiles(directory=CACHE_DIR), name="cache")
    
    # --- STARTUP CLEANUP ---
    try:
        cleanup_orphan_thumbnails()
    except Exception as e:
        logger.error(f"Error en limpieza inicial de miniaturas: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """
    [LITE - PHASE 9] Limpieza a la salida del servidor.
    1. Cancela todos los procesos de FFmpeg asíncronos en vuelo.
    2. Ejecuta garbage collection final de miniaturas huérfanas o basura temporal.
    """
    logger.info("Iniciando secuencia de apagado seguro...")
    
    # Cancelar FFmpeg
    for task_id, process in list(active_tasks.items()):
        try:
            logger.info(f"Terminando proceso FFmpeg huérfano: {task_id}")
            process.kill()
        except OSError:
            pass
    active_tasks.clear()
    
    # Limpieza final de caché
    try:
        cleanup_orphan_thumbnails()
    except Exception as e:
        logger.error(f"Error en limpieza final de caché: {e}")
    
    logger.info("Apagado seguro completado.")

def cleanup_orphan_thumbnails():
    """
    [LITE - PHASE 9] Garbage Collection para limpiar archivos .jpg en .lite_cache 
    que ya no estén asociados a ninguna escena en el estado persistido (SQLite).
    """
    if not _CACHE_DIR.exists(): return
    
    # Leer todos los linkedFiles de todas las escenas en SQLite
    db: Session = database.SessionLocal()
    try:
        all_projects = db.query(models.Project).all()
        valid_stems = set()
        
        for p in all_projects:
            if not p.scenes: continue
            for scene in p.scenes:
                scene_data = scene.scene_data or {}
                linked_file = scene_data.get("linkedFile")
                if not linked_file: continue
                # Regenerar el patrón de stem usado por get_thumbnail()
                safe_name = linked_file.replace("/", "_").replace("\\", "_")
                stem = os.path.splitext(safe_name)[0]
                valid_stems.add(stem)
                
        # Escanear el disco  
        deleted_count = 0
        for cached_file in _CACHE_DIR.glob("*.jpg"):
            if cached_file.stem not in valid_stems:
                try:
                    cached_file.unlink()
                    deleted_count += 1
                except Exception as e:
                    logger.warning(f"No se pudo eliminar el archivo caché huérfano {cached_file}: {e}")
                    
        if deleted_count > 0:
            logger.info(f"[Garbage Collection] Se eliminaron {deleted_count} miniaturas huérfanas del disco.")
    finally:
        db.close()



# === STATIC FILE SERVING ===

_SRC_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
app.mount("/js", StaticFiles(directory=_SRC_DIR / "js"), name="js")
app.mount("/css", StaticFiles(directory=_SRC_DIR / "css"), name="css")
app.mount("/img", StaticFiles(directory=_SRC_DIR / "img"), name="img")

# .lite_cache directory for FFmpeg-generated thumbnails
_CACHE_DIR = Path(os.path.dirname(os.path.abspath(__file__))).parent / ".lite_cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

THUMBNAIL_SEMAPHORE = asyncio.Semaphore(4)

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

    if not is_safe_path(str(abs_path), str(scan_root)):
        logger.warning(f"Path traversal attempt blocked: {abs_path}")
        raise HTTPException(status_code=403, detail="Directory traversal detected. Access denied.")

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

        # Generate with FFmpeg asynchronously (asyncio Subprocess)
        task_id = f"thumb_{uuid.uuid4().hex[:8]}"

        async def generate_thumbnail_bg():
            try:
                cmd = [
                    "ffmpeg", "-y",
                    "-ss", "00:00:01",
                    "-i", str(abs_path),
                    "-vframes", "1",
                    "-q:v", "2",
                    str(cache_path)
                ]
                async with THUMBNAIL_SEMAPHORE:
                    proc = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    active_tasks[task_id] = proc
                    
                    try:
                        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
                        if proc.returncode != 0:
                            # Eliminar archivo corrupto/incompleto (ej. disco lleno) para evitar que
                            # cache_path.exists() devuelva True en futuras peticiones y sirva un JPEG dañado.
                            cache_path.unlink(missing_ok=True)
                            logger.error(f"FFmpeg thumbnail failed for '{path}' (rc={proc.returncode}): {stderr.decode(errors='replace')[:300]}")
                    except asyncio.TimeoutError:
                        proc.kill()
                        logger.error(f"FFmpeg timeout generating thumbnail for '{path}'")
                    finally:
                        active_tasks.pop(task_id, None)

            except Exception as e:
                logger.error(f"Unexpected error generating thumbnail for '{path}': {e}")
                active_tasks.pop(task_id, None)

        # Disparamos tarea asincrona al bucle de eventos sin bloquear la respuesta
        asyncio.create_task(generate_thumbnail_bg())
        
        # Respondemos inmediatamente HTTP 202 Accepted
        return JSONResponse(
            status_code=202, 
            content={"status": "processing", "task_id": task_id, "message": "Thumbnail generation accepted and running in background"}
        )

    raise HTTPException(status_code=404, detail="Unsupported media type for thumbnail")

@app.post("/cancel_task")
async def cancel_task(payload: CancelTaskRequest):
    """
    Cancela un subproceso de FFmpeg pesado en ejecución usando su task_id.
    """
    pid = payload.task_id
    if pid in active_tasks:
        proc = active_tasks.pop(pid)
        try:
            proc.kill()
            logger.info(f"Task {pid} successfully killed by user request.")
            return {"status": "cancelled", "message": f"Task {pid} terminated"}
        except Exception as e:
            logger.error(f"Failed to kill task {pid}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=404, detail="Task not found or already finished")


# === CORE LITE ENDPOINT ===

@app.get("/lite/files")
async def list_lite_files(
    folder: Optional[str] = None,
    subpath: str = "",
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 500
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
    has_more = False
    
    try:
        # --- SEARCH MODE: recursive rglob filtered by filename ---
        if search and search.strip():
            query = search.strip().lower()
            skipped = 0
            for entry in target.rglob("*"):
                if not entry.is_file():
                    continue
                if entry.name.startswith("."):
                    continue
                if entry.suffix.lower() not in ALLOWED_EXTENSIONS:
                    continue
                if query not in entry.name.lower():
                    continue
                
                # Apply skip
                if skipped < skip:
                    skipped += 1
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
                
                # Check limit
                if len(items) > limit:
                    has_more = True
                    items.pop()
                    break

        # --- BROWSE MODE: single-level iterdir ---
        else:
            skipped = 0
            for entry in target.iterdir():
                if entry.name.startswith("."):
                    continue
                
                is_valid = False
                is_folder = False
                if entry.is_dir():
                    is_valid = True
                    is_folder = True
                elif entry.is_file() and entry.suffix.lower() in ALLOWED_EXTENSIONS:
                    is_valid = True
                
                if not is_valid:
                    continue

                # Apply skip
                if skipped < skip:
                    skipped += 1
                    continue

                try:
                    rel_str = entry.relative_to(scan_root).as_posix()
                except ValueError:
                    continue

                if is_folder:
                    items.append({
                        "path": rel_str,
                        "type": "folder",
                        "name": entry.name,
                    })
                else:
                    items.append({
                        "path": rel_str,
                        "type": get_media_type(entry.name),
                        "name": entry.name,
                    })
                
                # Check limit
                if len(items) > limit:
                    has_more = True
                    items.pop()
                    break

    except Exception as e:
        logger.error(f"Error scanning for /lite/files: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning media directory: {str(e)}")

    return {
        "status": "success",
        "items": items,
        "current": safe_sub,
        "total_in_page": len(items),
        "has_more": has_more
    }

class VerifyRoutesRequest(BaseModel):
    folder: str
    paths: List[str]

@app.post("/lite/verify_routes")
async def lite_verify_routes(payload: VerifyRoutesRequest):
    """
    [LITE - PHASE 9] Recibe una lista de rutas relativas y verifica masivamente
    si los archivos físicos existen en el disco bajo el Media Root actual.
    """
    if not payload.folder or not payload.folder.strip():
        raise HTTPException(status_code=400, detail="Media Root is required")
        
    root = Path(payload.folder.strip()).resolve()
    if not root.is_dir():
        return {"status": "error", "message": "Media Root not found", "missing": payload.paths}
        
    missing_paths = []
    for rel_path in payload.paths:
        if not rel_path: continue
        clean_rel = rel_path.strip().lstrip("/").lstrip("\\")
        if ".." in clean_rel.replace("\\", "/").split("/"): continue # Skip invalid
        
        target = (root / clean_rel).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            missing_paths.append(rel_path)
            
    return {"status": "success", "missing": missing_paths}


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
        await run_in_threadpool(target.rename, new_path)
    except Exception as e:
        logger.error(f"[Lite] Rename failed: {e}")
        raise HTTPException(status_code=500, detail=f"Rename failed: {e}")

    new_rel = new_path.relative_to(root).as_posix()
    await run_in_threadpool(_delete_cache_entry, old_rel)

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
        await run_in_threadpool(target.unlink)
    except Exception as e:
        logger.error(f"[Lite] Delete failed: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")

    await run_in_threadpool(_delete_cache_entry, rel_path)

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
        await run_in_threadpool(source.rename, dest_file)
    except Exception as e:
        logger.error(f"[Lite] Move failed: {e}")
        raise HTTPException(status_code=500, detail=f"Move failed: {e}")

    new_rel = dest_file.relative_to(root).as_posix()
    await run_in_threadpool(_delete_cache_entry, old_rel)

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
        await run_in_threadpool(new_dir_path.mkdir, parents=True, exist_ok=False)
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
        await run_in_threadpool(shutil.rmtree, target_dir)
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
        await run_in_threadpool(target_dir.rename, new_dir_path)
    except Exception as e:
        logger.error(f"[Lite] Folder rename failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to rename folder: {e}")

    new_rel_str = new_dir_path.relative_to(root).as_posix()
    logger.info(f"[Lite] Folder renamed: '{old_rel}' -> '{new_rel_str}'")
    return {"success": True, "old_path": old_rel, "new_path": new_rel_str}

@app.get("/")
async def serve_frontend():
    html_path = Path(__file__).parent / "builder.html"
    return FileResponse(str(html_path))

@app.get("/prompter")
async def serve_prompter():
    return FileResponse(str(Path(__file__).parent / "prompter.html"))

# === SQLITE VACUUM ===
@app.post("/optimize_storage")
async def optimize_storage():
    """
    [LITE] Forzar VACUUM en la base de datos SQLite.
    VACUUM no puede ejecutarse dentro de una transacción estándar de SQLite.
    Se usa una conexión raw en modo AUTOCOMMIT para cumplir esta restricción.
    """
    try:
        # AUTOCOMMIT obligatorio: SQLite prohíbe VACUUM dentro de transacción
        with database.engine.connect() as conn:
            conn = conn.execution_options(isolation_level="AUTOCOMMIT")
            conn.execute(text("VACUUM;"))
        logger.info("[Database] Comando VACUUM ejecutado exitosamente.")
        return {"status": "success", "message": "Storage optimized."}
    except Exception as e:
        logger.error(f"Fallo al ejecutar VACUUM: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to optimize storage: {e}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9999)
