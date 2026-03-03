# Registro de Decisiones de Arquitectura (ADR) — AIA Studio Lite

## 1. Eliminación de Componentes IA y Base de Datos
**Estado:** Aceptado
**Contexto:** La versión Lite prioriza simplicidad y arranque instantáneo sin requerir GPU, modelos de IA, ni ChromaDB/SQLite.
**Decisión:** Se eliminaron completamente Whisper, Vision, ChromaDB, y el proceso monitor (`monitor.py`). La vinculación de archivos es manual vía el endpoint `/lite/files` + modal en el frontend.

## 2. Generación de Miniaturas vía FFmpeg (Asíncrono)
**Estado:** Aceptado (Actualizado Fase 6-7)
**Contexto:** Sin un proceso de ingesta automática, las miniaturas de vídeo no se pre-generan.
**Decisión:** El endpoint `/thumbnail` genera miniaturas bajo demanda usando `asyncio` + `subprocess`. Devuelve HTTP `202 Accepted` mientras FFmpeg procesa, permitiendo al frontend hacer polling asíncrono (máx. 5 reintentos, 800ms). Las miniaturas se cachean en `.lite_cache/`. Se usa `THUMBNAIL_SEMAPHORE` (máx. 4 procesos concurrentes) para evitar saturar la CPU.
**Riesgo:** Si FFmpeg no está instalado, las miniaturas de vídeo fallarán con 404/500. Se acepta como requisito del sistema.

## 3. Procesamiento Asíncrono con FastAPI
**Estado:** Actualizado (Fase 6)
**Decisión:** Se migró el procesamiento de FFmpeg de `subprocess.run` bloqueante a `asyncio.create_subprocess_exec` con `run_in_threadpool`. El frontend maneja la respuesta `202` mediante polling para evitar timeouts en la UI.

## 4. Gestión de Ciclo de Vida del Servidor
**Estado:** Actualizado (Fase 9)
**Decisión:** Se implementaron decoradores `@app.on_event("startup")` y `@app.on_event("shutdown")`. Al arrancar: inicialización de DB + limpieza de caché. Al apagar: terminación forzada de procesos FFmpeg huérfanos en `active_tasks` + última ronda de Garbage Collection.

## 5. Sistemas de Diálogos Asíncronos
**Estado:** Aceptado
**Contexto:** Los diálogos nativos del navegador (`alert`, `confirm`, `prompt`) no son estilizables, bloquean el hilo principal, y resultan inconsistentes visualmente con la interfaz.
**Decisión:** Coexisten dos sistemas de diálogos:
1. `sysDialog()` — Función que retorna `Promise<{ confirmed, value }>`. Renderiza en `#sys-dialog-overlay`. Usado por el Lite File Explorer y gestión de carpetas.
2. `Modal.confirm/prompt/alert` — Objeto-función que retorna `Promise`. Renderiza en `#modal-overlay`. Usado por módulos secundarios.

## 6. Navegación Jerárquica con Memoria de Profundidad
**Estado:** Aceptado
**Decisión:** Se reemplazó el historial temporal por una variable de profundidad (`liteDeepestPath`). El botón ◀ sube al padre, el botón ▶ calcula el siguiente segmento hijo. No hay array de historial ni bugs de desbordamiento.

## 7. Colores Neón por Tipo de Archivo
**Estado:** Aceptado
**Decisión:** Las tarjetas emiten `data-type` basado en la extensión del `linkedFile`. CSS aplica colores neón (verde eléctrico, azul cian, magenta eléctrico). El panel Outline usa variantes suaves.

## 8. Zero-Flicker DOM Update
**Estado:** Aceptado
**Decisión:** `toggleSelection()` no llama a `render()`. Usa `classList.toggle()` directamente sobre `.scene-card` y `.outline-item`.

## 9. blobCache — Encapsulación en projectState
**Estado:** Actualizado (Fase 1)
**Contexto:** La variable global `blobCache = {}` era una fuga de memoria potencial.
**Decisión:** `blobCache` fue encapsulado dentro de `projectState.setBlobCache()` en `state.js`, con limpieza automática vía `URL.revokeObjectURL()`. No existen variables globales mutables sueltas.

## 10. Migración a ES6 Modules y Erradicación de Eventos Inline
**Estado:** Aceptado (Fase 5)
**Contexto:** El monolítico `app.js` (5400+ líneas) con eventos `onclick` inline era inmantenible.
**Decisión:** Se extrajo la lógica en 13 módulos ES6 con responsabilidad única. Todos los atributos de eventos inline (`onclick`, `onchange`, `oninput`, etc.) fueron eliminados de `builder.html`. La vinculación se realiza mediante:
1. **Event Delegation**: Un listener centralizado en `#timeline-container` (en `ui-renderer.js`) maneja todas las interacciones con tarjetas vía `event.target.closest()`.
2. **DOMContentLoaded**: Cada módulo registra sus propios listeners.
3. **window.***: Funciones accesibles entre módulos se exponen globalmente.

## 11. Reconciliación Atómica del DOM (Fase 8)
**Estado:** Aceptado
**Contexto:** `render()` reconstruía todo el `innerHTML` causando parpadeo de miniaturas y pérdida de scroll.
**Decisión:** Se implementó un sistema quirúrgico:
- **data-current-media**: Cada `<img>` almacena el path actual. Si no cambia, la miniatura no se toca.
- **insertBefore condicional**: Solo se reordena un nodo DOM si está fuera de posición, preservando el scroll.
- **removeAttribute('src')**: Al resetear una escena, se elimina el `src` y se oculta el `<img>` para evitar el ícono de imagen rota.

## 12. Garbage Collection de Miniaturas (Fase 9)
**Estado:** Aceptado
**Contexto:** El directorio `.lite_cache/` acumulaba archivos `.jpg` de escenas eliminadas.
**Decisión:** `cleanup_orphan_thumbnails()` lee todos los `linkedFile` de SQLite, reconstruye los stems de cache esperados, y elimina vía `unlink()` cualquier archivo que no tenga correspondencia activa. Se ejecuta en startup y shutdown.

## 13. Auditoría de Rutas Muertas (Fase 9)
**Estado:** Aceptado
**Contexto:** Si un archivo vinculado se borraba externamente (ej. desde el explorador de Windows), la UI no tenía forma de saberlo.
**Decisión:** Se creó `POST /lite/verify_routes` para verificación masiva de rutas. En el frontend, `triggerRouteVerification()` (debounced 1000ms) envía las rutas únicas al verificador tras cada `render()`. Los archivos faltantes se marcan con `scene._isMissing = true`, cambiando el icono de 🔗 a ⚠️ con texto rojo tachado.

## 14. Extirpación del Módulo Ingestor y APIs Bloqueantes
**Estado:** Aceptado
**Contexto:** Los módulos heredados de "Ingest Studio", "Media Pool" y sus APIs correspondientes integraban una carga masiva de componentes DOM y endpoints I/O destructivos.
**Decisión:** Fueron erradicados. El backend eliminó las rutas bajo `/raw-files`, `/assets`, `/ingest` y `/folders` convencionales. El frontend fue liberado del objeto `IngestStore`. Solo sobrevive el "Lite Explorer".

