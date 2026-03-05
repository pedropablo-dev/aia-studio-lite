// --- ARQUITECTURA DE DATOS V2 (OPTIMIZADA) --- // Updated v7.6



// --- CICLO DE VIDA ---
window.onload = async () => {
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

    // ATOMIC PERSISTENCE GLOBALS (Debounced)
    let historyDebounceTimer;
    document.addEventListener('input', (e) => {
        // 1. Guardado en BD local (3s)
        if (typeof window.debouncedSaveState === 'function') window.debouncedSaveState();

        // 2. Micro-historial de texto para Undo/Redo Unificado (800ms)
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
            clearTimeout(historyDebounceTimer);
            historyDebounceTimer = setTimeout(() => {
                if (typeof window.saveToHistory === 'function') window.saveToHistory();
            }, 800);
        }
    });
    document.addEventListener('change', () => {
        if (typeof window.debouncedSaveState === 'function') window.debouncedSaveState();
    });

    // ---> ESPERAR CARGA DE BBDD
    const loaded = await loadFromLocal();

    if (!loaded) {
        // Fallo crítico (404 o BBDD vacía). Ejecutar contingencia:
        if (typeof window.createNewProject === 'function') {
            await window.createNewProject();
        } else {
            if (scenes.length === 0) addScene();
            renderChecklist();
            resetView();
        }
    } else {
        render();
        renderChecklist();
        updateZoom(1.0);
    }
};

// --- VIEWPORT & ZOOM ---



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
        return `<div class="nav-result-item" data-id="${s.id}">
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

// Close nav dropdown on click outside and handle delegated clicks
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('timeline-nav-results');
    const bar = document.getElementById('timeline-nav-bar');

    const navItem = e.target.closest('.nav-result-item');
    if (navItem) {
        timelineNavGoTo(navItem.dataset.id);
        if (dropdown) dropdown.style.display = 'none';
        const input = document.getElementById('timeline-nav-input');
        if (input) input.value = '';
        return;
    }

    if (dropdown && bar && !bar.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Botones |< y >| del timeline navigator y controles varios (Con blindaje de nulidad estricto)
document.addEventListener('DOMContentLoaded', () => {
    const btnNavStart = document.getElementById('lite-nav-start');
    if (btnNavStart) {
        btnNavStart.addEventListener('click', () => { if (scenes.length > 0) timelineNavGoTo(scenes[0].id); });
    }

    const btnNavEnd = document.getElementById('lite-nav-end');
    if (btnNavEnd) {
        btnNavEnd.addEventListener('click', () => { if (scenes.length > 0) timelineNavGoTo(scenes[scenes.length - 1].id); });
    }

    const btnNavClear = document.getElementById('lite-nav-clear');
    if (btnNavClear) {
        btnNavClear.addEventListener('click', () => {
            const inp = document.getElementById('timeline-nav-input');
            if (inp) inp.value = '';
            const dropdown = document.getElementById('timeline-nav-results');
            if (dropdown) dropdown.style.display = 'none';
            timelineNavSearch('');
        });
    }

    const btnZoomReset = document.getElementById('btn-zoom-reset');
    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => { updateZoom(1.0); });
    }

    const navInput = document.getElementById('timeline-nav-input');
    if (navInput) {
        navInput.addEventListener('input', (e) => timelineNavSearch(e.target.value));
        navInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') timelineNavJump();
        });
    }

    // Historial jerárquico del explorador de archivos
    const btnHistBack = document.getElementById('btn-hist-back');
    if (btnHistBack) {
        btnHistBack.addEventListener('click', () => {
            if (currentBrowsePath === '') return;
            const lastSlash = currentBrowsePath.lastIndexOf('/');
            const parentPath = lastSlash !== -1 ? currentBrowsePath.substring(0, lastSlash) : '';
            openQuickFileModal(null, parentPath);
        });
    }

    const btnHistForward = document.getElementById('btn-hist-forward');
    if (btnHistForward) {
        btnHistForward.addEventListener('click', () => {
            if (!liteDeepestPath || liteDeepestPath === currentBrowsePath) return;
            const prefix = currentBrowsePath === '' ? '' : currentBrowsePath + '/';
            if (!liteDeepestPath.startsWith(prefix) && currentBrowsePath !== '') return;
            const remainder = liteDeepestPath.slice(prefix.length);
            const nextSegment = remainder.split('/')[0];
            const nextPath = currentBrowsePath === '' ? nextSegment : currentBrowsePath + '/' + nextSegment;
            openQuickFileModal(currentFileSceneId, nextPath);
        });
    }

    const sortSelect = document.getElementById('lite-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const q = document.getElementById('lite-file-search')?.value?.trim();
            if (q) filterQuickFiles();
            else openQuickFileModal(currentFileSceneId, currentBrowsePath);
        });
    }

    const searchClear = document.getElementById('lite-search-clear');
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            const searchInput = document.getElementById('lite-file-search');
            if (searchInput) searchInput.value = '';
            filterQuickFiles();
        });
    }
});

// ================================================================
// GESTIÓN DE CARPETAS (LITE)
// ================================================================




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



// Add shortcut for the modal itself? Maybe '?' (Shift + /)

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

// ================================================================
// EVENT BINDINGS (ECMA MODULES MIGRATION)
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Top Bar Global Actions
    document.getElementById('btn-history-undo')?.addEventListener('click', undo);
    document.getElementById('btn-history-redo')?.addEventListener('click', redo);

    // Viewport
    document.getElementById('viewport')?.addEventListener('click', clearSelection);

    // Footer Exporters / Media
    function openExportTxt() { if (typeof window.openExportModal === 'function') window.openExportModal('txt'); }
    function openExportMd() { if (typeof window.openExportModal === 'function') window.openExportModal('md'); }

    document.getElementById('btn-export-txt')?.addEventListener('click', openExportTxt);
    document.getElementById('btn-export-md')?.addEventListener('click', openExportMd);
    document.getElementById('btn-quick-file-global')?.addEventListener('click', () => { if (typeof window.openQuickFileModal === 'function') window.openQuickFileModal(null, ''); });
    document.getElementById('toggle-outline-btn')?.addEventListener('click', toggleTimelineOutline);
    document.getElementById('btn-media-config')?.addEventListener('click', openMediaConfig);
    document.getElementById('btn-export-davinci')?.addEventListener('click', () => { if (typeof window.exportDaVinci === 'function') window.exportDaVinci(); });
    document.getElementById('btn-export-markers')?.addEventListener('click', () => { if (typeof window.exportMarkersEDL === 'function') window.exportMarkersEDL(); });
    document.getElementById('btn-export-srt')?.addEventListener('click', () => { if (typeof window.exportSRT === 'function') window.exportSRT(); });

    // Modals internal controls
    document.getElementById('btn-close-edit-modal-x')?.addEventListener('click', () => closeModal(false));
    document.getElementById('btn-close-edit-modal-cancel')?.addEventListener('click', () => closeModal(false));
    document.getElementById('btn-close-edit-modal-save')?.addEventListener('click', () => closeModal(true));
    document.getElementById('btn-modal-wrap-brackets')?.addEventListener('click', () => {
        const textarea = document.getElementById('modal-text');
        if (typeof window.wrapTextWithBrackets === 'function') window.wrapTextWithBrackets(textarea);
    });
    document.getElementById('modal-text')?.addEventListener('input', (e) => {
        if (typeof currentEditingId !== 'undefined' && currentEditingId) {
            const scene = scenes.find(s => s.id === currentEditingId);
            if (scene) scene.script = e.target.value;
        }
    });
    document.getElementById('btn-close-media-config-x')?.addEventListener('click', () => { document.getElementById('media-config-modal').style.display = 'none'; });
    document.getElementById('btn-close-media-config-done')?.addEventListener('click', () => { document.getElementById('media-config-modal').style.display = 'none'; });

    // Custom Modal System bindings are inside sysDialog in app.js
    document.getElementById('btn-outline-sidebar-close')?.addEventListener('click', toggleTimelineOutline);

    // Lite file explorer direct bindings outside lite-explorer.js when used from header/footer
    document.getElementById('btn-lite-explorer-toggle-view')?.addEventListener('click', () => { if (typeof window.toggleLiteViewMode === 'function') window.toggleLiteViewMode(); });
    document.getElementById('lite-file-search')?.addEventListener('input', () => { if (typeof window.filterQuickFiles === 'function') window.filterQuickFiles(); });
    document.getElementById('btn-lite-explorer-create-folder')?.addEventListener('click', () => { if (typeof window.liteCreateFolder === 'function') window.liteCreateFolder(); });
    document.getElementById('btn-close-lite-explorer-x')?.addEventListener('click', () => { if (typeof window.closeLiteFileModal === 'function') window.closeLiteFileModal(); });
    document.getElementById('btn-close-lite-explorer-cancel')?.addEventListener('click', () => { if (typeof window.closeLiteFileModal === 'function') window.closeLiteFileModal(); });

    document.getElementById('input-quick-color-custom')?.addEventListener('change', (e) => {
        if (typeof window.applyCustomColor === 'function') window.applyCustomColor(e.target.value);
    });
});

