# Export System V3 — AIA Studio Lite

## Overview
The Export System V3 provides a unified modal for exporting project content in two formats:
- **TXT (Diálogos)**: Plain dialogue text per scene, grouped by speaker.
- **MD (Guion Técnico)**: Full technical screenplay in Markdown format including metadata (section, shot, speaker, title, script, duration).

Both formats are accessed from the same modal with speaker filtering, clipboard copy, and file download.

## Entry Points
- **📄 Diálogos (.txt)** button in footer → `openExportModal('txt')`
- **⬇️ Guion (.md)** button in footer → `openExportModal('md')`

## Modal Behavior

### Speaker Checkboxes
1. The modal scans all scenes for unique `speakerName` values.
2. Each speaker is rendered as a checkbox row with their assigned color.
3. Only scenes matching **checked speakers** are included in the generated output.
4. A "Select All / Deselect All" toggle is provided.

### Content Generation (Pure Functions)
Two stateless functions generate the exportable text:

#### `generateTXTContent(scenes, selectedSpeakers)`
- Iterates over scenes filtered by `selectedSpeakers`.
- Outputs: `#N — Title\nScript text\n\n` per scene.
- Returns a plain string.

#### `generateMDContent(scenes, selectedSpeakers, configs)`
- Iterates over scenes filtered by `selectedSpeakers`.
- Outputs Markdown with frontmatter-style fields per scene:
  ```
  ### Escena N — Title
  - **Sección**: SectionName
  - **Tipo Visual**: ColorName
  - **Plano**: Shot | **Movimiento**: Move
  - **Hablante**: SpeakerName
  - **Duración**: Xs

  > Script text

  ---
  ```
- Uses `presetColors` and `configs` for human-readable color/shot/move names.

### Actions
| Button | Action |
|--------|--------|
| **📋 Copiar** | Copies generated content to clipboard via `navigator.clipboard.writeText()` |
| **⬇️ Exportar** | Creates a `Blob`, generates an `objectURL`, triggers a download via a temporary `<a>` element, then revokes the URL |
| **Cancelar** | Closes the modal |

## Architecture

```
openExportModal(format)
  ├── Scan scenes → extract unique speakers
  ├── Build modal DOM (header, checkboxes, buttons)
  ├── On "Copiar" → generateTXTContent() or generateMDContent() → clipboard
  ├── On "Exportar" → generate content → Blob → download
  └── On "Cancelar" → remove modal from DOM
```

### Design Decisions
- **Pure generators**: `generateTXTContent` and `generateMDContent` are side-effect-free functions that receive data as arguments. This makes them testable independently of the DOM.
- **Dynamic modal**: The modal is created and destroyed on each invocation (no persistent HTML in `builder.html`). This prevents stale state.
- **Blob download**: Uses `URL.createObjectURL(blob)` + temporary `<a>` element pattern for cross-browser file download without server involvement.

## File Extensions
| Format | Default Filename | MIME Type |
|--------|-----------------|-----------|
| TXT | `{projectTitle}_dialogos.txt` | `text/plain` |
| MD | `{projectTitle}_guion.md` | `text/markdown` |
