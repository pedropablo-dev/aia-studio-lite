// --- ARQUITECTURA DE DATOS V2 (OPTIMIZADA) --- // Updated v7.6
// imageBank aísla los datos pesados (Base64) del ciclo de renderizado y undo/redo.
let imageBank = {};
// blobCache almacena URLs virtuales ligeras para las miniaturas del esquema lateral.
// Evita inyectar strings Base64 masivos en el DOM.
let blobCache = {};
let scenes = [];
let projectTitle = "Nuevo Proyecto";
let isTimelineOutlineOpen = false;





// Libera todas las URLs de Blob del esquema lateral para evitar fugas de memoria.
function clearBlobCache() {
    Object.values(blobCache).forEach(url => { try { URL.revokeObjectURL(url); } catch (_) { } });
    blobCache = {};
}

// --- PERFOMANCE: INDEXEDDB WRAPPER (Images) ---
const ImageDB = {
    dbName: 'AIA_VideoBuilder_Images',
    storeName: 'project_images',
    version: 1,
    db: null,

    init() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onerror = (e) => {
                console.warn("[ImageDB] Failed to open DB (Incognito?)", e);
                reject(e);
            };
        });
    },

    async saveAll(images) {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);

                // Optimización: Solo guardamos, no borramos previos por ahora para ser rápidos.
                // La limpieza real debería ocurrir al "Reset Project".
                Object.entries(images).forEach(([id, data]) => {
                    store.put({ id, data });
                });

                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        } catch (e) { return Promise.reject(e); }
    },

    async getAll() {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.getAll();
                request.onsuccess = () => {
                    const result = {};
                    if (request.result) {
                        request.result.forEach(item => result[item.id] = item.data);
                    }
                    resolve(result);
                };
                request.onerror = (e) => reject(e);
            });
        } catch (e) { return Promise.resolve({}); }
    },

    async clear() {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        } catch (e) { return Promise.resolve(); }
    }
};

// --- AUTOSAVE CONFIG ---
const AUTOSAVE_KEY = "aia_vb_autosave_v4_2"; // Legacy Support
const AUTOSAVE_SLOT_A = "aia_vb_autosave_slot_A";
const AUTOSAVE_SLOT_B = "aia_vb_autosave_slot_B";
const AUTOSAVE_META = "aia_vb_autosave_meta";
const AUTOSAVE_DELAY = 1000; // Esperar 1seg tras dejar de escribir para guardar
let autosaveTimer = null;

// Configs por defecto
let presetColors = [
    { name: "Estándar", code: "#455a64" },
    { name: "B-Roll", code: "#2e7d32" },
    { name: "Pantalla", code: "#6a1b9a" },
    { name: "VFX", code: "#00838f" },
    { name: "Gancho", code: "#fbc02d" },
    { name: "CTA", code: "#c62828" }
];

let presetSections = [
    { name: "SECCIÓN", code: "#252525" },
    { name: "INTRO", code: "#90caf9" },
    { name: "PROBLEMA", code: "#ffcc80" },
    { name: "AGITACIÓN", code: "#ef9a9a" },
    { name: "SOLUCIÓN", code: "#a5d6a7" },
    { name: "EL SISTEMA", code: "#80deea" },
    { name: "CIERRE", code: "#ce93d8" }
];

let presetSpeakers = [
    { name: "Voz", code: "transparent" },
    { name: "Voz en Off", code: "#b0bec5" },
    { name: "Fernando", code: "#ff6d00" },
    { name: "Pedro P.", code: "#2962ff" },
    { name: "Lorena", code: "#d500f9" }
];

let presetShots = ["Plano General", "Plano Medio", "Primer Plano", "Primerísimo P.P.", "Plano Detalle", "Gran Plano Gral"];
let presetMoves = ["Fijo", "Panorámica", "Tilt", "Zoom In", "Zoom Out", "Tracking/Dolly", "Cámara en Mano", "VFX"];

let projectChecklist = [
    { name: "Idea", checked: true },
    { name: "Guion", checked: false },
    { name: "Locución", checked: false },
    { name: "Grabación", checked: false },
    { name: "Edición", checked: false },
    { name: "Render", checked: false }
];

// Variables de estado temporal
let tempColors = [], tempSections = [], tempSpeakers = [], tempShots = [], tempMoves = [], tempChecklist = [];
let recentColors = [];
let selectedId = null;
let currentEditingId = null;
let currentColorSceneId = null;
let currentSectionSceneId = null;
let currentSpeakerSceneId = null;
let currentZoom = 1.0;

// --- UNDO/REDO SYSTEM (MEMORIA EFICIENTE) ---
const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];
let currentFileSceneId = null;  // [LITE] ID de la escena que abrió el file picker
let currentBrowsePath = '';     // [LITE] Subpath actual en el explorador jerárquico
let liteDeepestPath = '';       // [LITE] Ruta más profunda visitada (para navegación jerárquica ►)

// NOTA TÉCNICA: saveState ahora es ligero. No guarda las imágenes (MBs), solo referencias (Bytes).
function saveState() {
    const state = {
        projectTitle: projectTitle,
        scenes: JSON.parse(JSON.stringify(scenes)),
        projectChecklist: JSON.parse(JSON.stringify(projectChecklist)),
        configs: {
            colors: presetColors,
            sections: presetSections,
            speakers: presetSpeakers,
            shots: presetShots,
            moves: presetMoves
        }
    };
    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];

    // ---> NUEVO: Disparar auto-guardado
    triggerAutoSave();
}

function updateProjectTitle(val) {
    projectTitle = val;
    // No llamamos a saveState() en cada letra para no saturar el historial, 
    // pero sí actualizamos el título del documento HTML (pestaña del navegador)
    document.title = val + " - AIA Studio";
    triggerAutoSave(); // Guardamos en local silenciosamente
}

function restoreState(state) {
    // Restauración profunda
    scenes = JSON.parse(JSON.stringify(state.scenes));
    // RESTAURAR TÍTULO
    if (state.projectTitle) {
        projectTitle = state.projectTitle;
        const titleInput = document.getElementById('project-title-input');
        if (titleInput) titleInput.value = projectTitle;
    }
    projectChecklist = JSON.parse(JSON.stringify(state.projectChecklist));

    if (state.configs) {
        presetColors = state.configs.colors;
        presetSections = state.configs.sections;
        presetSpeakers = state.configs.speakers;
        presetShots = state.configs.shots;
        presetMoves = state.configs.moves;
    }

    // Las imágenes persisten en imageBank, así que al renderizar reaparecerán si su ID existe.
    render();
    renderChecklist();
    calculateTotalTime();
    updateLayoutWidth();
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({
        scenes: JSON.parse(JSON.stringify(scenes)),
        projectChecklist: JSON.parse(JSON.stringify(projectChecklist)),
        configs: { colors: presetColors, sections: presetSections, speakers: presetSpeakers, shots: presetShots, moves: presetMoves }
    });
    restoreState(undoStack.pop());
    showToast("Deshacer");
}

function redo() {
    if (redoStack.length === 0) return;

    // 1. Capturamos el estado actual antes de avanzar para poder volver atrás (Undo)
    const currentState = {
        scenes: JSON.parse(JSON.stringify(scenes)),
        projectChecklist: JSON.parse(JSON.stringify(projectChecklist)),
        configs: {
            colors: presetColors,
            sections: presetSections,
            speakers: presetSpeakers,
            shots: presetShots,
            moves: presetMoves
        }
    };

    // 2. Lo empujamos al stack de Undo MANUALMENTE (sin usar saveState para no borrar el Redo)
    undoStack.push(currentState);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();

    // 3. Recuperamos el futuro y restauramos
    const nextState = redoStack.pop();
    restoreState(nextState);

    showToast("Rehacer");
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); toggleTimelineOutline(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && selectedId) { e.preventDefault(); openQuickFileModal(selectedId); }
    if (e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); openQuickFileModal(null, ''); }
});

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 1500);
}

// --- CICLO DE VIDA ---
window.onload = () => {
    window.addEventListener('beforeunload', (e) => {
        // Solo avisar si hay escenas Y no hemos guardado recientemente (opcional)
        if (scenes.length > 0) { e.preventDefault(); e.returnValue = ''; }
    });

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
        updateZoom(currentZoom || 0.8); // Restaura el zoom guardado o usa 80% si no existe
    }

    // Render inicial si falló la carga o es nuevo
    if (!loaded) {
        renderChecklist();
        resetView();
    }
};

// --- VIEWPORT & ZOOM ---
function updateZoom(val) {
    currentZoom = val;
    document.getElementById('zoom-slider').value = currentZoom;
    document.getElementById('zoom-display').innerText = Math.round(currentZoom * 100) + "%";
    const container = document.getElementById('timeline-container');
    container.style.transform = `scale(${currentZoom})`;
    updateLayoutWidth();
}

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
    const WORK_ZOOM = 0.8;
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
        render();
    }
}

// --- GESTIÓN DE CHECKLIST ---
function renderChecklist() {
    const container = document.getElementById('global-checklist-container');
    container.innerHTML = projectChecklist.map((item, index) => `
            <div class="checklist-item ${item.checked ? 'checked' : ''}" onclick="toggleGlobalCheck(${index})">
                <div class="header-check-circle">${item.checked ? '✓' : ''}</div>
                <span>${item.name}</span>
            </div>
        `).join('');
}

function toggleGlobalCheck(index) {
    saveState();
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
    saveState();
    projectChecklist = JSON.parse(JSON.stringify(tempChecklist));
    document.getElementById('checklist-config-modal').style.display = 'none';
    renderChecklist();
}

// --- LOGICA CORE & CRUD ---
function createId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function addScene() {
    saveState();
    const newScene = {
        id: createId(), color: presetColors[0].code, imageId: null, duration: 0,
        timingMode: 'auto', // ESTADOS: 'auto', 'manual', 'video'
        shot: presetShots[0], move: presetMoves[0], description: "", script: "", done: false,
        title: "", sectionName: "SECCIÓN", sectionColor: "transparent",
        speakerName: "Voz", speakerColor: "transparent"
    };
    scenes.push(newScene);
    render();
    setTimeout(() => {
        const viewport = document.getElementById("viewport");
        viewport.scrollTo({ left: viewport.scrollWidth, behavior: 'smooth' });
    }, 100);
}

function duplicateScene(index, offset) {
    saveState();
    const original = scenes[index];
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = createId();
    // Nota: imageId se mantiene, apuntando a la misma imagen en caché (eficiente)

    const insertIndex = index + offset;
    scenes.splice(insertIndex, 0, copy);
    render();
}

function deleteScene(id) {
    saveState();
    scenes = scenes.filter(s => s.id !== id);
    if (selectedId === id) selectedId = null;
    render();
}


// --- SMART UPDATE V5 (FOCUS FIX + DOM MANIPULATION) ---
function updateData(id, field, value) {
    saveState();
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;

    // Compatibilidad
    if (!scene.timingMode) scene.timingMode = scene.manualTiming ? 'manual' : 'auto';

    scene[field] = value;

    // 1. GESTIÓN DE DURACIÓN (Sin perder foco)
    if (field === 'duration') {
        // Pasamos a manual automáticamente
        scene.timingMode = 'manual';
        scene.manualTiming = true; // Compatibilidad

        // ACTUALIZACIÓN VISUAL DIRECTA (DOM) SIN RENDER()
        // Esto evita que se pierda el foco al escribir
        const card = document.querySelector(`.scene-card[data-id="${id}"]`);
        if (card) {
            const input = card.querySelector('input[type="number"]');
            const iconDiv = card.querySelector('.time-icon-wrapper'); // Necesitamos añadir esta clase en render
            const timeBox = card.querySelector('.time-box-wrapper');  // Necesitamos añadir esta clase en render

            if (input) {
                input.style.color = '#ff9100'; // Naranja
            }
            if (iconDiv) {
                iconDiv.innerHTML = '🔒';
                iconDiv.title = "Clic para Desbloquear (Volver a Auto)";
            }
            if (timeBox) {
                timeBox.style.borderColor = '#ff910066';
            }
        }
        calculateTotalTime();
        return; // IMPORTANTE: No llamamos a render()
    }

    // 2. AUTO-TIMING (Script)
    if (field === 'script' && scene.timingMode === 'auto') {
        const newDuration = estimateDuration(value);
        scene.duration = newDuration;

        const card = document.querySelector(`.scene-card[data-id="${id}"]`);
        if (card) {
            const durInput = card.querySelector('input[type="number"]');
            if (durInput) durInput.value = newDuration;
        }
        calculateTotalTime();
    }

    const noRenderFields = ['title', 'script', 'description'];
    if (noRenderFields.includes(field)) return;

    render();
}

// --- GESTIÓN DE IMÁGENES (IMAGE BANK) ---
function triggerImageUpload(id) { document.getElementById(`file-${id}`).click(); }

function handleImageSelect(input, id) {
    if (input.files && input.files[0]) processImage(input.files[0], id);
}

function handleImageDrop(e, id) {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files[0]) processImage(e.dataTransfer.files[0], id);
}

function processImage(file, sceneId) {
    const r = new FileReader();
    r.onload = (e) => {
        saveState();
        // 1. Generar ID único para la imagen
        const imgId = "img_" + createId();
        // 2. Guardar en Banco Global
        imageBank[imgId] = e.target.result;
        // 3. Vincular escena a ID de imagen
        const scene = scenes.find(s => s.id === sceneId);
        if (scene) {
            scene.imageId = imgId;
            scene.imageSrc = null; // Limpiar legado si existía
        }
        render(); // Aquí sí renderizamos para mostrar la imagen
    };
    r.readAsDataURL(file);
}

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
function saveColorConfig() { saveState(); presetColors = JSON.parse(JSON.stringify(tempColors)); document.getElementById('color-config-modal').style.display = 'none'; render(); }

function openSectionConfig() { tempSections = JSON.parse(JSON.stringify(presetSections)); renderConfigRows('section', 'section-rows-container'); document.getElementById('section-config-modal').style.display = 'flex'; }
function saveSectionConfig() { saveState(); presetSections = JSON.parse(JSON.stringify(tempSections)); document.getElementById('section-config-modal').style.display = 'none'; render(); }

function openSpeakerConfig() { tempSpeakers = JSON.parse(JSON.stringify(presetSpeakers)); renderConfigRows('speaker', 'speaker-rows-container'); document.getElementById('speaker-config-modal').style.display = 'flex'; }
function saveSpeakerConfig() { saveState(); presetSpeakers = JSON.parse(JSON.stringify(tempSpeakers)); document.getElementById('speaker-config-modal').style.display = 'none'; render(); }

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
function saveTechConfig() { saveState(); presetShots = JSON.parse(JSON.stringify(tempShots)); presetMoves = JSON.parse(JSON.stringify(tempMoves)); document.getElementById('tech-config-modal').style.display = 'none'; render(); }

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
function applyCustomColor(color) {
    if (!presetColors.some(p => p.code === color) && !recentColors.includes(color)) recentColors.push(color);
    applyColorToScene(color);
}
function applyColorToScene(color) {
    updateData(currentColorSceneId, 'color', color);
    document.getElementById('quick-color-modal').style.display = 'none';
}

function openQuickSectionModal(id) {
    currentSectionSceneId = id;
    document.getElementById('quick-section-list-container').innerHTML = presetSections.map(s => `
            <button class="color-grid-btn" onclick="applySectionToScene('${s.name}', '${s.code}')">
                <div class="swatch" style="background-color:${s.code}"></div><span>${s.name}</span>
            </button>`).join('');
    document.getElementById('quick-section-modal').style.display = 'flex';
}
function applySectionToScene(name, color) {
    saveState();
    const s = scenes.find(x => x.id === currentSectionSceneId);
    if (s) { s.sectionName = name; s.sectionColor = color; render(); }
    document.getElementById('quick-section-modal').style.display = 'none';
}

function openQuickSpeakerModal(id) {
    currentSpeakerSceneId = id;
    document.getElementById('quick-speaker-list-container').innerHTML = presetSpeakers.map(s => `
            <button class="color-grid-btn" onclick="applySpeakerToScene('${s.name}', '${s.code}')">
                <div class="swatch" style="background-color:${s.code}"></div><span>${s.name}</span>
            </button>`).join('');
    document.getElementById('quick-speaker-modal').style.display = 'flex';
}
function applySpeakerToScene(name, color) {
    saveState();
    const s = scenes.find(x => x.id === currentSpeakerSceneId);
    if (s) { s.speakerName = name; s.speakerColor = color; render(); }
    document.getElementById('quick-speaker-modal').style.display = 'none';
}

// --- RENDER CORE ---
function render() {
    const container = document.getElementById("timeline-container");
    container.innerHTML = "";

    scenes.forEach((scene, index) => {
        const card = document.createElement("div");
        const isSelected = (scene.id === selectedId);

        card.className = `scene-card ${scene.done ? 'completed' : ''} ${isSelected ? 'selected' : ''}`;
        card.dataset.id = scene.id;
        // card.draggable = true; // REMOVED: Now using handle

        card.style.borderTopColor = scene.color;
        card.style.background = `linear-gradient(180deg, ${scene.color}11 0%, #1e1e1e 20%)`;

        card.onclick = (e) => toggleSelection(e, scene.id);
        // card.ondragstart = (e) => handleDragStart(e, index); // REMOVED
        card.ondragover = (e) => e.preventDefault();
        card.ondrop = (e) => handleDrop(e, index);

        // Recuperar imagen del banco si existe
        let imgSrc = '';
        if (scene.imageId && imageBank[scene.imageId]) {
            imgSrc = imageBank[scene.imageId];
        } else if (scene.tempThumbnail) {
            // Soporte para miniaturas temporales (API/URL)
            imgSrc = scene.tempThumbnail;
        } else if (scene.imageSrc) {
            // Retrocompatibilidad temporal
            imgSrc = scene.imageSrc;
        }

        const colorName = (presetColors.find(c => c.code === scene.color) || {}).name || '';
        const spkColor = scene.speakerColor || 'transparent';
        const spkName = scene.speakerName || 'Voz';

        // --- ETIQUETA INTELIGENTE V3 (Full Width + Ellipsis Real) ---

        // 1. Detectar tipo y color
        let linkColor = '#888'; // Default
        let fileType = '';      // Para data-type en la tarjeta
        if (scene.linkedFile) {
            const _ext = scene.linkedFile.split('.').pop().toLowerCase();
            if (['mp4', 'mov', 'avi', 'mkv', 'mxf', 'webm'].includes(_ext)) { linkColor = '#a5d6a7'; fileType = 'video'; }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(_ext)) { linkColor = '#81d4fa'; fileType = 'image'; }
            else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(_ext)) { linkColor = '#ce93d8'; fileType = 'audio'; }
        }
        // Aplicar data-type a la tarjeta para que CSS pueda colorear el nombre
        if (fileType) card.dataset.type = fileType;
        else delete card.dataset.type;
        const safeFileName = scene.linkedFile ? scene.linkedFile.replace(/'/g, "\\'") : "";
        const shortFileName = scene.linkedFile ? scene.linkedFile.split('/').pop() : "";
        const safeShortFileName = shortFileName.replace(/'/g, "\\'");

        // 2. Contenido condicional
        let labelInner = '';

        if (scene.linkedFile) {
            // MODO CON ARCHIVO: Flexbox real para que el texto ocupe todo el espacio restante

            // --- TIME BADGE LOGIC ---
            let timeBadge = '';
            if (scene.startTime && scene.startTime > 0) {
                const timeStr = new Date(scene.startTime * 1000).toISOString().substr(11, 8);
                timeBadge = `<div class="time-badge" style="color:#ffb74d; font-size:0.65rem; margin-right:6px; font-weight:bold; white-space:nowrap;">⏱ ${timeStr}</div>`;
            }

            labelInner = `
                    <div style="display:flex; align-items:center; gap:4px; width:100%; cursor:pointer;"
                         title="Clic para copiar: ${shortFileName}" 
                         onclick="copyLinkedText('${safeShortFileName}')">
                        
                        <span style="color:${linkColor}; flex-shrink:0;">🔗</span>
                        
                        <span class="linked-file-name" style="
                            color:${linkColor}; 
                            white-space:nowrap; 
                            overflow:hidden; 
                            text-overflow:ellipsis; 
                            flex:1;         
                            min-width:0;    
                        ">
                            ${scene.linkedFile}
                        </span>
                        ${timeBadge}
                    </div>
                `;
        } else {
            // MODO VACÍO: Espacio reservado invisible
            labelInner = `<span style="opacity:0; user-select:none;">&nbsp;</span>`;
        }

        // ---------------------------------------------------------
        const mode = scene.timingMode || (scene.manualTiming ? 'manual' : 'auto');
        let timeColor = '#e0e0e0';
        let timeIcon = '✨';
        let timeTitle = 'Automático (Basado en guion)';

        if (mode === 'manual') {
            timeColor = '#ff9100'; timeIcon = '🔒'; timeTitle = 'Manual (Bloqueado)';
        } else if (mode === 'video') {
            timeColor = '#00e676'; timeIcon = '📽️'; timeTitle = 'Sincronizado con Vídeo';
        }
        // ---------------------------------------------------------

        // 3. Contenedor Principal (Bloque fijo de altura)
        const linkedLabel = `
                <div style="
                    height: 16px; 
                    line-height: 16px;
                    margin-top: 2px; 
                    font-family:'Consolas', monospace; 
                    font-size:0.65rem; 
                    width: 100%; /* Asegura que llegue hasta el borde derecho (debajo de la X) */
                ">
                    ${labelInner}
                </div>
            `;

        card.innerHTML = `
                ${colorName ? `<div class="scene-type-tab" style="background-color:${scene.color}">${colorName}</div>` : ''}
                
                <div class="card-header">
                    <div class="header-left" style="flex-direction:column; align-items:flex-start; gap:0; width: 100%;">
                        <div style="display:flex; align-items:center; width:100%; justify-content: space-between;">
                             <div style="display:flex; align-items:center; gap:8px; flex:1;">
                                <span class="drag-handle" draggable="true" ondragstart="handleDragStart(event, ${index})">⋮⋮</span>
                                <span class="scene-number">#${index + 1}</span>
                                <input type="text" class="scene-title-input" 
                                       placeholder="Título..." 
                                       value="${scene.title || ''}" 
                                       oninput="updateData('${scene.id}', 'title', this.value)">
                             </div>
                             
                             <div class="card-controls">
                                <div class="color-picker-trigger" style="background-color:${scene.color}" 
                                     onclick="openQuickColorModal('${scene.id}')" title="Color"></div>
                                <button class="btn-danger" style="padding:2px 8px; border-radius:4px;" onclick="deleteScene('${scene.id}')">✕</button>
                             </div>
                        </div>
                        ${linkedLabel}
                    </div>
                </div>

                <div class="drop-zone ${scene.linkedFile && !/\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile) ? 'has-image' : (imgSrc ? 'has-image' : '')}" 
                     ondragover="event.preventDefault()" ondrop="handleImageDrop(event, '${scene.id}')">
                    ${(scene.linkedFile && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile)) ? `
                        <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#1a1a1a;">
                             <div style="font-size:1.8rem; margin-bottom:0;">\ud83c\udfb5</div>
                        </div>
                        <img src="" id="img-${scene.id}" style="display:none">
                    ` : (scene.linkedFile && /\.(mp4|mov|mxf|avi|webm|jpg|jpeg|png|webp)$/i.test(scene.linkedFile)) ? `
                        <img src="http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(scene.linkedFile)}&folder=${encodeURIComponent(document.getElementById('media-path-input')?.value || '')}" 
                             id="img-${scene.id}" 
                             style="width:100%; height:100%; object-fit:cover;"
                             onerror="this.style.display='none'; this.previousElementSibling && (this.previousElementSibling.style.display='flex');">
                    ` : `
                        <span>Imagen</span>
                        <img src="${imgSrc}" id="img-${scene.id}">
                    `}
                    <input type="file" id="file-${scene.id}" class="hidden-file-input" accept="image/*" onchange="handleImageSelect(this, '${scene.id}')">
                </div>

                <div class="full-row" style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                    
                    <div class="time-box-wrapper" style="
                        display:flex; align-items:center; 
                        background:#222; border:1px solid #444; border-radius:4px; 
                        padding:0 8px; 
                        height: 28px; 
                        box-sizing: border-box;
                        border-color: ${timeColor === '#e0e0e0' ? '#444' : timeColor + '66'}; 
                    ">
                        <span style="font-size:0.9rem; margin-right:5px; opacity:0.7;">⏱</span>
                        
                        <input type="number" value="${scene.duration}" min="0" step="0.1" 
                               style="
                                   width:50px; 
                                   text-align:center; border:none; background:transparent; 
                                   color: ${timeColor}; 
                                   font-weight: normal; 
                                   font-size: 0.85rem; 
                                   padding:0;
                                   font-family: inherit;
                               "
                               oninput="updateData('${scene.id}', 'duration', this.value)"
                               title="${timeTitle}">
                        
                        <span style="font-size:0.75rem; color:#666; margin-left:2px;">s</span>
                        
                        <div class="time-icon-wrapper" 
                             onclick="toggleTimingMode('${scene.id}')" 
                             style="cursor:pointer; font-size:0.75rem; margin-left:6px; opacity:0.8; display:flex; align-items:center;"
                             title="${mode === 'auto' ? 'Clic para Bloquear (Manual)' : 'Clic para Desbloquear (Volver a Auto)'}">
                            ${timeIcon}
                        </div>
                    </div>

                    <button onclick="openTimeMenu(event, '${scene.id}')" title="Herramientas de Tiempo" 
                            style="height: 28px; width: 28px; padding: 0; display: flex; align-items: center; justify-content: center; background: #222; border: 1px solid #444; border-radius: 4px; font-size: 0.9rem; cursor: pointer;">
                        ⚡
                    </button>

                    <div class="speaker-badge" onclick="openQuickSpeakerModal('${scene.id}')" style="flex-grow:0; margin-left:auto; width:135px;">
                        <div class="speaker-dot" style="background-color: ${spkColor}"></div>
                        <span class="speaker-name">${spkName}</span>
                    </div>

                    <button class="check-btn" onclick="toggleCheck('${scene.id}')" title="Listo">${scene.done ? '✓' : ''}</button>
                </div>
                
                <div class="tech-row">
                    <select onchange="updateData('${scene.id}', 'shot', this.value)">${presetShots.map(t => `<option ${t === scene.shot ? 'selected' : ''}>${t}</option>`).join('')}</select>
                    <select onchange="updateData('${scene.id}', 'move', this.value)">${presetMoves.map(m => `<option ${m === scene.move ? 'selected' : ''}>${m}</option>`).join('')}</select>
                </div>

                <textarea class="desc-textarea" placeholder="Descripción breve..." 
                          oninput="updateData('${scene.id}', 'description', this.value)">${scene.description}</textarea>

                <div class="script-area-container">
                    <textarea class="script-preview" placeholder="Diálogo..." 
                              oninput="updateData('${scene.id}', 'script', this.value)">${scene.script}</textarea>
                    <button class="expand-btn" onclick="openModal('${scene.id}')">⤢</button>
                </div>

                <div class="move-controls" style="display:flex; justify-content: space-between; align-items: center; margin-top: 10px; margin-bottom: 10px;">
                    <div class="move-group">
                        <button ${index === 0 ? 'disabled' : ''} onclick="moveScene(${index}, -1)">←</button>
                        <button class="dup-btn" onclick="duplicateScene(${index}, 0)">+</button>
                    </div>

                    <div style="display:flex; gap:5px;">
                        <button onclick="selectedId='${scene.id}'; render(); openQuickFileModal('${scene.id}')" title="Vincular Archivo Local" 
                                style="background:#222; border:1px solid #444; color:#ccc; width:30px; height:28px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;">
                            🔗
                        </button>
                    </div>

                    <div class="move-group">
                        <button class="dup-btn" onclick="duplicateScene(${index}, 1)">+</button>
                        <button ${index === scenes.length - 1 ? 'disabled' : ''} onclick="moveScene(${index}, 1)">→</button>
                    </div>
                </div>

                <div class="section-bar" style="background-color: ${scene.sectionColor || 'transparent'}; border-radius: 0 0 4px 4px; margin-top:0;" onclick="openQuickSectionModal('${scene.id}')">
                    <span class="section-label" style="color: ${scene.sectionName === 'SECCIÓN' ? '#666' : '#222'}">${scene.sectionName}</span>
                </div>
            `;
        container.appendChild(card);
    });
    document.getElementById("scene-count").innerText = scenes.length;
    calculateTotalTime();
    updateLayoutWidth();
    if (isTimelineOutlineOpen) renderTimelineOutline();
}

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

function toggleCheck(id) {
    const s = scenes.find(x => x.id === id);
    if (s) { saveState(); s.done = !s.done; render(); }
}

function moveScene(index, direction) {
    if ((direction === -1 && index > 0) || (direction === 1 && index < scenes.length - 1)) {
        saveState();
        const targetIndex = index + direction;
        [scenes[index], scenes[targetIndex]] = [scenes[targetIndex], scenes[index]];
        render();
    }
}

// Drag & Drop
let dragSrcIndex = null;
function handleDragStart(e, index) {
    dragSrcIndex = index;
    e.dataTransfer.effectAllowed = 'move';

    // Set ghost image to the whole card, not just the handle
    const card = e.target.closest('.scene-card');
    if (card) {
        e.dataTransfer.setDragImage(card, 0, 0);
        card.classList.add('dragging');
    }
}
function handleDrop(e, dropIndex) {
    e.stopPropagation();
    if (dragSrcIndex !== null && dragSrcIndex !== dropIndex) {
        saveState();
        const i = scenes.splice(dragSrcIndex, 1)[0];
        scenes.splice(dropIndex, 0, i);
        render();
    }
    return false;
}

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

// --- GUARDADO (CON PERSISTENCIA DE RUTA) ---
function saveProject() {
    // 1. Recoger configuración de Exportación (NUEVO)
    // Usamos el operador || '' por seguridad si el elemento no existiera
    const mediaPathVal = document.getElementById('media-path-input') ? document.getElementById('media-path-input').value : '';
    const mediaExtVal = document.getElementById('media-ext-input') ? document.getElementById('media-ext-input').value : '.mp4';

    // 2. Filtrar: Solo guardar imágenes que realmente se usen
    // (Lógica original mantenida intacta)
    let usedImages = {};
    scenes.forEach(s => {
        if (s.imageId && imageBank[s.imageId]) {
            usedImages[s.imageId] = imageBank[s.imageId];
        }
    });

    const projectData = {
        version: "6.6", // Actualizamos versión para control interno
        projectTitle: projectTitle,
        scenes: scenes,
        images: usedImages,
        configs: {
            colors: presetColors,
            sections: presetSections,
            speakers: presetSpeakers,
            shots: presetShots,
            moves: presetMoves
        },
        // NUEVO BLOQUE: Guardamos la ruta y extensión
        exportSettings: {
            mediaPath: mediaPathVal,
            mediaExt: mediaExtVal
        },
        recentColors: recentColors,
        projectChecklist: projectChecklist
    };

    // SANITIZAR NOMBRE DE ARCHIVO
    // Convertimos "Mi Vídeo Genial" en "Mi_Video_Genial.json"
    const safeName = projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "aia_project";

    const d = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData));
    const a = document.createElement('a'); a.href = d;
    a.download = safeName + ".json"; // <--- USAMOS EL NOMBRE AQUÍ
    document.body.appendChild(a); a.click(); a.remove();
}

// --- CARGA (CON RECUPERACIÓN DE RUTA) ---
function loadProject(input) {
    const f = input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            clearBlobCache(); // Liberar URLs de Blob del proyecto anterior

            // Carga compatible de escenas
            scenes = Array.isArray(data) ? data : (data.scenes || []);

            // Hydrate Image Bank
            if (data.images) {
                imageBank = data.images;
            }

            // Carga de Presets (Configuraciones)
            if (data.configs) {
                presetColors = data.configs.colors || presetColors;
                presetSections = data.configs.sections || presetSections;
                presetSpeakers = data.configs.speakers || presetSpeakers;
                presetShots = data.configs.shots || presetShots;
                presetMoves = data.configs.moves || presetMoves;
            } else {
                // Fallback v4.2 para archivos antiguos
                if (data.presetColors) presetColors = data.presetColors;
                if (data.presetSections) presetSections = data.presetSections;
            }

            // RECUPERAR TÍTULO
            if (data.projectTitle) {
                projectTitle = data.projectTitle;
                document.getElementById('project-title-input').value = projectTitle;
                document.title = projectTitle + " - AIA Studio";
            }

            // NUEVO BLOQUE: Restaurar Ruta y Extensión de DaVinci
            if (data.exportSettings) {
                const pathInput = document.getElementById('media-path-input');
                const extInput = document.getElementById('media-ext-input');

                if (pathInput && data.exportSettings.mediaPath) {
                    pathInput.value = data.exportSettings.mediaPath;
                }
                if (extInput && data.exportSettings.mediaExt) {
                    extInput.value = data.exportSettings.mediaExt;
                }
            }

            if (data.projectChecklist) projectChecklist = data.projectChecklist;
            if (data.recentColors) recentColors = data.recentColors;

            undoStack = []; // Limpiar historial
            render();
            renderChecklist();
            fitAll();

            // Feedback visual opcional
            showToast("Proyecto cargado correctamente");

        } catch (err) { console.error(err); showToast("❌ Error al leer el archivo JSON."); }
    };
    r.readAsText(f);
    // Resetear el input para permitir cargar el mismo archivo dos veces si hace falta
    input.value = '';
}

// --- MOTOR DE PERSISTENCIA (LOCALSTORAGE) ---
function triggerAutoSave() {
    // Debounce: Reinicia el temporizador si el usuario sigue escribiendo
    if (autosaveTimer) clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(() => {
        saveProjectSafe();
    }, AUTOSAVE_DELAY);
}

// --- AUTOSAVE LIGERO (SOLO TEXTO/ESTRUCTURA) ---
// --- SAFE STORAGE PROTOCOL (ATOMIC WRITES & SLOT ROTATION) ---
function saveProjectSafe() {
    // 1. Validar integridad de datos antes de guardar
    if (!scenes || !Array.isArray(scenes)) {
        console.error("❌ Abortando AutoSave: Estructura crítica corrupta o nula.");
        return;
    }

    // Preparamos payload (Siempre sin imágenes para ser ligero)
    const state = {
        version: "5.0", // SafeStorage Version
        timestamp: Date.now(),
        projectTitle: projectTitle,
        scenes: scenes,
        images: {}, // No guardamos imágenes en autosave para evitar QuotaExceeded
        zoom: currentZoom,
        configs: {
            colors: presetColors,
            sections: presetSections,
            speakers: presetSpeakers,
            shots: presetShots,
            moves: presetMoves
        },
        projectChecklist: projectChecklist,
        recentColors: recentColors,
        // Guardamos también settings de exportación si existen
        exportSettings: {
            mediaPath: document.getElementById('media-path-input') ? document.getElementById('media-path-input').value : '',
            mediaExt: document.getElementById('media-ext-input') ? document.getElementById('media-ext-input').value : '.mp4'
        }
    };

    try {
        const json = JSON.stringify(state);

        // 2. Leer Metadata para decidir Slot
        let meta = { activeSlot: null, timestamp: 0 };
        try {
            const rawMeta = localStorage.getItem(AUTOSAVE_META);
            if (rawMeta) meta = JSON.parse(rawMeta);
        } catch (e) {
            console.warn("⚠️ Metadata corrupta, reiniciando...");
        }

        // 3. Determinar Target Slot (Rotation)
        // Si A es el activo, escribimos en B. Si B es activo, escribimos en A.
        // Si ninguno es activo (primer uso), empezamos por A.
        const targetSlot = (meta.activeSlot === 'A') ? 'B' : 'A';
        const targetKey = (targetSlot === 'A') ? AUTOSAVE_SLOT_A : AUTOSAVE_SLOT_B;

        // 4. Escritura Atómica (Intento)
        localStorage.setItem(targetKey, json);

        // 5. Actualizar Metadata (Solo si la escritura anterior no falló)
        // Esto confirma que el slot target ahora es válido y el más reciente.
        const newMeta = {
            activeSlot: targetSlot,
            timestamp: Date.now(),
            valid: true
        };
        localStorage.setItem(AUTOSAVE_META, JSON.stringify(newMeta));

        // 6. [INDEXEDDB] Guardar Imágenes en background (No bloqueante)
        if (Object.keys(imageBank).length > 0) {
            ImageDB.saveAll(imageBank).catch(e => console.warn("[SafeStorage] ImageDB Save Error:", e));
        }

        // Limpieza de UI errores previos
        const toast = document.getElementById("toast");
        if (toast.classList.contains("show") && (toast.innerText.includes("Error") || toast.innerText.includes("Límite"))) {
            toast.className = "toast";
        }

        // console.log(`💾 AutoSave Secure: Slot ${targetSlot} Updated at ${new Date().toLocaleTimeString()}`);

    } catch (e) {
        console.error("🚨 Critical Save Error (Posible QuotaExceeded):", e);
        // Aquí podríamos intentar limpiar slots antiguos si fuera crítico,
        // pero en el patrón A/B simplemente fallamos el turno y el slot anterior (safe) queda vivo.
        showToast("⚠️ Error de guardado automático (Espacio lleno)");
    }
}

// --- RECOVERY SYSTEM (AUTO-REPAIR) ---
function loadFromLocal() { // Alias para mantener ciclo de vida init
    return loadProjectFromAutoSave();
}

function loadProjectFromAutoSave() {
    let loadedData = null;
    let loadedSlot = null;

    // 1. Intentar leer Metadata
    try {
        const rawMeta = localStorage.getItem(AUTOSAVE_META);
        if (rawMeta) {
            const meta = JSON.parse(rawMeta);
            if (meta.activeSlot) {
                // Intentar cargar el slot activo indicado
                const targetKey = (meta.activeSlot === 'A') ? AUTOSAVE_SLOT_A : AUTOSAVE_SLOT_B;
                const rawData = localStorage.getItem(targetKey);
                if (rawData) {
                    try {
                        loadedData = JSON.parse(rawData);
                        loadedSlot = meta.activeSlot;
                    } catch (parseErr) {
                        console.error(`💥 Slot ${meta.activeSlot} corrupto (JSON Error). Intentando switch...`);
                    }
                }
            }
        }
    } catch (e) { console.error("Error leyendo metadata", e); }

    // 2. Fallback: Si el slot activo falló o no existe metadata, probar el otro slot
    if (!loadedData) {
        // Probar A
        let rawA = localStorage.getItem(AUTOSAVE_SLOT_A);
        if (rawA) {
            try {
                loadedData = JSON.parse(rawA);
                loadedSlot = 'A';
                console.warn("⚠️ Recuperado desde Slot A (Fallback)");
            } catch (e) { }
        }
    }
    if (!loadedData) {
        // Probar B
        let rawB = localStorage.getItem(AUTOSAVE_SLOT_B);
        if (rawB) {
            try {
                loadedData = JSON.parse(rawB);
                loadedSlot = 'B';
                console.warn("⚠️ Recuperado desde Slot B (Fallback)");
            } catch (e) { }
        }
    }

    // 3. Last Resort: Probar Legacy Key (v4.2)
    if (!loadedData) {
        const legacy = localStorage.getItem(AUTOSAVE_KEY);
        if (legacy) {
            try {
                loadedData = JSON.parse(legacy);
                loadedSlot = 'LEGACY';
                console.warn("⚠️ Recuperado desde Legacy (Migrando...)");
            } catch (e) { }
        }
    }

    // --- APPLY DATA ---
    if (!loadedData) return false;

    try {
        // Validar estructura mínima
        if (!loadedData.scenes) throw new Error("Datos sin escenas");

        scenes = loadedData.scenes;

        // Restaurar Propiedades
        if (loadedData.projectTitle) {
            projectTitle = loadedData.projectTitle;
            const titleInput = document.getElementById('project-title-input');
            if (titleInput) titleInput.value = projectTitle;
            document.title = projectTitle + " - AIA Studio";
        }

        if (loadedData.zoom) currentZoom = loadedData.zoom;
        if (loadedData.images) imageBank = loadedData.images; // Generalmente vacío en autosave

        // [INDEXEDDB] Restauración Asíncrona de Imágenes
        ImageDB.getAll().then(dbImages => {
            const count = Object.keys(dbImages).length;
            if (count > 0) {
                imageBank = { ...imageBank, ...dbImages };
                console.log(`[SafeStorage] Images restored from IndexedDB: ${count} items`);
                // Re-renderizar si es necesario (solo si hay imágenes que no estaban)
                render();
            }
        });

        // Configs
        if (loadedData.configs) {
            presetColors = loadedData.configs.colors || presetColors;
            presetSections = loadedData.configs.sections || presetSections;
            presetSpeakers = loadedData.configs.speakers || presetSpeakers;
            presetShots = loadedData.configs.shots || presetShots;
            presetMoves = loadedData.configs.moves || presetMoves;
        }

        // Export Settings Recovery (NUEVO)
        if (loadedData.exportSettings) {
            const pathInput = document.getElementById('media-path-input');
            const extInput = document.getElementById('media-ext-input');
            if (pathInput && loadedData.exportSettings.mediaPath) pathInput.value = loadedData.exportSettings.mediaPath;
            if (extInput && loadedData.exportSettings.mediaExt) extInput.value = loadedData.exportSettings.mediaExt;
        }

        if (loadedData.projectChecklist) projectChecklist = loadedData.projectChecklist;
        if (loadedData.recentColors) recentColors = loadedData.recentColors;

        console.log(`✅ Proyecto restaurado correctamente. Fuente: [SLOT ${loadedSlot}]`);
        return true;

    } catch (e) {
        console.error("❌ Error aplicando datos recuperados:", e);
        return false;
    }
}

// --- MANUAL BACKUP (CTRL+S) ---
function manualBackup() {
    saveProjectSafe(); // Primero aseguramos autosave reciente

    // Generar volcado inmediato
    const safeName = projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "aia_project";
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `project_backup_${safeName}_${timestamp}.json`;

    // Reusamos lógica de saveProject pero forzando descarga
    // Clonamos saveProject simplificado para no duplicar código en exceso o llamamos a saveProject() directamente?
    // saveProject() usa el nombre limpio base. Manual Backup debería ser explícito con timestamp.

    // Vamos a crear un payload temporal con timestamp
    const dataPayload = {
        backup_type: "MANUAL_CTRL_S",
        timestamp: Date.now(),
        projectTitle: projectTitle,
        scenes: scenes,
        images: imageBank, // AQUÍ SÍ guardamos imágenes (Es backup manual explícito)
        configs: {
            colors: presetColors,
            sections: presetSections,
            speakers: presetSpeakers,
            shots: presetShots,
            moves: presetMoves
        },
        exportSettings: {
            mediaPath: document.getElementById('media-path-input') ? document.getElementById('media-path-input').value : '',
            mediaExt: document.getElementById('media-ext-input') ? document.getElementById('media-ext-input').value : '.mp4'
        },
        projectChecklist: projectChecklist,
        recentColors: recentColors
    };

    const d = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataPayload));
    const a = document.createElement('a');
    a.href = d;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("✅ Proyecto guardado y descargado.");
}

async function resetProject() {
    const { confirmed } = await sysDialog({
        icon: '⚠️',
        title: '¿Reiniciar Proyecto?',
        message: '¿Estás seguro de que quieres BORRAR todo el proyecto y empezar de cero?<br><br>Esta acción eliminará el autoguardado y no se puede deshacer.',
        type: 'confirm',
        confirmLabel: 'Borrar todo',
        confirmClass: 'btn-danger'
    });

    if (confirmed) {
        clearBlobCache(); // Liberar URLs de Blob antes de limpiar el proyecto
        // 1. Limpiar SafeStorage Slots & Metadata
        localStorage.removeItem(AUTOSAVE_SLOT_A);
        localStorage.removeItem(AUTOSAVE_SLOT_B);
        localStorage.removeItem(AUTOSAVE_META);

        // 2. Limpiar Legacy (por si acaso)
        localStorage.removeItem(AUTOSAVE_KEY);

        // 3. Limpiar IndexedDB
        await ImageDB.clear();

        // 3. Reiniciar aplicación
        location.reload();
    }
}

// =============================================================
// EXPORT SYSTEM V3 — Unified multi-speaker modal
// =============================================================

// -- Pure content generators (no side-effects) ----------------

function generateTXTContent(filteredScenes) {
    let t = '';
    filteredScenes.forEach(s => {
        const speaker = (s.speakerName && s.speakerName !== 'Voz')
            ? s.speakerName.toUpperCase() : 'HABLANTES';
        t += `${speaker}:\n${s.script || ''}\n\n`;
    });
    return t;
}

function generateMDContent(filteredScenes, speakerLabel) {
    let md = `# GUION DE VIDEO\nGenerado con AIA Studio\n`;
    if (speakerLabel) md += `*Filtrado por: **${speakerLabel}***\n`;
    md += '\n';
    filteredScenes.forEach((s, i) => {
        const sectionHeader = s.sectionName !== 'SECCI\u00d3N' ? ` [${s.sectionName}]` : '';
        const speakerHeader = s.speakerName && s.speakerName !== 'Voz'
            ? `**\ud83d\udde3\ufe0f ${s.speakerName}**\n` : '';
        md += `### Escena ${i + 1}${sectionHeader} (${s.duration}s) ${s.done ? '\u2705' : ''}\n`;
        md += `**Visual:** ${s.shot} | ${s.move}\n**Descripci\u00f3n:** ${s.description}\n\n`;
        md += `**Di\u00e1logo:**\n${speakerHeader}${s.script || ''}\n\n---\n\n`;
    });
    return md;
}

// -- Blob download helper -------------------------------------
function _downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
}

// -- Checkbox row builder -------------------------------------
function _makeCheckRow(label, id, checked) {
    const row = document.createElement('label');
    row.htmlFor = id;
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid transparent;transition:background 0.12s,border-color 0.12s;color:#d0d0d0;font-size:0.875rem;';
    row.onmouseenter = () => { row.style.background = '#252525'; row.style.borderColor = '#3a3a3a'; };
    row.onmouseleave = () => { row.style.background = ''; row.style.borderColor = 'transparent'; };
    const ckb = document.createElement('input');
    ckb.type = 'checkbox'; ckb.id = id; ckb.checked = checked;
    ckb.style.cssText = 'width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;';
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(ckb); row.appendChild(span);
    return row;
}

// -- Unified modal entry-point ---------------------------------
function openExportModal(format) {
    const activeSpeakers = [...new Set(scenes.map(s => s.speakerName).filter(Boolean))];

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(5px);';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1a1a1a;border:1px solid #3a3a3a;border-radius:12px;padding:26px 30px;min-width:300px;max-width:400px;width:92%;min-height:480px;max-height:85vh;box-shadow:0 0 50px rgba(0,0,0,0.9);display:flex;flex-direction:column;gap:0;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:18px;';
    const iconEl = document.createElement('span');
    iconEl.textContent = format === 'txt' ? '\ud83d\udcc4' : '\u2b07\ufe0f';
    iconEl.style.fontSize = '1.3rem';
    const hTitle = document.createElement('div');
    const displayFormat = format === 'txt' ? 'Dialogo (TXT)' : 'Guion Técnico (MD)';
    hTitle.innerHTML = `<span style="font-size:1rem;font-weight:700;color:#fff;">Exportar ${displayFormat}</span><br><span style="font-size:0.75rem;color:#666;">Selecciona los hablantes a incluir</span>`;
    header.appendChild(iconEl); header.appendChild(hTitle);
    box.appendChild(header);

    // Checkbox list
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;margin-bottom:20px;padding-right:4px;';

    const allRow = _makeCheckRow('\ud83d\udccb Todos los hablantes', 'ckb-todos', true);
    const allCkb = allRow.querySelector('input');
    listWrap.appendChild(allRow);

    const speakerCkbs = activeSpeakers.map(spk => {
        const row = _makeCheckRow('\ud83c\udf99\ufe0f ' + spk, 'ckb-' + spk, true);
        const ckb = row.querySelector('input');
        ckb.dataset.speaker = spk;
        ckb.addEventListener('change', () => {
            if (!ckb.checked) allCkb.checked = false;
            else if (speakerCkbs.every(c => c.checked)) allCkb.checked = true;
        });
        listWrap.appendChild(row);
        return ckb;
    });

    allCkb.addEventListener('change', () => {
        speakerCkbs.forEach(c => c.checked = allCkb.checked);
    });

    box.appendChild(listWrap);

    // Button row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';

    const destroy = () => document.body.removeChild(overlay);

    const getFiltered = () => {
        if (allCkb.checked) return { scenes, label: null, suffix: '' };
        const selected = speakerCkbs.filter(c => c.checked).map(c => c.dataset.speaker);
        if (!selected.length) { showToast('\u26a0\ufe0f Selecciona al menos un hablante'); return null; }
        return {
            scenes: scenes.filter(s => selected.includes(s.speakerName)),
            label: selected.join(', '),
            suffix: '_' + selected.map(s => s.replace(/\s+/g, '_')).join('-')
        };
    };

    const mkBtn = (html, css, handler) => {
        const b = document.createElement('button');
        b.innerHTML = html;
        b.style.cssText = 'padding:8px 18px;border-radius:6px;font-weight:600;cursor:pointer;font-size:0.875rem;' + css;
        b.onclick = handler;
        return b;
    };

    // Cancelar
    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = 'Cancelar';
    cancelBtn.className = 'btn-danger';
    cancelBtn.onclick = destroy;
    btnRow.appendChild(cancelBtn);

    // Copiar
    btnRow.appendChild(mkBtn('\ud83d\udccb\u00a0Copiar', 'background:#2a2a2a;border:1px solid #555;color:#e0e0e0;', () => {
        const r = getFiltered(); if (!r) return;
        const content = format === 'txt' ? generateTXTContent(r.scenes) : generateMDContent(r.scenes, r.label);
        navigator.clipboard.writeText(content).then(() => { showToast('\u2705 Copiado al portapapeles'); destroy(); });
    }));

    // Exportar
    const expBtn = mkBtn('\u2b07\ufe0f\u00a0Exportar', 'background:var(--accent);border:none;color:#fff;', () => {
        const r = getFiltered(); if (!r) return;
        const ext = format === 'txt' ? 'txt' : 'md';
        const mime = format === 'txt' ? 'text/plain' : 'text/markdown';
        const content = format === 'txt' ? generateTXTContent(r.scenes) : generateMDContent(r.scenes, r.label);
        _downloadBlob(content, `guion${r.suffix}.${ext}`, mime);
        showToast('\u2705 Archivo descargado');
        destroy();
    });
    btnRow.appendChild(expBtn);

    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.onclick = e => { if (e.target === overlay) destroy(); };
    document.body.appendChild(overlay);
}



// --- DAVINCI RESOLVE AUTO-CONFORM V7.0 (FINAL PRO) ---
// Soporta: Rutas Relativas, In-Points precisos (24fps) y Nombre de Proyecto dinámico.
function exportDaVinci() {
    const width = 3840; const height = 2160;
    const fps = 24;
    const frameBase = 24; // Base pura para cálculos de frame exactos

    // Helpers matemáticos locales
    const toFrames = (seconds) => Math.round((seconds || 0) * fps);
    const fmt = (frames) => `${frames}/${frameBase}s`;

    // 1. CAPTURAR NOMBRE DEL PROYECTO
    // Intenta buscar el input del título. Si no existe, usa un genérico.
    // ASEGÚRATE de que tu input en el HTML tenga id="project-title-input" o cambia esta línea:
    let projectNameElement = document.getElementById('project-title-input') || document.getElementById('project-title');
    let projectName = projectNameElement ? projectNameElement.value.trim() : "";
    if (!projectName) projectName = `AIA_Sequence_${Date.now()}`;

    // 2. OBTENER RUTA BASE (MEDIA ROOT)
    let mediaPath = document.getElementById('media-path-input').value.trim();
    const mediaExt = document.getElementById('media-ext-input').value.trim();

    let useRealMedia = false;
    if (mediaPath.length > 0) {
        useRealMedia = true;
        mediaPath = mediaPath.replace(/\\/g, '/');
        if (!mediaPath.endsWith('/')) mediaPath += '/';
        if (!mediaPath.startsWith('file:///')) {
            if (mediaPath.startsWith('/')) mediaPath = 'file://' + mediaPath;
            else mediaPath = 'file:///' + mediaPath;
        }
    }

    // CABECERA XML (FCPXML 1.9)
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
    <resources>
        <format id="r1" name="FFVideoFormat${height}p${fps}" frameDuration="1/${frameBase}s" width="${width}" height="${height}" colorSpace="1-1-1 (Rec. 709)"/>
`;

    // 3. GENERACIÓN DE RECURSOS (ASSETS)
    if (!useRealMedia) {
        xml += `        <asset id="r2" name="AIA_Placeholder" src="file:///dummy/path/placeholder.mov" start="0s" duration="0s" hasVideo="1" format="r1" />\n`;
    } else {
        scenes.forEach((s, i) => {
            // Lógica v7.0: Si hay ruta relativa (linkedFile), úsala. Si no, fallback al sistema antiguo.
            let filename = (s.linkedFile && s.linkedFile.length > 0) ? s.linkedFile : `${i + 1}${mediaExt}`;

            // Construir ruta absoluta para DaVinci
            const fullPath = `${mediaPath}${filename}`;

            const safeName = filename.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safePath = fullPath.replace(/&/g, '&amp;');

            const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename);
            const hasAudioVal = isImage ? "0" : "1";

            // Duración "infinita" en el asset para evitar problemas de lectura
            xml += `        <asset id="asset_${i}" name="${safeName}" src="${safePath}" start="0s" duration="3600s" hasVideo="1" hasAudio="${hasAudioVal}" />\n`;
        });
    }

    xml += `    </resources>
    <library>
        <event name="AIA Import">
            <project name="${projectName}">
                <sequence format="r1">
                    <spine>
`;

    // 4. LÍNEA DE TIEMPO (PRECISIÓN DE FRAMES)
    let currentOffsetFrames = 0; // Cursor del timeline global

    scenes.forEach((s, i) => {
        // DATOS DEL CLIP
        const durationSec = Math.max(1, s.duration || 2);
        const inPointSec = s.startTime || 0; // Punto de entrada (Trim)

        // CÁLCULOS
        const clipDurationFrames = toFrames(durationSec);
        const clipStartFrames = toFrames(inPointSec); // Frame exacto de inicio en el bruto

        // FORMATOS STRING
        const durationString = fmt(clipDurationFrames);
        const offsetString = fmt(currentOffsetFrames);
        const startString = fmt(clipStartFrames); // EL DATO CLAVE

        // LIMPIEZA DE TEXTOS
        const cleanScript = (s.script || "").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const cleanTitle = (s.title || `Escena ${i + 1}`).replace(/&/g, '&amp;').replace(/</g, '&lt;');

        let refId = useRealMedia ? `asset_${i}` : "r2";
        let rawFilename = useRealMedia ? ((s.linkedFile && s.linkedFile.length > 0) ? s.linkedFile : `${i + 1}${mediaExt}`) : cleanTitle;
        let clipName = rawFilename.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(rawFilename);

        // --- ESTRUCTURA DE ANIDAMIENTO (WRAPPED NESTING) ---
        // Vital para mantener el sync Audio/Video en DaVinci Resolve

        // 1. CLIP (CONTENEDOR)
        xml += `                        <clip name="${clipName}" offset="${offsetString}" duration="${durationString}" start="0s">
            `;

        // 2. VIDEO (CONTENIDO) - Aquí aplicamos el In-Point (startString)
        xml += `                <video name="${clipName}" offset="0s" duration="${durationString}" start="${startString}" ref="${refId}">`;

        // 3. AUDIO (SOMBRA) - Debe coincidir exactamente con el video
        if (useRealMedia && !isImage) {
            xml += `
                                    <audio ref="${refId}" lane="-1" offset="0s" duration="${durationString}" start="${startString}" role="dialogue" />`;
        }

        xml += `
                                    <note>${cleanScript}</note>
                                </video>
            `;

        // MARCADOR (Para ver el guion en el timeline)
        xml += `                <marker start="0s" duration="1/24s" value="${cleanTitle}" note="${cleanScript}"/>
                        </clip>
`;
        // Avanzar cursor
        currentOffsetFrames += clipDurationFrames;
    });

    xml += `                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;

    // 5. DESCARGAR ARCHIVO
    const blob = new Blob([xml], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Nombre de archivo seguro
    const safeFilename = projectName.replace(/[^a-z0-9_\-]/gi, '_') || "AIA_Sequence";
    a.download = `${safeFilename}.fcpxml`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// --- NUEVO: EXPORTADOR DE SUBTÍTULOS (.SRT) ---
function formatTimeSRT(seconds) {
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss},${ms}`;
}

function exportSRT() {
    let srtContent = "";
    let currentTime = 0;

    scenes.forEach((scene, index) => {
        const duration = Math.max(1, scene.duration || 2);
        const startTime = formatTimeSRT(currentTime);
        const endTime = formatTimeSRT(currentTime + duration);

        // Limpieza de saltos de línea para que no rompan el SRT
        const cleanScript = (scene.script || "Sin guion").replace(/\n/g, ' ');

        // Formato SRT: Número \n Tiempo \n Texto \n\n
        srtContent += `${index + 1}\n`;
        srtContent += `${startTime} --> ${endTime}\n`;
        srtContent += `${cleanScript}\n\n`;

        currentTime += duration;
    });

    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "guion_subtitulos.srt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// --- EXPORTADOR DE MARCADORES DE LÍNEA DE TIEMPO (.EDL) ---
function secondsToTimecode(seconds, fps = 24) {
    // Convertimos segundos a Frames totales
    const totalFrames = Math.round(seconds * fps);

    const h = Math.floor(totalFrames / (3600 * fps));
    const m = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
    const s = Math.floor((totalFrames % (60 * fps)) / fps);
    const f = totalFrames % fps;

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

// --- HELPER: PALETA OFICIAL DAVINCI RESOLVE (16 COLORES) ---
function getMarkerColor(hex) {
    if (!hex || hex === 'transparent') return "Blue";

    // Nombres exactos que usa DaVinci internamente (Case Sensitive)
    const davinciColors = {
        "Red": [255, 0, 0],
        "Green": [0, 255, 0],
        "Blue": [0, 0, 255],
        "Cyan": [0, 255, 255],
        "Fuchsia": [255, 0, 128], // DaVinci llama 'Fuchsia' al Magenta
        "Yellow": [255, 255, 0],
        "Pink": [255, 192, 203],
        "Purple": [128, 0, 128],
        "Rose": [255, 0, 127],
        "Lavender": [230, 230, 250],
        "Sky": [135, 206, 235],
        "Mint": [189, 252, 201],
        "Lemon": [255, 250, 205],
        "Sand": [244, 164, 96], // El "Naranja" de DaVinci
        "Cocoa": [210, 105, 30], // El "Marrón"
        "Cream": [255, 253, 208]  // El "Blanco"
    };

    // Convertir Hex a RGB
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = "0x" + hex[1] + hex[1]; g = "0x" + hex[2] + hex[2]; b = "0x" + hex[3] + hex[3];
    } else if (hex.length === 7) {
        r = "0x" + hex[1] + hex[2]; g = "0x" + hex[3] + hex[4]; b = "0x" + hex[5] + hex[6];
    }
    r = +r; g = +g; b = +b;

    // Buscar el color más cercano
    let minDistance = Infinity;
    let closestColor = "Blue";

    for (const [name, rgb] of Object.entries(davinciColors)) {
        const distance = Math.sqrt(
            Math.pow(r - rgb[0], 2) +
            Math.pow(g - rgb[1], 2) +
            Math.pow(b - rgb[2], 2)
        );
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = name;
        }
    }
    return closestColor;
}

// --- EXPORTADOR DE MARCADORES (.EDL) - V5.0 (CON DESCRIPCIÓN Y SECCIÓN) ---
function exportMarkersEDL() {
    const fps = 24; // Asegúrate que coincida con tu proyecto (24, 25, 30...)
    let edl = `TITLE: AIA_MARKERS\nFCM: NON-DROP FRAME\n\n`;
    let currentTime = 0;

    scenes.forEach((scene, i) => {
        const duration = Math.max(1, scene.duration || 2);

        const startTimecode = secondsToTimecode(currentTime, fps);
        // EDL Evento de 1 frame de duración
        const oneFrameLater = secondsToTimecode(currentTime + (1 / fps), fps);

        // 1. COLOR: Basado en la Sección
        const colorName = getMarkerColor(scene.sectionColor);

        // 2. NOMBRE (Name): El Título de la tarjeta (Limpiamos saltos de línea)
        let cleanTitle = (scene.title || `Escena ${i + 1}`).replace(/(\r\n|\n|\r)/gm, " ").trim();

        // 3. KEYWORD/NOTAS: 
        // Como EDL no tiene campo 'Keyword', ponemos la SECCIÓN al principio de la nota en mayúsculas.
        // Formato: [SECCIÓN] Descripción...
        const cleanSection = (scene.sectionName || "GENÉRICO").toUpperCase().replace(/(\r\n|\n|\r)/gm, " ").trim();
        const cleanDesc = (scene.description || "").replace(/(\r\n|\n|\r)/gm, " ").trim();

        // Construimos el contenido visible de la nota
        const noteContent = `[${cleanSection}] ${cleanDesc}`;

        const index = String(i + 1).padStart(3, '0');

        // --- GENERACIÓN EDL ---
        // Línea de evento
        edl += `${index}  001      V     C        ${startTimecode} ${oneFrameLater} ${startTimecode} ${oneFrameLater}\n`;

        // Línea Locator estándar
        edl += `* LOC: ${startTimecode} ${colorName} ${cleanTitle}\n`;

        // Línea Mágica de DaVinci:
        // Ponemos el contenido de la nota primero.
        // Al final añadimos las etiquetas de sistema (|C:Color, |M:Nombre, |D:Duración)
        edl += `* NOTE: ${noteContent} |C:ResolveColor${colorName} |M:${cleanTitle} |D:1\n\n`;

        currentTime += duration;
    });

    const blob = new Blob([edl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "timeline_markers_v5.edl";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// --- ATAJOS DE TECLADO (HOTKEYS V1.1 - Sin Flechas) ---
document.addEventListener('keydown', (e) => {
    // Detectar si estamos escribiendo en un input o textarea
    const activeTag = document.activeElement.tagName;
    const isTyping = (activeTag === 'INPUT' || activeTag === 'TEXTAREA');

    // MODO EDICIÓN: Aislar atajos globales para no pisar el salto de línea nativo (Shift+Enter)
    if (isTyping) {
        // Permitir atajos globales SOLO si involucran Alt o Ctrl
        if (!e.altKey && !e.ctrlKey) return;
    }

    // 1. NUEVA ESCENA: Alt + Enter
    if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        addScene();
        return;
    }

    // --- LOS SIGUIENTES YA ESTÁN PROTEGIDOS POR EL RETURN PREVIO ---

    // 2. BORRAR: Tecla Supr (Delete) o Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
            deleteScene(selectedId);
        }
    }

    // 3. DUPLICAR: Ctrl + D
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedId) {
            const index = scenes.findIndex(s => s.id === selectedId);
            if (index !== -1) duplicateScene(index, 1); // 1 = Duplicar a la derecha
        }
    }

    // 4. MANUAL BACKUP: Ctrl + S
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        manualBackup();
    }
});

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
 * Construye las URLs base con folder param.
 * @returns {string} URL base sin trailing query chars.
 */
function _liteApiBase() {
    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    return 'http://localhost:9999/lite/files?folder=' + encodeURIComponent(mediaRoot);
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


/**
 * Abre el explorador jerárquico de archivos Lite.
 * @param {string} sceneId  - ID de la escena destino.
 * @param {string} subpath  - Subdirectorio a mostrar (default = raíz).
 */
async function openQuickFileModal(sceneId, subpath = '') {
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
    const url = _liteApiBase() + '&subpath=' + encodeURIComponent(subpath);

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let items = data.items || [];

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
    const query = (document.getElementById('lite-file-search')?.value || '').trim();
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

    const url = _liteApiBase() + '&search=' + encodeURIComponent(query);

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let items = data.items || [];

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


        if (counter) counter.textContent = `${items.length} resultado${items.length !== 1 ? 's' : ''}`;
        grid.innerHTML = _renderGridItems(items, mediaRoot);

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
    saveState();
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
// [LITE] FASE B — GESTIÓN DE ARCHIVOS (Renombrar, Borrar, Mover)
// ================================================================

/**
 * Helper genérico de POST a la API de escritura Lite.
 * @param {string} endpoint - e.g. '/lite/files/delete'
 * @param {Object} body     - Payload JSON
 * @returns {Promise<Object>} Data parsed JSON or throws Error with detail message
 */
async function _litePost(endpoint, body) {
    const res = await fetch('http://localhost:9999' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
    }
    return data;
}

/**
 * Actualiza reactivamente todas las escenas que tengan el path antiguo como linkedFile.
 * Llama a saveState() + render() solo si hubo cambios reales.
 * @param {string} oldPath
 * @param {string|null} newPath - null indica que el archivo fue eliminado (vacía el vínculo)
 */
function _syncLinkedFile(oldPath, newPath) {
    let changed = false;
    scenes.forEach(scene => {
        if (scene.linkedFile === oldPath) {
            scene.linkedFile = newPath || '';
            if (!newPath) scene.startTime = 0;
            changed = true;
        }
    });
    if (changed) {
        saveState();
        render();
        const action = newPath ? `🔄 Vínculo actualizado: ${newPath.split('/').pop()}` : `🔗 Vínculo eliminado`;
        showToast(action);
    }
}

/**
 * Elimina un archivo de disco con confirmación del usuario.
 * @param {string} filePath  - Ruta relativa al Media Root
 */
async function liteDeleteFile(filePath) {
    const name = filePath.split('/').pop();
    const { confirmed } = await sysDialog({
        icon: '⚠️',
        title: '¿Eliminar archivo?',
        message: `¿Eliminar permanentemente <b>"${name}"</b> del disco?<br>Esta acción no se puede deshacer.`,
        type: 'confirm',
        confirmLabel: 'Eliminar',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    if (!mediaRoot) { showToast('❌ Configura el Media Root primero'); return; }

    try {
        await _litePost('/lite/files/delete', { folder: mediaRoot, file_path: filePath });
        showToast(`🗑️ Eliminado: ${name}`);
        _syncLinkedFile(filePath, null);
        openQuickFileModal(currentFileSceneId, currentBrowsePath); // Refresh grid
    } catch (err) {
        showToast(`❌ Error al eliminar: ${err.message}`);
        console.error('[Lite] Delete error:', err);
    }
}

/**
 * Renombra un archivo de disco con un prompt de nombre nuevo.
 * @param {string} filePath - Ruta relativa al Media Root
 */
async function liteRenameFile(filePath) {
    const oldName = filePath.split('/').pop();
    const ext = oldName.includes('.') ? '.' + oldName.split('.').pop() : '';

    const { confirmed, value: newName } = await sysDialog({
        icon: '✏️',
        title: 'Renombrar Archivo',
        message: `Introduce el nuevo nombre para <b>"${oldName}"</b>:`,
        type: 'prompt',
        defaultValue: oldName,
        confirmLabel: 'Renombrar',
        confirmClass: 'btn-accent'
    });

    if (!confirmed || !newName || newName.trim() === oldName) return;

    // Enforce same extension on client side for UX feedback
    if (!newName.trim().toLowerCase().endsWith(ext.toLowerCase())) {
        await sysDialog({
            icon: '❌',
            title: 'Extensión Inválida',
            message: `El nombre debe mantener la extensión <b>"${ext}"</b>`,
            type: 'alert'
        });
        return;
    }

    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    if (!mediaRoot) { showToast('❌ Configura el Media Root primero'); return; }

    try {
        const data = await _litePost('/lite/files/rename', {
            folder: mediaRoot,
            old_path: filePath,
            new_name: newName.trim()
        });
        showToast(`✏️ Renombrado: ${newName.trim()}`);
        _syncLinkedFile(data.old_path, data.new_path);
        openQuickFileModal(currentFileSceneId, currentBrowsePath); // Refresh grid
    } catch (err) {
        showToast(`❌ Error al renombrar: ${err.message}`);
        console.error('[Lite] Rename error:', err);
    }
}

/**
 * Renombra una carpeta en el servidor y sincroniza todos los archivos hijos vinculados.
 * @param {string} oldDirPath - Ruta relativa al Media Root
 */
async function liteRenameFolder(oldDirPath) {
    const oldName = oldDirPath.split('/').pop();

    const { confirmed, value: newName } = await sysDialog({
        icon: '✏️',
        title: 'Renombrar Carpeta',
        message: `Introduce el nuevo nombre para <b>"${oldName}"</b>:`,
        type: 'prompt',
        defaultValue: oldName,
        confirmLabel: 'Renombrar',
        confirmClass: 'btn-accent'
    });

    if (!confirmed || !newName || newName.trim() === oldName) return;

    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    if (!mediaRoot) { showToast('❌ Configura el Media Root primero'); return; }

    try {
        const data = await _litePost('/lite/folders/rename', {
            folder: mediaRoot,
            old_dir_path: oldDirPath,
            new_name: newName.trim()
        });

        // Sincronizar todos los archivos dentro de la carpeta renombrada
        const oldPrefix = data.old_path + "/";
        const newPrefix = data.new_path + "/";
        let changed = false;

        scenes.forEach(scene => {
            if (scene.linkedFile && scene.linkedFile.startsWith(oldPrefix)) {
                scene.linkedFile = newPrefix + scene.linkedFile.slice(oldPrefix.length);
                changed = true;
            }
        });

        if (changed) {
            saveState();
            render();
            showToast(`🔄 Vínculos sincronizados tras renombrar carpeta`);
        }

        showToast(`✏️ Carpeta renombrada a: ${newName.trim()}`);
        openQuickFileModal(currentFileSceneId, currentBrowsePath); // Refresh grid
    } catch (err) {
        showToast(`❌ Error al renombrar carpeta: ${err.message}`);
        console.error('[Lite] Rename folder error:', err);
    }
}


/**
 * Mueve un archivo a una carpeta destino (usado por Drag & Drop y la API).
 * @param {string} filePath       - Ruta relativa del archivo origen
 * @param {string} targetDirectory - Ruta relativa de la carpeta destino
 */
async function liteMoveFileTo(filePath, targetDirectory) {
    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    if (!mediaRoot) { showToast('❌ Configura el Media Root primero'); return; }

    try {
        const data = await _litePost('/lite/files/move', {
            folder: mediaRoot,
            file_path: filePath,
            target_directory: targetDirectory
        });
        showToast(`📦 Movido: ${data.new_path.split('/').pop()}`);
        _syncLinkedFile(data.old_path, data.new_path);
        openQuickFileModal(currentFileSceneId, currentBrowsePath); // Refresh grid
    } catch (err) {
        showToast(`❌ Error al mover: ${err.message}`);
        console.error('[Lite] Move error:', err);
    }
}

// ================================================================
// [LITE] DRAG & DROP — Handlers globales
// ================================================================

/** Almacena el path del archivo que se está arrastrando */
let _liteDraggedPath = null;

function _onFileDragStart(event, filePath) {
    _liteDraggedPath = filePath;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', filePath);
}

let _dragScrollInterval = null;

function _onFolderDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.style.borderColor = 'var(--accent)';

    // Auto-scroll: dynamic geometry — activates within 25% of container height from each edge
    const container = document.getElementById('quick-file-modal').querySelector('.modal-content');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const hitbox = rect.height * 0.40; // 40% of visible area — only 20% neutral zone
    const speed = 40;

    clearInterval(_dragScrollInterval);

    if (relativeY < hitbox) {
        // scroll up
        _dragScrollInterval = setInterval(() => { if (container.scrollTop > 0) container.scrollTop -= speed; }, 20);
    } else if (relativeY > rect.height - hitbox) {
        // scroll down
        _dragScrollInterval = setInterval(() => { container.scrollTop += speed; }, 20);
    }
}

function _onFolderDragLeave(event) {
    event.currentTarget.style.borderColor = '';
    clearInterval(_dragScrollInterval);
}

function _onFolderDrop(event, folderPath) {
    event.preventDefault();
    clearInterval(_dragScrollInterval);
    event.currentTarget.style.borderColor = '';

    // Normalize source path (replace Windows backslashes)
    const src = (_liteDraggedPath || event.dataTransfer.getData('text/plain')).replace(/\\/g, '/');
    if (!src) return;

    // Resolve the real destination path
    let destPath;
    if (folderPath === '..') {
        // Navigate up from the current browse path
        const cur = currentBrowsePath.replace(/\\/g, '/').replace(/\/+$/, '');
        const lastSlash = cur.lastIndexOf('/');
        destPath = lastSlash > 0 ? cur.substring(0, lastSlash) : '';
    } else {
        destPath = folderPath;
    }

    // Guard: don't drop on itself
    if (src === destPath || destPath.startsWith(src + '/')) return;

    liteMoveFileTo(src, destPath);
    _liteDraggedPath = null;
}



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
function sysDialog({ title = '', message = '', icon = '❓', type = 'confirm',
    defaultValue = '', confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar', confirmClass = 'btn-accent' } = {}) {
    return new Promise(resolve => {
        const overlay = document.getElementById('sys-dialog-overlay');
        const iconEl = document.getElementById('sys-dialog-icon');
        const titleEl = document.getElementById('sys-dialog-title');
        const msgEl = document.getElementById('sys-dialog-message');
        const inputEl = document.getElementById('sys-dialog-input');
        const btnsEl = document.getElementById('sys-dialog-btns');

        iconEl.textContent = icon;
        titleEl.textContent = title;
        msgEl.innerHTML = message;

        // Input visibility
        inputEl.style.display = (type === 'prompt') ? 'block' : 'none';
        if (type === 'prompt') {
            inputEl.value = defaultValue;
            setTimeout(() => inputEl.focus(), 80);
        }

        // Build buttons
        btnsEl.innerHTML = '';

        const close = (confirmed, val) => {
            overlay.style.display = 'none';
            resolve({ confirmed, value: val });
        };

        if (type !== 'alert') {
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = cancelLabel;
            cancelBtn.style.cssText = 'padding:7px 18px; background:#222; border:1px solid #444; color:#ccc; border-radius:4px; cursor:pointer;';
            cancelBtn.onclick = () => close(false, null);
            btnsEl.appendChild(cancelBtn);
        }

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmLabel;
        confirmBtn.className = confirmClass;
        confirmBtn.style.cssText = 'padding:7px 18px; border-radius:4px; cursor:pointer; font-weight:600;';
        confirmBtn.onclick = () => close(true, type === 'prompt' ? inputEl.value.trim() : null);

        // Enter on input also confirms
        inputEl.onkeydown = (e) => { if (e.key === 'Enter') confirmBtn.click(); };

        btnsEl.appendChild(confirmBtn);
        overlay.style.display = 'flex';
    });
}


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

// --- PROCESADOR MULTIMEDIA (VÍDEO E IMAGEN) V2 - Clean Reset ---
function handleVideoSelect(input, id) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const scene = scenes.find(s => s.id === id);
        if (!scene) return;

        saveState();

        // === CLEAN RESET LOGIC ===
        scene.linkedFile = file.name;
        scene.startTime = 0; // Reset explícito
        scene.duration = estimateDuration(scene.script); // Reset a auto
        scene.timingMode = 'auto';
        scene.manualTiming = false;
        scene.videoDuration = null; // Se llenará abajo para vídeos
        scene.tempThumbnail = null;

        if (file.type.startsWith('image/')) {
            // Lógica de imagen
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = 640 / img.width;
                    canvas.width = 640;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imgId = "img_" + createId();
                    imageBank[imgId] = canvas.toDataURL('image/jpeg', 0.7);
                    scene.imageId = imgId;
                    scene.imageSrc = null;
                    render();
                    showToast(`Imagen vinculada: ${file.name}`);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            // Lógica de vídeo
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            video.currentTime = 1;

            video.onseeked = () => {
                // Capturar duración del vídeo (habilita "Usar Vídeo Completo")
                if (video.duration && isFinite(video.duration)) {
                    scene.videoDuration = video.duration;
                    console.log("📊 Duración capturada:", file.name, video.duration + "s");
                }

                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 360;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imgId = "img_" + createId();
                imageBank[imgId] = canvas.toDataURL('image/jpeg', 0.7);
                scene.imageId = imgId;
                scene.imageSrc = null;

                URL.revokeObjectURL(video.src);
                render();
                showToast(`Vídeo vinculado: ${file.name}`);
            };

            video.onerror = () => {
                render();
                showToast(`Archivo vinculado: ${file.name}`);
            };

            video.preload = 'metadata';
        }
    }
}

// --- GESTIÓN DE TIEMPO V6.5 (MENÚ INTELIGENTE + FIX REPETICIÓN) ---

function toggleTimingMode(id) {
    saveState();
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
        saveState();
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

// --- AI INTEGRATION (APPEND-ONLY) ---
let currentAI_SceneId = null;

function openAIMatchModal(sceneId) {
    // Fallback logic: use sceneId → selectedId → null (Exploration mode)
    currentAI_SceneId = sceneId || selectedId || null;

    let query = "";
    if (currentAI_SceneId) {
        const scene = scenes.find(s => s.id === currentAI_SceneId);
        if (scene) {
            query = scene.script || scene.description || scene.title || "";
        }
    }

    document.getElementById('ai-search-input').value = query;
    document.getElementById('ai-match-modal').style.display = 'flex';
    document.getElementById('ai-search-input').focus();

    // Update link button state based on selection
    updateAILinkButtonState();

    if (query && query.length > 3) searchAI();
}

function updateAILinkButtonState() {
    // Find all link buttons in AI results and update their label
    // This will be called after search results load
    const hasTarget = currentAI_SceneId !== null;
    console.log("🎯 AI Target:", hasTarget ? currentAI_SceneId : "Modo Exploración");
}

function closeAIMatchModal() {
    document.getElementById('ai-match-modal').style.display = 'none';
    currentAI_SceneId = null;
}

let currentSearchScope = 'all';

function updateSearchScope(scope) {
    currentSearchScope = scope;
    // Update UI
    ['all', 'visual', 'audio', 'filename'].forEach(s => {
        const btn = document.getElementById(`scope-btn-${s}`);
        if (btn) {
            btn.style.background = (s === scope) ? '#333' : '#222';
            btn.style.borderColor = (s === scope) ? 'var(--accent)' : '#444';
        }
    });
    // Auto search if query exists
    const query = document.getElementById('ai-search-input').value;
    if (query && query.length > 2) searchAI();
}

async function searchAI() {
    const query = document.getElementById('ai-search-input').value;
    const precisionVal = document.getElementById('precision-slider').value;
    const minScore = precisionVal / 100.0;

    const container = document.getElementById('ai-results-container');
    container.innerHTML = `<div style="color:#666; width:100%; text-align:center; padding:20px;">🔍 Buscando en ${currentSearchScope}...</div>`;

    try {
        const res = await fetch(`http://localhost:9999/search?query=${encodeURIComponent(query)}&min_score=${minScore}&scope=${currentSearchScope}`);
        const data = await res.json();

        if (data.length === 0) {
            container.innerHTML = '<div style="color:#666; width:100%; text-align:center; padding:20px;">Sin resultados.</div>';
            return;
        }

        container.innerHTML = data.map(vid => {
            // [FIX v2] ESTRATEGIA DE PROXIES ROBUSTA
            const filename = vid.filename;

            // Extraer nombre base sin extensión
            const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;

            // CONSTRUCCIÓN DE URLS ESTÁTICAS con encoding para espacios
            const safeThumb = `http://localhost:9999/proxies/${encodeURIComponent(baseName)}.jpg`;

            // FIX: Si proxy_path viene de la API, usarlo; sino fallback a filename
            let proxyUrl;
            if (vid.proxy_path && vid.proxy_path.length > 0) {
                // Extraer solo el nombre del archivo del proxy_path (por si viene con ruta)
                const proxyFilename = vid.proxy_path.split(/[\\/]/).pop();
                proxyUrl = `http://localhost:9999/proxies/${encodeURIComponent(proxyFilename)}`;
            } else {
                proxyUrl = `http://localhost:9999/proxies/${encodeURIComponent(filename)}`;
            }
            const safePath = proxyUrl;

            // Datos UI
            const safeFilename = vid.filename.replace(/'/g, "\\'");
            const seconds = vid.seconds || 0.0;
            const scorePct = (vid.score * 100).toFixed(0);

            // Badges
            const scoreBadge = `<div style="position:absolute; top:5px; right:5px; background:rgba(0, 230, 118, 0.9); color:#000; font-weight:bold; font-size:0.7rem; padding:2px 6px; border-radius:4px;">${scorePct}%</div>`;
            const timeBadge = (vid.type === 'segment')
                ? `<div style="position:absolute; bottom:5px; right:5px; background:rgba(255, 145, 0, 0.9); color:#000; font-weight:bold; font-size:0.7rem; padding:2px 6px; border-radius:4px;">⏱ ${vid.start_time || '00:00:00'}</div>`
                : '';

            const descText = vid.type === 'segment'
                ? `<span style="color:#ffb74d;">🗣 "${vid.text}"</span>`
                : `<span style="color:#aaa;">🤖 ${vid.text || 'Coincidencia visual'}</span>`;

            return `
                        <div style="background:#252525; border:1px solid #444; border-radius:6px; overflow:hidden; display:flex; flex-direction:column; min-height:320px; flex-shrink:0;">
                            <div style="position:relative; aspect-ratio:16/9; background:#000; cursor:pointer;"
                                onclick="playPreview(this, '${safePath}', ${seconds})"
                                title="Ver momento exacto">
                         
                                <img src="${safeThumb}" style="width:100%; height:100%; object-fit:cover;" 
                                    onerror="this.onerror=null; this.src='https://via.placeholder.com/320x180?text=No+Preview';">
                         
                                <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-size:2rem; color:rgba(255,255,255,0.8);">▶️</div>
                                ${scoreBadge}
                                ${timeBadge}
                            </div>
                    
                            <div style="padding:10px; flex:1; display:flex; flex-direction:column; gap:5px;">
                                <div style="font-weight:bold; font-size:0.85rem; color:#fff; word-break:break-all;">${vid.filename}</div>
                                <div style="font-size:0.75rem; margin-bottom:5px; max-height:60px; overflow-y:auto;">
                                    ${descText}
                                </div>
                                <button onclick="linkVideoToCard('${safeFilename}', '${safeThumb}', ${seconds})" 
                                        style="margin-top:auto; background:var(--accent); color:#fff; border:none; padding:8px; border-radius:4px; cursor:pointer; width:100%; font-weight:bold;">
                                    🔗 Vincular Escena
                                </button>
                            </div>
                        </div>
                    `;
        }).join('');

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="color:#ff5252; padding:20px; text-align:center;">Error API</div>`;
    }
}

// --- GLOBAL HELPER: Link Video (V2 - Clean Reset + Metadata Sniffing) ---
function linkVideoToCard(filename, thumbUrl, startTimeInSeconds, forceDuration = null) {
    console.log("🔗 Vinculando:", filename, "Start:", startTimeInSeconds, "ForceDuration:", forceDuration);

    if (!selectedId) {
        // Try grabbing from class if selectId var is not synced
        const sel = document.querySelector('.scene-card.selected');
        if (sel) selectedId = sel.getAttribute('data-id');
    }

    if (!selectedId) {
        showToast("⚠️ Selecciona una tarjeta primero.");
        return;
    }
    const scene = scenes.find(s => s.id === selectedId);
    if (!scene) return;

    saveState();

    // === CLEAN RESET LOGIC ===
    // 1. Asignar archivo y thumbnail
    scene.linkedFile = filename;
    scene.tempThumbnail = thumbUrl;

    // 2. Reset startTime (solo usa valor si se especifica explícitamente)
    scene.startTime = parseFloat(startTimeInSeconds) || 0;

    // 3. Reset duración a estimación automática (evita "duraciones fantasma")
    scene.duration = estimateDuration(scene.script);
    scene.timingMode = 'auto';
    scene.manualTiming = false;

    // 4. Limpiar metadatos de vídeo anterior
    scene.videoDuration = null;
    scene.imageId = null;
    scene.imageSrc = null;

    // === METADATA SNIFFING ===
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename);

    if (forceDuration !== null && forceDuration > 0) {
        // Si nos pasan la duración, la usamos directamente
        scene.videoDuration = parseFloat(forceDuration);
        console.log("📊 Duración forzada:", scene.videoDuration);
    } else if (!isImage) {
        // ASYNC: Crear vídeo temporal para leer metadata del proxy
        const proxyUrl = `http://localhost:9999/proxies/${encodeURIComponent(filename)}`;
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.muted = true;

        tempVideo.onloadedmetadata = () => {
            // Buscar la escena de nuevo (puede haber cambiado durante async)
            const updatedScene = scenes.find(s => s.linkedFile === filename);
            if (updatedScene && tempVideo.duration && isFinite(tempVideo.duration)) {
                updatedScene.videoDuration = tempVideo.duration;
                console.log("📊 Metadata capturada:", filename, tempVideo.duration + "s");
                render(); // Re-render para mostrar opción "Usar Vídeo"
            }
            tempVideo.src = ''; // Cleanup
        };

        tempVideo.onerror = () => {
            console.warn("⚠️ No se pudo cargar metadata para:", filename);
            tempVideo.src = '';
        };

        tempVideo.src = proxyUrl;
    }

    // Actualizar DOM invisible
    const cardEl = document.querySelector(`.scene-card[data-id="${selectedId}"]`);
    if (cardEl) cardEl.dataset.startTime = scene.startTime;

    render();

    // Cerrar modales (safe check)
    const m1 = document.getElementById('ai-match-modal');
    if (m1) m1.style.display = 'none';

    // Feedback
    const timeStr = new Date(scene.startTime * 1000).toISOString().substr(14, 5);
    if (typeof showToast === 'function') showToast(`Vinculado: ${filename} (@${timeStr})`);
}

function playPreview(container, videoPath, startTime) {
    if (!videoPath) {
        container.innerHTML = '<div style="color:#666; font-size:0.8rem; padding:10px;">Video no disponible</div>';
        return;
    }

    container.innerHTML = ''; // Limpiar

    // [FIX] Extraer nombre limpio y evitar doble extensión
    let filename = videoPath.split(/[\\/]/).pop();
    // Si viene de proxy_path, a veces trae 'algo.mp4'. Si viene de filename, es 'algo.mp4'.
    // El API espera el filename para servir el proxy desde /proxies/FILENAME
    // Pero nuestro endpoint es /proxies (StaticFiles).
    // Entonces la URL es: http://localhost:9999/proxies/video.mp4

    const serverUrl = `http://localhost:9999/proxies/${encodeURIComponent(filename)}`;

    console.log("▶️ Preview:", serverUrl, "@", startTime);

    const video = document.createElement('video');
    video.src = serverUrl;
    video.style.width = '100%';
    video.style.height = '100%';
    video.controls = true;
    video.autoplay = true;

    if (startTime > 0) {
        video.currentTime = startTime;
        video.addEventListener('loadedmetadata', () => {
            video.currentTime = startTime;
        }, { once: true });
    }

    // Manejo de errores visual
    video.onerror = () => {
        console.error("Error cargando video:", serverUrl);
        container.innerHTML = `<div style="color:#ff5252; font-size:0.8rem; padding:10px; text-align:center;">
                    Error cargando archivo.<br>
                    <small>${filename}</small>
                </div>`;
    };

    container.appendChild(video);
}

function selectAIMatch(filename, thumbUrl, seconds = 0) {
    if (currentAI_SceneId) {
        // Seleccionar la tarjeta primero (hack)
        const card = document.querySelector(`.scene-card[data-id="${currentAI_SceneId}"]`);
        if (card) {
            // Deseleccionar otros
            document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedId = currentAI_SceneId; // Sync global state
        }

        linkVideoToCard(filename, thumbUrl, seconds);
        closeAIMatchModal();
    }
}



// =========================================
// === UI COMPONENTS & MODAL SYSTEM (v7.5) ===
// =========================================

const Modal = {
    overlay: () => document.getElementById('custom-modal-overlay'),
    title: () => document.getElementById('modal-title'),
    message: () => document.getElementById('modal-message'),
    input: () => document.getElementById('modal-input'),
    btnConfirm: () => document.getElementById('modal-btn-confirm'),
    btnCancel: () => document.getElementById('modal-btn-cancel'),

    confirm(title, text, isDanger = false) {
        return this._show(title, text, false, "", isDanger, true);
    },

    prompt(title, defaultValue = "") {
        return this._show(title, "", true, defaultValue, false, true);
    },

    alert(title, text) {
        return this._show(title, text, false, "", false, false);
    },

    _show(title, text, hasInput, inputVal, isDanger, showCancel) {
        return new Promise((resolve) => {
            const overlay = this.overlay();
            if (!overlay) {
                console.error("Modal overlay not found!");
                resolve(null);
                return;
            }

            // Setup UI
            this.title().innerText = title;
            this.message().innerText = text;
            this.message().style.display = text ? 'block' : 'none';

            const input = this.input();
            if (hasInput) {
                input.value = inputVal;
                input.classList.remove('hidden');
            } else {
                input.classList.add('hidden');
            }

            const btnConfirm = this.btnConfirm();
            btnConfirm.className = isDanger ? 'btn-danger' : 'btn-primary';
            this.btnCancel().style.display = showCancel ? 'inline-block' : 'none';

            // FIX v7.6: Force Flex display override
            overlay.style.display = 'flex';
            overlay.classList.remove('hidden'); // Legacy clean

            if (hasInput) {
                setTimeout(() => input.select(), 50); // Focus and select text
            } else {
                btnConfirm.focus();
            }

            // Output Handling
            const close = (result) => {
                overlay.style.display = 'none'; // FIX v7.6
                cleanup();
                resolve(result);
            };

            const onConfirm = () => {
                if (hasInput) close(input.value);
                else close(true);
            };

            const onCancel = () => close(hasInput ? null : false);

            const onKey = (e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
            };

            // Bind Listeners
            // We use onclick property to override previous listeners automatically
            btnConfirm.onclick = onConfirm;
            this.btnCancel().onclick = onCancel;
            window.addEventListener('keydown', onKey);

            const cleanup = () => {
                window.removeEventListener('keydown', onKey);
                btnConfirm.onclick = null;
                this.btnCancel().onclick = null;
            };
        });
    }
};

// =========================================
// === MONITOR CONTROL LOGIC (v7.6.5) ===
// =========================================
let monitorPollTimer = null;

async function checkMonitorStatus() {
    try {
        const res = await fetch('http://localhost:9999/monitor/status');
        const data = await res.json();
        const isRunning = data.running;

        // Update UI
        const toggle = document.getElementById('monitor-toggle');
        const led = document.getElementById('monitor-status-led');

        if (toggle && !toggle.disabled) toggle.checked = isRunning;

        if (led) {
            // Refined Colors
            led.style.background = isRunning ? '#00e676' : '#ff1744'; // Green / Red
            led.style.boxShadow = isRunning ? '0 0 8px #00e676' : 'none';
        }

        updateProcessButtonState(isRunning);
    } catch (e) {
        console.error("Monitor Poll Error:", e);
    }
}

async function toggleMonitor(active) {
    const endpoint = active ? 'start' : 'stop';
    const toggle = document.getElementById('monitor-toggle');
    const led = document.getElementById('monitor-status-led');

    // State: Processing (Yellow)
    if (led) {
        led.style.background = '#ffeb3b';
        led.style.boxShadow = '0 0 8px #ffeb3b';
    }
    if (toggle) toggle.disabled = true;

    showToast(active ? "⏳ Iniciando Monitor..." : "⏳ Deteniendo Monitor...");

    try {
        const res = await fetch(`http://localhost:9999/monitor/${endpoint}`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            showToast("✅ " + data.message);
            // Re-enable toggle and force poll
            if (toggle) toggle.disabled = false;
            checkMonitorStatus();
        } else {
            showToast("❌ Error: " + (data.message || "Fallo en operación"));
            if (toggle) {
                toggle.disabled = false;
                toggle.checked = !active; // Revert
            }
        }
    } catch (e) {
        showToast("❌ Error de comunicación");
        if (toggle) {
            toggle.disabled = false;
            toggle.checked = !active;
        }
    }
}

function updateProcessButtonState(isRunning) {
    const btn = document.getElementById('process-files-btn');
    if (!btn) return;

    if (isRunning) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.filter = 'none';
        btn.style.cursor = 'pointer';
        btn.innerHTML = '🚀 Procesar Selección';
        btn.title = "Enviar a monitor";
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.filter = 'grayscale(1)';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = '⚠️ Encienda Monitor';
        btn.title = "El monitor debe estar activo para procesar";
    }
}

function startMonitorPolling() {
    checkMonitorStatus(); // Immediate check
    if (monitorPollTimer) clearInterval(monitorPollTimer);
    monitorPollTimer = setInterval(checkMonitorStatus, 2000);
}

function stopMonitorPolling() {
    if (monitorPollTimer) {
        clearInterval(monitorPollTimer);
        monitorPollTimer = null;
    }
}

// =========================================
// === INGESTOR DRAG & DROP & CONTEXT MENU ===
// =========================================

function onIngestDragStart(event, filename) {
    event.dataTransfer.setData('text/plain', filename);
    event.target.style.opacity = '0.5';

    // Cleanup visual style after drop
    event.target.addEventListener('dragend', (e) => {
        e.target.style.opacity = '1';
    }, { once: true });
}

function onIngestFolderDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    // Visual feedback for hovering
    const el = event.currentTarget;
    el.style.backgroundColor = '#383838';
    el.addEventListener('dragleave', () => {
        el.style.backgroundColor = '';
    }, { once: true });
}

async function onIngestFolderDrop(event, targetFolder) {
    event.preventDefault();
    const filename = event.dataTransfer.getData('text/plain');
    if (!filename) return;

    // Direct UI feedback
    event.currentTarget.style.backgroundColor = '';

    try {
        const res = await fetch('http://localhost:9999/raw-files/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: [filename],
                target_folder: targetFolder
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast(`Movido a ${targetFolder || 'Raíz'} ✅`);
            loadRawFiles(true);
        } else {
            showToast("❌ Error al mover: " + (data.detail || data.message));
        }
    } catch (e) {
        console.error(e);
        showToast("❌ Error de conexión al mover");
    }
}

function onIngestContextMenu(event, filename) {
    event.preventDefault();
    contextMenuTarget = filename;

    // Position menu (asset-context-menu is used as general menu element)
    const menu = document.getElementById('asset-context-menu');
    if (!menu) return;

    // Hide sanitize in Ingest (Individual removal as per v7.6.3)
    const sanitizeBtn = document.getElementById('ctx-sanitize');
    if (sanitizeBtn) sanitizeBtn.style.display = 'none';

    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.classList.remove('hidden');
    menu.dataset.context = 'ingest'; // Mark context
}


let contextMenuTarget = null; // Stores filename

function onPoolContextMenu(event, filename) {
    event.preventDefault();
    contextMenuTarget = filename;

    const menu = document.getElementById('asset-context-menu');
    if (!menu) return;

    // Hide sanitize in Pool
    const sanitizeBtn = document.getElementById('ctx-sanitize');
    if (sanitizeBtn) sanitizeBtn.style.display = 'none';

    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.classList.remove('hidden');
    menu.dataset.context = 'pool'; // Reset context default
}

function initContextMenu() {
    const menu = document.getElementById('asset-context-menu');
    if (!menu) {
        console.warn("Context menu element not found. Skipping initialization.");
        return;
    }

    // Global click to close menu
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.add('hidden');
            menu.dataset.context = ''; // Reset context
        }
    });


    // Context Menu Action: Rename
    const renameBtn = document.getElementById('ctx-rename');
    if (renameBtn) {
        renameBtn.addEventListener('click', async () => {
            menu.classList.add('hidden');
            if (!contextMenuTarget) return;

            if (menu.dataset.context === 'ingest') {
                inspectFile(contextMenuTarget);
                return;
            }
            // ... (omitting unchanged rest for this chunk)

            // USE CUSTOM MODAL
            const currentName = contextMenuTarget.split('/').pop();
            const newName = await Modal.prompt("Renombrar Asset", currentName);

            // Convert to lowercase and replace spaces/unsafe chars with _
            let safeName = newName.trim().toLowerCase();
            safeName = safeName.replace(/\s+/g, '_');      // Spaces to underscore
            safeName = safeName.replace(/[^a-z0-9._-]/g, '_'); // Remove unsafe chars
            safeName = safeName.replace(/_+/g, '_');       // Remove duplicate underscores

            // [v7.6.4] Extension Constraint
            const originalExt = contextMenuTarget.substring(contextMenuTarget.lastIndexOf('.'));
            if (!safeName.endsWith(originalExt)) {
                safeName += originalExt;
            }

            if (!safeName || safeName === currentName) return;

            try {
                const res = await fetch('http://localhost:9999/assets/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        old_path: contextMenuTarget,
                        new_name: safeName
                    })
                });

                const data = await res.json();
                if (data.success) {
                    showToast(`Renombrado a: ${safeName} ✅`);
                    loadPoolAssets(currentPoolPage, false); // Refresh grid
                } else {
                    showToast("❌ Error: " + (data.detail || data.message));
                }
            } catch (e) {
                console.error(e);
                showToast("❌ Error de conexión al renombrar");
            }
        });
    }

    // Context Menu Action: Delete
    const deleteBtn = document.getElementById('ctx-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            menu.classList.add('hidden');
            if (!contextMenuTarget) return;

            if (menu.dataset.context === 'ingest') {
                // Ingest Delete Logic
                const confirmedIngest = await Modal.confirm(
                    "⚠️ ¿Eliminar Archivo?",
                    `Se eliminará permanentemente:\n${contextMenuTarget}`,
                    true
                );
                if (!confirmedIngest) return;

                try {
                    const res = await fetch('http://localhost:9999/raw-files', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: contextMenuTarget })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast(`Eliminado: ${contextMenuTarget} 🗑️`);
                        loadRawFiles(true);
                    }
                } catch (e) {
                    showToast("❌ Error al eliminar");
                }
                return;
            }

            // USE CUSTOM MODAL
            const confirmed = await Modal.confirm(
                "⚠️ ¿Eliminar Asset?",
                `Se eliminará permanentemente:\n${contextMenuTarget}\n\nEsta acción también borrará los proxies y metadatos de IA.`,
                true // isDanger
            );

            if (!confirmed) return;

            try {
                const res = await fetch('http://localhost:9999/assets', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: contextMenuTarget })
                });

                const data = await res.json();
                if (data.success) {
                    showToast(`Eliminado: ${contextMenuTarget} 🗑️`);
                    // Optimistic UI Removal
                    const safeSelect = contextMenuTarget.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    const card = document.querySelector(`.pool-card[data-filename="${safeSelect}"]`);
                    if (card) card.remove();
                } else {
                    showToast("❌ Error: " + (data.detail || data.message));
                }
            } catch (e) {
                console.error(e);
                showToast("❌ Error de conexión al eliminar");
            }
        });
    }
}

// Initialize Context Menu on Load
document.addEventListener('DOMContentLoaded', initContextMenu);
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
document.addEventListener('keydown', (e) => {
    if (e.key === '?' && document.activeElement.tagName === 'BODY') {
        openShortcutsModal();
    }
    // Cerrar con Esc (ya está cubierto, pero específico para este modal)
    if (e.key === 'Escape' && document.getElementById('shortcuts-modal').style.display === 'flex') {
        closeShortcutsModal();
    }
});

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

function renderTimelineOutline() {
    if (!isTimelineOutlineOpen) return;
    const container = document.getElementById('outline-list-container');
    if (!container) return;

    const htmlString = scenes.map((s, i) => {
        const shortName = s.linkedFile ? s.linkedFile.split('/').pop() : 'Vacío';
        const colorName = (presetColors.find(c => c.code === s.color) || {}).name || 'Sin Color';
        const secColor = s.sectionColor || 'transparent';
        const secName = s.sectionName || 'SECCIÓN';
        let linkColor = '#888';
        if (s.linkedFile) {
            const _ext = s.linkedFile.split('.').pop().toLowerCase();
            if (['mp4', 'mov', 'avi', 'mkv', 'mxf', 'webm'].includes(_ext)) linkColor = '#a5d6a7';
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(_ext)) linkColor = '#81d4fa';
            else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(_ext)) linkColor = '#ce93d8';
        }

        let thumb = '';
        const _mediaFolder = document.getElementById('media-path-input')?.value || '';
        if (s.linkedFile) {
            const _ext = s.linkedFile.split('.').pop().toLowerCase();
            const _audioExts = ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac'];
            if (_audioExts.includes(_ext)) {
                thumb = `<div style="width:100%; height:100%; background:#1a1a2e; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🎵</div>`;
            } else {
                const _thumbUrl = `http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(s.linkedFile)}&folder=${encodeURIComponent(_mediaFolder)}`;
                thumb = `<img src="${_thumbUrl}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">`;
            }
        } else if (s.tempThumbnail) {
            thumb = `<img src="${s.tempThumbnail}" style="width:100%; height:100%; object-fit:cover;">`;
        } else if (s.imageId && imageBank[s.imageId]) {
            // Use a cached Blob URL if available; otherwise convert Base64 → Blob URL once
            if (!blobCache[s.imageId]) {
                const raw = imageBank[s.imageId];
                if (raw && raw.startsWith('data:image')) {
                    try {
                        const [header, b64] = raw.split(',');
                        const mime = header.match(/:(.*?);/)[1];
                        const byteChars = atob(b64);
                        const byteArr = new Uint8Array(byteChars.length);
                        for (let _b = 0; _b < byteChars.length; _b++) byteArr[_b] = byteChars.charCodeAt(_b);
                        const blob = new Blob([byteArr], { type: mime });
                        blobCache[s.imageId] = URL.createObjectURL(blob);
                    } catch (_) {
                        blobCache[s.imageId] = raw;
                    }
                } else {
                    blobCache[s.imageId] = raw;
                }
            }
            thumb = `<img src="${blobCache[s.imageId]}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            thumb = `<div style="width:100%; height:100%; background:#111; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🎬</div>`;
        }

        const scriptText = (s.script || s.description || 'Sin guion...').replace(/(\r\n|\n|\r)/gm, " ");
        let checkOverlay = s.done ? `<div class="outline-thumb-check">✓</div>` : '';

        return `<div class="outline-item ${s.id === selectedId ? 'active' : ''}" data-id="${s.id}" onclick="timelineNavGoTo('${s.id}')">
                <div class="outline-left">
                    <div class="outline-thumb">
                        ${thumb}
                        ${checkOverlay}
                    </div>
                    <div class="outline-sec" style="background:${secColor}; color:${secName === 'SECCIÓN' ? '#666' : '#000'}">${secName}</div>
                </div>
                <div class="outline-right">
                    <div class="outline-line-1"><b>#${i + 1}</b> - ${s.title || 'Sin título'}</div>
                    <div class="outline-line-2"><span style="color:${s.color}">⬤</span> <b>${colorName}</b> - <span style="color:${linkColor}; font-weight:600;">${shortName}</span></div>
                    <div class="outline-line-3">${scriptText}</div>
                </div>
            </div>`;
    }).join('');

    console.log("[DEBUG OUTLINE] HTML Generado: ", htmlString);
    container.innerHTML = htmlString;

    if (selectedId) {
        setTimeout(() => {
            const activeEl = container.querySelector('.outline-item.active');
            if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }
}
