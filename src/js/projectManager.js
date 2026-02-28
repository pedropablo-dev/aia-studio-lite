// src/js/projectManager.js
import { ProjectState } from './projectState.js';
import { switchProject, createNewProject } from './storage.js';

// Init UI button in header
export function initProjectManagerUI() {
    // El botón ha sido movido estáticamente al builder.html (Header)
}

async function openProjectManagerModal() {
    // Reutilizamos el custom sysDialog container o creamos uno nuevo. 
    // Para simplificar y no colisionar variables, creamos un overlay ad-hoc para el modal.
    let overlay = document.getElementById('project-manager-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'project-manager-overlay';
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '9999';

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.cssText = 'max-width: 800px; width: 90%; height: auto; max-height: 80vh; padding: 24px; display: flex; flex-direction: column;';

        const closeBtn = document.createElement('div');
        closeBtn.className = 'close-modal-x';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => { overlay.style.display = 'none'; };
        content.appendChild(closeBtn);

        const title = document.createElement('h3');
        title.style.cssText = 'margin: 0 0 16px 0; color: var(--accent); font-size: 1.2rem;';
        title.innerHTML = '📂 Gestor de Proyectos';
        content.appendChild(title);

        const listContainer = document.createElement('div');
        listContainer.id = 'project-list-container';
        listContainer.style.cssText = 'flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;';

        // --- NUEVO: BARRA DE BÚSQUEDA Y ORDENACIÓN ---
        const filterContainer = document.createElement('div');
        filterContainer.style.cssText = 'display: flex; gap: 10px; margin-bottom: 12px;';

        const searchInputWrapper = document.createElement('div');
        searchInputWrapper.style.cssText = 'position:relative; flex:1; display:flex;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'pm-search';
        searchInput.placeholder = 'Buscar proyecto...';
        searchInput.style.cssText = 'flex: 1; background: #1a1a1a; border: 1px solid #333; color: white; padding: 8px; padding-right: 30px; border-radius: 4px; outline: none;';

        const clearBtn = document.createElement('button');
        clearBtn.innerHTML = '✕';
        clearBtn.title = 'Limpiar búsqueda';
        clearBtn.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #888; font-size: 14px; cursor: pointer; padding: 0;';
        clearBtn.onclick = () => {
            document.getElementById('pm-search').value = '';
            if (typeof window.renderFilteredList === 'function') window.renderFilteredList();
        };

        searchInputWrapper.appendChild(searchInput);
        searchInputWrapper.appendChild(clearBtn);

        const sortSelect = document.createElement('select');
        sortSelect.id = 'pm-sort';
        sortSelect.style.cssText = 'background: #1a1a1a; border: 1px solid #333; color: white; padding: 8px; border-radius: 4px; outline: none; cursor: pointer; max-width: 200px;';
        sortSelect.innerHTML = `
            <option value="newest">Más recientes primero</option>
            <option value="oldest">Más antiguos primero</option>
            <option value="az">Nombre (A-Z)</option>
            <option value="za">Nombre (Z-A)</option>
        `;

        filterContainer.appendChild(searchInput);
        filterContainer.appendChild(sortSelect);
        content.appendChild(filterContainer);
        // ---------------------------------------------

        content.appendChild(listContainer);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #333; padding-top: 16px; gap: 10px;';

        const btnStyle = 'height: 40px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 0 15px; cursor: pointer; border-radius: 4px; border: 1px solid #444; font-weight: bold;';

        const newProjBtn = document.createElement('button');
        newProjBtn.className = 'btn-accent';
        newProjBtn.style.cssText = btnStyle;
        newProjBtn.innerHTML = '✨ Nuevo Proyecto';
        newProjBtn.onclick = async () => {
            overlay.style.display = 'none';
            await createNewProject();
        };

        const importBtn = document.createElement('button');
        importBtn.className = 'view-btn';
        importBtn.style.cssText = btnStyle + ' background: #222; color: #add8e6;';
        importBtn.innerHTML = '📥 Importar JSON';
        importBtn.onclick = () => { document.getElementById('import-json-input').click(); };

        const cancelBtn = document.createElement('button');
        cancelBtn.style.cssText = btnStyle + ' background: #444; color: white;';
        cancelBtn.innerHTML = 'Cerrar';
        cancelBtn.onclick = () => { overlay.style.display = 'none'; };

        actions.appendChild(newProjBtn);
        actions.appendChild(importBtn);
        actions.appendChild(cancelBtn);

        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'file';
        hiddenInput.id = 'import-json-input';
        hiddenInput.accept = '.json';
        hiddenInput.style.display = 'none';
        hiddenInput.onchange = function () {
            if (typeof loadProject === 'function') {
                overlay.style.display = 'none';
                loadProject(this);
            }
        };
        content.appendChild(hiddenInput);

        content.appendChild(actions);

        overlay.appendChild(content);
        document.body.appendChild(overlay);
    }

    const listContainer = document.getElementById('project-list-container');
    listContainer.innerHTML = '<div style="color:#aaa; text-align:center;">Cargando proyectos...</div>';
    overlay.style.display = 'flex';

    try {
        // Obtenemos los proyectos de la BBDD (API global configurada en api-client.js)
        const projects = await liteListProjectsApi();

        listContainer.innerHTML = '';
        if (projects.length === 0) {
            listContainer.innerHTML = '<div style="color:#aaa; text-align:center;">No hay proyectos guardados.</div>';
            const filterRow = document.getElementById('pm-search')?.parentElement;
            if (filterRow) filterRow.style.display = 'none';
            return;
        } else {
            const filterRow = document.getElementById('pm-search')?.parentElement;
            if (filterRow) filterRow.style.display = 'flex';
        }

        window.renderFilteredList = function () {
            const q = document.getElementById('pm-search').value.toLowerCase();
            const sortMode = document.getElementById('pm-sort').value;

            let filtered = projects.filter(p => (p.title || 'Proyecto').toLowerCase().includes(q));

            filtered.sort((a, b) => {
                const dateA = new Date(a.updated_at).getTime() || 0;
                const dateB = new Date(b.updated_at).getTime() || 0;
                if (sortMode === 'newest') return dateB - dateA;
                if (sortMode === 'oldest') return dateA - dateB;
                if (sortMode === 'az') return (a.title || '').localeCompare(b.title || '');
                if (sortMode === 'za') return (b.title || '').localeCompare(a.title || '');
                return 0;
            });

            listContainer.innerHTML = '';

            if (filtered.length === 0) {
                listContainer.innerHTML = '<div style="color:#aaa; text-align:center;">No hay coincidencias.</div>';
                return;
            }

            const currentId = ProjectState.getId();
            const ul = document.createElement('ul');
            ul.style.cssText = 'list-style:none; padding:0; margin:0;';

            filtered.forEach(proj => {
                const isActive = proj.id === currentId;
                const safeTitle = (proj.title || "Proyecto").replace(/'/g, "\\'");
                const dateStr = proj.updated_at ? new Date(proj.updated_at).toLocaleString() : 'Desconocida';

                const li = document.createElement('li');
                li.className = 'project-row';
                li.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 10px; border-bottom: 1px solid #333;`;

                const statusBadgeHTML = isActive ? `<span style="background:var(--accent); color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7em; font-weight:bold;">ACTIVO</span>` : '';

                li.innerHTML = `
                    <div class="project-info" style="flex-grow:1; display:flex; align-items:center; gap:10px; min-width: 0;">
                        <strong style="color: ${isActive ? '#fff' : '#ccc'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; display: inline-block; vertical-align: middle;" title="${safeTitle}">${proj.title}</strong>
                        ${statusBadgeHTML}
                        <div style="font-size: 0.8em; color: #888;">Última edición: ${dateStr}</div>
                    </div>
                    <div class="project-actions" style="flex-shrink:0;">
                        <button title="Renombrar" onclick="renameProject('${proj.id}', '${safeTitle}')">✎</button>
                        <button title="Duplicar" onclick="duplicateProject('${proj.id}')">❏</button>
                        <button title="Exportar" onclick="exportProject('${proj.id}')">⇡</button>
                        <button title="Eliminar" style="color:red;" onclick="deleteProject('${proj.id}')">🗑</button>
                        ${!isActive ? `<button onclick="loadProjectFromManager('${proj.id}')">▶</button>` : ''}
                    </div>
                `;
                ul.appendChild(li);
            });
            listContainer.appendChild(ul);
        };

        // Escuchadores del filtro/búsqueda
        document.getElementById('pm-search').addEventListener('input', window.renderFilteredList);
        document.getElementById('pm-sort').addEventListener('change', window.renderFilteredList);

        window.renderFilteredList();

    } catch (e) {
        listContainer.innerHTML = `<div style="color:#ff5252; text-align:center;">Error al cargar: ${e.message}</div>`;
    }
}

// ==========================================
// UTILS CUSTOM DIALOGS
// ==========================================

window.customConfirm = function (message, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay';
    overlay.innerHTML = `
        <div class="custom-dialog-box">
            <h3 style="margin-top:0;">⚠️ Confirmación</h3>
            <p>${message}</p>
            <div class="custom-dialog-buttons">
                <button class="btn-cancel" onclick="this.closest('.custom-dialog-overlay').remove()">Cancelar</button>
                <button class="btn-confirm" id="confirm-btn">Aceptar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('confirm-btn').onclick = () => { overlay.remove(); callback(); };
};

window.customPrompt = function (message, defaultValue, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay';
    overlay.innerHTML = `
        <div class="custom-dialog-box">
            <h3 style="margin-top:0;">✏️ Renombrar</h3>
            <p>${message}</p>
            <input type="text" id="prompt-input" value="${defaultValue}">
            <div class="custom-dialog-buttons">
                <button class="btn-cancel" onclick="this.closest('.custom-dialog-overlay').remove()">Cancelar</button>
                <button class="btn-confirm" id="prompt-btn">Aceptar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const input = document.getElementById('prompt-input');
    input.focus();
    input.select();
    document.getElementById('prompt-btn').onclick = () => {
        const val = input.value.trim();
        overlay.remove();
        if (val) callback(val);
    };
};

window.exportProject = async function (id) {
    try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error("Fallo al cargar el proyecto");
        const projectData = await res.json();

        const jsonStr = JSON.stringify(projectData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = (projectData.title || "proyecto").replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `${cleanName}_backup.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (typeof showToast === 'function') showToast('Operación exitosa', 'success');
    } catch (err) {
        if (typeof showToast === 'function') showToast('Error al exportar: ' + err.message, 'error');
    }
};

// ==========================================
// GLOBALS
// ==========================================

// Inyectamos el componente al DOM
window.addEventListener('DOMContentLoaded', initProjectManagerUI);

window.loadProjectFromManager = async function (id, forceNoSave = false) {
    const overlay = document.getElementById('project-manager-overlay');
    if (overlay) overlay.style.display = 'none';
    await switchProject(id, forceNoSave);
};

// Lógica de control CRUD (Exportada globalmente para el DOM de renderProjectList)
window.renameProject = async function (id, currentTitle = "") {
    window.customPrompt("Introduce el nuevo nombre del proyecto:", currentTitle, async (newTitle) => {
        if (newTitle !== null && newTitle !== '') {
            try {
                const res = await fetch(`/api/projects/${id}/rename`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_title: newTitle })
                });
                if (!res.ok) throw new Error("Fallo al renombrar");

                // Si renombramos el activo, actualizamos UI global
                if (id === ProjectState.getId() && typeof saveState === 'function') {
                    projectTitle = newTitle;
                    const tInput = document.getElementById('project-title-input');
                    if (tInput) tInput.value = projectTitle;
                    document.title = projectTitle + " - AIA Studio";
                }

                if (typeof showToast === 'function') showToast('Operación exitosa', 'success');
                openProjectManagerModal(); // Recargar UI del modal
            } catch (err) {
                if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
            }
        }
    });
};

window.duplicateProject = async function (id) {
    try {
        const res = await fetch(`/api/projects/${id}/duplicate`, { method: 'POST' });
        if (!res.ok) throw new Error("Fallo al duplicar");
        if (typeof showToast === 'function') showToast('Operación exitosa', 'success');
        openProjectManagerModal();
    } catch (err) {
        if (typeof showToast === 'function') showToast('Error al duplicar: ' + err.message, 'error');
    }
};

window.deleteProject = async function (id) {
    window.customConfirm(`¿Estás seguro de eliminar el proyecto? Esta acción es irreversible.`, async () => {
        try {
            // BLOQUEO ASÍNCRONO DE AUTOGUARDADOS PENDIENTES
            if (typeof debounceSaveTimer !== 'undefined' && debounceSaveTimer) clearTimeout(debounceSaveTimer);
            if (typeof autosaveTimer !== 'undefined' && autosaveTimer) clearTimeout(autosaveTimer);

            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Fallo al eliminar");

            if (typeof showToast === 'function') showToast('Operación exitosa', 'success');

            // ANTI-SUICIDIO DINÁMICO
            if (id === ProjectState.getId()) {
                const listRes = await fetch('/api/projects');
                if (listRes.ok) {
                    const projectList = await listRes.json();
                    if (projectList && projectList.length > 0) {
                        await loadProjectFromManager(projectList[0].id, true);
                        return; // Sale de la función, el modal se cierra automáticamente
                    } else {
                        if (typeof createNewProject === 'function') await createNewProject();
                    }
                } else {
                    if (typeof createNewProject === 'function') await createNewProject();
                }
            }

            // Refresco obligatorio del modal si no se ejecutó el return previo
            openProjectManagerModal();
        } catch (err) {
            if (typeof showToast === 'function') showToast('Error al eliminar: ' + err.message, 'error');
        }
    });
};

// Fallback local functions globally if ever needed:
window.openProjectManagerModal = openProjectManagerModal;
