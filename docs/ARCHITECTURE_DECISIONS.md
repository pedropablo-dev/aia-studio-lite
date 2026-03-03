# Registro de Decisiones de Arquitectura (ADR) — AIA Studio Lite

## 1. Eliminación de Componentes IA y Base de Datos
**Estado:** Aceptado
**Contexto:** La versión Lite prioriza simplicidad y arranque instantáneo sin requerir GPU, modelos de IA, ni ChromaDB/SQLite.
**Decisión:** Se eliminaron completamente Whisper, Vision, ChromaDB, y el proceso monitor (`monitor.py`). La vinculación de archivos es manual vía el endpoint `/lite/files` + modal en el frontend.

## 2. Generación de Miniaturas vía FFmpeg (Asíncrono)
**Estado:** Actualizado (Fase 11)
**Contexto:** Sin un proceso de ingesta automática, las miniaturas de vídeo no se pre-generan.
**Decisión:** El endpoint `/thumbnail` genera miniaturas bajo demanda usando `asyncio` + `subprocess`. Devuelve HTTP `202 Accepted` mientras FFmpeg procesa, permitiendo al frontend hacer polling asíncrono. Las miniaturas se cachean en `.lite_cache/`. Se usa `THUMBNAIL_SEMAPHORE` (máx. 4 procesos concurrentes) para evitar saturar la CPU. **Si FFmpeg falla** (código de retorno ≠ 0, ej. disco lleno), el archivo parcial se **elimina inmediatamente** vía `cache_path.unlink(missing_ok=True)` para evitar servir miniaturas corruptas.
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

## 11. Reconciliación Atómica del DOM (Fase 8, Actualizado Fase 11)
**Estado:** Actualizado
**Contexto:** `render()` reconstruía todo el `innerHTML` causando parpadeo de miniaturas y pérdida de scroll.
**Decisión:** Se implementó un sistema quirúrgico:
- **O(1) Node Lookup**: Un `Map<id, Element>` (`cardMap`) se pre-construye antes del bucle. `cardMap.get(scene.id)` reemplaza el O(n²) `querySelector` dentro del loop.
- **data-current-media**: Cada `<img>` almacena el path actual. Si no cambia, la miniatura no se toca.
- **insertBefore condicional**: Solo se reordena un nodo DOM si está fuera de posición, preservando el scroll.
- **removeAttribute('src')**: Al resetear una escena, se elimina el `src` y se oculta el `<img>` para evitar el ícono de imagen rota.
- **Memory Safety**: `URL.revokeObjectURL()` se invoca sobre el blob anterior antes de asignar uno nuevo en `loadThumbnail()`, previniendo acumulación de Object URLs en sesiones largas.

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

## 15. Integridad de Datos: WAL + Transacciones Atómicas (Fase 10)
**Estado:** Aceptado
**Contexto:** En entorno local con disco limitado, un crash a mitad de `save_project` podía corromper la base de datos.
**Decisión:** SQLite configurado en modo WAL (`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`) vía event listener de SQLAlchemy. El endpoint `save_project` envuelve la operación completa (delete + insert) en un bloque `try…except` con `db.commit()` / `db.rollback()`. `VACUUM` ejecutado en modo `AUTOCOMMIT` para evitar conflictos con WAL.

## 16. Gestión Dinámica de Memoria RAM (Fase 11)
**Estado:** Aceptado
**Contexto:** Proyectos con 5000+ escenas consumen ~500MB en el undoStack con 50 snapshots.
**Decisión:** `saveToHistory()` aplica un cap dinámico: `MAX_HISTORY=10` para proyectos >300 escenas, 50 para el resto. `recentColors` limitado a 20 entradas con evicción FIFO (`shift()`).

## 17. Erradicación de `imageBank` (Fase 11)
**Estado:** Aceptado
**Contexto:** `imageBank` era una estructura legacy que almacenaba datos Base64 de imágenes. Tras migrar a miniaturas FFmpeg, estaba vacía pero aún tenía código de conversión activo.
**Decisión:** Eliminadas 24 líneas: constructor en `state.js`, `Object.defineProperty` alias, lookup en `render()`, bloque Base64-to-blob de 20 líneas en `generateThumbnailHTML()`, y comentario de arquitectura muerto en `app.js`.

## 18. Testigo Visual de Integridad de Base de Datos (Fase 11)
**Estado:** Aceptado
**Contexto:** El toast de error desaparecía en 1.5s, invisible si el usuario no estaba mirando.
**Decisión:** `showDbSyncWarning()` inyecta un badge persistente `#db-sync-warning` ("⚠️ Sin guardar") en bottom-right con z-index 99999. `hideDbSyncWarning()` lo elimina automáticamente cuando el siguiente `saveState()` tiene éxito. Guard `getElementById` previene duplicados.

## 19. Polling Asíncrono de Miniaturas en Explorador (Fase 11)
**Estado:** Aceptado
**Contexto:** Las miniaturas del File Explorer se cargaban con `<img src>` estático, fallando silenciosamente si FFmpeg aún procesaba.
**Decisión:** `loadExplorerThumbnail()` replica el patrón del timeline (fetch → 202 retry → blob URL). Cada `<img>` usa `data-explorer-thumb-url` sin `src` inicial. `_kickExplorerThumbnailPolling()` arranca tras cada render de grid (browse y search). 10 reintentos / 1000ms. Fallback 🎬 definitivo y `revokeObjectURL` estricto. Botón ↻ estático en la barra de búsqueda para recarga manual.
