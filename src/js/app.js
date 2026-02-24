// --- ARQUITECTURA DE DATOS V2 (OPTIMIZADA) --- // Updated v7.6
// imageBank aísla los datos pesados (Base64) del ciclo de renderizado y undo/redo.
let imageBank = {};
let scenes = [];
let projectTitle = "Nuevo Proyecto";




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
    selectedId = (selectedId === id) ? null : id;
    render(); // Necesario para actualizar estado visual de selección
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
        const isImage = scene.linkedFile && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(scene.linkedFile);
        const linkColor = isImage ? '#40c4ff' : '#00e676';
        const safeFileName = scene.linkedFile ? scene.linkedFile.replace(/'/g, "\\'") : "";

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
                         title="Clic para copiar: ${scene.linkedFile}" 
                         onclick="copyLinkedText('${safeFileName}')">
                        
                        <span style="color:${linkColor}; flex-shrink:0;">🔗</span>
                        
                        <span style="
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

                <div class="drop-zone ${imgSrc || (scene.linkedFile && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile)) ? 'has-image' : ''}" 
                     onclick="triggerImageUpload('${scene.id}')" ondragover="event.preventDefault()" ondrop="handleImageDrop(event, '${scene.id}')">
                    ${(scene.linkedFile && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile)) ? `
                        <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#1a1a1a;">
                             <div style="font-size:1.8rem; margin-bottom:0;">🎵</div>
                        </div>
                        <img src="" id="img-${scene.id}" style="display:none">
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
                        <button onclick="selectedId='${scene.id}'; render(); triggerVideoLink('${scene.id}')" title="Vincular Vídeo Real" 
                                style="background:#222; border:1px solid #444; color:#ccc; width:30px; height:28px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;">
                            🔗
                        </button>
                        <button onclick="selectedId='${scene.id}'; render(); openAIMatchModal('${scene.id}')" title="Buscar con IA" 
                                style="background:#222; border:1px solid #444; color:#ae81ff; width:30px; height:28px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;">
                            ✨
                        </button>
                        <button onclick="selectedId='${scene.id}'; render(); openMediaPoolModal('${scene.id}')" title="Media Pool" 
                                style="background:#222; border:1px solid #444; color:#fca311; width:30px; height:28px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;">
                            🎛️
                        </button>
                        <input type="file" id="vid-${scene.id}" style="display:none" accept="video/*, image/*" onchange="handleVideoSelect(this, '${scene.id}')">
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
    const confirmed = await Modal.confirm(
        "⚠️ ¿Reiniciar Proyecto?",
        "¿Estás seguro de que quieres BORRAR todo el proyecto y empezar de cero?\n\nEsta acción eliminará el autoguardado y no se puede deshacer.",
        true
    );

    if (confirmed) {
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

// Export Utils
function exportTXT() {
    let t = "";
    scenes.forEach((s) => {
        let speaker = (s.speakerName && s.speakerName !== 'Voz') ? s.speakerName.toUpperCase() : 'HABLANTES';
        t += `${speaker}:\n${s.script}\n\n`;
    });
    navigator.clipboard.writeText(t).then(async () => {
        await Modal.alert("📋 Copiado", "Texto para Prompter copiado al portapapeles.");
    });
}

function exportMD() {
    let md = `# GUION DE VIDEO\nGenerado con AIA Studio\n\n`;
    scenes.forEach((s, i) => {
        const sectionHeader = s.sectionName !== 'SECCIÓN' ? ` [${s.sectionName}]` : '';
        const speakerHeader = s.speakerName && s.speakerName !== 'Voz' ? `**🗣️ ${s.speakerName}**\n` : '';
        md += `### Escena ${i + 1}${sectionHeader} (${s.duration}s) ${s.done ? '✅' : ''}\n`;
        md += `**Visual:** ${s.shot} | ${s.move}\n**Descripción:** ${s.description}\n\n`;
        md += `**Diálogo:**\n${speakerHeader}${s.script}\n\n---\n\n`;
    });
    const d = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    const a = document.createElement('a'); a.href = d; a.download = "guion.md";
    document.body.appendChild(a); a.click(); a.remove();
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

    // 1. NUEVA ESCENA: Shift + Enter (Funciona SIEMPRE)
    if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        addScene();
        return;
    }

    // --- LOS SIGUIENTES SOLO FUNCIONAN SI NO ESTÁS ESCRIBIENDO TEXTO ---
    if (isTyping) return;

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

// 1. Esta función activa el input oculto cuando pulsas el botón 🔗
function triggerVideoLink(id) {
    const input = document.getElementById(`vid-${id}`);
    if (input) input.click();
    else console.error("No encuentro el input para la escena " + id);
}

// --- FUNCIÓN HELPER PARA COPIAR NOMBRE ---
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
    const m2 = document.getElementById('media-pool-modal');
    if (m2) m2.style.display = 'none';

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

let currentPoolSceneId = null;
let poolSearchTimer = null;
let currentPoolAsset = null; // Asset being inspected
let currentPoolPage = 1;
let isLoadingPool = false;
let poolHasMore = true;
const POOL_LIMIT = 50;

function openMediaPoolModal(sceneId) {
    // Auto-select scene if provided
    if (sceneId) {
        selectedId = sceneId;
        currentPoolSceneId = sceneId;
    }
    document.getElementById('media-pool-modal').style.display = 'flex';
    // Reset inspector
    document.getElementById('pool-inspector').innerHTML = '<div style="color: #666; text-align: center; padding: 40px; font-style: italic;">Selecciona un asset para inspeccionar</div>';
    currentPoolAsset = null;

    // Reset filters on open if needed, or keep state
    updatePoolFilter(currentPoolFilter); // This triggers loadPoolAssets(1, false) implicitly

    // Infinite Scroll Listener
    const grid = document.getElementById('media-pool-grid');
    grid.removeEventListener('scroll', handlePoolScroll);
    grid.addEventListener('scroll', handlePoolScroll);

    // [v7.5] Init Folders
    fetchFolders();
}

function handlePoolScroll() {
    const grid = document.getElementById('media-pool-grid');
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 100) {
        if (!isLoadingPool && poolHasMore) {
            currentPoolPage++;
            loadPoolAssets(currentPoolPage, true);
        }
    }
}

// --- FILTER & SORT STATE ---
let currentPoolFilter = null; // null, 'video', 'image'
let currentPoolSort = 'date_desc'; // 'date_desc', 'name_asc'
let currentPoolSearch = ''; // Search query
let currentPoolFolder = null; // [v7.6] Default: VIEW ALL (Recursive)

// [v7.5] FOLDER API Logic
async function fetchFolders() {
    try {
        const res = await fetch('http://localhost:9999/folders');
        const data = await res.json();
        renderFolderTree(data.folders || []);
    } catch (e) {
        console.error("Error fetching folders:", e);
        document.getElementById('folder-tree-list').innerHTML = '<div style="color:#d32f2f; text-align:center;">Error</div>';
    }
}

function renderFolderTree(folders) {
    const container = document.getElementById('folder-tree-list');

    // 1. VIEW ALL (Recursive) - Virtual
    let html = `
        <div class="folder-tree-item ${currentPoolFolder === null ? 'active' : ''}" 
             onclick="selectPoolFolder(null)"
             style="color: var(--accent); font-weight: bold; font-style: normal;">
             <span style="margin-right:8px;">🗃️</span> Todo
        </div>
    `;

    // 2. ROOT (Flat) - Physical
    html += `
        <div class="folder-tree-item ${currentPoolFolder === '' ? 'active' : ''}" 
             onclick="selectPoolFolder('')"
             ondragover="onPoolFolderDragOver(event)"
             ondragleave="onPoolFolderDragLeave(event)"
             ondrop="onPoolFolderDrop(event, '')">
             <span style="margin-right:8px;">📁</span> Input (Raíz)
        </div>
    `;

    // 3. Subfolders
    html += folders.map(f => `
        <div class="folder-tree-item ${currentPoolFolder === f ? 'active' : ''}" 
             onclick="selectPoolFolder('${f.replace(/'/g, "\\'")}')" 
             ondragover="onPoolFolderDragOver(event)"
             ondragleave="onPoolFolderDragLeave(event)"
             ondrop="onPoolFolderDrop(event, '${f.replace(/'/g, "\\'")}')"
             title="${f}"
             style="padding-left: 20px;">
             <span style="color:#ffca28; margin-right:8px;">📁</span> ${f}
        </div>
    `).join('');

    container.innerHTML = html;
}

function selectPoolFolder(folderPath) {
    currentPoolFolder = folderPath;
    // Refresh visual state and reload assets
    fetchFolders();
    loadPoolAssets(1, false);
}

async function createFolder() {
    const name = await Modal.prompt("Nueva Carpeta", "");
    if (!name) return;

    try {
        const res = await fetch('http://localhost:9999/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: filterNewFolderName(name) })
        });
        const d = await res.json();
        if (d.success) {
            showToast("Carpeta creada ✅");
            fetchFolders();
        } else {
            showToast("❌ Error: " + (d.detail || d.message));
        }
    } catch (e) {
        console.error(e);
        showToast("❌ Error de conexión");
    }
}

function filterNewFolderName(name) {
    // Basic cleanup
    return name.trim();
}

function onPoolSearchInput() {
    clearTimeout(poolSearchTimer);
    poolSearchTimer = setTimeout(() => {
        currentPoolSearch = document.getElementById('pool-search').value.trim();
        loadPoolAssets(1, false);
    }, 300);
}

function updatePoolFilter(type) {
    currentPoolFilter = type;
    // Update UI (Supports: all, video, image, audio)
    document.querySelectorAll('#media-pool-modal .filter-btn').forEach(b => {
        b.style.background = '#222';
        b.style.borderColor = '#444';
    });
    const activeId = type ? `btn-filter-${type}` : `btn-filter-all`;
    const activeBtn = document.getElementById(activeId);
    if (activeBtn) {
        activeBtn.style.background = '#333';
        activeBtn.style.borderColor = 'var(--accent)';
    }
    loadPoolAssets(1, false);
}

function updatePoolSort(sortMode) {
    currentPoolSort = sortMode;
    loadPoolAssets(1, false);
}

function closeMediaPoolModal() {
    document.getElementById('media-pool-modal').style.display = 'none';
    currentPoolSceneId = null;
    currentPoolAsset = null;

    const grid = document.getElementById('media-pool-grid');
    if (grid) grid.removeEventListener('scroll', handlePoolScroll);

    // Stop media previews
    const inspector = document.getElementById('pool-inspector');
    if (inspector) {
        inspector.querySelectorAll('video, audio').forEach(v => {
            v.pause();
            v.src = "";
        });
    }
    // No need to stop grid previews as they are images/svgs mostly, but if we had video hover...
}

function formatSecondsToTime(seconds) {
    return new Date(seconds * 1000).toISOString().substr(11, 8);
}

async function loadPoolAssets(page = 1, append = false) {
    const grid = document.getElementById('media-pool-grid');

    if (!append) {
        currentPoolPage = 1;
        poolHasMore = true;
        grid.innerHTML = '<div style="color:#aaa; text-align:center; grid-column:1/-1; padding:20px;">Cargando biblioteca...</div>';
    } else {
        // Show small loader at bottom
        if (!document.getElementById('pool-loading-indicator')) {
            const loader = document.createElement('div');
            loader.id = 'pool-loading-indicator';
            loader.style.cssText = 'grid-column:1/-1; text-align:center; padding:10px; color:#666; font-size:0.8rem;';
            loader.innerText = 'Cargando más assets...';
            grid.appendChild(loader);
        }
    }

    isLoadingPool = true;

    try {
        // Construct URL with filters
        let url = `http://localhost:9999/assets?limit=${POOL_LIMIT}&page=${page}&sort=${currentPoolSort}`;
        if (currentPoolFilter) {
            url += `&type=${currentPoolFilter}`;
        }
        if (currentPoolSearch) {
            url += `&search=${encodeURIComponent(currentPoolSearch)}`;
        }
        if (currentPoolFolder !== null) {
            url += `&folder=${encodeURIComponent(currentPoolFolder)}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error("Error API");
        const assets = await res.json();

        // Remove appended loader if exists
        const loader = document.getElementById('pool-loading-indicator');
        if (loader) loader.remove();

        if (assets.length < POOL_LIMIT) {
            poolHasMore = false;
        }

        // [v7.6] FOLDER FILTERING (Server-side)
        const filteredAssets = assets;

        if (currentPoolFolder !== null && filteredAssets.length === 0 && !append) {
            grid.innerHTML = '<div style="color:#666; text-align:center; grid-column:1/-1; padding:40px;">Carpeta vacía.</div>';
            return;
        } else if (assets.length === 0 && !append) {
            grid.innerHTML = '<div style="color:#666; text-align:center; grid-column:1/-1; padding:40px;">No hay assets que coincidan.</div>';
            return;
        }

        const cardsHTML = filteredAssets.map(asset => {
            const safeFilename = asset.filename.replace(/'/g, "\\'");
            const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(asset.filename);
            const isAudio = /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(asset.filename);
            const typeIcon = isImage ? '🖼️' : (isAudio ? '🎵' : '🎬');
            const audioIconSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23111'/%3E%3Cpath d='M50 15v45c-2.5-1.5-5.5-2.5-9-2.5-8 0-14.5 5.5-14.5 12.5s6.5 12.5 14.5 12.5 14.5-5.5 14.5-12.5V30h15V15H50z' fill='%23eee'/%3E%3C/svg%3E`;

            let thumbSrc;
            if (isAudio) {
                thumbSrc = audioIconSvg;
            } else {
                thumbSrc = `http://localhost:9999/thumbnail?path=${encodeURIComponent(asset.proxy_path)}`;
            }

            return `
                <div class="pool-card" onclick="inspectPoolAsset('${safeFilename}')" 
                     draggable="true"
                     ondragstart="onPoolDragStart(event, '${safeFilename}')"
                     ondragend="onPoolDragEnd(event)"
                     oncontextmenu="onPoolContextMenu(event, '${safeFilename}')"
                     style="background:#252525; border-radius:6px; overflow:hidden; cursor:pointer; border:2px solid transparent; transition:all 0.2s;"
                     data-filename="${asset.filename}">
                    <div style="aspect-ratio:16/9; background:#000; position:relative; overflow:hidden;">
                        <img src="${thumbSrc}"
                             style="width:100%; height:100%; object-fit:${isAudio ? 'contain' : 'cover'};"
                             loading="lazy"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div style="display:none; width:100%; height:100%; background:#333; color:#777; font-size:1.5rem; justify-content:center; align-items:center;">${typeIcon}</div>
                    </div>
                    <div style="padding:6px 8px; font-size:0.75rem; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${asset.filename}">
                        ${typeIcon} ${asset.filename}
                    </div>
                </div>
            `;
        }).join('');

        if (append) {
            grid.insertAdjacentHTML('beforeend', cardsHTML);
        } else {
            grid.innerHTML = cardsHTML;
        }

    } catch (err) {
        console.error(err);
        if (!append) grid.innerHTML = `<div style="color:#ff5252; text-align:center; grid-column:1/-1;">Error de conexión con API.</div>`;
    } finally {
        isLoadingPool = false;
    }
}

function inspectPoolAsset(filename) {
    const inspector = document.getElementById('pool-inspector');

    // Highlight selected card
    document.querySelectorAll('.pool-card').forEach(card => {
        card.style.borderColor = card.dataset.filename === filename ? 'var(--accent)' : 'transparent';
    });

    // Detect media type
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename);
    const isAudio = /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(filename);
    const isVideo = !isImage && !isAudio;

    // Build proxy URL - audio files are transcoded to .mp3, images to .jpg
    let proxyFilename = filename;
    if (isAudio) {
        // Force .mp3 extension for audio proxies (transcoding converts all audio to mp3)
        proxyFilename = filename.replace(/\.[^/.]+$/, '') + '.mp3';
    } else if (isImage) {
        // Force .jpg extension for image proxies (all images are converted to jpg)
        proxyFilename = filename.replace(/\.[^/.]+$/, '') + '.jpg';
    }
    const proxyUrl = `http://localhost:9999/proxies/${encodeURIComponent(proxyFilename)}`;
    const thumbUrl = `http://localhost:9999/thumbnail?path=${encodeURIComponent(filename)}`;

    currentPoolAsset = { filename, proxyUrl, thumbUrl, duration: 0, type: isImage ? 'image' : (isAudio ? 'audio' : 'video') };

    let mediaPreview;
    let mediaTypeLabel;

    if (isImage) {
        mediaTypeLabel = 'Imagen';
        mediaPreview = `
            <div style="aspect-ratio:16/9; background:#000; border-radius:6px; overflow:hidden; margin-bottom:15px;">
                <img src="${proxyUrl}" style="width:100%; height:100%; object-fit:contain;">
            </div>
        `;
    } else if (isAudio) {
        mediaTypeLabel = 'Audio';
        mediaPreview = `
             <div style="background:#1a1a1a; border-radius:6px; padding:15px; margin-bottom:15px; border: 1px solid #333; display:flex; flex-direction:column; align-items:center;">
                <div style="font-size:3rem; margin-bottom:10px;">🎵</div>
                <audio id="pool-preview-audio" src="${proxyUrl}" controls style="width:100%;" 
                       onloadedmetadata="onPoolAudioLoaded(this)" onerror="onPoolAudioError(this, '${filename}')"></audio>
            </div>
        `;
    } else {
        // Video
        mediaTypeLabel = 'Cargando duración...';
        mediaPreview = `
            <div style="aspect-ratio:16/9; background:#000; border-radius:6px; overflow:hidden; margin-bottom:15px;">
                <video id="pool-preview-video" src="${proxyUrl}" controls style="width:100%; height:100%;"
                       onloadedmetadata="onPoolVideoLoaded(this)"></video>
            </div>
        `;
    }

    // Time picker only for video/audio (not images)
    const showTimePicker = !isImage;
    const timePickerHtml = showTimePicker ? `
        <div style="background:#1a2a3a; border:1px solid #2979ff33; border-radius:6px; padding:12px; margin-bottom:15px;">
            <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:8px;">⏱ Start Time (Offset)</label>
            <div style="display:flex; gap:10px; align-items:center;">
                <input type="text" id="pool-start-time" value="00:00:00" readonly
                       style="flex:1; background:#222; border:1px solid #444; color:#4fc3f7; padding:10px; border-radius:4px; font-family:monospace; font-size:1rem; text-align:center;">
                <button onclick="capturePoolTime()" style="background:#2979ff; border:none; color:#fff; padding:10px 15px; border-radius:4px; cursor:pointer; font-weight:bold;">
                    📍 Capturar
                </button>
            </div>
            <div style="font-size:0.7rem; color:#666; margin-top:6px;">Reproduce ${isAudio ? 'el audio' : 'el vídeo'} y pulsa "Capturar" en el momento deseado</div>
        </div>
    ` : '';

    inspector.innerHTML = `
        ${mediaPreview}
        
        <!-- File Info -->
        <div style="background:#222; border-radius:6px; padding:12px; margin-bottom:15px;">
            <div style="font-weight:bold; color:#fff; margin-bottom:8px; word-break:break-all;">${filename}</div>
            <div style="font-size:0.8rem; color:#888;">
                <span id="pool-duration-display">${mediaTypeLabel}</span>
            </div>
        </div>
        
        ${timePickerHtml}
        
        <!-- Link Button -->
        <button onclick="linkFromPoolInspector()" class="btn-accent" 
                style="width:100%; padding:15px; font-size:1rem; font-weight:bold; border-radius:6px; display:flex; align-items:center; justify-content:center; gap:8px;">
            🔗 Vincular a Escena
        </button>
    `;
}

// Old WaveSurfer functions removed.
function toggleWaveSurferPlayback() { }
function updateAudioTimeDisplay() { }

function onPoolAudioLoaded(audioEl) {
    if (currentPoolAsset && audioEl.duration && isFinite(audioEl.duration)) {
        currentPoolAsset.duration = audioEl.duration;
        const durationDisplay = document.getElementById('pool-duration-display');
        if (durationDisplay) {
            durationDisplay.textContent = `Duración: ${formatSecondsToTime(audioEl.duration)}`;
        }
    }
}

function onPoolAudioError(audioEl, originalFilename) {
    console.error('❌ Error loading audio proxy for:', originalFilename);
    const container = document.getElementById('audio-preview-container');
    if (container) {
        container.innerHTML = `
            <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
            <div style="color:#ff5252; font-size:0.9rem; margin-bottom:8px;">Error al cargar audio</div>
            <div style="color:#888; font-size:0.75rem;">${originalFilename}</div>
            <div style="color:#666; font-size:0.7rem; margin-top:8px;">Proxy no disponible. Reprocesa el archivo.</div>
        `;
    }
    const durationDisplay = document.getElementById('pool-duration-display');
    if (durationDisplay) {
        durationDisplay.textContent = 'Error de carga';
        durationDisplay.style.color = '#ff5252';
    }
}

function onPoolVideoLoaded(videoEl) {
    if (currentPoolAsset && videoEl.duration) {
        currentPoolAsset.duration = videoEl.duration;
        const durationDisplay = document.getElementById('pool-duration-display');
        if (durationDisplay) {
            durationDisplay.textContent = `Duración: ${formatSecondsToTime(videoEl.duration)}`;
        }
    }
}

function capturePoolTime() {
    const timeInput = document.getElementById('pool-start-time');
    let currentTime = 0;

    // Standard HTML5 media check
    const video = document.getElementById('pool-preview-video');
    const audio = document.getElementById('pool-preview-audio');

    if (video && video.style.display !== 'none') {
        currentTime = video.currentTime;
    } else if (audio && audio.style.display !== 'none') {
        currentTime = audio.currentTime;
    }

    if (timeInput && (currentTime > 0 || currentPoolAsset)) {
        timeInput.value = formatSecondsToTime(currentTime);
        timeInput.dataset.seconds = currentTime;
        showToast(`Tiempo capturado: ${formatSecondsToTime(currentTime)}`);
    } else {
        showToast("⚠️ No hay media reproduciendo");
    }
}

function linkFromPoolInspector() {
    if (!currentPoolAsset) {
        showToast("⚠️ Selecciona un asset primero");
        return;
    }

    // Get start time from input
    const timeInput = document.getElementById('pool-start-time');
    const startTime = timeInput ? parseFloat(timeInput.dataset.seconds || 0) : 0;

    linkVideoToCard(
        currentPoolAsset.filename,
        currentPoolAsset.thumbUrl,
        startTime,
        currentPoolAsset.duration
    );

    closeMediaPoolModal();
}


// --- DRAG & DROP LOGIC (Media Pool to Folder) ---

function onPoolDragStart(event, filename) {
    if (!filename) return;
    event.dataTransfer.setData('text/plain', filename);
    event.dataTransfer.effectAllowed = 'move';

    // Add class for visual feedback
    // We use setTimeout to ensure the class is added AFTER the drag starts, 
    // otherwise the drag ghost might include the 'dragging' style (opacity) which is double effect.
    setTimeout(() => {
        event.target.classList.add('dragging');
    }, 0);
}

function onPoolDragEnd(event) {
    event.target.classList.remove('dragging');
}

function onPoolFolderDragOver(event) {
    event.preventDefault(); // Necessary to allow dropping
    event.currentTarget.classList.add('drag-over');
    event.dataTransfer.dropEffect = 'move';
}

function onPoolFolderDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function onPoolFolderDrop(event, targetFolder) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');

    const assetPath = event.dataTransfer.getData('text/plain');
    if (!assetPath) return;

    // Prevent move if target is same as current folder (visual optimization)
    // Note: assetPath is "Folder/File.mp4". targetFolder is "Folder". 
    // We check if assetPath starts with targetFolder + '/'
    // BUT checking backend is safer.

    console.log(`📦 Moving ${assetPath} -> ${targetFolder || 'ROOT'}`);

    try {
        const res = await fetch('http://localhost:9999/assets/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: [assetPath],
                target_folder: targetFolder
            })
        });

        const data = await res.json();

        if (data.success) {
            showToast(`Movido a ${targetFolder || 'Raíz'} ✅`);

            // Optimistic UI Update: Remove card
            // Need to escape backslashes for querySelector if Windows path
            const safeSelect = assetPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const card = document.querySelector(`.pool-card[data-filename="${safeSelect}"]`);
            if (card) {
                card.style.transform = 'scale(0)';
                setTimeout(() => card.remove(), 200);
            }

        } else {
            // Handle specific errors
            if (data.errors && data.errors.length > 0) {
                showToast("⚠️ " + data.errors[0]); // Show first error
            } else {
                showToast("❌ Error : " + (data.message || "Desconocido"));
            }
        }
    } catch (e) {
        console.error(e);
        showToast("❌ Error de conexión");
    }
}


// Legacy function for backwards compatibility
function linkFromPoolModal(btnElement, filename, thumbUrl) {
    // 1. Intentar encontrar tiempo actual si hay preview
    let currentTime = 0;
    const card = btnElement.closest('.pool-item');
    if (card) {
        const video = card.querySelector('video');
        if (video) {
            currentTime = video.currentTime;
        }
    }

    // 2. Usar la función centralizada
    linkVideoToCard(filename, thumbUrl, currentTime);
    closeMediaPoolModal();
}

// =========================================
// === INGEST STUDIO MODULE (STORE PATTERN) ===
// =========================================

/**
 * IngestStore - Centralized state management for Ingest Studio
 * All state mutations go through this store for consistency and debugging
 */
const IngestStore = {
    // Configuration
    CONFIG: {
        PAGE_LIMIT: 50,
        SCROLL_THRESHOLD: 100,
        SEARCH_DEBOUNCE_MS: 300
    },

    // Centralized State
    state: {
        files: [],
        selected: new Set(),
        currentFile: null,
        filter: 'all',
        viewMode: 'list', // 'list' or 'grid'
        // Pagination
        page: 1,
        isLoading: false,
        hasMore: true,
        // Trim points (video editing)
        trimIn: 0,
        trimOut: 0,
        // Folder Navigation
        folder: null // [v7.6] Default: VIEW ALL (Recursive)
    },

    // Internal: Search debounce timer
    _searchTimer: null,

    // ===== State Mutation Methods =====

    /**
     * Reset all state to initial values
     */
    reset() {
        this.state.files = [];
        this.state.selected.clear();
        this.state.currentFile = null;
        this.state.filter = 'all';
        this.state.page = 1;
        this.state.isLoading = false;
        this.state.hasMore = true;
        this.state.trimIn = 0;
        this.state.trimOut = 0;
    },

    /**
     * Reset pagination state for new search/filter
     */
    resetPagination() {
        this.state.page = 1;
        this.state.files = [];
        this.state.hasMore = true;
    },

    /**
     * Set files array (append or replace)
     * @param {Array} newFiles - Files to add
     * @param {boolean} append - If true, append to existing; if false, replace
     */
    setFiles(newFiles, append = false) {
        if (append) {
            this.state.files = this.state.files.concat(newFiles);
        } else {
            this.state.files = newFiles;
        }
    },

    /**
     * Toggle file selection
     * @param {string} filename - File to toggle
     * @returns {boolean} - New selection state
     */
    toggleSelection(filename) {
        if (this.state.selected.has(filename)) {
            this.state.selected.delete(filename);
            return false;
        } else {
            this.state.selected.add(filename);
            return true;
        }
    },

    /**
     * Clear all selections
     */
    clearSelection() {
        this.state.selected.clear();
    },

    /**
     * Set current file being inspected
     * @param {string} filename - Filename to inspect
     * @returns {Object|null} - The file object or null if not found
     */
    setCurrentFile(filename) {
        this.state.currentFile = this.state.files.find(f => f.filename === filename) || null;
        return this.state.currentFile;
    },

    /**
     * Set filter type
     * @param {string} type - 'all', 'video', 'audio', 'image'
     */
    setFilter(type) {
        this.state.filter = type;
    },

    /**
     * Set view mode
     * @param {string} mode - 'list' or 'grid'
     */
    setViewMode(mode) {
        this.state.viewMode = mode;
    },

    /**
     * Set loading state
     * @param {boolean} loading 
     */
    setLoading(loading) {
        this.state.isLoading = loading;
    },

    /**
     * Set has more pages flag
     * @param {boolean} hasMore 
     */
    setHasMore(hasMore) {
        this.state.hasMore = hasMore;
    },

    /**
     * Increment page number
     */
    nextPage() {
        this.state.page++;
    },

    /**
     * Set trim points
     * @param {string} point - 'in' or 'out'
     * @param {number} time - Time in seconds
     */
    setTrimPoint(point, time) {
        if (point === 'in') {
            this.state.trimIn = time;
        } else if (point === 'out') {
            this.state.trimOut = time;
        }
    },

    /**
     * Reset trim points
     */
    resetTrimPoints() {
        this.state.trimIn = 0;
        this.state.trimOut = 0;
    },

    /**
     * Set current folder
     * @param {string} folderPath 
     */
    setFolder(folderPath) {
        this.state.folder = folderPath;
    },

    // ===== Convenience Getters =====

    get files() { return this.state.files; },
    get selectedCount() { return this.state.selected.size; },
    get selectedFiles() { return Array.from(this.state.selected); },
    get currentFile() { return this.state.currentFile; },
    get isLoading() { return this.state.isLoading; },
    get hasMore() { return this.state.hasMore; },
    get page() { return this.state.page; },
    get filter() { return this.state.filter; },
    get viewMode() { return this.state.viewMode; },
    get trimIn() { return this.state.trimIn; },
    get trimOut() { return this.state.trimOut; },
    get folder() { return this.state.folder; }
};

// ===== UI FUNCTIONS (use IngestStore) =====

function toggleIngestView(mode) {
    IngestStore.setViewMode(mode);
    document.getElementById('view-list-btn').style.background = mode === 'list' ? '#333' : '#222';
    document.getElementById('view-list-btn').style.borderColor = mode === 'list' ? 'var(--accent)' : '#444';
    document.getElementById('view-grid-btn').style.background = mode === 'grid' ? '#333' : '#222';
    document.getElementById('view-grid-btn').style.borderColor = mode === 'grid' ? 'var(--accent)' : '#444';
    renderIngestFiles();
}

async function openIngestModal() {
    document.getElementById('ingest-modal').style.display = 'flex';
    initIngestFolders(); // [New] Load folders
    await loadRawFiles(true);

    // Setup infinite scroll listener
    const container = document.getElementById('ingest-file-list');
    container.removeEventListener('scroll', handleIngestScroll);
    container.addEventListener('scroll', handleIngestScroll);

    startMonitorPolling(); // [v7.6.5] Start Monitor Polling
}

function closeIngestModal() {
    document.getElementById('ingest-modal').style.display = 'none';
    IngestStore.clearSelection();
    IngestStore.state.currentFile = null;

    // Clean up scroll listener
    const container = document.getElementById('ingest-file-list');
    container.removeEventListener('scroll', handleIngestScroll);

    stopMonitorPolling(); // [v7.6.5] Stop Monitor Polling
}

// Infinite Scroll Handler
function handleIngestScroll() {
    const container = document.getElementById('ingest-file-list');
    const { SCROLL_THRESHOLD } = IngestStore.CONFIG;

    if (container.scrollTop + container.clientHeight >= container.scrollHeight - SCROLL_THRESHOLD) {
        if (!IngestStore.isLoading && IngestStore.hasMore) {
            IngestStore.nextPage();
            loadRawFiles(false);
        }
    }
}

async function loadRawFiles(reset = false) {
    // Prevent concurrent requests
    if (IngestStore.isLoading) return;

    // Reset state for new search/filter
    if (reset) {
        IngestStore.resetPagination();
        const container = document.getElementById('ingest-file-list');
        container.innerHTML = '';
    }

    // Don't fetch if no more data
    if (!IngestStore.hasMore && !reset) return;

    IngestStore.setLoading(true);

    // Show loading indicator
    const container = document.getElementById('ingest-file-list');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'ingest-loading';
    loadingIndicator.style.cssText = 'text-align:center; padding:20px; color:#888; grid-column: 1/-1;';
    loadingIndicator.innerHTML = '⏳ Cargando...';

    if (IngestStore.page > 1) {
        container.appendChild(loadingIndicator);
    } else if (reset) {
        container.innerHTML = loadingIndicator.outerHTML;
    }

    try {
        const searchQuery = document.getElementById('ingest-search')?.value || '';
        const sortMode = document.getElementById('ingest-sort')?.value || 'date_desc';

        const params = new URLSearchParams({
            page: IngestStore.page,
            limit: IngestStore.CONFIG.PAGE_LIMIT,
            sort: sortMode
        });

        if (IngestStore.filter !== 'all') {
            params.append('filter_type', IngestStore.filter);
        }
        if (IngestStore.folder !== null) {
            params.append('folder', IngestStore.folder);
        }
        if (searchQuery.trim()) {
            params.append('search', searchQuery.trim());
        }

        const res = await fetch(`http://localhost:9999/raw-files?${params}`);
        const data = await res.json();

        // Remove loading indicator
        const existingLoader = document.getElementById('ingest-loading');
        if (existingLoader) existingLoader.remove();

        // Update store state
        IngestStore.setFiles(data.files, true); // Always append
        IngestStore.setHasMore(data.has_more);

        // Render files
        renderIngestFiles(reset);

    } catch (err) {
        console.error('Error loading raw files:', err);
        const existingLoader = document.getElementById('ingest-loading');
        if (existingLoader) existingLoader.remove();

        if (reset || IngestStore.page === 1) {
            container.innerHTML = '<div style="color: var(--danger); padding: 20px; text-align: center;">Error al cargar archivos</div>';
        }
    } finally {
        IngestStore.setLoading(false);
    }
}

function updateIngestFilter(type) {
    IngestStore.setFilter(type);
    ['all', 'video', 'audio', 'image'].forEach(t => {
        const btn = document.getElementById(`ingest-filter-${t}`);
        if (btn) {
            btn.style.background = (t === type) ? '#333' : '#222';
            btn.style.borderColor = (t === type) ? 'var(--accent)' : '#444';
        }
    });
    loadRawFiles(true);
}

// Debounced search input handler
function onIngestSearchInput() {
    clearTimeout(IngestStore._searchTimer);
    IngestStore._searchTimer = setTimeout(() => {
        loadRawFiles(true);
    }, IngestStore.CONFIG.SEARCH_DEBOUNCE_MS);
}

function onIngestSortChange() {
    loadRawFiles(true);
}

// [v7.6] FOLDER TREE LOGIC
async function initIngestFolders() {
    try {
        const res = await fetch('http://localhost:9999/folders?source=raw');
        const data = await res.json();
        renderIngestFolders(data.folders || []);
    } catch (e) {
        console.error("Error fetching ingest folders:", e);
        document.getElementById('ingest-folder-tree').innerHTML = '<div style="color:#d32f2f; text-align:center; padding:10px;">Error</div>';
    }
}

function renderIngestFolders(folders) {
    const container = document.getElementById('ingest-folder-tree');
    const current = IngestStore.folder;

    // 1. Todo (Recursive) - Virtual
    let html = `
        <div class="folder-tree-item ${current === null ? 'active' : ''}" 
             onclick="selectIngestFolder(null)"
             style="color: var(--accent); font-weight: bold; font-style: normal; justify-content:flex-start; text-align:left; padding-left:12px;">
             <span style="margin-right:8px;">🗃️</span> Todo
        </div>
    `;

    // 2. Brutos (Root) - Physical
    html += `
        <div class="folder-tree-item ${current === '' ? 'active' : ''}" 
             style="color:#fff; font-style:normal; justify-content:flex-start; text-align:left; padding-left:12px;"
             onclick="selectIngestFolder('')">
             <span style="color:#ffca28; margin-right:8px;">📁</span> Brutos (Raíz)
        </div>
    `;

    // 3. Subfolders
    html += folders.map(f => `
        <div class="folder-tree-item ${current === f ? 'active' : ''}" 
             style="color:#fff; font-style:normal; justify-content:flex-start; text-align:left; padding-left:12px;"
             onclick="selectIngestFolder('${f.replace(/'/g, "\\'")}')" 
             ondragover="onIngestFolderDragOver(event)"
             ondrop="onIngestFolderDrop(event, '${f.replace(/'/g, "\\'")}')"
             title="${f}">
             <span style="color:#ffca28; margin-right:8px;">📁</span> ${f}
        </div>
    `).join('');

    container.innerHTML = html;
}

function selectIngestFolder(path) {
    IngestStore.setFolder(path);
    initIngestFolders(); // Refresh visuals
    loadRawFiles(true);
}

async function createIngestFolder() {
    const rawName = await Modal.prompt("Nueva Carpeta", "");
    if (!rawName) return;

    // UI Feedback for sanitization is handled by API response or we can preview here
    try {
        const res = await fetch('http://localhost:9999/folders?source=raw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: rawName })
        });
        const d = await res.json();
        if (d.success) {
            showToast(`Carpeta creada: ${d.folder} ✅`);
            initIngestFolders();
        } else {
            showToast("❌ Error: " + (d.detail || d.message));
        }
    } catch (e) {
        console.error(e);
        showToast("❌ Error de conexión");
    }
}

// [MIGRATION v7.0] Sanitize Logic
async function sanitizeRawFiles() {
    const confirmed = await Modal.confirm(
        "🛡️ ¿Sanitizar nombres de archivo?",
        "Se convertirán a minúsculas, sin espacios ni caracteres especiales para máxima compatibilidad.",
        false
    );
    if (!confirmed) return;

    showToast("Sanitizando...", "info");
    try {
        const res = await fetch('http://localhost:9999/raw-files/sanitize', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            showToast(`✅ ${data.message}`, "success");
            // Reload immediately
            loadRawFiles(true);
        } else {
            showToast("Error al sanitizar", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Error de conexión", "error");
    }
}

function renderIngestFiles(fullRender = true) {
    const container = document.getElementById('ingest-file-list');
    const { files, state } = IngestStore;

    // Toggle grid/list mode class
    container.classList.toggle('grid-mode', state.viewMode === 'grid');

    if (files.length === 0 && !state.isLoading) {
        container.innerHTML = '<div style="color: #666; text-align: center; padding: 40px; grid-column: 1/-1;">No hay archivos</div>';
        // Clean up sanitizer button if exists
        const btn = document.getElementById('ingest-sanitize-btn');
        if (btn) btn.style.display = 'none';
        return;
    }

    // --- DETECT "DIRTY" FILES & INJECT BUTTON ---
    // Rule: Uppercase OR Spaces OR Unsafe Chars (keeping / for folders, . - _)
    const isDirtyRegex = /[^a-z0-9._\-\/]/;
    let hasDirtyFiles = files.some(f => isDirtyRegex.test(f.filename));

    // Inject Button logic (Dynamic)
    // In builder.html, the toolbar is the div containing #ingest-search, #view-list-btn, etc.
    // We can target the filter group using the known IDs.

    if (!document.getElementById('ingest-sanitize-btn')) {
        // Try to insert after the filter group
        const filterGroup = document.getElementById('ingest-filter-all')?.parentNode;

        if (filterGroup) {
            const btn = document.createElement('button');
            btn.id = 'ingest-sanitize-btn';
            btn.className = 'filter-btn'; // Re-use style for consistency, or override
            btn.style.backgroundColor = '#ffca28';
            btn.style.color = '#000';
            btn.style.fontWeight = 'bold';
            btn.style.border = '1px solid #ffd54f';
            btn.style.marginLeft = '15px';
            btn.style.display = 'none';
            btn.innerHTML = '🛡️ Sanitizar Todo';
            btn.onclick = sanitizeRawFiles;

            // Insert after the filter group
            filterGroup.parentNode.insertBefore(btn, filterGroup.nextSibling);
        }
    }

    const sanitizeBtn = document.getElementById('ingest-sanitize-btn');
    if (sanitizeBtn) {
        // ALWAYS VISIBLE per v7.7 UI Polish
        sanitizeBtn.style.display = 'inline-block';
    }

    const icons = { video: '🎬', audio: '🎵', image: '🖼️', unknown: '📄' };

    const filesHTML = files.map(file => {
        const isSelected = state.selected.has(file.filename);
        const safeFilename = file.filename.replace(/'/g, "\\'");

        // Visual Cleanup in renderIngestFiles: Force clean filename
        const pathParts = file.filename.split('/');
        const displayName = pathParts.pop();
        const parentFolder = pathParts.length > 0 ? pathParts.join('/') : '';
        const folderBadge = parentFolder ? `<div style="font-size:0.65rem; color:#666; margin-top:2px; overflow:hidden; text-overflow:ellipsis;" title="Ubicación: ${parentFolder}">📂 ${parentFolder}</div>` : '';

        // Check Dirty (Only filename, ignore folder path)
        const isDirty = isDirtyRegex.test(displayName);
        const warningIcon = isDirty ? '<span title="El nombre no es seguro. Pulsa 🛡️ Sanitizar." style="cursor:help; margin-left:1px;">⚠️</span>' : '';

        if (state.viewMode === 'grid') {
            const encodedFilename = encodeURIComponent(file.filename);
            let mediaContent = '';

            // Fix Media Pool consistency: 16:9 aspect ratio and better styling
            if (file.type === 'image') {
                mediaContent = `<img src="http://localhost:9999/raw-content/${encodedFilename}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.nextElementSibling.style.display='flex'">
                                <div style="display:none; width:100%; height:100%; background:#333; justify-content:center; align-items:center; font-size:2rem;">🖼️</div>`;
            } else if (file.type === 'video') {
                mediaContent = `<video src="http://localhost:9999/raw-content/${encodedFilename}#t=1.0" preload="metadata" muted style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.nextElementSibling.style.display='flex'"></video>
                                <div style="display:none; width:100%; height:100%; background:#333; justify-content:center; align-items:center; font-size:2rem;">🎬</div>`;
            } else if (file.type === 'audio') {
                mediaContent = `<div style="width:100%; height:100%; background:#1a1a1a; display:flex; justify-content:center; align-items:center; flex-direction:column; gap:5px;">
                                    <div style="font-size:2.5rem;">🎵</div>
                                </div>`;
            } else {
                mediaContent = `<div style="width:100%; height:100%; background:#222; display:flex; justify-content:center; align-items:center;">
                                    <div style="font-size:2rem;">📄</div>
                                </div>`;
            }

            return `
                <div class="grid-card ${isSelected ? 'selected' : ''}" onclick="toggleFileSelection('${safeFilename}')"
                     draggable="true" 
                     ondragstart="onIngestDragStart(event, '${safeFilename}')"
                     oncontextmenu="onIngestContextMenu(event, '${safeFilename}')"
                     style="background:#252525; border-radius:6px; overflow:hidden; border:2px solid ${isSelected ? 'var(--accent)' : 'transparent'}; position:relative; transition:all 0.1s;">
                    
                    <div style="aspect-ratio:16/9; background:#000; position:relative; overflow:hidden;">
                        ${mediaContent}
                        
                        <!-- Checkbox Overlay -->
                        <div style="position:absolute; top:8px; left:8px; z-index:10;" onclick="event.stopPropagation()">
                             <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${safeFilename}')" 
                                    style="width:18px; height:18px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.5);">
                        </div>
                    </div>

                    <div style="padding:8px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div style="font-size:0.75rem; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;" 
                             title="${file.filename}">
                            <div style="${isDirty ? 'color:#ffca28' : ''}; font-weight:500;">${warningIcon} ${displayName}</div>
                            ${folderBadge}
                        </div>
                        
                        <button onclick="event.stopPropagation(); inspectFile('${safeFilename}')" 
                                style="background:transparent; border:1px solid #444; color:#aaa; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.7rem; flex-shrink:0;">
                            INFO
                        </button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="ingest-file-item ${isSelected ? 'selected' : ''}" onclick="toggleFileSelection('${safeFilename}')"
                     draggable="true" 
                     ondragstart="onIngestDragStart(event, '${safeFilename}')"
                     oncontextmenu="onIngestContextMenu(event, '${safeFilename}')">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleFileSelection('${safeFilename}')">
                    <div class="ingest-file-icon">${icons[file.type] || icons.unknown}</div>
                    <div class="ingest-file-details">
                        <div class="ingest-file-name" title="${file.filename}" style="${isDirty ? 'color:#ffca28' : ''}; font-weight:500;">
                            ${displayName} ${warningIcon}
                        </div>
                        ${folderBadge ? `<div style="font-size:0.7rem; color:#666;">📂 ${parentFolder}</div>` : ''}
                        <div class="ingest-file-size">${file.size}</div>
                    </div>
                    <button onclick="event.stopPropagation(); inspectFile('${safeFilename}')" 
                        style="background: var(--accent); border: none; color: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
                        Ver
                    </button>
                </div>
            `;
        }
    }).join('');

    container.innerHTML = filesHTML;

    // Add "more to load" indicator
    if (IngestStore.hasMore && !IngestStore.isLoading) {
        const moreIndicator = document.createElement('div');
        moreIndicator.style.cssText = 'text-align:center; padding:15px; color:#666; font-size:0.85rem; grid-column: 1/-1;';
        moreIndicator.innerHTML = '↓ Desplaza para cargar más';
        container.appendChild(moreIndicator);
    }
}

function toggleFileSelection(filename) {
    // Toggle state in store
    const isNowSelected = IngestStore.toggleSelection(filename);

    // === ZERO-FLICKER DOM UPDATE ===
    // Find the element directly instead of re-rendering everything
    const safeFilename = CSS.escape(filename);

    // Try list view first, then grid view
    let el = document.querySelector(`.ingest-file-item[onclick*="${safeFilename}"]`);
    if (!el) {
        el = document.querySelector(`.grid-card[onclick*="${safeFilename}"]`);
    }

    if (el) {
        // Toggle selected class
        el.classList.toggle('selected', isNowSelected);

        // Update checkbox
        const checkbox = el.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = isNowSelected;
        }
    }

    // Update selection counter if exists
    const counterEl = document.getElementById('ingest-selection-count');
    if (counterEl) {
        counterEl.textContent = IngestStore.selectedCount;
    }
}

async function inspectFile(filename) {
    const file = IngestStore.setCurrentFile(filename);
    if (!file) return;

    const inspector = document.getElementById('ingest-inspector');
    const fileUrl = `http://localhost:9999/raw-content/${encodeURIComponent(file.filename)}`;
    const isVideo = file.type === 'video';
    const isImage = file.type === 'image';
    const isAudio = file.type === 'audio';

    let previewHTML = '';
    if (isVideo) {
        previewHTML = `<video id="ingest-preview-video" controls 
            style="width: 100%; aspect-ratio: 16/9; background: #000; object-fit: contain; border-radius: 8px;" 
            src="${fileUrl}"></video>`;
    } else if (isImage) {
        previewHTML = `<img src="${fileUrl}" style="width: 100%; max-height: 400px; object-fit: contain; border-radius: 8px;">`;
    } else if (isAudio) {
        previewHTML = `
            <div style="background:#1a1a1a; padding:20px; text-align:center; border-radius:8px; margin-bottom:10px;">
                 <div style="font-size:3rem; margin-bottom:15px;">🎵</div>
                 <audio id="ingest-preview-audio" controls style="width: 100%;" src="${fileUrl}"></audio>
            </div>
        `;
    }

    const shortName = file.filename.split('/').pop();
    const folderPath = file.filename.includes('/') ? file.filename.substring(0, file.filename.lastIndexOf('/')) : 'Raíz';

    inspector.innerHTML = `
        <div>
            <h4 style="margin: 0 0 10px 0; color: var(--accent);">Inspector</h4>
            ${previewHTML}
            
            <div style="margin-top: 15px;">
                <label style="display: block; margin-bottom: 2px; font-size: 0.85rem; color: #aaa;">Renombrar</label>
                <small style="display: block; color: #666; font-size: 0.7rem; margin-bottom: 5px;">📍 Carpeta: ${folderPath}</small>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="rename-input" value="${shortName}" 
                        style="flex: 1; background: #222; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px;"
                        oninput="this.value = this.value.replace(/ /g, '_').toLowerCase()">
                    <button onclick="renameCurrentFile()" 
                        style="background: var(--success); border: none; color: #fff; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        💾 Guardar
                    </button>
                </div>
                <small style="color: #666; font-size: 0.75rem;">Los espacios se reemplazan automáticamente por guiones bajos</small>
            </div>
            
            ${isVideo ? `
                <div style="margin-top: 20px; padding: 15px; background: #222; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: var(--success);">✂️ Recorte Lossless</h4>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <button onclick="setTrimIn()" style="flex: 1; padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">
                            📍 Marcar IN
                        </button>
                        <button onclick="setTrimOut()" style="flex: 1; padding: 8px; background: #444; border: none; color: #fff; border-radius: 4px; cursor: pointer;">
                            📍 Marcar OUT
                        </button>
                    </div>
                    <div style="font-size: 0.9rem; color: #aaa; margin-bottom: 10px;">
                        IN: <span id="trim-in-display">00:00:00</span> | OUT: <span id="trim-out-display">00:00:00</span>
                    </div>
                    <input type="text" id="trim-output-name" placeholder="nombre_clip.mp4" 
                        style="width: 100%; background: #222; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; margin-bottom: 10px;"
                        oninput="this.value = this.value.replace(/ /g, '_').toLowerCase()">
                    <button onclick="executeTrim()" 
                        style="width: 100%; padding: 10px; background: var(--accent); border: none; color: #fff; border-radius: 4px; cursor: pointer; font-weight: bold;">
                        ✂️ Extraer Clip (Sin pérdida)
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    IngestStore.resetTrimPoints();
}

async function renameCurrentFile() {
    let newName = document.getElementById('rename-input').value;
    const currentFile = IngestStore.currentFile;
    if (!newName || !currentFile) return;

    // [v7.6.4] Extension Constraint
    const originalExt = currentFile.filename.substring(currentFile.filename.lastIndexOf('.'));
    let cleanName = newName.replace(/ /g, '_').toLowerCase();

    // Auto-append extension if missing
    if (!cleanName.endsWith(originalExt)) {
        cleanName += originalExt;
    }

    try {
        // [PATH SAFETY] Reconstruct full path
        const lastSlash = currentFile.filename.lastIndexOf('/');
        const parentFolder = lastSlash !== -1 ? currentFile.filename.substring(0, lastSlash) : '';
        const reconstructedPath = parentFolder ? `${parentFolder}/${cleanName}` : cleanName;

        const res = await fetch('http://localhost:9999/raw-files/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_name: currentFile.filename, new_name: reconstructedPath })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Archivo renombrado');
            await loadRawFiles(true);
            inspectFile(reconstructedPath);
        } else {
            showToast('❌ Error: ' + (data.detail || 'No se pudo renombrar'));
        }
    } catch (err) {
        showToast('❌ Error de conexión');
    }
}

function setTrimIn() {
    const video = document.getElementById('ingest-preview-video');
    if (video) {
        IngestStore.setTrimPoint('in', video.currentTime);
        document.getElementById('trim-in-display').textContent = formatTime(IngestStore.trimIn);
    }
}

function setTrimOut() {
    const video = document.getElementById('ingest-preview-video');
    if (video) {
        IngestStore.setTrimPoint('out', video.currentTime);
        document.getElementById('trim-out-display').textContent = formatTime(IngestStore.trimOut);
    }
}

async function executeTrim() {
    let outputName = document.getElementById('trim-output-name').value;
    const currentFile = IngestStore.currentFile;

    if (!outputName) {
        showToast('⚠️ Especifica un nombre para el clip');
        return;
    }
    if (IngestStore.trimOut <= IngestStore.trimIn) {
        showToast('⚠️ El punto OUT debe ser mayor que IN');
        return;
    }

    // [FIX] Auto-extension
    if (!outputName.includes('.')) {
        const ext = currentFile.filename.split('.').pop();
        outputName = `${outputName}.${ext}`;
        console.log("✂️ Extensión auto-agregada:", outputName);
    }

    try {
        // [PATH SAFETY] Reconstruct full path for target_name
        const lastSlash = currentFile.filename.lastIndexOf('/');
        const parentFolder = lastSlash !== -1 ? currentFile.filename.substring(0, lastSlash) : '';
        const targetPath = parentFolder ? `${parentFolder}/${outputName}` : outputName;

        showToast('⏳ Recortando... (esto puede tardar un momento)');
        const res = await fetch('http://localhost:9999/ingest/trim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: currentFile.filename,
                start: IngestStore.trimIn,
                end: IngestStore.trimOut,
                target_name: targetPath
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Clip extraído: ' + data.output_file);
            await loadRawFiles(true);
        } else {
            showToast('❌ Error: ' + (data.detail || 'No se pudo recortar'));
        }
    } catch (err) {
        showToast('❌ Error de conexión');
    }
}

async function deleteSelectedFiles() {
    const count = IngestStore.selectedCount;
    if (count === 0) {
        showToast('⚠️ Selecciona archivos para eliminar');
        return;
    }
    const confirmed = await Modal.confirm(
        "¿Eliminar archivos?",
        `¿Estás seguro de que quieres eliminar ${count} archivo(s)?`,
        true
    );
    if (!confirmed) return;

    for (const filename of IngestStore.selectedFiles) {
        try {
            await fetch('http://localhost:9999/raw-files', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
        } catch (err) {
            console.error('Error deleting:', filename, err);
        }
    }

    showToast(`🗑️ Eliminados ${count} archivos`);
    IngestStore.clearSelection();
    await loadRawFiles(true);
}

async function processSelectedFiles() {
    const count = IngestStore.selectedCount;
    if (count === 0) {
        showToast('⚠️ Selecciona archivos para procesar');
        return;
    }

    try {
        showToast('🚀 Moviendo archivos a procesamiento...');
        const res = await fetch('http://localhost:9999/ingest/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: IngestStore.selectedFiles })
        });
        const data = await res.json();
        showToast(`✅ Procesados: ${data.moved.length} archivos`);
        IngestStore.clearSelection();
        await loadRawFiles(true);
    } catch (err) {
        showToast('❌ Error de conexión');
    }
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
                { keys: ["Shift", "Enter"], desc: "Nueva Escena (Siempre activo)" },
                { keys: ["Ctrl", "D"], desc: "Duplicar Escena Seleccionada" },
                { keys: ["Supr"], desc: "Eliminar Escena" },
                { keys: ["←", "→"], desc: "Moverse entre escenas (si implementado)" }
            ]
        },
        {
            title: "🖱️ Navegación y UI",
            shortcuts: [
                { keys: ["Ctrl", "Rueda Ratón"], desc: "Zoom en Línea de Tiempo" },
                { keys: ["Clic", "Arrastrar"], desc: "Panorámica (Scroll horizontal)" },
                { keys: ["Esc"], desc: "Cerrar Ventanas / Cancelar" },
                { keys: ["Enter"], desc: "Confirmar acción" }
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
