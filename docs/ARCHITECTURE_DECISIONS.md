# Registro de Decisiones de Arquitectura (ADR) - AI_Media_Manager también conocido como AIA Studio

## 1. Procesamiento Síncrono y Bloqueante
**Estado:** Aceptado (Decisión de Diseño)
**Contexto:** El procesamiento de medios e IA (FFmpeg, Whisper, Vision) consume recursos críticos de CPU y GPU (VRAM).
**Decisión:** Se mantiene la ejecución síncrona en `monitor.py` y `api.py`. El bloqueo del hilo principal es intencional.
**Razón:** - Garantiza que los procesos se ejecuten en serie, evitando que múltiples instancias de modelos de IA compitan por la GPU y causen errores de "Out of Memory" (OOM).
- Asegura la integridad de la base de datos ChromaDB/SQLite al evitar escrituras concurrentes desde hilos asíncronos que podrían corromper el índice.

## 2. Gestión de Ciclo de Vida en Windows
**Estado:** Aceptado
**Contexto:** Las señales de sistema (`SIGTERM`) y la propagación de procesos hijo son inconsistentes en el entorno Windows.
**Decisión:** No se implementará una gestión compleja de señales. El cierre de la aplicación es responsabilidad del usuario y se acepta la posibilidad de procesos huérfanos si se detiene el monitor durante una tarea activa.
**Razón:** La simplicidad del código actual es preferible a la inestabilidad observada en arquitecturas de cierre cooperativo en este entorno específico.

## 3. Prioridad de Estabilidad sobre Fluidez
**Decisión:** Se prioriza la ejecución correcta de las tareas de IA sobre la fluidez de la interfaz de usuario (UI). Se acepta el congelamiento momentáneo de la interfaz mientras se realizan operaciones de disco pesadas o carga de modelos en memoria.