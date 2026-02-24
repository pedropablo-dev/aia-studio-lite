# Registro de Decisiones de Arquitectura (ADR) — AIA Studio Lite

## 1. Eliminación de Componentes IA y Base de Datos
**Estado:** Aceptado
**Contexto:** La versión Lite prioriza simplicidad y arranque instantáneo sin requerir GPU, modelos de IA, ni ChromaDB/SQLite.
**Decisión:** Se eliminaron completamente Whisper, Vision, ChromaDB, y el proceso monitor (`monitor.py`). La vinculación de archivos es manual vía el endpoint `/lite/files` + modal en el frontend.

## 2. Generación de Miniaturas vía FFmpeg
**Estado:** Aceptado
**Contexto:** Sin un proceso de ingesta automática, las miniaturas de vídeo no se pre-generan.
**Decisión:** El endpoint `/thumbnail` genera miniaturas bajo demanda usando `subprocess.run(ffmpeg ...)`, con caché persistente en `.lite_cache/`. Las imágenes se sirven directamente sin caché.
**Riesgo:** Si FFmpeg no está instalado, las miniaturas de vídeo fallarán con 404/500. Se acepta como requisito del sistema.

## 3. Procesamiento Síncrono y Bloqueante
**Estado:** Aceptado (heredado)
**Decisión:** Se mantiene la ejecución síncrona en `api.py` para operaciones de FFmpeg (trim, thumbnails). El bloqueo es intencional para evitar condiciones de carrera en el sistema de archivos.

## 4. Gestión de Ciclo de Vida en Windows
**Estado:** Aceptado (heredado)
**Decisión:** No se implementa gestión compleja de señales (`SIGTERM`). El cierre es responsabilidad del usuario.