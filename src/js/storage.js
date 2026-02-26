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

    const d = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
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

    const d = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataPayload, null, 2));
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
