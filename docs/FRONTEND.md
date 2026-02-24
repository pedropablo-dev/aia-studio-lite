# Frontend Documentation (AIA Video Builder)

**Version**: 2.0.0
**Type**: Modular Architecture (HTML + CSS + JS)

## File Structure

```
src/
├── builder.html      # Main HTML shell (imports external assets)
├── css/
│   └── style.css     # All CSS (extracted from monolith)
└── js/
    └── app.js        # All JavaScript logic + IngestStore
```

> **v2.0 Breaking Change**: The frontend was refactored from a single-file component to modular architecture. CSS and JS are now external files loaded via `<link>` and `<script>` tags.

## UI Structure

### Header
- **Project Title**: Inline editable input.
- **History Controls**: Undo/Redo functionality.
- **Checklist**: Interactive horizontal checklist for production steps.
- **Zoom**: Timeline zoom controls.

### Viewport & Timeline
- **Viewport**: Scrollable area with radial gradient background.
- **Timeline Container**: Flexbox container holding scene cards.

### Scene Card Components
- **Drag Zone**: Aspect ratio 16/9 zone for drag and drop media.
- **Scene Stats**: ID, Title, Duration.
- **Script Area**: Textarea for script/voiceover.
- **Visual Tags**: Shot type top tab, Section color bar bottom.
- **Speaker Badge**: Assignable speaker with color coding.
- **Timing Mode**:
    - `Auto`: Calculated from word count.
    - `Manual`: User override.
    - `Video`: Synced to finding media asset.

## CSS System
Uses CSS Variables for theming (Dark Mode default).
- `--bg-color`: #121212
- `--accent`: #2979ff
- `--card-width`: 360px

**File**: `src/css/style.css` (~900 lines)

## State Management (v2.0)

### IngestStore Pattern
All Ingest Studio state is managed through a centralized `IngestStore` object in `app.js`:

```javascript
const IngestStore = {
    CONFIG: {
        PAGE_LIMIT: 50,
        SCROLL_THRESHOLD: 100,
        SEARCH_DEBOUNCE_MS: 300
    },
    state: {
        files: [],           // Current file list
        selected: new Set(), // Selected filenames
        currentFile: null,   // File being inspected
        filter: 'all',       // Active filter type
        viewMode: 'list',    // 'list' or 'grid'
        page: 1,             // Current pagination page
        isLoading: false,    // API loading state
        hasMore: true,       // More pages available
        trimIn: 0,           // Video trim IN point
        trimOut: 0           // Video trim OUT point
    },
    // Mutation methods
    reset(), resetPagination(), setFiles(), toggleSelection(),
    clearSelection(), setCurrentFile(), setFilter(), setViewMode(),
    setLoading(), setHasMore(), nextPage(), setTrimPoint(), resetTrimPoints()
};
```

**Benefits**:
- No global variable collisions
- Centralized debugging (`IngestStore.state` in DevTools)
- Safe mutations through methods
- Configurable constants in `CONFIG`

## Key Interactions
- **Drag & Drop**: Native API for image/video files into DropScenes.
- **Shortcuts**: `Ctrl+S` (Manual Save/Backup), `Ctrl+Z` (Undo), `Ctrl+Y` (Redo).
- **Strategy**: Atomic A/B Slot Rotation (`aia_save_slot_a`, `aia_save_slot_b`).
- **Trigger**: Debounced (2s) after state change.
- **Limitation**: Does NOT save Base64 images to prevent QuotaExceeded. Use `Ctrl+S` for full backup.
- **Manual Backup**: `Ctrl+S` forces an immediate commit to the active SafeStorage slot.

## Deep Linking & Metadata

### `linkVideoToCard(filename, thumb, time)`
Central function to link a video asset to a scene card.
- **filename**: Only the basename (e.g. `video.mp4`).
- **time**: Start time in seconds (Float).
- **Effect**:
    - Updates `scene.linkedFile`.
    - Updates `scene.startTime`.
    - Updates DOM `dataset.startTime` on the card.
    - **Visual**: Shows a "⏱ Inicia en: HH:MM:SS" badge on the card.

## Ingest Studio (v2.0)

Full-featured media staging and preparation environment with **pagination** and **infinite scroll**.

**Access**: Main sidebar → "📥 Ingest Studio" button

### Layout (v7.0)
- **3-Pane Design**: Folder Tree (left) | File Grid/List (center) | Inspector (right)
- **Toolbar**: Search, View Toggle (Grid/List), Breadcrumbs, Monitor Toggle.
- **Tree View**: Hierarchical navigation of `brutos` directory.

### Interactions
- **Selection**:
  - Single Click: Select and Inspect.
  - Double Click: Preview (or Open Folder if in Tree).
- **Drag & Drop**:
  - **Internal**: Move files between folders in the Tree.
  - **External**: Drop files from OS into the Grid to upload (Disabled currently, manual copy required for external root).
- **Context Menu**: Right-click on files for "Sanitize", "Rename", "Trim".

### Monitor Control
- **Location**: Footer (Left).
- **Components**: Toggle Switch + Status LED.
- **Logic**: Safety interlock prevents "Process Selection" if monitor is OFF.

### Infinite Scroll (v2.0)
- **Page Size**: 50 files per request
- **Scroll Trigger**: 100px from bottom of container
- **Debounced Search**: 300ms delay before API call
- **Infinite Scroll (Lazy Loading)**:
    - Implementation: `handleIngestScroll` monitors scroll position.
    - Page Size: 50 items (`IngestStore.CONFIG.PAGE_LIMIT`).
    - **Audit Note**: This is a *Lazy Loading* implementation, not *Virtual Scrolling*. DOM nodes are appended solely. Performance degrades after ~5,000 items. Logic is located in `src/js/app.js`.

### 5. Persistence (SafeStorage)
| Mode | Display | Thumbnails |
|------|---------|------------|
| List (📜) | Vertical list with icons | No |
| Grid (田) | Responsive cards | Real video/image thumbnails |

### Inspector Panel
- **Video**: 16:9 player with `aspect-ratio` and `object-fit: contain`
- **Audio**: Native HTML5 Player (Standard controls)
- **Image**: Responsive preview with max-height constraint
- **Rename Tool**: Auto-replaces spaces with underscores
- **Trim Tool** (video only): IN/OUT markers + lossless FFmpeg extraction

### File Selection
- Click to select/deselect
- Checkbox for multi-select
- Batch delete/process actions in footer
- State managed by `IngestStore.state.selected` (Set)

**Streaming**: Uses `/raw-content/{filename}` endpoint with URL encoding for space support.

## Media Pool (v2.0 Split-View)
Refactored into a **Master-Detail** layout for enhanced usability:
- **Left Panel (Grid)**: Displays asset cards.
    - **Audio Thumbnails**: Uses static SVG icons (🎵) instead of broken image requests.
    - **Infinite Scroll**: Optimization for large libraries.
- **Right Panel (Inspector)**: Detailed preview of selected asset.
    - **Video**: HTML5 Player with "Capture Time" button.
    - **Audio**: Native HTML5 Player.
    - **Image**: Zoomable preview.

### Audio Engine (Native)
We use the browser's **Native HTML5 Audio** stack for maximum stability.
- **Why?**: Previous third-party libraries (WaveSurfer) caused rendering crashes in large lists.
- **Visuals**: Simple, performant iconography (`🎵`) replaces expensive waveform rendering.
- **Performance**: Zero-dependency audio playback ensures consistent behavior across all browsers.

### UX Features
- **Smart Linking**:
    - **Full Video**: Automatically detects proxy duration and sets it as the scene duration.
    - **Time Capture**: "Link from here" button in Inspector captures exact timestamp.
- **Auto-Selection**: Clicking action buttons (✨, 🔗) automatically selects the relevant scene card.

## Metadata Attribution
Cards carry `data-start-time` attribute which is used during Export to set the "In-Point" of the clip in the text/xml/edl output.
