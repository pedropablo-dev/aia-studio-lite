"""
FILE MONITOR
Refactored for v7.0 External Media Root using src.utils
"""
import time
import sys
import os
import shutil
import ffmpeg
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from colorama import init, Fore
from pathlib import Path

# [MIGRATION v7.0]
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import ai_engine
import vision_engine
import db_engine
from utils import limpiar_vram, INPUT_DIR, PROXIES_DIR, OUTPUT_DIR

init(autoreset=True)

# Initialize DB
DB = None
try:
    DB = db_engine.VideoDatabase()
except Exception as e:
    print(f"{Fore.RED}[ERROR DB] No se pudo inicializar la base de datos: {e}")

EXT_VIDEO = {'.mp4', '.mov', '.mkv', '.avi', '.mxf'}
EXT_AUDIO = {'.mp3', '.wav', '.m4a', '.flac', '.aac'}
EXT_IMAGE = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}

def wait_for_file_stability(filepath, stability_duration=3, check_interval=1, timeout=600):
    start_time = time.time()
    last_size = -1
    stable_since = None
    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout:
            print(f"{Fore.RED}[TIMEOUT] Archivo no estabilizó: {os.path.basename(filepath)}")
            return False
        try:
            current_size = os.path.getsize(filepath)
        except OSError:
            time.sleep(check_interval); continue
        
        if current_size != last_size:
            size_mb = current_size / (1024 * 1024)
            print(f"{Fore.YELLOW}⏳ Copiando: {size_mb:.1f} MB...")
            last_size = current_size
            stable_since = time.time()
        else:
            if stable_since and (time.time() - stable_since) >= stability_duration:
                print(f"{Fore.GREEN}✓ Estable. Procesando...")
                return True
        time.sleep(check_interval)

def obtener_duracion_video(ruta_video):
    try:
        probe = ffmpeg.probe(ruta_video)
        return float(probe['format']['duration'])
    except: return None

def extraer_frames_multifocal(ruta_video, dir_salida, nombre_base):
    duracion = obtener_duracion_video(ruta_video)
    if duracion is None: return [], None, None
    
    timestamps = [duracion * 0.5] if duracion < 5 else [duracion * 0.15, duracion * 0.5, duracion * 0.85]
    labels = ["Único"] if duracion < 5 else ["Inicio", "Medio", "Final"]
    
    frames = []
    frame_principal = None
    
    for i, ts in enumerate(timestamps):
        ruta_frame = os.path.join(dir_salida, f"{nombre_base}_temp_{i}.jpg")
        try:
            (ffmpeg.input(ruta_video, ss=ts).output(ruta_frame, vframes=1).overwrite_output().run(quiet=True))
            if os.path.exists(ruta_frame):
                frames.append((ruta_frame, labels[i]))
                if labels[i] in ["Medio", "Único"]: frame_principal = ruta_frame
        except: continue
    return frames, frame_principal, duracion

def generar_proxy(ruta_entrada):
    _, ext = os.path.splitext(ruta_entrada)
    if ext.lower() not in EXT_VIDEO: return False, None
    try:
        nombre_archivo = os.path.basename(ruta_entrada)
        ruta_salida = PROXIES_DIR / nombre_archivo
        
        (ffmpeg.input(ruta_entrada)
         .output(str(ruta_salida), vf='scale=-1:720', vcodec='libx264', preset='ultrafast', acodec='aac')
         .overwrite_output().run(quiet=True))
        return True, str(ruta_salida)
    except: return False, None

def generar_proxy_imagen(ruta_entrada):
    try:
        nombre_original = os.path.basename(ruta_entrada)
        nombre_base, _ = os.path.splitext(nombre_original)
        ruta_salida = PROXIES_DIR / (nombre_base + ".jpg")
        
        (ffmpeg.input(ruta_entrada)
         .output(str(ruta_salida), vf='scale=-1:720', vframes=1)
         .overwrite_output().run(quiet=True))
        return True, str(ruta_salida)
    except Exception as e:
        print(f"{Fore.RED}[ERROR IMAGEN] {e}")
        return False, None

def generar_proxy_audio(ruta_entrada):
    try:
        nombre_original = os.path.basename(ruta_entrada)
        nombre_base, _ = os.path.splitext(nombre_original)
        ruta_salida = PROXIES_DIR / (nombre_base + ".mp3")
        
        (ffmpeg.input(ruta_entrada)
         .output(str(ruta_salida), acodec='libmp3lame', ab='192k')
         .overwrite_output().run(quiet=True))
        return True, str(ruta_salida)
    except Exception as e:
        print(f"{Fore.RED}[ERROR AUDIO] {e}")
        return False, None

# --- CLASE PRINCIPAL DEL MONITOR ---
class MonitorHandler(FileSystemEventHandler):
    
    def on_created(self, event):
        if event.is_directory: return
        
        path = event.src_path
        filename = os.path.basename(path)
        
        if filename.startswith('.') or filename.startswith('~$') or filename == 'Thumbs.db':
            return
            
        print(f"\n{Fore.CYAN}[MONITOR] Nuevo archivo detectado: {filename}")
        
        # --- PASO 1.1: SAFETY CHECK (BLINDAJE ANTI-DUPLICADOS) ---
        try:
            if DB:
                # 1. Calculamos ruta relativa exacta (la ID usada en DB)
                relative_path = os.path.relpath(path, INPUT_DIR)
                relative_path = relative_path.replace("\\", "/") # Estandarizar a barras UNIX
                
                # 2. Consultamos usando el método oficial de la clase DB
                existe = DB.verificar_existencia(relative_path)
                
                if existe:
                    print(f"{Fore.YELLOW}[SKIP] El archivo '{relative_path}' ya existe en la DB. Omitiendo re-procesado.")
                    return
        except Exception as e:
            print(f"{Fore.RED}[WARNING] Error al consultar DB en monitor: {e}")
            # Si falla la consulta, continuamos por seguridad (Fail-Open), 
            # aunque idealmente deberíamos detenernos si la integridad es crítica.
        # ---------------------------------------------------------

        if not wait_for_file_stability(path): return

        name_only, ext = os.path.splitext(filename)
        ext_lower = ext.lower()

        try:
            # VIDEO
            if ext_lower in EXT_VIDEO:
                print(f"{Fore.YELLOW}[VIDEO] {filename} -> Proxy...")
                exito, ruta_salida = generar_proxy(path)
                if exito:
                    print(f"{Fore.CYAN}[IA] Whisper...")
                    transcripcion, segmentos = ai_engine.transcribir_video(path)
                    limpiar_vram()
                    
                    descripcion_visual = None
                    print(f"{Fore.MAGENTA}[VISIÓN] Analizando frames clave...")
                    try:
                        frames_temp, frame_principal, _ = extraer_frames_multifocal(path, str(PROXIES_DIR), name_only)
                        
                        if frames_temp:
                            descs = []
                            for f_path, label in frames_temp:
                                d = vision_engine.analizar_imagen(f_path)
                                if d: descs.append(f"[{label}] {d}")
                            
                            if descs: descripcion_visual = "\n".join(descs)
                            
                            if frame_principal and os.path.exists(frame_principal):
                                ruta_jpg_principal = PROXIES_DIR / (name_only + ".jpg")
                                shutil.copy2(frame_principal, str(ruta_jpg_principal))
                            
                            for rf, _ in frames_temp:
                                try: os.remove(rf)
                                except: pass
                    except Exception as e: print(f"{Fore.RED}[ERROR VISIÓN] {e}")

                    limpiar_vram()
                    
                    ruta_txt = OUTPUT_DIR / (name_only + ".txt")
                    content = ""
                    if descripcion_visual: content += f"--- VISUAL DESCRIPTION ---\n{descripcion_visual}\n\n"
                    if transcripcion: content += f"--- AUDIO TRANSCRIPTION ---\n{transcripcion}\n"
                    with open(ruta_txt, "w", encoding="utf-8") as f: f.write(content)
                    print(f"{Fore.GREEN}[IA] Análisis guardado.")

                    if DB:
                        str_vision = descripcion_visual if descripcion_visual else ""
                        str_audio = transcripcion if transcripcion else ""
                        relative_path = os.path.relpath(path, INPUT_DIR).replace("\\", "/")
                        DB.guardar_video(relative_path, str_vision, str_audio, ruta_salida, path, "video")
                        if segmentos: DB.guardar_segmentos(relative_path, segmentos, path, "video")
                        print(f"{Fore.GREEN}[RAG] Indexado.")

            # AUDIO
            elif ext_lower in EXT_AUDIO:
                print(f"{Fore.YELLOW}[AUDIO] {filename} -> Proxy...")
                exito, ruta_salida = generar_proxy_audio(path)
                if exito:
                    print(f"{Fore.CYAN}[IA] Transcribiendo...")
                    transcripcion, segmentos = ai_engine.transcribir_video(path)
                    ruta_txt = OUTPUT_DIR / (name_only + ".txt")
                    with open(ruta_txt, "w", encoding="utf-8") as f:
                        f.write(f"--- AUDIO TRANSCRIPTION ---\n{transcripcion}\n")
                    
                    if DB:
                        relative_path = os.path.relpath(path, INPUT_DIR).replace("\\", "/")
                        DB.guardar_video(relative_path, "", str(transcripcion), ruta_salida, path, "audio")
                        if segmentos: DB.guardar_segmentos(relative_path, segmentos, path, "audio")
                        print(f"{Fore.GREEN}[RAG] Indexado.")
            
            # IMAGE
            elif ext_lower in EXT_IMAGE:
                print(f"{Fore.YELLOW}[IMAGE] {filename} -> Proxy...")
                exito, ruta_salida = generar_proxy_imagen(path)
                if exito:
                    print(f"{Fore.MAGENTA}[VISIÓN] Analizando...")
                    try:
                        desc = vision_engine.analizar_imagen(path)
                        if desc:
                            ruta_txt = OUTPUT_DIR / (name_only + ".txt")
                            with open(ruta_txt, "w", encoding="utf-8") as f:
                                f.write(f"--- VISUAL DESCRIPTION ---\n{desc}\n")
                            if DB:
                                relative_path = os.path.relpath(path, INPUT_DIR).replace("\\", "/")
                                DB.guardar_video(relative_path, str(desc), "", ruta_salida, path, "image")
                                print(f"{Fore.GREEN}[RAG] Indexado.")
                    except Exception as e: print(f"{Fore.RED}[ERROR] {e}")

        except Exception as e:
            print(f"{Fore.RED}[ERROR CRÍTICO EN MONITOR] {e}")

if __name__ == "__main__":
    path_to_watch = str(INPUT_DIR)
    
    if not os.path.exists(path_to_watch):
        os.makedirs(path_to_watch)

    event_handler = MonitorHandler()
    observer = Observer()
    observer.schedule(event_handler, path_to_watch, recursive=True)
    
    observer.start()
    print(f"Monitoreando carpeta EXTERNA: {path_to_watch}")
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()