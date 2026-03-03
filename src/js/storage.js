// --- CONSTANTES GLOBALES DE PERSISTENCIA ---
import { ProjectState } from './projectState.js';

const AUTOSAVE_DELAY = 1000;
let autosaveTimer = null;

// ================================================================
// NUEVO MOTOR DE PERSISTENCIA REST (SQLite)
// ================================================================

let debounceSaveTimer = null;
function debouncedSaveState() {
    if (debounceSaveTimer) clearTimeout(debounceSaveTimer);
    debounceSaveTimer = setTimeout(() => {
        saveState();
    }, 3000);
}

function triggerAutoSave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        debouncedSaveState();
    }, AUTOSAVE_DELAY);
}

/**
 * Construye el payload completo y lo envía al backend SQLite.
 * Sustituye a 'saveProjectSafe' y elimina completamente IndexedDB.
 */
async function saveState() {
    if (!scenes || !Array.isArray(scenes)) {
        console.error("[Storage] Abortando guardado: escenas corruptas o nulas.");
        return;
    }

    const payload = {
        id: ProjectState.getId(),
        title: projectTitle || "Mi Proyecto",
        metadata_config: {
            colors: presetColors,
            recentColors: recentColors,
            sections: presetSections,
            speakers: presetSpeakers,
            shots: presetShots,
            moves: presetMoves,
            projectChecklist: projectChecklist,
            zoom: currentZoom,
            exportSettings: {
                mediaPath: document.getElementById('media-path-input')?.value || '',
                mediaExt: document.getElementById('media-ext-input')?.value || '.mp4'
            }
        },
        scenes: scenes
    };

    try {
        await liteSaveProjectApi(payload);
        // showToast('Proyecto guardado', 'success'); // Silenced per request

        // Limpiamos errores previos si los hubiera
        const toastEl = document.getElementById("toast");
        if (toastEl && toastEl.innerText.includes("Desconexión")) {
            toastEl.className = "toast";
        }
    } catch (error) {
        console.error("[Storage] Fallo al guardar en SQLite:", error);
        showToast("❌ Error crítico: Desconexión del Servidor local", "error");
    }
}


/**
 * Solicita el último estado de SQLite al arrancar la app.
 * Sustituye a 'loadFromLocal'
 */
async function loadFromLocal() {
    try {
        const currentId = ProjectState.getId();
        const data = await liteLoadProjectApi(currentId);

        // --- RESTAURAR DATOS ---
        if (data.scenes && Array.isArray(data.scenes)) {
            // Aplanar la estructura de SQLite (scene_data a nivel de objeto)
            const flattenedScenes = data.scenes.map(scene => {
                if (scene.scene_data) {
                    return { id: scene.id, ...scene.scene_data };
                }
                return scene; // Fallback por si acaso
            });
            scenes = flattenedScenes;
        }
        if (data.title) {
            projectTitle = data.title;
            const titleInput = document.getElementById('project-title-input');
            if (titleInput) { titleInput.value = projectTitle; titleInput.title = projectTitle; }
            document.title = projectTitle + " - AIA Studio";
        }

        if (data.metadata_config) {
            const m = data.metadata_config;
            presetColors = m.colors || presetColors;
            recentColors = m.recentColors || recentColors;
            presetSections = m.sections || presetSections;
            presetSpeakers = m.speakers || presetSpeakers;
            presetShots = m.shots || presetShots;
            presetMoves = m.moves || presetMoves;
            projectChecklist = m.projectChecklist || projectChecklist;
            // if (m.zoom) currentZoom = m.zoom; // Bloqueado para forzar zoom 100% global

            if (m.exportSettings) {
                const p = document.getElementById('media-path-input');
                const e = document.getElementById('media-ext-input');
                if (p && m.exportSettings.mediaPath) p.value = m.exportSettings.mediaPath;
                if (e && m.exportSettings.mediaExt) e.value = m.exportSettings.mediaExt;
            }
        }

        console.log(`✅ Proyecto '${currentId}' restaurado desde SQLite.`);

        // 5. Force UI refresh
        if (typeof render === 'function') render();
        if (typeof renderChecklist === 'function') renderChecklist();
        if (typeof resetView === 'function') resetView();

        return true;

    } catch (error) {
        console.warn("[Storage] No se pudo cargar proyecto inicial (Primera vez o servidor off). Inicializando vacío.", error);
        return false;
    }
}

// --- IMPORTACIÓN JSON (TRADUCCIÓN DE LEGACY) ---
function loadProject(input) {
    const f = input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async (e) => {
        try {
            // 1. Bloqueo y guardado de seguridad del proyecto actual
            if (typeof debounceSaveTimer !== 'undefined' && debounceSaveTimer) clearTimeout(debounceSaveTimer);
            if (typeof autosaveTimer !== 'undefined' && autosaveTimer) clearTimeout(autosaveTimer);
            await saveState();

            // 2. Transición a nuevo ID seguro
            const newImportId = 'proj_imp_' + Date.now();
            if (typeof ProjectState !== 'undefined') {
                ProjectState.setId(newImportId);
            }

            const data = JSON.parse(e.target.result);

            // 3. Limpieza y REGENERACIÓN DE IDs (Evita IntegrityError en SQLite)
            let importedScenes = Array.isArray(data) ? data : (data.scenes || []);
            importedScenes = importedScenes.map(scene => {
                // Forzamos un ID nuevo para cada escena importada
                scene.id = createId();
                delete scene.imageId;
                delete scene.imageSrc;
                return scene;
            });

            // 4. Título con etiqueta de importación
            projectTitle = (data.projectTitle || data.title || "Proyecto") + " (Importado)";
            const titleInput = document.getElementById('project-title-input');
            if (titleInput) titleInput.value = projectTitle;
            document.title = projectTitle + " - AIA Studio";

            // Translador inverso
            if (data.configs || data.presetColors) {
                // Formato antiguo
                presetColors = (data.configs && data.configs.colors) || data.presetColors || presetColors;
                presetSections = (data.configs && data.configs.sections) || data.presetSections || presetSections;
                presetSpeakers = (data.configs && data.configs.speakers) || data.presetSpeakers || presetSpeakers;
                presetShots = (data.configs && data.configs.shots) || data.presetShots || presetShots;
                presetMoves = (data.configs && data.configs.moves) || data.presetMoves || presetMoves;
            } else if (data.metadata_config) {
                // Formato moderno
                const m = data.metadata_config;
                if (m.colors) presetColors = m.colors;
                if (m.sections) presetSections = m.sections;
                if (m.speakers) presetSpeakers = m.speakers;
                if (m.shots) presetShots = m.shots;
                if (m.moves) presetMoves = m.moves;
                // if (m.zoom) currentZoom = m.zoom; // Bloqueado para forzar zoom 100% global

                if (m.exportSettings) {
                    const p = document.getElementById('media-path-input');
                    const eExt = document.getElementById('media-ext-input');
                    if (p && m.exportSettings.mediaPath) p.value = m.exportSettings.mediaPath;
                    if (eExt && m.exportSettings.mediaExt) eExt.value = m.exportSettings.mediaExt;
                }
            }

            if (data.projectChecklist) projectChecklist = data.projectChecklist;
            if (data.recentColors) recentColors = data.recentColors;

            // 3. Asignar variables globales 
            scenes = importedScenes;
            if (typeof undoStack !== 'undefined') undoStack = []; // Limpiar historial si existe

            // 4. Force UI refresh
            if (typeof render === 'function') render();
            if (typeof renderChecklist === 'function') renderChecklist();
            if (typeof resetView === 'function') resetView();

            // 5. Guardado y Sincronización de Vista
            await saveState();
            await loadFromLocal(); // Obligatorio para refrescar ProjectState y UI
            showToast("✅ Proyecto importado con éxito", "success");

        } catch (err) {
            console.error(err);
            showToast("❌ Error al convertir el archivo JSON.", "error");
        }
    };
    r.readAsText(f);
    input.value = ''; // Reset input
}


// --- MANUAL BACKUP LIGERO (JSON DESCARGADO) ---
// Retenemos esta función para que el usuario pueda bajar "hard copies" si quiere.
async function manualBackup() {
    await saveState(); // Forzamos guardado DB local primero

    const safeName = (projectTitle || "proyecto").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_lite_${safeName}_${timestamp}.json`;

    // Clean up scenes to remove obsolete ImageDB traces
    const cleanScenes = JSON.parse(JSON.stringify(scenes)).map(s => {
        delete s.imageId;
        delete s.imageSrc;
        return s;
    });

    const dataPayload = {
        id: ProjectState.getId(),
        title: projectTitle || "Mi Proyecto",
        metadata_config: {
            colors: presetColors,
            recentColors: recentColors,
            sections: presetSections,
            speakers: presetSpeakers,
            shots: presetShots,
            moves: presetMoves,
            projectChecklist: projectChecklist,
            zoom: currentZoom,
            exportSettings: {
                mediaPath: document.getElementById('media-path-input')?.value || '',
                mediaExt: document.getElementById('media-ext-input')?.value || '.mp4'
            }
        },
        scenes: cleanScenes
    };

    const d = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataPayload, null, 2));
    const a = document.createElement('a');
    a.href = d;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("✅ Copia JSON descargada (Backup manual)");
}

// --- RESET PROYECTO ---
async function resetProject() {
    const { confirmed } = await sysDialog({
        icon: '⚠️',
        title: '¿Reiniciar Proyecto?',
        message: '¿Borrar <b>todo</b> el proyecto?<br>Empezarás un lienzo en blanco (pero las imágenes cacheadas seguirán en el disco para otros proyectos).',
        type: 'confirm',
        confirmLabel: 'Borrar',
        confirmClass: 'btn-danger'
    });

    if (confirmed) {
        // En vez de borrar la BBDD, limpiamos en memoria y pisamos el guardado
        scenes = [];
        projectTitle = "Mi Vídeo";
        await saveState();
        location.reload();
    }
}

// --- MULTI-PROJECT SYSTEM (FASE 10) ---

/**
 * Transición Segura entre Proyectos (Regla 2: Race Condition Prevention)
 */
export async function switchProject(newId, forceNoSave = false) {
    if (newId === ProjectState.getId()) return;

    // 1. Detener temporizadores en vuelo
    if (typeof debounceSaveTimer !== 'undefined' && debounceSaveTimer) clearTimeout(debounceSaveTimer);
    if (typeof autosaveTimer !== 'undefined' && autosaveTimer) clearTimeout(autosaveTimer);

    // 2. Guardado síncrono del proyecto saliente (Cortacorrientes)
    if (!forceNoSave) await saveState();

    // 3. Mutar el estado global de forma segura
    ProjectState.setId(newId);

    // 4. Cargar datos y repintar UI
    const loaded = await loadFromLocal();
    if (!loaded) {
        if (typeof createNewProject === 'function') {
            await createNewProject();
            return; // Evita el doble render de abajo
        } else {
            scenes = [];
            projectTitle = "Nuevo Proyecto";
        }
    }

    if (typeof render === 'function') render();
    if (typeof renderChecklist === 'function') renderChecklist();
    if (typeof resetView === 'function') resetView();
    calculateTotalTime();

    showToast("📂 Proyecto cambiado correctamente");
}

/**
 * Creación de un proyecto en blanco (Regla 2)
 */
export async function createNewProject() {
    // 1. Detener temporizadores en vuelo
    if (typeof debounceSaveTimer !== 'undefined' && debounceSaveTimer) clearTimeout(debounceSaveTimer);
    if (typeof autosaveTimer !== 'undefined' && autosaveTimer) clearTimeout(autosaveTimer);

    // 2. Transicionar a un nuevo ID
    const newId = "proj_" + Date.now() + Math.random().toString(36).substr(2, 5);
    ProjectState.setId(newId);

    // 3. Limpiar estado global estrictamente
    scenes = [];
    projectTitle = "Nuevo Proyecto";
    const tInput = document.getElementById('project-title-input');
    if (tInput) { tInput.value = projectTitle; tInput.title = projectTitle; }
    document.title = projectTitle + " - AIA Studio";

    // 4. Forzar guardado inicial explícito e inmediato a SQLite (evita duplicados de auto-save)
    await saveState();

    // 5. Añadir al menos una escena vacía y repintar UI
    if (typeof addScene === 'function') addScene();
    if (typeof render === 'function') render();
    if (typeof renderChecklist === 'function') renderChecklist();
    if (typeof resetView === 'function') resetView();
    if (typeof calculateTotalTime === 'function') calculateTotalTime();
}


// --- LIGAR FALLBACKS AL WINDOW (Compatibilidad Módulos ES6 -> Legacy Scripts) ---
window.debouncedSaveState = debouncedSaveState;
window.triggerAutoSave = triggerAutoSave;
window.saveState = saveState;
window.loadFromLocal = loadFromLocal;
window.loadProject = loadProject;
window.manualBackup = manualBackup;
window.resetProject = resetProject;
window.createNewProject = createNewProject;
window.switchProject = switchProject;
