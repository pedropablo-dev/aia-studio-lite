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
function createId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

