// --- PROJECT STATE ENCAPSULATION ---
export class ProjectState {
    constructor() {
        this.imageBank = {};
        this.blobCache = {};
        this.scenes = [];
        this.projectTitle = "Nuevo Proyecto";
        this.isTimelineOutlineOpen = false;

        // Configs por defecto
        this.presetColors = [
            { name: "Estándar", code: "#455a64" },
            { name: "B-Roll", code: "#2e7d32" },
            { name: "Pantalla", code: "#6a1b9a" },
            { name: "VFX", code: "#00838f" },
            { name: "Gancho", code: "#fbc02d" },
            { name: "CTA", code: "#c62828" }
        ];

        this.presetSections = [
            { name: "SECCIÓN", code: "#252525" },
            { name: "INTRO", code: "#90caf9" },
            { name: "PROBLEMA", code: "#ffcc80" },
            { name: "AGITACIÓN", code: "#ef9a9a" },
            { name: "SOLUCIÓN", code: "#a5d6a7" },
            { name: "EL SISTEMA", code: "#80deea" },
            { name: "CIERRE", code: "#ce93d8" }
        ];

        this.presetSpeakers = [
            { name: "Hablante", code: "transparent" },
            { name: "Voz en Off", code: "#b0bec5" },
            { name: "Fernando", code: "#ff6d00" },
            { name: "Pedro P.", code: "#2962ff" },
            { name: "Lorena", code: "#d500f9" },
            { name: "Max", code: "#f9e800ff" },
            { name: "Marcelo", code: "#be7200ff" },
            { name: "Extra", code: "#00f5f9ff" }
        ];

        this.presetShots = ["Plano", "Plano General", "Plano Medio", "Primer Plano", "Primerísimo P.P.", "Plano Detalle", "Gran Plano Gral"];
        this.presetMoves = ["Movimiento", "Fijo", "Panorámica", "Tilt", "Zoom In", "Zoom Out", "Tracking/Dolly", "Cámara en Mano", "VFX"];

        this.projectChecklist = [
            { name: "Idea", checked: true },
            { name: "Guion", checked: false },
            { name: "Locución", checked: false },
            { name: "Grabación", checked: false },
            { name: "Edición", checked: false },
            { name: "Render", checked: false }
        ];

        // Variables de estado temporal
        this.tempColors = [];
        this.tempSections = [];
        this.tempSpeakers = [];
        this.tempShots = [];
        this.tempMoves = [];
        this.tempChecklist = [];
        this.recentColors = [];

        // Selección Global
        this.selectedId = null;
        this.currentEditingId = null;
        this.currentColorSceneId = null;
        this.currentSectionSceneId = null;
        this.currentSpeakerSceneId = null;
        this.currentZoom = 1.0;

        // Undo/Redo
        this.MAX_HISTORY = 50;
        this.undoStack = [];
        this.redoStack = [];
    }

    // Libera todas las URLs de Blob del esquema lateral para evitar fugas de memoria.
    clearBlobCache() {
        Object.values(this.blobCache).forEach(url => { try { URL.revokeObjectURL(url); } catch (_) { } });
        this.blobCache = {};
    }

    // Evita fugas de memoria al sobreescribir blobs
    setBlobCache(id, blobOrRaw) {
        if (this.blobCache[id] && typeof this.blobCache[id] === 'string' && this.blobCache[id].startsWith('blob:')) {
            try {
                URL.revokeObjectURL(this.blobCache[id]);
            } catch (e) {
                console.warn("Failed to revoke previous blob URL:", e);
            }
        }

        if (blobOrRaw instanceof Blob) {
            this.blobCache[id] = URL.createObjectURL(blobOrRaw);
        } else {
            this.blobCache[id] = blobOrRaw; // For raw data urls
        }
    }

    saveToHistory() {
        const state = {
            projectTitle: this.projectTitle,
            scenes: JSON.parse(JSON.stringify(this.scenes)),
            projectChecklist: JSON.parse(JSON.stringify(this.projectChecklist)),
            configs: {
                colors: this.presetColors,
                sections: this.presetSections,
                speakers: this.presetSpeakers,
                shots: this.presetShots,
                moves: this.presetMoves
            }
        };
        this.undoStack.push(state);
        if (this.undoStack.length > this.MAX_HISTORY) this.undoStack.shift();
        this.redoStack = [];

        // ---> Disparar auto-guardado a BBDD 
        if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
    }

    updateProjectTitle(val) {
        this.projectTitle = val;
        // No llamamos a saveState() en cada letra para no saturar el historial, 
        // pero sí actualizamos el título del documento HTML (pestaña del navegador)
        document.title = val + " - AIA Studio";
        if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
    }

    restoreState(state) {
        this.scenes = JSON.parse(JSON.stringify(state.scenes));
        if (state.projectTitle) {
            this.projectTitle = state.projectTitle;
            const titleInput = document.getElementById('project-title-input');
            if (titleInput) titleInput.value = this.projectTitle;
        }
        this.projectChecklist = JSON.parse(JSON.stringify(state.projectChecklist));

        if (state.configs) {
            this.presetColors = state.configs.colors;
            this.presetSections = state.configs.sections;
            this.presetSpeakers = state.configs.speakers;
            this.presetShots = state.configs.shots;
            this.presetMoves = state.configs.moves;
        }

        // Requiere globales, se asume que app.js será refactorizado pronto
        if (typeof window.render === 'function') window.render();
        if (typeof window.renderChecklist === 'function') window.renderChecklist();
        if (typeof window.calculateTotalTime === 'function') window.calculateTotalTime();
        if (typeof window.updateLayoutWidth === 'function') window.updateLayoutWidth();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push({
            scenes: JSON.parse(JSON.stringify(this.scenes)),
            projectChecklist: JSON.parse(JSON.stringify(this.projectChecklist)),
            configs: { colors: this.presetColors, sections: this.presetSections, speakers: this.presetSpeakers, shots: this.presetShots, moves: this.presetMoves }
        });
        this.restoreState(this.undoStack.pop());
        if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
        if (typeof window.showToast === 'function') window.showToast("Deshacer");
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const currentState = {
            scenes: JSON.parse(JSON.stringify(this.scenes)),
            projectChecklist: JSON.parse(JSON.stringify(this.projectChecklist)),
            configs: {
                colors: this.presetColors,
                sections: this.presetSections,
                speakers: this.presetSpeakers,
                shots: this.presetShots,
                moves: this.presetMoves
            }
        };

        this.undoStack.push(currentState);
        if (this.undoStack.length > this.MAX_HISTORY) this.undoStack.shift();

        const nextState = this.redoStack.pop();
        this.restoreState(nextState);

        if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
        if (typeof window.showToast === 'function') window.showToast("Rehacer");
    }

    createId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
}

// --- EXPLORER STATE ENCAPSULATION ---
export class ExplorerState {
    constructor() {
        this.currentFileSceneId = null;  // [LITE] ID de la escena que abrió el file picker
        this.currentBrowsePath = '';     // [LITE] Subpath actual en el explorador jerárquico
        this.liteDeepestPath = '';       // [LITE] Ruta más profunda visitada (para navegación jerárquica ►)
    }
}

// --- SINGLETON EXPORTS ---
export const projectState = new ProjectState();
export const explorerState = new ExplorerState();

// ----------------------------------------------------------------------
// --- RETROCOMPATIBILIDAD CRÍTICA (Fase de Transición) ---
// ----------------------------------------------------------------------
// Como app.js y otros módulos antiguos confían let globals en window o en el scope raíz
// necesitamos inyectar de nuevo este estado de forma simulada.

// Project State
Object.defineProperty(window, 'imageBank', { get: () => projectState.imageBank, set: (v) => projectState.imageBank = v });
Object.defineProperty(window, 'blobCache', { get: () => projectState.blobCache, set: (v) => projectState.blobCache = v });
Object.defineProperty(window, 'scenes', { get: () => projectState.scenes, set: (v) => projectState.scenes = v });
Object.defineProperty(window, 'projectTitle', { get: () => projectState.projectTitle, set: (v) => projectState.projectTitle = v });
Object.defineProperty(window, 'isTimelineOutlineOpen', { get: () => projectState.isTimelineOutlineOpen, set: (v) => projectState.isTimelineOutlineOpen = v });

Object.defineProperty(window, 'presetColors', { get: () => projectState.presetColors, set: (v) => projectState.presetColors = v });
Object.defineProperty(window, 'presetSections', { get: () => projectState.presetSections, set: (v) => projectState.presetSections = v });
Object.defineProperty(window, 'presetSpeakers', { get: () => projectState.presetSpeakers, set: (v) => projectState.presetSpeakers = v });
Object.defineProperty(window, 'presetShots', { get: () => projectState.presetShots, set: (v) => projectState.presetShots = v });
Object.defineProperty(window, 'presetMoves', { get: () => projectState.presetMoves, set: (v) => projectState.presetMoves = v });
Object.defineProperty(window, 'projectChecklist', { get: () => projectState.projectChecklist, set: (v) => projectState.projectChecklist = v });

Object.defineProperty(window, 'tempColors', { get: () => projectState.tempColors, set: (v) => projectState.tempColors = v });
Object.defineProperty(window, 'tempSections', { get: () => projectState.tempSections, set: (v) => projectState.tempSections = v });
Object.defineProperty(window, 'tempSpeakers', { get: () => projectState.tempSpeakers, set: (v) => projectState.tempSpeakers = v });
Object.defineProperty(window, 'tempShots', { get: () => projectState.tempShots, set: (v) => projectState.tempShots = v });
Object.defineProperty(window, 'tempMoves', { get: () => projectState.tempMoves, set: (v) => projectState.tempMoves = v });
Object.defineProperty(window, 'tempChecklist', { get: () => projectState.tempChecklist, set: (v) => projectState.tempChecklist = v });
Object.defineProperty(window, 'recentColors', { get: () => projectState.recentColors, set: (v) => projectState.recentColors = v });

Object.defineProperty(window, 'selectedId', { get: () => projectState.selectedId, set: (v) => projectState.selectedId = v });
Object.defineProperty(window, 'currentEditingId', { get: () => projectState.currentEditingId, set: (v) => projectState.currentEditingId = v });
Object.defineProperty(window, 'currentColorSceneId', { get: () => projectState.currentColorSceneId, set: (v) => projectState.currentColorSceneId = v });
Object.defineProperty(window, 'currentSectionSceneId', { get: () => projectState.currentSectionSceneId, set: (v) => projectState.currentSectionSceneId = v });
Object.defineProperty(window, 'currentSpeakerSceneId', { get: () => projectState.currentSpeakerSceneId, set: (v) => projectState.currentSpeakerSceneId = v });
Object.defineProperty(window, 'currentZoom', { get: () => projectState.currentZoom, set: (v) => projectState.currentZoom = v });

Object.defineProperty(window, 'undoStack', { get: () => projectState.undoStack, set: (v) => projectState.undoStack = v });
Object.defineProperty(window, 'redoStack', { get: () => projectState.redoStack, set: (v) => projectState.redoStack = v });
Object.defineProperty(window, 'MAX_HISTORY', { get: () => projectState.MAX_HISTORY });

// Explorer State
Object.defineProperty(window, 'currentFileSceneId', { get: () => explorerState.currentFileSceneId, set: (v) => explorerState.currentFileSceneId = v });
Object.defineProperty(window, 'currentBrowsePath', { get: () => explorerState.currentBrowsePath, set: (v) => explorerState.currentBrowsePath = v });
Object.defineProperty(window, 'liteDeepestPath', { get: () => explorerState.liteDeepestPath, set: (v) => explorerState.liteDeepestPath = v });

// Methods Backwards Compatibility
window.clearBlobCache = () => projectState.clearBlobCache();
window.saveToHistory = () => projectState.saveToHistory();
window.updateProjectTitle = (val) => projectState.updateProjectTitle(val);
window.undo = () => projectState.undo();
window.redo = () => projectState.redo();
window.createId = () => projectState.createId();

window.setBlobCache = (id, blobOrRaw) => projectState.setBlobCache(id, blobOrRaw);
