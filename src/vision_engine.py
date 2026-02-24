"""
Vision Engine - Qwen2-VL-2B-Instruct
Motor de visión con soporte nativo para imágenes y vídeo.
Proporciona descripciones densas, OCR, y análisis de escenas.
"""
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
from qwen_vl_utils import process_vision_info
from PIL import Image
import torch
import os
import tempfile

# ENGINE CONFIGURATION
QWEN_MODEL = "Qwen/Qwen2-VL-2B-Instruct"
MAX_IMAGE_SIZE = 1280  # Max pixels en lado más largo (previene OOM en 4K)



PROCESSOR = None
MODEL = None
DEVICE = None

def inicializar_modelo():
    """
    Inicializa el modelo Qwen2-VL-2B-Instruct con:
    - torch.float16 para compatibilidad CUDA universal
    - device_map="auto" para distribución automática
    """
    global PROCESSOR, MODEL, DEVICE
    if MODEL is None:
        print(f"[VISION ENGINE] Cargando modelo Qwen2-VL ({QWEN_MODEL})...")
        
        # Verificar CUDA
        if torch.cuda.is_available():
            DEVICE = "cuda"
            dtype = torch.float16
            print(f"[VISION ENGINE] Usando dispositivo: {DEVICE} (float16 optimizado)")
        else:
            DEVICE = "cpu"
            dtype = torch.float32
            print(f"[VISION ENGINE] ⚠️ CUDA no disponible, usando CPU (rendimiento reducido)")
        
        try:
            # Cargar procesador
            PROCESSOR = AutoProcessor.from_pretrained(QWEN_MODEL)
            
            # Cargar modelo con optimización
            MODEL = Qwen2VLForConditionalGeneration.from_pretrained(
                QWEN_MODEL,
                torch_dtype=dtype,
                device_map="auto"
            )
            
            print("[VISION ENGINE] Modelo Qwen2-VL cargado correctamente.")
        except Exception as e:
            print(f"[VISION ENGINE] Error cargando modelo: {e}")
            raise
    
    return PROCESSOR, MODEL


def analizar_imagen(ruta_imagen):
    """
    Genera una descripción textual densa para la imagen dada usando Qwen2-VL.
    Soporta OCR, detección de objetos, y análisis de escenas.
    """
    global PROCESSOR, MODEL, DEVICE
    try:
        processor, model = inicializar_modelo()
        
        print(f"[VISION ENGINE] Analizando imagen con Qwen2-VL: {ruta_imagen}...")
        
        # Downscale si la imagen es muy grande (previene OOM)
        ruta_procesada = ruta_imagen
        img = Image.open(ruta_imagen)

        # Handle Transparency (Alpha Channel) - Non-destructive in-memory fix
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            # Create a white background canvas of the same size
            background = Image.new('RGB', img.size, (255, 255, 255))
            
            # Ensure image is RGBA for consistent alpha handling
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
                
            # Composite the image over the white background using alpha as mask
            background.paste(img, mask=img.split()[3]) 
            img = background # Replace the in-memory object with the flattened RGB version
        elif img.mode != 'RGB':
            # Handle Grayscale (L) or CMYK -> Convert to RGB directly
            img = img.convert('RGB')

        if max(img.size) > MAX_IMAGE_SIZE:
            print(f"[VISION ENGINE] Redimensionando imagen {img.size} -> max {MAX_IMAGE_SIZE}px...")
            img.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.Resampling.LANCZOS)
            # Guardar en temporal para que qwen_vl_utils pueda leerlo
            temp_path = os.path.join(tempfile.gettempdir(), "qwen_temp_img.jpg")
            img.save(temp_path, "JPEG", quality=90)
            ruta_procesada = temp_path
        img.close()
        
        # Construir mensaje en formato conversación
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": f"file://{ruta_procesada}"},
                    {"type": "text", "text": "Describe this image in extreme detail, focusing on objects, actions, text (OCR), and lighting."}
                ]
            }
        ]
        
        # Preparar texto con template de chat
        text = processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        # Procesar información visual
        image_inputs, video_inputs = process_vision_info(messages)
        
        # Preparar inputs para el modelo
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt"
        ).to(DEVICE)
        
        # Generar descripción
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=512,
                do_sample=False
            )
        
        # Extraer solo los tokens generados (sin el prompt)
        generated_ids_trimmed = [
            out_ids[len(in_ids):] 
            for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
        ]
        
        # Decodificar respuesta
        output_text = processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False
        )[0]
        
        return output_text.strip()
        
    except Exception as e:
        print(f"[VISION ENGINE] Error en análisis de visión: {e}")
        return "Error en análisis"


def analizar_video(ruta_video, max_frames=8):
    """
    Genera una descripción textual densa para el vídeo dado usando Qwen2-VL.
    Qwen2-VL tiene soporte nativo para vídeo.
    
    Args:
        ruta_video: Ruta al archivo de vídeo
        max_frames: Número máximo de frames a analizar (default: 8)
    """
    global PROCESSOR, MODEL, DEVICE
    try:
        processor, model = inicializar_modelo()
        
        print(f"[VISION ENGINE] Analizando vídeo con Qwen2-VL: {ruta_video}...")
        
        # Construir mensaje con vídeo
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "video", 
                        "video": f"file://{ruta_video}",
                        "max_pixels": 360 * 360,  # Reducido para evitar OOM en 4K
                        "nframes": max_frames
                    },
                    {"type": "text", "text": "Describe this video in detail. What actions are happening? What objects and people are visible? Describe any text visible (OCR)."}
                ]
            }
        ]
        
        # Preparar texto con template de chat
        text = processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        # Procesar información visual
        image_inputs, video_inputs = process_vision_info(messages)
        
        # Preparar inputs para el modelo
        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt"
        ).to(DEVICE)
        
        # Generar descripción
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=512,
                do_sample=False
            )
        
        # Extraer solo los tokens generados
        generated_ids_trimmed = [
            out_ids[len(in_ids):] 
            for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
        ]
        
        # Decodificar respuesta
        output_text = processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False
        )[0]
        
        return output_text.strip()
        
    except Exception as e:
        print(f"[VISION ENGINE] Error en análisis de vídeo: {e}")
        return "Error en análisis de vídeo"
