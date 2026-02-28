// --- ARQUITECTURA DE DATOS V2 (OPTIMIZADA) --- // Updated v7.6
// imageBank aísla los datos pesados (Base64) del ciclo de renderizado y undo/redo.



// --- CICLO DE VIDA ---
window.onload = () => {

    // Configurar Scroll
    const viewport = document.getElementById("viewport");
    viewport.addEventListener("wheel", (evt) => {
        evt.preventDefault();
        if (evt.ctrlKey) {
            const delta = evt.deltaY > 0 ? -0.1 : 0.1;
            let newZoom = currentZoom + delta;
            newZoom = Math.min(Math.max(newZoom, 0.1), 1.5);
            updateZoom(newZoom);
        } else {
            viewport.scrollLeft += evt.deltaY;
        }
    }, { passive: false });

    // ---> NUEVO: Intentar cargar del almacenamiento local
    const loaded = loadFromLocal();

    if (!loaded) {
        // Si no había nada guardado, iniciar nuevo
        if (scenes.length === 0) addScene();
        renderChecklist();
        resetView();
    } else {
        // Si cargó, renderizar todo
        render();
        renderChecklist();
        updateZoom(1.0); // Fuerza zoom al 100% al arrancar
    }

    // Render inicial si falló la carga o es nuevo
    if (!loaded) {
        renderChecklist();
        resetView();
    }
};

// --- VIEWPORT & ZOOM ---

function updateLayoutWidth() {
    const realContentWidth = scenes.length * 385;
    const scaledWidth = realContentWidth * currentZoom;
    const container = document.getElementById('timeline-container');
    container.style.width = (scaledWidth + (300 * currentZoom)) + "px";
}

function manualZoom(val) { updateZoom(parseFloat(val)); }

function fitAll() {
    if (scenes.length === 0) return;
    const viewport = document.getElementById('viewport');
    const availableWidth = viewport.clientWidth - 50;
    const totalRealWidth = (scenes.length * 385) + 140;
    let fitZoom = availableWidth / totalRealWidth;
    fitZoom = Math.min(Math.max(fitZoom, 0.15), 1.0);
    updateZoom(fitZoom);
    requestAnimationFrame(() => { viewport.scrollLeft = 0; });
}

function resetView() {
    const WORK_ZOOM = 1.0;
    updateZoom(WORK_ZOOM);
    if (selectedId) {
        const index = scenes.findIndex(s => s.id === selectedId);
        if (index !== -1) centerOnIndex(index, WORK_ZOOM);
    }
}

function focusSelection() {
    if (!selectedId) return showToast("Selecciona primero una tarjeta");
    const index = scenes.findIndex(s => s.id === selectedId);
    if (index !== -1) centerOnIndex(index, currentZoom);
}

function centerOnIndex(index, zoomLevel) {
    const targetX = (index * 385 * zoomLevel);
    const viewport = document.getElementById("viewport");
    const centerOffset = viewport.clientWidth / 2;
    const cardHalfWidth = (360 * zoomLevel) / 2;
    const leftPadding = 40 * zoomLevel;
    viewport.scrollTo({ left: targetX - centerOffset + cardHalfWidth + leftPadding, behavior: 'smooth' });
}

function toggleSelection(event, id) {
    // Ignorar clics en controles interactivos
    if (event.target.closest('button, input, select, textarea, .card-controls, .section-bar, .speaker-badge')) return;

    event.stopPropagation();
    selectedId = id; // Siempre asume el ID (no deselecciona al hacer clic de nuevo)

    // Zero-flicker: manipulación directa del DOM sin reconstruir todo el árbol
    document.querySelectorAll('.scene-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === id);
    });
    document.querySelectorAll('.outline-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === id);
    });
    // Scroll esquema lateral al elemento activo
    const activeOutline = document.querySelector(`.outline-item[data-id="${id}"]`);
    if (activeOutline) activeOutline.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clearSelection(event) {
    if (event.target.id === 'viewport' || event.target.id === 'timeline-container') {
        selectedId = null;
        document.querySelectorAll('.scene-card').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
    }
}

// --- GESTIÓN DE CHECKLIST ---

function toggleGlobalCheck(index) {
    debouncedSaveState();
    projectChecklist[index].checked = !projectChecklist[index].checked;
    renderChecklist();
}

// Config Checklist
function openChecklistConfig() {
    tempChecklist = JSON.parse(JSON.stringify(projectChecklist));
    renderChecklistRows();
    document.getElementById('checklist-config-modal').style.display = 'flex';
}
function renderChecklistRows() {
    document.getElementById('checklist-rows-container').innerHTML = tempChecklist.map((item, index) => `
            <div class="config-row">
                <input type="text" value="${item.name}" onchange="updateTempChecklist(${index}, this.value)">
                <button class="trash-btn" onclick="removeChecklistRow(${index})">✕</button>
            </div>
        `).join('');
}
function updateTempChecklist(index, value) { tempChecklist[index].name = value; }
function addChecklistRow() { tempChecklist.push({ name: "Nuevo Estado", checked: false }); renderChecklistRows(); }
function removeChecklistRow(index) { tempChecklist.splice(index, 1); renderChecklistRows(); }
function saveChecklistConfig() {
    debouncedSaveState();
    projectChecklist = JSON.parse(JSON.stringify(tempChecklist));
    document.getElementById('checklist-config-modal').style.display = 'none';
    renderChecklist();
}

// --- LOGICA CORE & CRUD ---





// --- SMART UPDATE V5 (FOCUS FIX + DOM MANIPULATION) ---

// --- GESTIÓN DE IMÁGENES (IMAGE BANK OBSOLETE) ---
function triggerImageUpload(id) {
    showToast('Usa el botón 🔗 para vincular medios desde el explorador', 'warning');
}

function handleImageSelect(input, id) {
    if (input.files && input.files[0]) {
        showToast('Usa el botón 🔗 para vincular medios desde el explorador', 'warning');
    }
}

function handleImageDrop(e, id) {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files[0]) {
        showToast('Usa el botón 🔗 para vincular medios desde el explorador', 'warning');
    }
}

// processImage REMOVED

// --- CONFIG MODALS (GENERIC) ---
function renderConfigRows(type, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    let data = (type === 'color') ? tempColors : (type === 'section') ? tempSections : tempSpeakers;

    data.forEach((item, index) => {
        container.innerHTML += `
                <div class="config-row">
                    <input type="color" onchange="updateTempItem('${type}', ${index}, 'code', this.value)" value="${item.code}">
                    <input type="text" onchange="updateTempItem('${type}', ${index}, 'name', this.value)" value="${item.name}">
                    <button class="trash-btn" onclick="removeConfigItem('${type}', ${index})">✕</button>
                </div>`;
    });
}

function updateTempItem(type, index, field, value) {
    if (type === 'color') tempColors[index][field] = value;
    else if (type === 'section') tempSections[index][field] = value;
    else if (type === 'speaker') tempSpeakers[index][field] = value;
}

function addConfigItem(type) {
    const newItem = { name: "Nuevo", code: "#888888" };
    if (type === 'color') { tempColors.push(newItem); renderConfigRows('color', 'color-rows-container'); }
    else if (type === 'section') { tempSections.push(newItem); renderConfigRows('section', 'section-rows-container'); }
    else if (type === 'speaker') { tempSpeakers.push(newItem); renderConfigRows('speaker', 'speaker-rows-container'); }
}

function removeConfigItem(type, index) {
    if (type === 'color') tempColors.splice(index, 1);
    else if (type === 'section') tempSections.splice(index, 1);
    else if (type === 'speaker') tempSpeakers.splice(index, 1);
    renderConfigRows(type, type + '-rows-container');
}

// Modals Open/Save
function openColorConfig() { tempColors = JSON.parse(JSON.stringify(presetColors)); renderConfigRows('color', 'color-rows-container'); document.getElementById('color-config-modal').style.display = 'flex'; }
function saveColorConfig() { debouncedSaveState(); presetColors = JSON.parse(JSON.stringify(tempColors)); document.getElementById('color-config-modal').style.display = 'none'; render(); }

function openSectionConfig() { tempSections = JSON.parse(JSON.stringify(presetSections)); renderConfigRows('section', 'section-rows-container'); document.getElementById('section-config-modal').style.display = 'flex'; }
function saveSectionConfig() { debouncedSaveState(); presetSections = JSON.parse(JSON.stringify(tempSections)); document.getElementById('section-config-modal').style.display = 'none'; render(); }

function openSpeakerConfig() { tempSpeakers = JSON.parse(JSON.stringify(presetSpeakers)); renderConfigRows('speaker', 'speaker-rows-container'); document.getElementById('speaker-config-modal').style.display = 'flex'; }
function saveSpeakerConfig() { debouncedSaveState(); presetSpeakers = JSON.parse(JSON.stringify(tempSpeakers)); document.getElementById('speaker-config-modal').style.display = 'none'; render(); }

// Tech Config (Strings)
function renderTechRows(type) {
    const container = document.getElementById(type === 'shot' ? 'shot-rows-container' : 'move-rows-container');
    container.innerHTML = '';
    const data = (type === 'shot') ? tempShots : tempMoves;
    data.forEach((item, index) => {
        container.innerHTML += `
                <div class="config-row">
                    <input type="text" onchange="updateTempTech('${type}', ${index}, this.value)" value="${item}">
                    <button class="trash-btn" onclick="removeTechItem('${type}', ${index})">✕</button>
                </div>`;
    });
}
function updateTempTech(type, index, value) { if (type === 'shot') tempShots[index] = value; else tempMoves[index] = value; }
function addTechItem(type) { if (type === 'shot') tempShots.push("Nuevo Plano"); else tempMoves.push("Nuevo Mov."); renderTechRows(type); }
function removeTechItem(type, index) { if (type === 'shot') tempShots.splice(index, 1); else tempMoves.splice(index, 1); renderTechRows(type); }

function openTechConfig() { tempShots = JSON.parse(JSON.stringify(presetShots)); tempMoves = JSON.parse(JSON.stringify(presetMoves)); renderTechRows('shot'); renderTechRows('move'); document.getElementById('tech-config-modal').style.display = 'flex'; }
function saveTechConfig() { debouncedSaveState(); presetShots = JSON.parse(JSON.stringify(tempShots)); presetMoves = JSON.parse(JSON.stringify(tempMoves)); document.getElementById('tech-config-modal').style.display = 'none'; render(); }

// --- SELECTORES RÁPIDOS ---
function openQuickColorModal(id) {
    currentColorSceneId = id;
    document.getElementById('quick-presets-container').innerHTML = presetColors.map(p => `
            <button class="color-grid-btn" onclick="applyColorToScene('${p.code}')">
                <div class="swatch" style="background-color:${p.code}"></div><span>${p.name}</span>
            </button>`).join('');

    document.getElementById('quick-recent-container').innerHTML = (recentColors.length === 0)
        ? '<div style="color:#666; font-size:0.8rem; padding:5px;">Sin recientes</div>'
        : recentColors.map(c => `<button class="color-grid-btn" onclick="applyColorToScene('${c}')"><div class="swatch" style="background-color:${c}"></div><span>${c}</span></button>`).join('');

    document.getElementById('quick-color-modal').style.display = 'flex';
}

function openQuickSectionModal(id) {
    currentSectionSceneId = id;
    document.getElementById('quick-section-list-container').innerHTML = presetSections.map(s => `
            <button class="color-grid-btn" onclick="applySectionToScene('${s.name}', '${s.code}')">
                <div class="swatch" style="background-color:${s.code}"></div><span>${s.name}</span>
            </button>`).join('');
    document.getElementById('quick-section-modal').style.display = 'flex';
}

function openQuickSpeakerModal(id) {
    currentSpeakerSceneId = id;
    document.getElementById('quick-speaker-list-container').innerHTML = presetSpeakers.map(s => `
            <button class="color-grid-btn" onclick="applySpeakerToScene('${s.name}', '${s.code}')">
                <div class="swatch" style="background-color:${s.code}"></div><span>${s.name}</span>
            </button>`).join('');
    document.getElementById('quick-speaker-modal').style.display = 'flex';
}

// --- RENDER CORE ---

// --- UTILS & CALCULATIONS ---
function calculateTotalTime() {
    const total = scenes.reduce((acc, curr) => acc + Number(curr.duration || 0), 0);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    document.getElementById("total-time").innerText = `${min}m ${sec}s`;
}

// --- NUEVO: CALCULADORA DE TIEMPO (150 palabras/min) ---
function estimateDuration(text) {
    if (!text) return 0;
    // Contamos palabras separando por espacios
    const words = text.trim().split(/\s+/).length;
    // Velocidad: 2.5 palabras por segundo (ajuste estándar de locución)
    // Mínimo: 2 segundos (para que no queden clips demasiado cortos)
    const estimatedSeconds = Math.ceil(words / 2.5);
    return Math.max(2, estimatedSeconds);
}



// Drag & Drop

// Text Editor Modal
function openModal(id) {
    currentEditingId = id;
    const s = scenes.find(i => i.id === id);
    document.getElementById('modal-scene-num').innerText = scenes.indexOf(s) + 1;
    document.getElementById('modal-text').value = s.script;
    document.getElementById('edit-modal').style.display = 'flex';
    document.getElementById('modal-text').focus();
}
function closeModal(save) {
    if (save && currentEditingId) {
        updateData(currentEditingId, 'script', document.getElementById('modal-text').value);
    }
    document.getElementById('edit-modal').style.display = 'none';
    currentEditingId = null;
}

function openMediaConfig() {
    document.getElementById('media-config-modal').style.display = 'flex';
    document.getElementById('media-path-input').focus();
}



// --- FUNCIONES DEL BOTÓN DE VINCULAR MEDIA ---

// --- [LITE] VINCULACIÓN DE ARCHIVOS VÍA API ---

/** Cierra el modal del explorador y limpia el estado de navegación. */
function closeLiteFileModal() {
    document.getElementById('quick-file-modal').style.display = 'none';
    currentBrowsePath = '';
    // Limpiar historial al cerrar para evitar fugas de estado
    liteNavHistory = [];
    liteNavHistoryIndex = -1;
    _isHistoryNavigation = false;
    liteDeepestPath = '';
    updateHistoryButtons();
    const search = document.getElementById('lite-file-search');
    if (search) search.value = '';
}

/** Habilita/deshabilita los botones ◀ / ▶ según la posición en el historial. */
function updateHistoryButtons() {
    const back = document.getElementById('btn-hist-back');
    const fwd = document.getElementById('btn-hist-forward');
    if (back) back.disabled = (currentBrowsePath === '');
    // ▶ enabled when liteDeepestPath goes deeper than currentBrowsePath
    const prefix = currentBrowsePath === '' ? '' : currentBrowsePath + '/';
    const canGoForward = liteDeepestPath !== '' && liteDeepestPath !== currentBrowsePath &&
        (currentBrowsePath === '' || liteDeepestPath.startsWith(prefix));
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
        const thumbUrl = (isVideo || !isAudio)
            ? `http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(item.path)}&folder=${encodeURIComponent(mediaRoot)}`
            : null;

        const mediaEl = isAudio
            ? `<div class="file-icon" style="height:90px;width:100%;display:flex;align-items:center;justify-content:center;background:#111;border-radius:5px;margin-bottom:7px;font-size:2.2rem;">🎧</div>`
            : `<img src="${thumbUrl}" loading="lazy" alt="" onerror="this.style.display='none'">`;

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

// --- EXPLORER PAGINATION STATE ---
let currentExplorerSkip = 0;
const currentExplorerLimit = 500;
let isFetchingMore = false;
let hasMoreExplorerFiles = true;
let targetExplorerSubpath = '';
let targetExplorerQuery = '';
let explorerObserver = null;

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
        const linkedScene = scenes.find(s => s.id === sceneId);
        if (linkedScene && linkedScene.linkedFile) {
            const lastSlash = linkedScene.linkedFile.lastIndexOf('/');
            subpath = lastSlash !== -1
                ? linkedScene.linkedFile.substring(0, lastSlash)
                : '';
        }
    }

    currentBrowsePath = subpath;

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
            badge.style.cssText = 'margin-left:10px;padding:2px 8px;background:#ff9100;color:#000;border-radius:4px;font-size:0.7rem;font-weight:700;letter-spacing:0.5px;vertical-align:middle;';
            badge.textContent = '\ud83d\udcc1 Modo Organización';
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

        if (hasMoreExplorerFiles) {
            grid.insertAdjacentHTML('beforeend', '<div id="explorer-sentinel" style="height: 50px; width: 100%;"></div>');
            _setupExplorerObserver(mediaRoot, 'browse');
        }

        // Update liteDeepestPath when entering a deeper folder
        if (currentBrowsePath.length > liteDeepestPath.length ||
            !liteDeepestPath.startsWith(currentBrowsePath)) {
            liteDeepestPath = currentBrowsePath;
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
        openQuickFileModal(currentFileSceneId, currentBrowsePath);
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
    const scene = scenes.find(s => s.id === currentFileSceneId);
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

// ================================================================
// [LITE] DRAG & DROP — Handlers globales
// ================================================================

/** Almacena el path del archivo que se está arrastrando */








// ================================================================
// SISTEMA DE DIÁLOGOS CUSTOM (reemplaza confirm/prompt/alert)
// ================================================================

/**
 * Shows a custom async dialog. Returns a Promise that resolves with
 * { confirmed: bool, value: string|null } when the user responds.
 *
 * @param {Object} opts
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {string}  [opts.icon='❓']
 * @param {string}  [opts.type='confirm']   - 'confirm' | 'prompt' | 'alert'
 * @param {string}  [opts.defaultValue='']  - Initial value for prompt inputs
 * @param {string}  [opts.confirmLabel='Aceptar']
 * @param {string}  [opts.cancelLabel='Cancelar']
 * @param {string}  [opts.confirmClass='btn-accent']  - CSS class for confirm button
 */


// ================================================================
// NAVEGADOR DE TIMELINE
// ================================================================

let _navResults = [];
let _navIndex = -1;

/**
 * Fills the dropdown with scenes matching the query (number or text in script/title).
 */
function timelineNavSearch(query) {
    const dropdown = document.getElementById('timeline-nav-results');
    if (!query || !query.trim()) {
        dropdown.style.display = 'none';
        _navResults = [];
        return;
    }

    const q = query.trim().toLowerCase();
    const byNum = parseInt(q, 10);

    _navResults = scenes.filter((s, i) => {
        if (!isNaN(byNum)) return (i + 1) === byNum;
        return (s.title || '').toLowerCase().includes(q) ||
            (s.script || '').toLowerCase().includes(q);
    });

    if (_navResults.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = _navResults.map((s, i) => {
        const num = scenes.indexOf(s) + 1;
        const preview = (s.script || s.title || '').substring(0, 60);
        return `<div class="nav-result-item" onclick="timelineNavGoTo('${s.id}')">
            <b>#${num}</b> ${s.title || '(sin título)'} <span style="color:#555;">— ${preview}…</span>
        </div>`;
    }).join('');

    dropdown.style.display = 'block';
}

/**
 * Jumps to a scene: either the first result in the dropdown, or if the input is a number
 * jump directly to scene #N.
 */
function timelineNavJump() {
    const input = document.getElementById('timeline-nav-input');
    const q = (input.value || '').trim();
    if (!q) return;

    const byNum = parseInt(q, 10);
    let target = null;
    if (!isNaN(byNum) && byNum >= 1 && byNum <= scenes.length) {
        target = scenes[byNum - 1];
    } else if (_navResults.length > 0) {
        target = _navResults[0];
    }

    if (target) {
        timelineNavGoTo(target.id);
        document.getElementById('timeline-nav-results').style.display = 'none';
        input.value = '';
    }
}

/**
 * Scrolls to a scene card by ID and briefly highlights it.
 * @param {string} sceneId
 */
function timelineNavGoTo(sceneId) {
    const card = document.querySelector(`.scene-card[data-id="${sceneId}"]`);
    if (!card) return;

    card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    card.classList.remove('nav-highlight');
    // Force reflow so animation replays
    void card.offsetWidth;
    card.classList.add('nav-highlight');
    card.addEventListener('animationend', () => card.classList.remove('nav-highlight'), { once: true });

    // Select the scene and sync the outline sidebar
    selectedId = sceneId;
    render();
}

// Close nav dropdown on click outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('timeline-nav-results');
    const bar = document.getElementById('timeline-nav-bar');
    if (dropdown && bar && !bar.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Botones |< y >| del timeline navigator
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lite-nav-start')?.addEventListener('click', () => {
        if (scenes.length > 0) timelineNavGoTo(scenes[0].id);
    });
    document.getElementById('lite-nav-end')?.addEventListener('click', () => {
        if (scenes.length > 0) timelineNavGoTo(scenes[scenes.length - 1].id);
    });
    document.getElementById('lite-nav-clear')?.addEventListener('click', () => {
        const inp = document.getElementById('timeline-nav-input');
        if (inp) { inp.value = ''; }
        const dropdown = document.getElementById('timeline-nav-results');
        if (dropdown) dropdown.style.display = 'none';
        timelineNavSearch('');
    });
    // Historial jerárquico del explorador de archivos
    document.getElementById('btn-zoom-reset').addEventListener('click', () => { updateZoom(1.0); });
    document.getElementById('btn-hist-back')?.addEventListener('click', () => {
        if (currentBrowsePath === '') return;
        const lastSlash = currentBrowsePath.lastIndexOf('/');
        const parentPath = lastSlash !== -1 ? currentBrowsePath.substring(0, lastSlash) : '';
        openQuickFileModal(null, parentPath);
    });
    document.getElementById('btn-hist-forward')?.addEventListener('click', () => {
        // Determinar la siguiente carpeta en la ruta más profunda visitada
        if (!liteDeepestPath || liteDeepestPath === currentBrowsePath) return;
        const prefix = currentBrowsePath === '' ? '' : currentBrowsePath + '/';
        if (!liteDeepestPath.startsWith(prefix) && currentBrowsePath !== '') return;
        const remainder = liteDeepestPath.slice(prefix.length);
        const nextSegment = remainder.split('/')[0];
        const nextPath = currentBrowsePath === '' ? nextSegment : currentBrowsePath + '/' + nextSegment;
        openQuickFileModal(currentFileSceneId, nextPath);
    });
    document.getElementById('lite-sort-select')?.addEventListener('change', () => {
        // Re-render with new sort: if searching, re-filter; otherwise reload current folder
        const q = document.getElementById('lite-file-search')?.value?.trim();
        if (q) filterQuickFiles();
        else openQuickFileModal(currentFileSceneId, currentBrowsePath);
    });
    document.getElementById('lite-search-clear')?.addEventListener('click', () => {
        const searchInput = document.getElementById('lite-file-search');
        if (searchInput) { searchInput.value = ''; }
        filterQuickFiles();
    });
});

// ================================================================
// GESTIÓN DE CARPETAS (LITE)
// ================================================================

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
    const newDir = currentBrowsePath ? `${currentBrowsePath}/${value}` : value;
    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    if (!mediaRoot) { showToast('❌ Configura el Media Root primero'); return; }

    try {
        await _litePost('/lite/folders/create', { folder: mediaRoot, new_dir: newDir });
        showToast(`📁 Carpeta creada: ${value}`);
        openQuickFileModal(currentFileSceneId, currentBrowsePath);
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
        openQuickFileModal(currentFileSceneId, currentBrowsePath);
    } catch (err) {
        showToast(`❌ Error al eliminar carpeta: ${err.message}`);
        console.error('[Lite] Delete folder error:', err);
    }
}


function copyLinkedText(text) {
    // Evitar que el clic se propague (si fuera necesario)
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copiado: ${text}`);
    }).catch(err => {
        console.error('Error al copiar', err);
        showToast("Error al copiar");
    });
}

// --- PROCESADOR MULTIMEDIA (VÍDEO E IMAGEN) OBSOLETO ---
function handleVideoSelect(input, id) {
    if (input.files && input.files[0]) {
        showToast('Las cargas directas han sido deshabilitadas. Usa el explorador (botón 🔗).', 'warning');
    }
}

// --- GESTIÓN DE TIEMPO V6.5 (MENÚ INTELIGENTE + FIX REPETICIÓN) ---

function toggleTimingMode(id) {
    debouncedSaveState();
    const s = scenes.find(x => x.id === id);
    if (s) {
        const currentMode = s.timingMode || (s.manualTiming ? 'manual' : 'auto');

        // Si está en Manual o Video -> Pasa a Auto (Reset)
        if (currentMode === 'manual' || currentMode === 'video') {
            s.timingMode = 'auto';
            s.manualTiming = false;
            s.duration = estimateDuration(s.script);
        } else {
            // Si está en Auto -> Pasa a Manual (Bloqueo)
            s.timingMode = 'manual';
            s.manualTiming = true;
        }
        render();
    }
}

// applyTime acepta keepMenu para permitir múltiples clics
function applyTime(id, newTime, mode, keepMenu = false) {
    const s = scenes.find(x => x.id === id);
    if (s) {
        debouncedSaveState();
        s.timingMode = mode;
        s.manualTiming = true;
        s.duration = parseFloat(parseFloat(newTime).toFixed(1));
        render();
    }

    if (!keepMenu) {
        closeContextMenu();
    }
}

function openTimeMenu(event, id) {
    event.stopPropagation();
    closeContextMenu();

    const s = scenes.find(x => x.id === id);
    if (!s) return;

    // Detectamos modo actual para personalizar el botón de abajo
    const currentMode = s.timingMode || (s.manualTiming ? 'manual' : 'auto');

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'active-context-menu';
    menu.style.left = event.clientX + 'px';
    menu.style.top = (event.clientY + 10) + 'px';

    // OPCIÓN 1: VIDEO (Si existe)
    if (s.videoDuration) {
        const btnVideo = document.createElement('button');
        btnVideo.innerHTML = `📽️ Usar Vídeo (${s.videoDuration.toFixed(1)}s)`;
        btnVideo.style.color = "#00e676";
        btnVideo.onclick = () => { applyTime(id, s.videoDuration, 'video', false); };
        menu.appendChild(btnVideo);
        menu.appendChild(Object.assign(document.createElement('div'), { className: 'divider' }));
    }

    // OPCIÓN 2: SUMAR (FIX: Leemos la duración fresca en cada clic)
    const btnPlus = document.createElement('button');
    btnPlus.innerText = "🔺Añadir 0.5s";
    btnPlus.onclick = (e) => {
        e.stopPropagation();
        const freshScene = scenes.find(x => x.id === id); // <-- TRUCO: Leer dato fresco
        const dur = parseFloat(freshScene.duration) || 0;
        applyTime(id, dur + 0.5, 'manual', true);
    };
    menu.appendChild(btnPlus);

    // OPCIÓN 3: RESTAR (FIX: Leemos la duración fresca en cada clic)
    const btnMinus = document.createElement('button');
    btnMinus.innerText = "🔻Quitar 0.5s";
    btnMinus.onclick = (e) => {
        e.stopPropagation();
        const freshScene = scenes.find(x => x.id === id); // <-- TRUCO: Leer dato fresco
        const dur = parseFloat(freshScene.duration) || 0;
        applyTime(id, Math.max(0.5, dur - 0.5), 'manual', true);
    };
    menu.appendChild(btnMinus);

    menu.appendChild(Object.assign(document.createElement('div'), { className: 'divider' }));

    // OPCIÓN 4: BOTÓN CONTEXTUAL (Cambia según el estado)
    const btnContext = document.createElement('button');


    if (currentMode === 'auto') {
        // Si está en Auto -> Ofrecemos Bloquear
        btnContext.innerText = "🔒 Bloquear Tiempo";
        btnContext.style.color = "#ff9100";
    } else {
        // Si está en Manual/Video -> Ofrecemos Resetear
        btnContext.innerText = "✨ Resetear a Auto";
        btnContext.style.color = "#aaa";
    }

    btnContext.onclick = () => { toggleTimingMode(id); closeContextMenu(); };
    menu.appendChild(btnContext);

    document.body.appendChild(menu);

    // Listener para cerrar al hacer clic fuera
    setTimeout(() => {
        const clickOutsideHandler = (e) => {
            if (!menu.contains(e.target)) {
                closeContextMenu();
                document.removeEventListener('click', clickOutsideHandler);
            }
        };
        document.addEventListener('click', clickOutsideHandler);
    }, 50);
}

function closeContextMenu() {
    const existing = document.getElementById('active-context-menu');
    if (existing) existing.remove();
}

// =========================================
// === UI COMPONENTS & MODAL SYSTEM (v7.5) ===
// =========================================


// === INGESTOR DRAG & DROP & CONTEXT MENU ===

// --- KEYBOARD SHORTCUTS MODAL LOGIC ---

// --- KEYBOARD SHORTCUTS MODAL LOGIC (FIXED) ---

function closeShortcutsModal() {
    document.getElementById('shortcuts-modal').style.display = 'none';
}

function openShortcutsModal() {
    const categories = [
        {
            title: "💾 Globales / Archivo",
            shortcuts: [
                { keys: ["Ctrl", "S"], desc: "Guardar Proyecto / Backup" },
                { keys: ["Ctrl", "Z"], desc: "Deshacer" },
                { keys: ["Ctrl", "Y"], desc: "Rehacer" },
                { keys: ["Shift", "?"], desc: "Abrir esta Ayuda" }
            ]
        },
        {
            title: "🎬 Gestión de Escenas",
            shortcuts: [
                { keys: ["Alt", "Enter"], desc: "Nueva Escena (Siempre activo)" },
                { keys: ["Ctrl", "D"], desc: "Duplicar Escena Seleccionada" },
                { keys: ["Supr"], desc: "Eliminar Escena" },
                { keys: ["Ctrl", "L"], desc: "Vincular Media a Escena" },
                { keys: ["Alt", "E"], desc: "Explorador Global" }
            ]
        },
        {
            title: "🖱️ Navegación y UI",
            shortcuts: [
                { keys: ["Ctrl", "Rueda Ratón"], desc: "Zoom en Línea de Tiempo" },
                { keys: ["Clic", "Arrastrar"], desc: "Panorámica (Scroll horizontal)" },
                { keys: ["←", "→"], desc: "Desplazar Línea de Tiempo" },
                { keys: ["Esc"], desc: "Cerrar Ventanas / Cancelar" },
                { keys: ["Enter"], desc: "Confirmar acción" },
                { keys: ["Ctrl", "Enter"], desc: "Abrir/Cerrar Esquema de Tarjetas" }
            ]
        }
    ];

    const container = document.getElementById('shortcuts-list-container');
    container.innerHTML = categories.map(cat => `
        <div class="shortcut-category" style="margin-bottom: 20px;">
            <h4 style="color: var(--accent); margin: 0 0 10px 0; border-bottom: 1px solid #333; padding-bottom: 5px;">${cat.title}</h4>
            ${cat.shortcuts.map(s => {
        const keysHtml = s.keys.map(k => `<span class="key-badge">${k}</span>`).join(' + ');
        return `
                    <div class="shortcut-row" style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #2a2a2a;">
                        <span class="shortcut-desc" style="color: #ccc;">${s.desc}</span>
                        <div style="white-space: nowrap;">${keysHtml}</div>
                    </div>
                `;
    }).join('')}
        </div>
    `).join('');

    document.getElementById('shortcuts-modal').style.display = 'flex';
}

// Add shortcut for the modal itself? Maybe '?' (Shift + /)
/**
 * Applies the current selected sort order by quickly re-fetching the current level.
 */
function liteSortFiles(value) {
    if (document.getElementById('lite-file-search')?.value.trim()) {
        filterQuickFiles();
    } else {
        openQuickFileModal(currentFileSceneId, currentBrowsePath);
    }
}

// --- TIMELINE OUTLINE (SIDEBAR) LOGIC ---
function toggleTimelineOutline() {
    isTimelineOutlineOpen = !isTimelineOutlineOpen;
    const sidebar = document.getElementById('timeline-outline-sidebar');
    if (sidebar) {
        if (isTimelineOutlineOpen) {
            sidebar.classList.add('open');
            renderTimelineOutline();
        } else {
            sidebar.classList.remove('open');
        }
    }
}

