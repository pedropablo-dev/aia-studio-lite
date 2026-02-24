# Frontend Documentation — AIA Studio Lite

**Type**: Modular Architecture (HTML + CSS + JS)

## File Structure
```
src/
├── builder.html      # Main HTML shell
├── css/
│   └── style.css     # All CSS
└── js/
    └── app.js        # All JavaScript logic
```

## UI Structure

### Header
- **Project Title**: Inline editable input.
- **History Controls**: Undo/Redo.
- **Checklist**: Interactive production step tracker.
- **Zoom**: Timeline zoom controls.

### Timeline (Viewport)
Flexbox container holding **Scene Cards**, each with:
- **Drop Zone**: 16:9 area for drag-and-drop images, or auto-populated thumbnails from `/thumbnail` API.
- **Linked File Label**: Shows the linked file name (🔗 icon, clickable to copy path).
- **Scene Stats**: Number, Title, Duration.
- **Script Area**: Textarea for voiceover/dialogue.
- **Visual Tags**: Shot type tab (top), Section color bar (bottom).
- **Speaker Badge**: Assignable speaker with color.
- **Timing Mode**: Auto (word count) / Manual (locked) / Video (synced).
- **🔗 Link Button**: Opens the **Lite File Modal** to browse and link media files.

### Footer
- **Shortcuts**: ⌨️ button.
- **+ Add Scene**: Creates a new scene card.
- **Config Buttons**: Tipo Visual, Secciones, Hablantes, Técnica.
- **Export**: Copiar Diálogo, Markdown, Guardar JSON, Cargar JSON.
- **DaVinci Tools**: 📁 Media Root Config, 🎬 XML Export, 📍 EDL Markers, 📝 SRT Subtitles.

## Lite File Modal (`#quick-file-modal`)
Opened via the 🔗 button on each scene card. Flow:
1. `openQuickFileModal(sceneId)` fetches `GET /lite/files?folder=<media-root>`.
2. Results are rendered as scrollable `<li>` elements with type icons (🎥 video, 🎧 audio, 🖼️ image).
3. User can filter in real-time via `#lite-file-search` input.
4. Clicking a file calls `selectLiteFile(path)` → sets `scene.linkedFile` → re-renders card.

## Thumbnails on Cards
If `scene.linkedFile` is a video or image, the card's drop-zone `<img>` points to:
```
/thumbnail?path=<linkedFile>&folder=<media-root>
```
For audio files, a 🎵 icon is displayed instead.

## CSS System
Dark mode by default using CSS Variables:
- `--bg-color`: #121212
- `--accent`: #2979ff
- `--card-width`: 360px

## State & Persistence
- **SafeStorage**: A/B slot rotation in LocalStorage (debounced 2s).
- **Image Bank**: IndexedDB for heavy image blobs.
- **Manual Backup**: `Ctrl+S`.
- **Undo/Redo**: In-memory stack (max 50 states), excludes image data.

## Key Interactions
- **Drag & Drop**: Native API for images into drop zones. Drag handle (⋮⋮) for card reordering.
- **Shortcuts**: `Ctrl+Z` (Undo), `Ctrl+Y` (Redo), `Ctrl+S` (Backup), `Shift+?` (Shortcuts modal).
