"""
DB ENGINE
Refactored for v7.0 External Media Root using src.utils
"""
import chromadb
import os
import sys
import torch
import chromadb.utils.embedding_functions as embedding_functions

# [MIGRATION v7.0]
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils import DB_DIR

EMBEDDING_MODEL = "BAAI/bge-m3"
EMBEDDING_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

class VideoDatabase:
    def __init__(self):
        # Use centralized DB_DIR
        self.db_path = str(DB_DIR)
        
        if not os.path.exists(self.db_path):
            os.makedirs(self.db_path)
            
        print(f"[DB ENGINE] Inicializando ChromaDB en: {self.db_path}")
        self.client = chromadb.PersistentClient(path=self.db_path)
        
        print(f"[DB ENGINE] Cargando modelo: {EMBEDDING_MODEL} (device={EMBEDDING_DEVICE})")
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL,
            device=EMBEDDING_DEVICE
        )
        
        self.collection = self.client.get_or_create_collection(
            name="video_metadata",
            embedding_function=self.embedding_fn
        )
        
        self.segment_collection = self.client.get_or_create_collection(
            name="asset_segments",
            embedding_function=self.embedding_fn
        )

    def guardar_video(self, nombre_archivo, descripcion_visual, transcripcion_audio, ruta_proxy, ruta_original, media_type="video"):
        try:
            documento = f"VISUAL: {descripcion_visual}\nAUDIO: {transcripcion_audio}"
            # En la v7.0, nombre_archivo DEBE ser la ruta relativa para evitar colisiones
            video_id = nombre_archivo 
            metadatos = {
                "path": ruta_proxy,
                "original_path": ruta_original,
                "media_type": media_type,
                "vision": descripcion_visual[:1000] if descripcion_visual else "",
                "audio": transcripcion_audio[:1000] if transcripcion_audio else ""
            }
            print(f"[DB ENGINE] Indexando video: {nombre_archivo} ...")
            self.collection.upsert(documents=[documento], metadatas=[metadatos], ids=[video_id])
            return True
        except Exception as e:
            print(f"[DB ENGINE] Error al guardar en DB: {e}")
            return False

    def guardar_segmentos(self, nombre_archivo, segmentos, ruta_original, media_type="video"):
        try:
            if not segmentos: return True
            print(f"[DB ENGINE] Indexando {len(segmentos)} segmentos para {nombre_archivo}...")
            ids = []; documents = []; metadatas = []
            for seg in segmentos:
                seg_id = f"{nombre_archivo}_{seg['start']}"
                doc_text = seg['text']
                meta = {
                    "origin_file": nombre_archivo,
                    "original_path": ruta_original,
                    "media_type": media_type,
                    "start": seg['start'],
                    "end": seg['end'],
                    "text": seg['text'][:200]
                }
                ids.append(seg_id); documents.append(doc_text); metadatas.append(meta)
            self.segment_collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
            return True
        except Exception as e:
            print(f"[DB ENGINE] Error guardando segmentos: {e}\nProbablemente el ID ya existe o es inválido.")
            return False

    def get_all_videos(self, limit=50):
        try:
            return self.collection.get(limit=limit, include=['metadatas'])
        except Exception as e:
            print(f"[DB ENGINE] Error al listar videos: {e}")
            return None

    def verificar_existencia(self, relative_path):
        """Verifica si un asset existe por su ID (path relativo) o basename."""
        try:
            # Check ID
            res = self.collection.get(ids=[relative_path])
            if res and res['ids']: return True
            
            # Check Legacy (Basename) if different
            basename = os.path.basename(relative_path)
            if basename != relative_path:
                res = self.collection.get(ids=[basename])
                if res and res['ids']: return True
            
            return False
        except: return False

    def move_video_record(self, old_id, new_id, new_full_path):
        """
        Migrates a record from old_id to new_id, preserving embeddings and metadata.
        Also migrates associated segments.
        """
        try:
            # 1. GET OLD RECORD
            # We need embeddings to copy them, so include=['embeddings', 'metadatas', 'documents']
            old_data = self.collection.get(ids=[old_id], include=['embeddings', 'metadatas', 'documents'])
            
            if not old_data or not old_data['ids']:
                print(f"[DB ENGINE] Move failed: Record '{old_id}' not found.")
                return False

            # Extract data
            embedding = old_data['embeddings'][0]
            metadata = old_data['metadatas'][0]
            document = old_data['documents'][0]
            
            # 2. UPDATE METADATA
            metadata['original_path'] = new_full_path
            # If 'path' (proxy) stored relative to filename, it might need update if we rename proxies.
            # Usually 'path' in DB is the proxy path. We will update it outside or let API pass it?
            # For now, we assume the API handles proxy renaming on disk, but here we might preserve the OLD proxy path 
            # if strictly just moving file, OR the caller should update metadata before calling if they want specific changes.
            # BETTER: We update 'original_path'. Caller can update 'path' (proxy) via another call if needed, 
            # OR we naively assume proxy structure follows. 
            # Let's just update 'original_path' here. The API layer should handle Proxy updates in metadata if needed.
            # Actually, if we rename the file, the proxy name likely changes. 
            # Let's try to update 'path' if it looks like a proxy path we manage.
            if 'path' in metadata:
                 # We don't automatically guess new proxy path here to avoid coupling. 
                 # We'll rely on the fact that 'path' might be stale until re-scanned or we can accept it as arg?
                 # ideally move_video_record could take new_proxy_path argument.
                 pass
            
            # 3. INSERT NEW with OLD EMBEDDING
            self.collection.add(
                ids=[new_id],
                embeddings=[embedding],
                metadatas=[metadata],
                documents=[document]
            )
            
            # 4. DELETE OLD
            self.collection.delete(ids=[old_id])
            print(f"[DB ENGINE] Moved asset record: {old_id} -> {new_id}")

            # 5. MIGRATE SEGMENTS
            # Segment IDs are usually "{origin_file}_{start}".
            # We query by metadata 'origin_file'
            seg_res = self.segment_collection.get(where={"origin_file": old_id}, include=['embeddings', 'metadatas', 'documents'])
            if seg_res and seg_res['ids']:
                print(f"[DB ENGINE] Migrating {len(seg_res['ids'])} segments...")
                new_ids = []
                new_embs = []
                new_docs = []
                new_metas = []
                
                for i, sid in enumerate(seg_res['ids']):
                    s_meta = seg_res['metadatas'][i]
                    s_emb = seg_res['embeddings'][i]
                    s_doc = seg_res['documents'][i]
                    
                    # Update Meta
                    s_meta['origin_file'] = new_id
                    s_meta['original_path'] = new_full_path
                    
                    # New ID
                    # Extract timestamp suffix from old ID if possible or just use new_id + suffix
                    # Old: "folder/file.mp4_12.5" -> suffix "_12.5"
                    suffix = sid.split(old_id)[-1] if old_id in sid else f"_{s_meta.get('start', 0)}"
                    new_seg_id = f"{new_id}{suffix}"
                    
                    new_ids.append(new_seg_id)
                    new_embs.append(s_emb)
                    new_docs.append(s_doc)
                    new_metas.append(s_meta)
                
                # Batch Add New
                self.segment_collection.add(ids=new_ids, embeddings=new_embs, metadatas=new_metas, documents=new_docs)
                # Batch Delete Old
                self.segment_collection.delete(ids=seg_res['ids'])
            
            return True

        except Exception as e:
            print(f"[DB ENGINE] Error moving record: {e}")
            return False

    # --- NUEVO MÉTODO PARA BLINDAJE DE MONITOR ---
    def verificar_existencia(self, relative_path):
        """
        Verifica si un archivo ya existe en la base de datos ChromaDB.
        Usa relative_path como ID.
        """
        try:
            # Consultamos por ID. Si devuelve algo en 'ids', es que existe.
            result = self.collection.get(ids=[relative_path], include=[]) 
            if result and result['ids']:
                return True
            return False
        except Exception as e:
            # print(f"[DB ENGINE] Debug Check Existence: {e}")
            return False

    def delete_video_record(self, relative_path):
        """
        [MIGRATION v7.5] Deletes a video record and its associated segments.
        relative_path: The unique ID of the asset.
        """
        try:
            print(f"[DB ENGINE] Deleting asset: {relative_path}")
            
            # 1. Delete associated segments
            # We query by metadata 'origin_file' which matches our ID
            try:
                self.segment_collection.delete(where={"origin_file": relative_path})
                print(f"[DB ENGINE] Deleted segments for {relative_path}")
            except Exception as e:
                print(f"[DB ENGINE] Error deleting segments: {e}")

            # 2. Delete main video record
            self.collection.delete(ids=[relative_path])
            return True

        except Exception as e:
            print(f"[DB ENGINE] Error deleting video record: {e}")
            return False
