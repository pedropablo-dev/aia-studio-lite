import subprocess
import webbrowser
import time
import os
import sys

def main():
    print("--- 🚀 INICIANDO AIA STUDIO (AI-POWERED) ---")
    
    # 1. Definir rutas
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    API_SCRIPT = os.path.join(BASE_DIR, "api.py")
    BUILDER_HTML = os.path.join(BASE_DIR, "builder.html")
    
    # 2. Iniciar API Backend
    print("[SYSTEM] Arrancando Motor de IA (FastAPI)...")
    # Usamos sys.executable para garantizar que se usa el python del venv actual
    api_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "src.api:app", "--port", "9999"],
        cwd=os.path.dirname(BASE_DIR) # Ejecutar desde la raíz para que los imports funcionen
    )
    
    try:
        # Esperar a que la API caliente
        print("[SYSTEM] Esperando servicios (3s)...")
        time.sleep(3)
        
        # 3. Abrir Frontend en MODO APP (Chrome)
        file_url = "http://localhost:9999"
        print(f"[SYSTEM] Lanzando Chrome App Mode: {file_url}")
        
        try:
            # Intentamos lanzar Chrome con el flag --app
            # 'start chrome' funciona si Chrome está en el PATH de Windows (lo habitual)
            subprocess.Popen(f'start "" /max chrome --app="{file_url}"', shell=True)
        except Exception as e:
            # Fallback por si falla (abre navegador default con barras)
            print(f"[WARN] No se pudo lanzar modo App ({e}). Usando navegador por defecto.")
            webbrowser.open(file_url)
        
        print("\n✅ SISTEMA OPERATIVO")
        print("Presiona Ctrl+C para detener el servidor.")
        
        # Mantener vivo
        api_process.wait()
        
    except KeyboardInterrupt:
        print("\n[SYSTEM] Apagando servicios...")
        api_process.terminate()
        print("[SYSTEM] Adiós.")

if __name__ == "__main__":
    main()
