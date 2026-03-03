import { projectState, explorerState } from './state.js';

let currentExplorerSkip = 0;
const currentExplorerLimit = 500;
let isFetchingMore = false;
let hasMoreExplorerFiles = true;
let targetExplorerSubpath = '';
let targetExplorerQuery = '';
let explorerObserver = null;

let liteNavHistory = [];
let liteNavHistoryIndex = -1;
let _isHistoryNavigation = false;

// ================================================================
// ASYNC THUMBNAIL POLLING — EXPLORADOR (idéntico a loadThumbnail del timeline)
// ================================================================

/**
 * Carga asíncronamente la miniatura de una tarjeta del explorador.
 * Reintenta hasta MAX_RETRIES veces si el servidor devuelve HTTP 202 (FFmpeg en proceso).
 * Aplica revokeObjectURL sobre el blob anterior para evitar fugas de RAM.
 *
 * @param {string} imgId    - id del elemento <img> destino
 * @param {string} url      - URL completa del endpoint /thumbnail
 * @param {number} retries  - Reintentos restantes (default: 10)
 */
async function loadExplorerThumbnail(imgId, url, retries = 10) {
    const imgEl = document.getElementById(imgId);
    if (!imgEl) return;
    const container = imgEl.closest('.explorer-thumb-container');

    try {
        const timestampedUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        const response = await fetch(timestampedUrl);

        if (response.status === 202) {
            // FFmpeg generando la miniatura — mostrar spinner y reintentar
            if (container) container.classList.add('loading-spinner');
            if (retries > 0) {
                setTimeout(() => loadExplorerThumbnail(imgId, url, retries - 1), 1000);
            } else {
                // Retries agotados: spinner eterno prevenido — mostrar fallback definitivo
                if (container) container.classList.remove('loading-spinner');
                imgEl.style.display = 'none';
                if (container && !container.querySelector('.thumb-fallback-icon')) {
                    const fb = document.createElement('div');
                    fb.className = 'thumb-fallback-icon';
                    fb.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;background:#111;border-radius:5px;';
                    fb.textContent = '\uD83C\uDFAC';
                    container.appendChild(fb);
                }
            }
            return;
        }

        if (response.ok) {
            const blob = await response.blob();
            // Liberar blob URL anterior para evitar fugas acumuladas en sesiones largas
            if (imgEl.src && imgEl.src.startsWith('blob:')) URL.revokeObjectURL(imgEl.src);
            imgEl.src = URL.createObjectURL(blob);
            imgEl.style.display = 'block';
            imgEl.style.opacity = '0';
            if (container) container.classList.remove('loading-spinner');
            requestAnimationFrame(() => { imgEl.style.opacity = '1'; });
            return;
        }

        // 4xx/5xx — ocultar imagen, sin reintentar
        if (container) container.classList.remove('loading-spinner');
        imgEl.style.display = 'none';

    } catch (e) {
        if (container) container.classList.remove('loading-spinner');
        imgEl.style.display = 'none';
    }
}

/**
 * Inicia el polling de miniaturas para todos los `<img data-explorer-thumb-url>` presentes
 * en el grid del explorador. Se llama después de cada render del grid.
 */
function _kickExplorerThumbnailPolling() {
    document.querySelectorAll('img[data-explorer-thumb-url]').forEach(img => {
        if (img.dataset.pollingStarted === 'true') return;
        img.dataset.pollingStarted = 'true';
        loadExplorerThumbnail(img.id, img.dataset.explorerThumbUrl);
    });
}

/** Cierra el modal del explorador y limpia el estado de navegación. */
function closeLiteFileModal() {
    document.getElementById('quick-file-modal').style.display = 'none';
    explorerState.currentBrowsePath = '';
    // Limpiar historial al cerrar para evitar fugas de estado
    liteNavHistory = [];
    liteNavHistoryIndex = -1;
    _isHistoryNavigation = false;
    explorerState.liteDeepestPath = '';
    updateHistoryButtons();
    const search = document.getElementById('lite-file-search');
    if (search) search.value = '';
}

/** Habilita/deshabilita los botones ◀ / ▶ según la posición en el historial. */
function updateHistoryButtons() {
    const back = document.getElementById('btn-hist-back');
    const fwd = document.getElementById('btn-hist-forward');
    if (back) back.disabled = (explorerState.currentBrowsePath === '');
    // ▶ enabled when liteDeepestPath goes deeper than currentBrowsePath
    const prefix = explorerState.currentBrowsePath === '' ? '' : explorerState.currentBrowsePath + '/';
    const canGoForward = explorerState.liteDeepestPath !== '' && explorerState.liteDeepestPath !== explorerState.currentBrowsePath &&
        (explorerState.currentBrowsePath === '' || explorerState.liteDeepestPath.startsWith(prefix));
    if (fwd) fwd.disabled = !canGoForward;
}

/** Alterna la vista Grid/Lista en el explorador de archivos. */
function toggleLiteViewMode() {
    const list = document.getElementById('quick-file-list');
    if (!list) return;
    list.classList.toggle('list-view');
    const mode = list.classList.contains('list-view') ? 'list' : 'grid';
    localStorage.setItem('liteViewMode', mode);
}

/** Inicializa la vista persistida. */
function initLiteViewMode() {
    const list = document.getElementById('quick-file-list');
    const saved = localStorage.getItem('liteViewMode');
    if (list && saved === 'list') {
        list.classList.add('list-view');
    } else if (list) {
        list.classList.remove('list-view');
    }
}

/**
 * Renderiza el panel de breadcrumbs para el path actual.
 * @param {string} subpath - Ruta relativa actual (forward slashes).
 */
function _renderBreadcrumbs(subpath) {
    const bar = document.getElementById('lite-breadcrumb');
    if (!bar) return;

    const parts = subpath ? subpath.split('/').filter(Boolean) : [];
    let html = `<span class="crumb" onclick="openQuickFileModal(currentFileSceneId, '')">🏠 Inicio</span>`;

    let accumulated = '';
    parts.forEach((part, i) => {
        accumulated += (accumulated ? '/' : '') + part;
        const path = accumulated.replace(/\\/g, '/'); // capture for closure
        const isLast = i === parts.length - 1;
        html += `<span class="crumb-sep">›</span>`;
        if (isLast) {
            html += `<span class="crumb-current">${part}</span>`;
        } else {
            html += `<span class="crumb" onclick="openQuickFileModal(currentFileSceneId, '${path.replace(/'/g, "\\'")}')">${part}</span>`;
        }
    });

    bar.innerHTML = html;
}

/**
 * Convierte la lista de ítems en tarjetas HTML para el grid.
 * @param {Array} items
 * @param {string} mediaRoot
 * @returns {string} HTML string
 */
function _renderGridItems(items, mediaRoot) {
    if (items.length === 0) {
        return '<div class="file-grid-empty">No se encontraron elementos en esta carpeta.</div>';
    }

    return items.map(item => {
        const safePath = item.path.replace(/'/g, "\\'");

        // ── FOLDER CARD ─────────────────────────────────────────────
        if (item.type === 'folder') {
            return `
                <div class="file-card is-folder" data-path="${item.path}" data-name="${item.name}"
                     onclick="openQuickFileModal(currentFileSceneId, '${safePath}')"
                     ondragover="_onFolderDragOver(event)"
                     ondragleave="_onFolderDragLeave(event)"
                     ondrop="_onFolderDrop(event, '${safePath}')">
                    <div class="file-card-actions" onclick="event.stopPropagation()">
                        <button title="Renombrar carpeta" onclick="liteRenameFolder('${safePath}')">✏️</button>
                        <button title="Eliminar carpeta" onclick="liteDeleteFolder('${safePath}')">&#x1F5D1;</button>
                    </div>
                    <div class="file-icon">&#x1F4C1;</div>
                    <div class="file-label" title="${item.name}">${item.name}</div>
                </div>`;
        }

        // ── MEDIA FILE CARD ─────────────────────────────────────────
        const isVideo = /\.(mp4|mov|mxf|avi|webm)$/i.test(item.name);
        const isAudio = /\.(mp3|wav|aac)$/i.test(item.name);
        const needsThumb = !isAudio; // videos e imágenes necesitan miniatura async
        const thumbUrl = needsThumb
            ? `http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(item.path)}&folder=${encodeURIComponent(mediaRoot)}`
            : null;

        // ID único y estable para el <img> de esta tarjeta (basado en path sanitizado)
        const thumbImgId = `explorer-thumb-${item.path.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const mediaEl = isAudio
            ? `<div class="file-icon" style="height:90px;width:100%;display:flex;align-items:center;justify-content:center;background:#111;border-radius:5px;margin-bottom:7px;font-size:2.2rem;">🎧</div>`
            : `<div class="explorer-thumb-container loading-spinner" style="position:relative;width:100%;height:90px;border-radius:5px;overflow:hidden;background:#111;margin-bottom:7px;">
                   <img id="${thumbImgId}"
                        data-explorer-thumb-url="${thumbUrl}"
                        alt=""
                        style="width:100%;height:100%;object-fit:cover;display:none;opacity:0;transition:opacity 0.3s ease-in;">
               </div>`;

        const badge = `<span class="file-type-badge">${item.type}</span>`;

        // Action buttons — stopPropagation so clicks don't open the file
        const actions = `
            <div class="file-card-actions" onclick="event.stopPropagation()">
                <button title="Renombrar" onclick="liteRenameFile('${safePath}')">✏️</button>
                <button title="Eliminar" onclick="liteDeleteFile('${safePath}')">🗑️</button>
            </div>`;

        return `
            <div class="file-card" data-path="${item.path}" data-name="${item.name}" data-type="${item.type}"
                 draggable="true"
                 ondragstart="_onFileDragStart(event, '${safePath}')"
                 onclick="selectLiteFile('${safePath}')">
                ${badge}
                ${actions}
                ${mediaEl}
                <div class="file-label" title="${item.path}">${item.name}</div>
            </div>`;
    }).join('');
}

/**
 * Configura el IntersectionObserver para el scroll infinito del File Explorer.
 */
function _setupExplorerObserver(mediaRoot, mode) {
    const sentinel = document.getElementById('explorer-sentinel');
    if (!sentinel) return;

    explorerObserver = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && hasMoreExplorerFiles && !isFetchingMore) {
            isFetchingMore = true;
            currentExplorerSkip += currentExplorerLimit;

            try {
                let data;
                if (mode === 'search') {
                    data = await liteSearchFilesApi(targetExplorerQuery, currentExplorerSkip, currentExplorerLimit);
                } else {
                    data = await liteFetchFilesApi(targetExplorerSubpath, currentExplorerSkip, currentExplorerLimit);
                }

                let items = data.items || [];
                hasMoreExplorerFiles = data.has_more;

                const sortVal = document.getElementById('lite-sort-select')?.value || 'name';
                items.sort((a, b) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;
                    if (sortVal === 'name') return a.name.localeCompare(b.name);
                    if (sortVal === 'type') {
                        if (a.type === b.type) return a.name.localeCompare(b.name);
                        return a.type.localeCompare(b.type);
                    }
                    return 0;
                });

                sentinel.remove();

                const grid = document.getElementById('quick-file-list');
                const html = _renderGridItems(items, mediaRoot);
                grid.insertAdjacentHTML('beforeend', html);

                if (hasMoreExplorerFiles) {
                    grid.insertAdjacentHTML('beforeend', '<div id="explorer-sentinel" style="height: 50px; width: 100%;"></div>');
                    _setupExplorerObserver(mediaRoot, mode);
                }

                const counter = document.getElementById('lite-file-count');
                if (counter) {
                    const totalLoaded = currentExplorerSkip + items.length;
                    const text = mode === 'search' ? 'resultado' : 'elemento';
                    const plural = totalLoaded !== 1 ? 's' : '';
                    counter.textContent = `${totalLoaded}${hasMoreExplorerFiles ? '+' : ''} ${text}${plural}`;
                }

            } catch (e) {
                console.error('[Lite] Pagination error:', e);
            } finally {
                isFetchingMore = false;
            }
        }
    }, {
        root: document.getElementById('quick-file-modal').querySelector('.modal-content'),
        rootMargin: '200px'
    });

    explorerObserver.observe(sentinel);
}

/**
 * Abre el explorador jerárquico de archivos Lite.
 * @param {string} sceneId  - ID de la escena destino.
 * @param {string} subpath  - Subdirectorio a mostrar (default = raíz).
 */
async function openQuickFileModal(sceneId, subpath = '') {
    currentExplorerSkip = 0;
    isFetchingMore = false;
    hasMoreExplorerFiles = true;
    targetExplorerSubpath = subpath;
    targetExplorerQuery = '';
    if (explorerObserver) explorerObserver.disconnect();

    if (sceneId) currentFileSceneId = sceneId;
    else currentFileSceneId = null; // Modo Organización: sin escena objetivo

    // --- APERTURA CONTEXTUAL ---
    // Si se abre desde una tarjeta (sceneId real) sin subpath explícito,
    // navegar directamente a la carpeta del archivo ya vinculado.
    // GUARD: solo cuando el modal está CERRADO; si ya está abierto respetamos
    // el subpath recibido (navegación interna, botón "..") sin sobrescribirlo.
    const _modal = document.getElementById('quick-file-modal');
    const _isModalOpen = _modal && _modal.style.display === 'flex';
    if (sceneId && subpath === '' && !_isModalOpen) {
        const linkedScene = projectState.scenes.find(s => s.id === sceneId);
        if (linkedScene && linkedScene.linkedFile) {
            const lastSlash = linkedScene.linkedFile.lastIndexOf('/');
            subpath = lastSlash !== -1
                ? linkedScene.linkedFile.substring(0, lastSlash)
                : '';
        }
    }

    explorerState.currentBrowsePath = subpath;

    const grid = document.getElementById('quick-file-list');
    const counter = document.getElementById('lite-file-count');
    const searchInput = document.getElementById('lite-file-search');

    // Clear search box when navigating folders (not when refreshing same level)
    if (sceneId && searchInput) searchInput.value = '';

    grid.innerHTML = '<div class="file-grid-empty">Cargando…</div>';
    document.getElementById('quick-file-modal').style.display = 'flex';

    // Render breadcrumbs
    _renderBreadcrumbs(subpath);
    // Inyectar etiqueta "Modo Organización" si no hay escena objetivo
    if (!currentFileSceneId) {
        const bar = document.getElementById('lite-breadcrumb');
        if (bar) {
            const badge = document.createElement('span');
            badge.style.cssText = 'margin-left: auto; padding:2px 8px;background:#ff9100;color:#000;border-radius:4px;font-size:0.7rem;font-weight:700;letter-spacing:0.5px;vertical-align:middle;';
            badge.textContent = '📂 Modo Organización';
            bar.appendChild(badge);
        }
    }
    initLiteViewMode();

    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';

    try {
        const data = await liteFetchFilesApi(subpath, currentExplorerSkip, currentExplorerLimit);
        let items = data.items || [];
        hasMoreExplorerFiles = data.has_more;

        // Apply sorting
        const sortVal = document.getElementById('lite-sort-select')?.value || 'name';
        items.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            if (sortVal === 'name') return a.name.localeCompare(b.name);
            if (sortVal === 'type') {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type.localeCompare(b.type);
            }
            return 0;
        });


        if (counter) counter.textContent = `${items.length} elemento${items.length !== 1 ? 's' : ''}`;

        // "Go up" card
        let goUp = '';
        if (subpath) {
            const parent = subpath.includes('/') ? subpath.substring(0, subpath.lastIndexOf('/')) : '';
            const safeParent = parent.replace(/'/g, "\\'");
            goUp = `<div class="file-card is-parent"
                        onclick="openQuickFileModal(currentFileSceneId, '${safeParent}')"
                        ondragover="_onFolderDragOver(event)"
                        ondragleave="_onFolderDragLeave(event)"
                        ondrop="_onFolderDrop(event, '..')">
                        <div class="file-icon">📂</div>
                        <div class="file-label">..</div>
                    </div>`;
        }

        grid.innerHTML = goUp + _renderGridItems(items, mediaRoot);

        // Arrancar polling asíncrono de miniaturas tras el render del grid
        _kickExplorerThumbnailPolling();

        if (hasMoreExplorerFiles) {
            grid.insertAdjacentHTML('beforeend', '<div id="explorer-sentinel" style="height: 50px; width: 100%;"></div>');
            _setupExplorerObserver(mediaRoot, 'browse');
        }

        // Update liteDeepestPath when entering a deeper folder
        if (explorerState.currentBrowsePath.length > explorerState.liteDeepestPath.length ||
            !explorerState.liteDeepestPath.startsWith(explorerState.currentBrowsePath)) {
            explorerState.liteDeepestPath = explorerState.currentBrowsePath;
        }
        updateHistoryButtons();

    } catch (err) {
        console.error('[Lite] Error fetching /lite/files:', err);
        grid.innerHTML = `<div class="file-grid-empty" style="color:#ff5252;">Error conectando con la API: ${err.message}</div>`;
    }
}

/**
 * Búsqueda en toda la biblioteca (modo server-side rglob).
 * Se activa con el input #lite-file-search.
 */
async function filterQuickFiles() {
    currentExplorerSkip = 0;
    isFetchingMore = false;
    hasMoreExplorerFiles = true;
    if (explorerObserver) explorerObserver.disconnect();

    const query = (document.getElementById('lite-file-search')?.value || '').trim();
    targetExplorerQuery = query;

    const grid = document.getElementById('quick-file-list');
    const counter = document.getElementById('lite-file-count');
    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';

    if (!query) {
        // Empty query → go back to current browse level
        openQuickFileModal(currentFileSceneId, explorerState.currentBrowsePath);
        return;
    }

    grid.innerHTML = '<div class="file-grid-empty">Buscando…</div>';

    // Reset breadcrumbs to show search context
    const bar = document.getElementById('lite-breadcrumb');
    if (bar) bar.innerHTML = `<span class="crumb" onclick="openQuickFileModal(currentFileSceneId, '')">🏠 Inicio</span><span class="crumb-sep">›</span><span class="crumb-current">🔍 "${query}"</span>`;

    try {
        const data = await liteSearchFilesApi(query, currentExplorerSkip, currentExplorerLimit);
        let items = data.items || [];
        hasMoreExplorerFiles = data.has_more;

        // Apply sorting to search results too
        const sortVal = document.getElementById('lite-sort-select')?.value || 'name';
        items.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            if (sortVal === 'name') return a.name.localeCompare(b.name);
            if (sortVal === 'type') {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type.localeCompare(b.type);
            }
            return 0;
        });


        if (counter) counter.textContent = `${items.length}${hasMoreExplorerFiles ? '+' : ''} resultado${items.length !== 1 ? 's' : ''}`;
        grid.innerHTML = _renderGridItems(items, mediaRoot);

        // Arrancar polling asíncrono de miniaturas tras el render de búsqueda
        _kickExplorerThumbnailPolling();

        if (hasMoreExplorerFiles) {
            grid.insertAdjacentHTML('beforeend', '<div id="explorer-sentinel" style="height: 50px; width: 100%;"></div>');
            _setupExplorerObserver(mediaRoot, 'search');
        }

    } catch (err) {
        console.error('[Lite] Error searching /lite/files:', err);
        grid.innerHTML = `<div class="file-grid-empty" style="color:#ff5252;">Error en la búsqueda: ${err.message}</div>`;
    }
}

/**
 * Vincula el archivo seleccionado a la escena y cierra el modal.
 * @param {string} filePath - Ruta relativa devuelta por /lite/files (forward slashes).
 */
function selectLiteFile(filePath) {
    // Modo Organización: si no hay escena objetivo, no vincular
    if (!currentFileSceneId) {
        showToast('Modo Organización: Selecciona un archivo desde una tarjeta para vincularlo');
        return;
    }
    const scene = projectState.scenes.find(s => s.id === currentFileSceneId);
    if (!scene) {
        console.error('[Lite] No scene found with id:', currentFileSceneId);
        return;
    }
    debouncedSaveState();
    scene.linkedFile = filePath;
    scene.startTime = 0;   // Reset any previously synced timecode
    // Purgar datos de miniatura del estado anterior de la escena
    scene.tempThumbnail = null;
    scene.imageId = null;
    scene.imageSrc = null;
    document.getElementById('quick-file-modal').style.display = 'none';
    currentFileSceneId = null;
    render();
    showToast(`🔗 Vinculado: ${filePath.split('/').pop()}`);
}

/**
 * Muestra un prompt custom para crear una nueva carpeta en el path actual.
 */
async function liteCreateFolder() {
    const { confirmed, value } = await sysDialog({
        icon: '📁',
        title: 'Nueva Carpeta',
        message: 'Introduce el nombre de la nueva carpeta:',
        type: 'prompt',
        defaultValue: 'Nueva Carpeta',
        confirmLabel: 'Crear',
        confirmClass: 'btn-accent'
    });

    if (!confirmed || !value) return;

    // Build the full relative path (current browse path + new name)
    const newDir = explorerState.currentBrowsePath ? `${explorerState.currentBrowsePath}/${value}` : value;
    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    if (!mediaRoot) { showToast('❌ Configura el Media Root primero'); return; }

    try {
        await _litePost('/lite/folders/create', { folder: mediaRoot, new_dir: newDir });
        showToast(`📁 Carpeta creada: ${value}`);
        openQuickFileModal(currentFileSceneId, explorerState.currentBrowsePath);
    } catch (err) {
        showToast(`❌ Error al crear carpeta: ${err.message}`);
        console.error('[Lite] Create folder error:', err);
    }
}

/**
 * Elimina una carpeta y su contenido con confirmación custom.
 * @param {string} folderPath - Ruta relativa al Media Root
 */
async function liteDeleteFolder(folderPath) {
    const name = folderPath.split('/').pop();
    const { confirmed } = await sysDialog({
        icon: '⚠️',
        title: '¿Eliminar carpeta?',
        message: `Se eliminará permanentemente <b>"${name}"</b> y <b>todo su contenido</b>.<br>Esta acción no se puede deshacer.`,
        type: 'confirm',
        confirmLabel: 'Eliminar',
        confirmClass: 'btn-danger'
    });

    if (!confirmed) return;

    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    if (!mediaRoot) { showToast('❌ Configura el Media Root primero'); return; }

    try {
        await _litePost('/lite/folders/delete', { folder: mediaRoot, dir_path: folderPath });
        showToast(`🗑️ Carpeta eliminada: ${name}`);
        openQuickFileModal(currentFileSceneId, explorerState.currentBrowsePath);
    } catch (err) {
        showToast(`❌ Error al eliminar carpeta: ${err.message}`);
        console.error('[Lite] Delete folder error:', err);
    }
}

// Add shortcut for the modal itself? Maybe '?' (Shift + /)
/**
 * Applies the current selected sort order by quickly re-fetching the current level.
 */
function liteSortFiles(value) {
    if (document.getElementById('lite-file-search')?.value.trim()) {
        filterQuickFiles();
    } else {
        openQuickFileModal(currentFileSceneId, explorerState.currentBrowsePath);
    }
}

// === EXPOSICIÓN GLOBAL (RETROCOMPATIBILIDAD) ===
window.closeLiteFileModal = closeLiteFileModal;
window.updateHistoryButtons = updateHistoryButtons;
window.toggleLiteViewMode = toggleLiteViewMode;
window.initLiteViewMode = initLiteViewMode;
window._renderBreadcrumbs = _renderBreadcrumbs;
window._renderGridItems = _renderGridItems;
window._setupExplorerObserver = _setupExplorerObserver;
window.openQuickFileModal = openQuickFileModal;
window.filterQuickFiles = filterQuickFiles;
window.selectLiteFile = selectLiteFile;
window.liteCreateFolder = liteCreateFolder;
window.liteDeleteFolder = liteDeleteFolder;
window.liteSortFiles = liteSortFiles;
window.loadExplorerThumbnail = loadExplorerThumbnail;

document.addEventListener('DOMContentLoaded', () => {
    // Bind Cancel Button in Lite Explorer
    document.getElementById('btn-close-explorer')?.addEventListener('click', closeLiteFileModal);

    // Bind static Refresh button (barra de búsqueda)
    document.getElementById('btn-explorer-refresh-bar')?.addEventListener('click', () => {
        openQuickFileModal(currentFileSceneId, explorerState.currentBrowsePath);
    });
});
