@echo off
TITLE AIA Studio Lite Console (Debug Mode)
:: Forzar el directorio de trabajo a la raíz del proyecto
cd /d "E:\AIA-Studio-Lite"

echo [BOOT] Iniciando entorno virtual...
echo [BOOT] Python: venv\Scripts\python.exe
echo.

:: Ejecutar script manteniendo la ventana abierta
"E:\AIA-Studio-Lite\venv\Scripts\python.exe" "src\start_studio.py"

:: Si el script termina (por error o cierre manual), pausar para leer logs
echo.
echo [SYSTEM] El proceso ha terminado.
pause