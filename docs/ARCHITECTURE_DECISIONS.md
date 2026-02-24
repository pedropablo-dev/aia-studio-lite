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

## 5. Sistema de Diálogos Asíncronos (`sysDialog`)
**Estado:** Aceptado
**Contexto:** Los diálogos nativos del navegador (`alert`, `confirm`, `prompt`) no son estilizables, bloquean el hilo principal, y resultan inconsistentes visualmente con la interfaz.
**Decisión:** Se implementó `sysDialog()`, una función asíncrona que retorna una `Promise<{ confirmed, value }>`. Renderiza un modal en `#sys-dialog-overlay` con soporte para modos `confirm`, `prompt` y `alert`. Todas las confirmaciones del explorador de archivos y la gestión de carpetas usan este sistema.

## 6. Navegación Jerárquica con Memoria de Profundidad
**Estado:** Aceptado
**Contexto:** Un sistema de historial temporal (`liteNavHistory[]` + `liteNavHistoryIndex`) introducía bugs de state-overwrite cuando la navegación async y la apertura contextual colisionaban.
**Decisión:** Se reemplazó el historial temporal por una variable de profundidad (`liteDeepestPath`). El botón ◀ sube al padre (`lastIndexOf('/')`), el botón ▶ calcula el siguiente segmento hijo dentro de la ruta más profunda visitada. No hay array de historial, no hay bugs de desbordamiento de índice.

## 7. Motor de Auto-Scroll Dinámico (Drag & Drop)
**Estado:** Aceptado
**Contexto:** Un umbral estático en píxeles (50px, 130px, 250px) no se adaptaba a distintos tamaños de viewport/modal.
**Decisión:** Se implementó geometría dinámica: `hitbox = rect.height * 0.40`, dejando solo un 20% de zona neutral en el centro del contenedor. La velocidad es fija a 40px/tick.

## 8. Colores Neón por Tipo de Archivo
**Estado:** Aceptado
**Contexto:** Los nombres de archivos vinculados en el timeline eran difíciles de distinguir visualmente.
**Decisión:** Las tarjetas de escena emiten un atributo `data-type` basado en la extensión del `linkedFile`. Reglas CSS con `!important` sobrescriben el color inline para aplicar colores neón de alta saturación (verde eléctrico, azul cian, magenta eléctrico).