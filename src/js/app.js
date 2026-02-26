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
        document.querySelectorAll('.scene-card').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
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

    try {
        const data = await liteFetchFilesApi(subpath);
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

    try {
        const data = await liteSearchFilesApi(query);
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
