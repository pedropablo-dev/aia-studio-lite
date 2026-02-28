# Export System V3 — AIA Studio Lite

El sistema de exportación de AIA Studio Lite es completamente local y se ejecuta en el navegador sin intermediación del backend (pura manipulación de cadenas y XML en memoria vía `exporters.js`). Ofrece 5 formatos hiper-especializados alojados en 2 flujos de usuario distintos.

## Flujo 1: Modal Unificado de Guiones (TXT / MD)

Disparado desde el Footer o usando los atajos `Alt + D` y `Alt + G`. El modal unificado compila a todos los hablantes activos y los muestra como lista de selección (`checkboxes`), permitiendo aislar guiones de voz en off o actores específicos. 

### 📄 Exportar Diálogos (.txt) - `Alt + D`
Genera un archivo de texto crudo ideal para teleprompters o locutores.
- **Formato:** `[HABLANTES / Nombre Actor]:\n[Diálogo]\n\n`
- **Descarga:** Blob download o copiado directo al portapapeles.

### ⬇️ Exportar Guion Técnico (.md) - `Alt + G`
Genera un documento Markdown elegante (`.md`) que sirve como orden de rodaje o despiece técnico.
- **Formato:**
  ```markdown
  # GUION DE VIDEO
  Generado con AIA Studio
  *Filtrado por: Voz, Narrador*

  ### Escena 1 [INTRODUCCIÓN] (5s) ✅
  **Visual:** WIDE SHOT | STATIC
  **Descripción:** Plano del equipo trabajando.
  **Diálogo:**
  **🗣️ Voz**
  Bienvenidos al nuevo sistema.
  ```

---

## Flujo 2: Exportadores DaVinci Resolve (Timeline Sync)

Disparados de manera directa a través de los botones del Footer sin modal intermedio. Estos sistemas toman el Media Root actual y exportan la arquitectura relacional de línea de tiempo con exactitud de *frames*.

### 🎬 Exportar XML (DaVinci Auto-Conform V7.0 Pro)
Genera un archivo `.fcpxml` (Final Cut Pro XML v1.9) garantizado para reconformado en DaVinci Resolve.
- **Resolución & FPS:** Hardcodeado a `3840x2160 @ 24fps` de base pura.
- **Gestión de Assets (`useRealMedia`):** Si hay archivos vinculados, el XML inserta el `AIA_MEDIA_ROOT` local como prefijo en todos los assets, reconstruyendo la ruta exacta al disco del montador.
- **Wrapped Nesting:** Para asegurar el sincronismo perfecto de los `in-points` de audio/video (`start`), el XML anida los archivos dentro de un Clip contenedor superior.
- **Placeholder Fallback:** Si no se usan rutas vinculadas, crea identificadores lógicos (`Asset_01.mp4`) en un Media Pool virtual para su reemplazo manual.

### 📍 Exportar Marcadores EDL (Timeline Markers V5)
Útil cuando el montaje ya está hecho pero se quieren importar las notas del guion como etiquetas sobre la línea de tiempo.
- **Formato:** EDL standard (CMX 3600).
- **Match de Colores:** Convierte el color Hex de la Escena al namespace `ResolveColor` interno (e.g. `Fuchsia`, `Sand`, `Mint`).
- **Notas Ocultas:** Inserta la *Descripción* y *Sección* como nota descriptiva dentro de la etiqueta Mágica de DaVinci (`|C:Color |M:Nombre |D:Duración`).

### 📝 Exportar Subtítulos base (.srt)
Convierte todo el bloque de texto del guion (`script`) en pistas precisas utilizando la métrica de tiempo calculada o asignada en el *Timing Mode*.
- **Cálculo temporal:** Sumatoria correlativa (`00:00:00,000` -> `Duration`).
- **Limpieza de Strings:** Elimina los saltos de línea internos (`\n` -> espacio) para evitar quebrar la estructura strict-parser requerida por el formato SRT.
