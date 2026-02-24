import whisper
import torch
import os
import ffmpeg

# ENGINE CONFIGURATION
WHISPER_MODEL_SIZE = "large-v3"  # Options: "medium", "large-v3", "large-v3-turbo"

MODEL = None

def inicializar_modelo():
    """
    Inicializa el modelo Whisper y lo mueve a CUDA si es posible.
    """
    global MODEL
    if MODEL is None:
        print(f"[AI ENGINE] Cargando modelo Whisper ({WHISPER_MODEL_SIZE})...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[AI ENGINE] Usando dispositivo: {device}")
        # large-v3 maximiza precisión en RTX 3090 (Phase 1 Ultra Mode)
        MODEL = whisper.load_model(WHISPER_MODEL_SIZE, device=device)
        print("[AI ENGINE] Modelo cargado correctamente.")
    return MODEL

def transcribir_video(ruta_video):
    """
    Transcribe el audio del video usando el modelo cargado.
    Retorna el texto transcrito.
    """
    global MODEL
    import subprocess
    import tempfile
    
    # Use system temp dir to avoid local permission/path issues
    temp_fd, temp_audio = tempfile.mkstemp(suffix=".wav")
    os.close(temp_fd) # Close handle so ffmpeg can write
    try:
        inicializar_modelo()
        print(f"[AI ENGINE] Transcribiendo: {ruta_video} ...")
        
        # Extraer audio a WAV con subprocess directo (bypass ffmpeg-python args issues)
        print(f"[AI ENGINE] Extrayendo audio a {temp_audio}...")
        
        # -y: overwrite
        # -loglevel error: Solo errores críticos
        # -stats: Muestra progreso visual (sin buffer RAM)
        cmd = [
            "ffmpeg", "-y", 
            "-i", ruta_video,
            "-ac", "1", 
            "-ar", "16000",
            "-loglevel", "error",
            "-stats",
            temp_audio
        ]
        
        # Ejecución directa sin buffer de RAM (check=True lanza excepción si falla)
        subprocess.run(cmd, check=True)
        
        # Whisper maneja la extracción de audio internamente, pero le pasamos el WAV limpio
        # FIX: Parámetros ajustados para vídeos largos:
        # - no_speech_threshold bajo (0.4) para captar audio tenue
        # - condition_on_previous_text=False para evitar bucles de silencio
        result = MODEL.transcribe(
            temp_audio, 
            language="es",
            no_speech_threshold=0.4,
            condition_on_previous_text=False,
            word_timestamps=True  # Asegura que los segmentos tengan 'start' y 'end' precisos
        )
        
        # Validar que los segmentos contengan tiempos correctos para la BD
        segments = result.get("segments", [])
        for seg in segments:
            if "start" not in seg:
                seg["start"] = 0.0
            if "end" not in seg:
                seg["end"] = seg.get("start", 0.0) + 1.0
        
        return result["text"], segments
    except Exception as e:
        print(f"[AI ENGINE] Error en transcripción: {e}")
        return None
    finally:
        if os.path.exists(temp_audio):
            try:
                os.remove(temp_audio)
            except:
                pass
