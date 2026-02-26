/**
 * Construye las URLs base con folder param.
 * @returns {string} URL base sin trailing query chars.
 */
function _liteApiBase() {
    const mediaRoot = document.getElementById('media-path-input')?.value?.trim() || '';
    return 'http://localhost:9999/lite/files?folder=' + encodeURIComponent(mediaRoot);
}

/** Obtiene lista de archivos (separación de red para openQuickFileModal) */
async function liteFetchFilesApi(subpath, skip = 0, limit = 500) {
    const url = _liteApiBase() + '&subpath=' + encodeURIComponent(subpath) + `&skip=${skip}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

/** Busca archivos (separación de red para filterQuickFiles) */
async function liteSearchFilesApi(query, skip = 0, limit = 500) {
    const url = _liteApiBase() + '&search=' + encodeURIComponent(query) + `&skip=${skip}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
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
 * Llama a debouncedSaveState() + render() solo si hubo cambios reales.
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
        debouncedSaveState();
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
            debouncedSaveState();
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
// [LITE] FASE C — PERSISTENCIA DE PROYECTOS (SQLite)
// ================================================================

/**
 * Guarda el proyecto completo en el backend (Upsert).
 * @param {Object} payload - Objeto estructurado del proyecto
 */
async function liteSaveProjectApi(payload) {
    const res = await fetch('http://localhost:9999/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
}

/**
 * Carga un proyecto específico desde el backend.
 * @param {string} projectId 
 */
async function liteLoadProjectApi(projectId) {
    const res = await fetch(`http://localhost:9999/api/projects/${projectId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
}

/**
 * Obtiene la lista ligera de todos los proyectos para el menú de carga.
 */
async function liteListProjectsApi() {
    const res = await fetch('http://localhost:9999/api/projects');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
}

