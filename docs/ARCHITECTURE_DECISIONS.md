# Registro de Decisiones de Arquitectura (ADR) — AIA Studio Lite

## 1. Eliminación de Componentes IA y Base de Datos
**Estado:** Aceptado
**Contexto:** La versión Lite prioriza simplicidad y arranque instantáneo sin requerir GPU, modelos de IA, ni ChromaDB/SQLite.
**Decisión:** Se eliminaron completamente Whisper, Vision, ChromaDB, y el proceso monitor (`monitor.py`). La vinculación de archivos es manual vía el endpoint `/lite/files` + modal en el frontend.

## 2. Generación de Miniaturas vía FFmpeg
**Estado:** Aceptado
**Contexto:** Sin un proceso de ingesta automática, las miniaturas de vídeo no se pre-generan.
**Decisión:** El endpoint `/thumbnail` genera miniaturas bajo demanda usando `subprocess.run(ffmpeg ...)`, con caché persistente en `.lite_cache/`. Las imágenes se sirven directamente sin caché. Se genera a **resolución nativa** del vídeo (sin filtro de escala) con calidad `-q:v 2`.
**Riesgo:** Si FFmpeg no está instalado, las miniaturas de vídeo fallarán con 404/500. Se acepta como requisito del sistema.

## 3. Procesamiento Síncrono y Bloqueante
**Estado:** Aceptado (heredado)
**Decisión:** Se mantiene la ejecución síncrona en `api.py` para operaciones de FFmpeg (trim, thumbnails). El bloqueo es intencional para evitar condiciones de carrera en el sistema de archivos.

## 4. Gestión de Ciclo de Vida en Windows
**Estado:** Aceptado (heredado)
**Decisión:** No se implementa gestión compleja de señales (`SIGTERM`). El cierre es responsabilidad del usuario.

## 5. Sistemas de Diálogos Asíncronos
**Estado:** Aceptado
**Contexto:** Los diálogos nativos del navegador (`alert`, `confirm`, `prompt`) no son estilizables, bloquean el hilo principal, y resultan inconsistentes visualmente con la interfaz.
**Decisión:** Coexisten dos sistemas de diálogos:
1. `sysDialog()` — Función que retorna `Promise<{ confirmed, value }>`. Renderiza en `#sys-dialog-overlay`. Usado por el Lite File Explorer y gestión de carpetas.
2. `Modal.confirm/prompt/alert` — Objeto-función que retorna `Promise`. Renderiza en `#modal-overlay`. Usado por Ingest Studio y otros módulos.

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
**Decisión:** Las tarjetas de escena emiten un atributo `data-type` basado en la extensión del `linkedFile`. Reglas CSS con `!important` sobrescriben el color inline para aplicar colores neón de alta saturación (verde eléctrico, azul cian, magenta eléctrico). El panel Outline usa variantes suaves (`#a5d6a7`, `#81d4fa`, `#ce93d8`).

## 9. Panel Lateral de Esquema (Timeline Outline)
**Estado:** Aceptado
**Contexto:** Con proyectos de muchas escenas, localizar una tarjeta específica requería scroll manual interminable por el timeline.
**Decisión:** Panel fijo lateral (`#timeline-outline-sidebar`) que lista todas las escenas con miniatura, sección, título, archivo vinculado y extracto del guión. Se abre con `Ctrl+Enter` o el botón 🚩 Esquema. Utiliza `selectedId` para highlight bidireccional con el timeline. Las miniaturas siguen una cadena de prioridad: `linkedFile` API → `tempThumbnail` → `blobCache` → fallback 🎬.

## 10. Zero-Flicker DOM Update
**Estado:** Aceptado
**Contexto:** La función `toggleSelection()` llamaba a `render()` tras cada clic, reconstruyendo todo el DOM y causando micro-parpadeos visibles al seleccionar tarjetas.
**Decisión:** Se eliminó la llamada a `render()` de `toggleSelection()`. En su lugar, se itera directamente sobre `.scene-card` y `.outline-item` usando `classList.toggle()` para aplicar/quitar las clases `.selected` y `.active`. El `outline-item` activo se centra con `scrollIntoView({ block: 'center', behavior: 'smooth' })`. Resultado: selección instantánea sin reconstrucción del DOM.

## 11. blobCache — Prevención de Colapso de Memoria
**Estado:** Aceptado
**Contexto:** El esquema lateral inyectaba strings Base64 completos (cientos de KB) directamente en el atributo `src` de `<img>`, multiplicado por el número de escenas. Esto provocaba un DOM extremadamente pesado.
**Decisión:** Se creó una variable global `blobCache = {}` que convierte cada string Base64 a un `Blob` y genera una URL ligera con `URL.createObjectURL()` (~60 bytes). La conversión se realiza perezosamente (solo al primer uso de cada `imageId`). `clearBlobCache()` revoca todas las URLs al cargar o reiniciar un proyecto para evitar fugas de memoria.

## 12. Modo Organización en el Explorador
**Estado:** Aceptado
**Contexto:** El explorador de archivos siempre requería un `sceneId` para funcionar. No existía forma de navegar y gestionar archivos (renombrar, mover, crear carpetas) sin estar vinculado a una tarjeta específica.
**Decisión:** Se añadió un botón 📂 Explorador en el footer y el atajo `Alt+E`, ambos llamando a `openQuickFileModal(null, '')`. Cuando `currentFileSceneId` es `null`, se inyecta un badge naranja "📁 Modo Organización" en los breadcrumbs. `selectLiteFile()` aborta con un toast informativo si no hay escena objetivo. Todas las operaciones CRUD de refresco pasan `currentFileSceneId` en lugar de `null` para preservar el contexto si se entró desde una tarjeta.
