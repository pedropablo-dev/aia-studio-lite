"""
SYSTEM UTILITIES & PATH CONFIGURATION
Centralizes directory management for v7.0 migration (External Media Root).
"""
import os
import sys
import gc
import torch
from pathlib import Path
from dotenv import load_dotenv

# 1. Load Environment Variables
load_dotenv()

# 2. Path Resolution Logic
# Priority: AIA_MEDIA_ROOT env var > Local Fallback
_env_root = os.getenv("AIA_MEDIA_ROOT")

if _env_root and os.path.exists(_env_root):
    BASE_MEDIA_PATH = Path(_env_root).resolve()
    MODE = "EXTERNAL"
else:
    # Fallback to Project Root (assuming src/utils.py location)
    BASE_MEDIA_PATH = Path(__file__).resolve().parent.parent
    MODE = "LOCAL_LEGACY"

# 3. Define Absolute Paths
INPUT_DIR = BASE_MEDIA_PATH / "input"
OUTPUT_DIR = BASE_MEDIA_PATH / "output"
PROXIES_DIR = BASE_MEDIA_PATH / "proxies"
RAW_DIR = BASE_MEDIA_PATH / "brutos"
DB_DIR = BASE_MEDIA_PATH / "db_storage"

# 4. Auto-Initialization
def init_directories():
    """Ensure all critical directories exist."""
    dirs = [INPUT_DIR, OUTPUT_DIR, PROXIES_DIR, RAW_DIR, DB_DIR]
    created = []
    for d in dirs:
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            created.append(d.name)
    
    # Print status on import
    print(f"\n[SYSTEM] Media Root: {BASE_MEDIA_PATH} ({MODE})")
    if created:
        print(f"[SYSTEM] Created directories: {created}")

# Execute initialization immediately on import
init_directories()

# 5. Resource Management (Legacy)
def limpiar_vram():
    """
    Fuerza la liberación de memoria CUDA y RAM no utilizada.
    """
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
        print("[UTILS] VRAM liberada")
