# Especificación Técnica: Importación de Guiones (Markdown -> JSON)

## 1. Resumen Ejecutivo
El objetivo es automatizar la conversión de guiones en formato Markdown (`guion_normalizado.md`) a archivos de proyecto JSON (`.json`) válidos para **AIA Video Builder** (v6.6+). La auditoría del código fuente (`src/js/app.js`) y las plantillas confirma que **es 100% viable** realizar esta importación sin modificar el núcleo de la aplicación, siempre que se respete estrictamente el esquema de datos y la estrategia de generación de IDs.

## 2. Auditoría de `src/js/app.js` y Datos

### 2.1. Lógica de Carga (`loadProject`)
La función `loadProject(input)` (Líneas 1026-1090) realiza una sustitución completa del estado de la aplicación:
- **Sobrescribe** `scenes`, `imageBank`, y `configs`.
- **No valida** la existencia de IDs únicos (confía en el archivo de entrada).
- **No calcula** duraciones automáticamente al cargar (confía en el valor `duration` del JSON).

### 2.2. Mapeo de Datos (Markdown vs JSON)

La siguiente tabla detalla cómo transformar cada campo del Markdown al esquema JSON esperado por `app.js`.

| Campo Markdown (`guion_normalizado.md`) | Campo JSON (`scene` object) | Tipo | Notas de Implementación |
| :--- | :--- | :--- | :--- |
| **(Implícito)** | `id` | `String` | **CRÍTICO**. Debe ser único. Ver Estrategia de IDs. |
| `**SECTION:** [Nombre]` | `sectionName` | `String` | Se debe buscar el color asociado en `configs.sections`. |
| **(Derivado de Section)** | `sectionColor` | `Hex` | Lookup en la configuración de la plantilla. |
| `**TITLE:** [Título]` | `title` | `String` | Texto directo. |
| `**TYPE:** [Nombre]` | `color` | `Hex` | **CRÍTICO**. Mapear "Vídeo IA" -> `configs.colors`. El JSON guarda el HEX, no el nombre. |
| `**SPEAKER:** [Nombre]` | `speakerName` | `String` | Texto directo. |
| **(Derivado de Speaker)** | `speakerColor` | `Hex` | Lookup en `configs.speakers`. Si no existe, usar default. |
| `**SHOT:** [Tipo]` | `shot` | `String` | Debe coincidir con `configs.shots`. |
| `**MOVE:** [Tipo]` | `move` | `String` | Debe coincidir con `configs.moves`. |
| `**VISUAL:** [Texto]` | `description` | `String` | Texto directo. |
| `**DIALOGUE:** [Texto]` | `script` | `String` | Texto del guion. |
| **(Calculado)** | `duration` | `Number` | Calcular: `palabras / 2.5` (mínimo 2s). Lógica de `estimateDuration`. |
| **(Por defecto)** | `timingMode` | `String` | Valor fijo: `"auto"`. |
| **(Por defecto)** | `imageId` | `null` | Inicializar como `null`. |
| **(Por defecto)** | `done` | `Bool` | Valor fijo: `false`. |

---

## 3. Riesgos Detectados y Mitigación

### 🚨 Riesgo 1: Inconsistencia de Configuraciones
- **Problema:** `app.js` tiene unos colores por defecto (líneas 98-105) diferentes a los de `plantilla_maestra.json`. Si el Markdown usa "Vídeo IA" pero `app.js` espera "Estándar", el mapeo fallará visualmente si no importamos también las `configs`.
- **Solución:** El JSON generado **DEBE incluir el objeto `configs` completo** extraído de `plantilla_maestra.json`. De esta forma, al importar el JSON, `loadProject` actualizará la paleta del editor para que coincida con el guion.

### 🚨 Riesgo 2: Colisión de IDs
- **Problema:** `app.js` usa IDs como claves para el renderizado DOM y manipulación. Si dos escenas tienen el mismo ID, o si el ID tiene caracteres inválidos, la UI se romperá al intentar borrar o editar.
- **Solución:** Generar IDs aleatorios robustos durante la conversión. No usar índices simples (1, 2, 3) ya que pueden colisionar si el usuario añade escenas manualmente después.

### 🚨 Riesgo 3: Caracteres Especiales
- **Problema:** El Markdown puede contener comillas, saltos de línea o caracteres reservados que rompan el `JSON.parse` si no se escapan correctamente.
- **Solución:** El parser debe usar una librería de serialización JSON estándar que escape automáticamente caracteres de control en los strings (`script`, `description`, etc.).

---

## 4. Estrategia de IDs

Para replicar la lógica nativa de `app.js` (Función `createId()` línea 413) y asegurar compatibilidad total:

**Fórmula Recomendada (JS):**
```javascript
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
```

**Formato Resultante:** String alfanumérico (ej: `lrs4t9z1x5k2j8`).
Se debe generar un ID nuevo para cada bloque de escena detectado en el Markdown.

---

## 5. Algoritmo de Conversión (Pseudo-código)

Recomendación para la "Skill de Importación":

1.  **Cargar Referencias:** Leer `plantilla_maestra.json` para obtener los mapas de colores (`colors`, `sections`, `speakers`).
2.  **Leer Markdown:** Leer `guion_normalizado.md` línea por línea.
3.  **Detectar Separadores:** Usar `---` o `### SECTION` para identificar el inicio de una nueva escena.
4.  **Parsear Key-Values:** Extraer valores usando Regex: `/\*\*(.*?):\*\*\s*(.*)/`.
    *   Ej: `**TYPE:** Vídeo IA` -> Buscar "Vídeo IA" en `plantilla.configs.colors` -> Obtener `#005bbd`.
5.  **Construir Objeto Escena:**
    *   Generar ID único.
    *   Asignar valores mapeados.
    *   Calcular duración estimada (`palabras_dialogo / 2.5`).
6.  **Ensamblar JSON Final:**
    *   Crear estructura raíz con `projectTitle` (extraído del nombre de archivo o cabecera).
    *   Insertar array `scenes`.
    *   **Importante:** Copiar `configs` de `plantilla_maestra.json` al nuevo JSON.
    *   Inicializar `images: {}` vacío.
7.  **Salida:** Guardar archivo `.json` listo para importar en `app.js`.

## 6. Conclusión

La arquitectura actual de **AIA Media Manager** soporta nativamente la inyección de proyectos externos. No es necesario modificar `app.js`.

La implementación de la skill debe centrarse en un **Parser robusto** que actúe como puente entre el Markdown humano y el JSON técnico, garantizando que todos los códigos de color y configuraciones se traduzcan correctamente antes de llegar al navegador.
