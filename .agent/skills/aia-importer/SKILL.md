---
name: aia-importer
description: Convierte guiones normalizados (Markdown) a proyectos JSON para AIA Studio, gestionando colores, tiempos, IDs únicos y configuraciones técnicas.
input: input_scripts/*.md
template: templates/plantilla_maestra.json
output: output_projects/*.json
---

# AIA Importer Skill

Esta Skill automatiza la transformación de guiones escritos en Markdown (`input_scripts/`) a archivos de proyecto JSON (`output_projects/`) compatibles con AIA Video Builder v6.6+.

## Contexto y Requisitos

- **Input:** Archivos `.md` en `input_scripts/` siguiendo el formato `guion_normalizado.md`.
- **Template:** `templates/plantilla_maestra.json` (Fuente de verdad para `configs` y `version`).
- **Output:** Archivos `.json` en `output_projects/` con el mismo nombre base que el input.
- **Validación:** El JSON resultante debe incluir OBLIGATORIAMENTE el objeto `configs` completo para garantizar la correcta visualización de colores en la UI.

## Procedimiento de Ejecución

### 1. Carga y Preparación del Entorno
1.  **Cargar Template:** Leer `templates/plantilla_maestra.json`.
2.  **Inicializar Proyecto:** Crear un nuevo objeto JSON base copiando del template:
    -   `version`: Copiar valor (ej: "6.6").
    -   `configs`: **COPIAR OBJETO COMPLETO** (Crucial para la UI).
    -   `projectChecklist`: Copiar array.
    -   `exportSettings`: Copiar objeto (o inicializar por defecto si no existe).
    -   `recentColors`: Inicializar array vacío `[]`.
    -   `images`: Inicializar objeto vacío `{}`.
    -   `scenes`: Inicializar array vacío `[]`.
3.  **Crear Índices de Búsqueda (Lookups):**
    Generar mapas para búsqueda rápida de colores Hexadecimales basados en nombres:
    -   `ColorMap`: Map `name` -> `code` desde `configs.colors`.
    -   `SectionMap`: Map `name` -> `code` desde `configs.sections`.
    -   `SpeakerMap`: Map `name` -> `code` desde `configs.speakers`.

### 2. Parsing del Markdown
1.  **Leer Input:** Cargar el contenido del archivo Markdown objetivo.
2.  **Determinar Título:** Usar el nombre del archivo (sin extensión) como `projectTitle`.
3.  **Segmentar Escenas:** Dividir el contenido usando el separador `---` (o `### SECTION` si `---` no está presente al inicio).
4.  **Extraer Campos (Regex):**
    Para cada segmento de escena, extraer los siguientes campos usando expresiones regulares (con soporte para multilínea en `DIALOGUE` y `VISUAL`):

    | Campo Markdown | Variable Interna | Notas |
    | :--- | :--- | :--- |
    | `**TITLE:** (.*)` | `rawTitle` | Título de la tarjeta |
    | `**TYPE:** (.*)` | `rawType` | Determina `color` |
    | `**SECTION:** (.*)` | `rawSection` | Determina `sectionColor` |
    | `**SPEAKER:** (.*)` | `rawSpeaker` | Determina `speakerColor` |
    | `**SHOT:** (.*)` | `shot` | Mapeo directo a `shot` |
    | `**MOVE:** (.*)` | `move` | Mapeo directo a `move` |
    | `**VISUAL:** (.*)` | `description` | Mapeo directo a `description` |
    | `**DIALOGUE:** ([\s\S]*?)(\n---|\Z)` | `script` | Mapeo directo a `script`. Limpiar espacios extra. |

### 3. Construcción y Transformación de Escenas
Por cada escena extraída, construir un objeto y añadirlo al array `scenes`:

1.  **Generar ID:**
    ```javascript
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    // Asegurar que sea único en el array (aunque la probabilidad de colisión es ínfima)
    ```

2.  **Mapear Colores (Lookups):**
    -   `color`: Buscar `rawType` en `ColorMap`. Si no existe, usar default (ej: `#455a64`).
    -   `sectionColor`: Buscar `rawSection` en `SectionMap`. Si no existe, usar default.
    -   `sectionName`: Usar `rawSection` (o "SECCIÓN" si vacío).
    -   `speakerColor`: Buscar `rawSpeaker` en `SpeakerMap`. Si no existe, usar default.
    -   `speakerName`: Usar `rawSpeaker` (o "Voz" si vacío).

3.  **Calcular Duración:**
    -   Contar palabras en `script`.
    -   Fórmula: `duration = Math.ceil(num_words / 2.5)`.
    -   Restricción: `Math.max(duration, 2)` (Mínimo 2 segundos).

4.  **Asignar Propiedades Estáticas:**
    -   `timingMode`: `"auto"`
    -   `done`: `false`
    -   `imageId`: `null` (o lógica futura para buscar imagen por nombre)
    -   `videoDuration`: `null`

5.  **Ensamblar Objeto Escena:**
    ```json
    {
      "id": "...",
      "color": "#...",
      "imageId": null,
      "duration": 5,
      "timingMode": "auto",
      "shot": "...",
      "move": "...",
      "description": "...",
      "script": "...",
      "done": false,
      "title": "...",
      "sectionName": "...",
      "sectionColor": "#...",
      "speakerName": "...",
      "speakerColor": "#..."
    }
    ```

### 4. Wrapper Final y Guardado
1.  **Asignar Array:** `jsonObject.scenes = scenesArray`.
2.  **Validar:** Asegurar que `jsonObject.configs` está presente y no vacío.
3.  **Guardar:** Escribir el archivo JSON en `output_projects/[filename].json`.
    -   Usar indentación de 2 o 4 espacios para legibilidad.
    -   Codificación UTF-8.

## Notas Adicionales
- **Robustez:** Si falta un campo opcional (ej: `MOVE`), usar un valor por defecto del template (ej: "Fijo / Trípode").
- **Limpieza:** Eliminar asteriscos `**` residuales si la regex falla parcialmente.
- **Escapado:** Asegurar que el JSON resultante escapa correctamente comillas dobles y saltos de línea en los textos.
