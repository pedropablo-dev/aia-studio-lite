import uuid
import base64
from fastapi import APIRouter, HTTPException, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
import logging

from pydantic import BaseModel
import database
import models
import schemas

logger = logging.getLogger("AIA-API")
router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectRenameRequest(BaseModel):
    new_title: str


# ==========================================
# BASE 64 EXTRACTOR (ANTI-DB BLOAT)
# ==========================================

async def extract_and_save_base64(data):
    """
    Recorre recursivamente diccionarios y listas parseando strings Base64 de imagenes.
    Las guarda en disco en CACHE_DIR y sustituye el valor por la ruta url /cache/archivo.jpg.
    """
    # Usamos importaciones dinámicas o pasadas como config si CACHE_DIR está en otro módulo, 
    # pero como aquí está disponible base_media_path, lo calculamos o lo importamos.
    # CACHE_DIR se maneja dentro de este archivo o usando database.BASE_MEDIA_PATH
    CACHE_DIR = database.BASE_MEDIA_PATH / ".cache"

    if isinstance(data, dict):
        new_dict = {}
        for k, v in data.items():
            if isinstance(v, str) and v.startswith('data:image/'):
                print(f"[DEBUG] Imagen Base64 detectada. Longitud: {len(v)} bytes.")
                try:
                    header, b64_str = v.split(',', 1)
                    ext = ".png"
                    if "jpeg" in header or "jpg" in header: ext = ".jpg"
                    elif "webp" in header: ext = ".webp"
                    
                    file_name = uuid.uuid4().hex + ext
                    file_path = CACHE_DIR / file_name
                    
                    # Offload file writing to threadpool to avoid blocking
                    def _write_img(path, b64_content):
                        try:
                            with open(path, "wb") as img_file:
                                img_file.write(base64.b64decode(b64_content))
                        except Exception as e:
                            print(f"[ERROR CRÍTICO] Fallo al guardar imagen: {e}")
                            raise e
                    
                    await run_in_threadpool(_write_img, file_path, b64_str)
                    
                    new_dict[k] = f"/cache/{file_name}"
                except Exception as e:
                    logger.error(f"Error decoding base64 in key {k}: {e}")
                    new_dict[k] = v # fallback
            else:
                new_dict[k] = await extract_and_save_base64(v)
        return new_dict
    elif isinstance(data, list):
        return [await extract_and_save_base64(item) for item in data]
    else:
        return data


# ==========================================
# PROJECTS CRUD (SQLITE)
# ==========================================

@router.post("")
async def save_project(project: schemas.ProjectSchema, db: Session = Depends(database.get_db)):
    # 1. Extraer imágenes base64 para evitar el bloat
    clean_meta = await extract_and_save_base64(project.metadata_config)
    clean_scenes = []
    
    for index, scene_dict in enumerate(project.scenes):
        clean_s_data = await extract_and_save_base64(scene_dict)
        scene_id = scene_dict.get("id", str(uuid.uuid4()))
        clean_scenes.append({
            "id": scene_id, 
            "order_index": index, 
            "scene_data": clean_s_data
        })

    # 2. Operación COMPLETA dentro de una única transacción atómica
    # Si cualquier paso falla, db.rollback() devuelve el estado anterior intacto.
    try:
        # Upsert Proyecto
        db_proj = db.query(models.Project).filter(models.Project.id == project.id).first()
        if db_proj:
            db_proj.title = project.title
            db_proj.metadata_config = clean_meta
        else:
            db_proj = models.Project(
                id=project.id,
                title=project.title,
                metadata_config=clean_meta
            )
            db.add(db_proj)

        # Reemplazo completo de escenas (borrado + inserción)
        db.query(models.Scene).filter(models.Scene.project_id == project.id).delete()
        
        for scene_item in clean_scenes:
            new_scene = models.Scene(
                id=scene_item["id"],
                project_id=project.id,
                order_index=scene_item["order_index"],
                scene_data=scene_item["scene_data"]
            )
            db.add(new_scene)
        
        # Commit Único — si falla cualquier paso anterior, nada se persiste
        db.commit()

    except Exception as e:
        db.rollback()
        logger.error(f"[save_project] Error crítico al guardar proyecto {project.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al guardar el proyecto: {str(e)}")

    return {"status": "success", "message": "Proyecto guardado"}


@router.get("")
async def list_projects(db: Session = Depends(database.get_db)):
    # Lightweight list for "Load Project" UI
    projs = db.query(models.Project).order_by(models.Project.updated_at.desc()).all()
    return [{
        "id": p.id,
        "title": p.title,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None
    } for p in projs]


@router.get("/{project_id}")
async def load_project(project_id: str, db: Session = Depends(database.get_db)):
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    scenes = db.query(models.Scene).filter(models.Scene.project_id == project_id).order_by(models.Scene.order_index).all()
    
    return {
        "id": proj.id,
        "title": proj.title,
        "metadata_config": proj.metadata_config,
        "scenes": [
            {
                "id": s.id,
                "order_index": s.order_index,
                "scene_data": s.scene_data
            } for s in scenes
        ]
    }

@router.put("/{project_id}/rename")
async def rename_project(project_id: str, request: ProjectRenameRequest, db: Session = Depends(database.get_db)):
    if not request.new_title or not request.new_title.strip():
        raise HTTPException(status_code=400, detail="El título no puede estar vacío.")

    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    proj.title = request.new_title.strip()
    db.commit()
    return {"status": "success", "message": "Proyecto renombrado", "new_title": proj.title}

@router.delete("/{project_id}")
async def delete_project(project_id: str, db: Session = Depends(database.get_db)):
    proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    # Eliminación profunda: Escenas primero
    db.query(models.Scene).filter(models.Scene.project_id == project_id).delete()
    db.delete(proj)
    db.commit()
    return {"status": "success", "message": "Proyecto eliminado permanentemente"}

@router.post("/{project_id}/duplicate")
async def duplicate_project(project_id: str, db: Session = Depends(database.get_db)):
    # 1. Recuperar original
    orig_proj = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not orig_proj:
        raise HTTPException(status_code=404, detail="Proyecto original no encontrado")

    # 2. Generar clon de Proyecto
    import time
    new_id = f"proj_{int(time.time() * 1000)}_{uuid.uuid4().hex[:5]}"
    new_title = orig_proj.title + " (Copia)"

    new_proj = models.Project(
        id=new_id,
        title=new_title,
        metadata_config=orig_proj.metadata_config
    )
    db.add(new_proj)

    # 3. Recuperar y duplicar escenas con IDs NUEVOS para evitar Unique Constraints
    orig_scenes = db.query(models.Scene).filter(models.Scene.project_id == project_id).all()
    for s in orig_scenes:
        import copy
        # Deep copy del JSON de la escena y mutar el identificador interno si existe
        new_scene_data = copy.deepcopy(s.scene_data)
        new_scene_internal_id = str(uuid.uuid4())
        if isinstance(new_scene_data, dict) and "id" in new_scene_data:
            new_scene_data["id"] = new_scene_internal_id

        new_scene = models.Scene(
            id=new_scene_internal_id,
            project_id=new_id,
            order_index=s.order_index,
            scene_data=new_scene_data
        )
        db.add(new_scene)

    db.commit()
    return {"status": "success", "message": "Proyecto duplicado", "new_id": new_id}

