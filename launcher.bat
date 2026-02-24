@echo off
TITLE AIA Media Manager Console (Debug Mode)
:: Forzar el directorio de trabajo a la raíz del proyecto
cd /d "E:\AI_Media_Manager"

echo [BOOT] Iniciando entorno virtual...
echo [BOOT] Python: venv\Scripts\python.exe
echo.

:: Ejecutar script manteniendo la ventana abierta
"E:\AI_Media_Manager\venv\Scripts\python.exe" "src\start_studio.py"

:: Si el script termina (por error o cierre manual), pausar para leer logs
echo.
echo [SYSTEM] El proceso ha terminado.
pause