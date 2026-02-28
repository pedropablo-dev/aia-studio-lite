// src/js/projectManager.js
import { ProjectState } from './projectState.js';
import { switchProject, createNewProject } from './storage.js';

// Init UI button in header
export function initProjectManagerUI() {
    const parentContainer = document.querySelector('.header-left-block');
    if (!parentContainer) return;

    const btn = document.createElement('button');
    btn.className = 'view-btn';
    btn.style.cssText = 'background: #222; border: 1px solid #444; color: #add8e6; margin-left: 15px; padding: 4px 10px; font-weight: bold; cursor: pointer; border-radius: 4px;';
    btn.innerHTML = '📂 Proyectos';
    btn.title = 'Gestor de Proyectos (Cambiar / Crear)';
    btn.onclick = openProjectManagerModal;

    parentContainer.appendChild(btn);
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
        content.style.cssText = 'max-width: 500px; height: auto; max-height: 80vh; padding: 24px; display: flex; flex-direction: column;';

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
        content.appendChild(listContainer);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #333; padding-top: 16px;';

        const newProjBtn = document.createElement('button');
        newProjBtn.className = 'btn-accent';
        newProjBtn.innerHTML = '✨ Nuevo Proyecto';
        newProjBtn.onclick = async () => {
            overlay.style.display = 'none';
            await createNewProject();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = 'Cerrar';
        cancelBtn.onclick = () => { overlay.style.display = 'none'; };

        actions.appendChild(newProjBtn);
        actions.appendChild(cancelBtn);
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
            return;
        }

        const currentId = ProjectState.getId();

        projects.forEach(p => {
            const isCurrent = p.id === currentId;
            const dateStr = p.updated_at ? new Date(p.updated_at).toLocaleString() : 'Desconocida';

            const card = document.createElement('div');
            card.style.cssText = `
                background: ${isCurrent ? '#1a2a40' : '#1a1a1a'};
                border: 1px solid ${isCurrent ? 'var(--accent)' : '#333'};
                padding: 12px;
                border-radius: 6px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                transition: background 0.2s;
            `;

            if (!isCurrent) {
                card.onmouseover = () => { card.style.background = '#252525'; };
                card.onmouseout = () => { card.style.background = '#1a1a1a'; };
                card.onclick = async () => {
                    overlay.style.display = 'none';
                    await switchProject(p.id);
                };
            } else {
                card.style.cursor = 'default';
            }

            const info = document.createElement('div');
            info.innerHTML = `
                <div style="font-weight: bold; color: ${isCurrent ? '#fff' : '#ccc'};">${p.title || 'Sin Título'}</div>
                <div style="font-size: 0.75rem; color: #777; margin-top: 4px;">Última edición: ${dateStr}</div>
            `;

            const actionTarget = document.createElement('div');
            if (isCurrent) {
                actionTarget.innerHTML = `<span style="background: var(--accent); color:#fff; font-size:0.7rem; padding: 2px 6px; border-radius:4px; font-weight:bold;">ACTIVO</span>`;
            } else {
                actionTarget.innerHTML = `<span style="color:#888; font-size:1.2rem;">▶</span>`;
            }

            card.appendChild(info);
            card.appendChild(actionTarget);
            listContainer.appendChild(card);
        });

    } catch (e) {
        listContainer.innerHTML = `<div style="color:#ff5252; text-align:center;">Error al cargar: ${e.message}</div>`;
    }
}

// Inyectamos el componente al DOM
window.addEventListener('DOMContentLoaded', initProjectManagerUI);

// Fallback local functions globally if ever needed:
window.openProjectManagerModal = openProjectManagerModal;
