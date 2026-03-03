import { projectState } from './state.js';

// --- CONFIG MODALS (GENERIC) ---
function renderConfigRows(type, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    let data = (type === 'color') ? projectState.tempColors : (type === 'section') ? projectState.tempSections : projectState.tempSpeakers;

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
    if (type === 'color') projectState.tempColors[index][field] = value;
    else if (type === 'section') projectState.tempSections[index][field] = value;
    else if (type === 'speaker') projectState.tempSpeakers[index][field] = value;
}

function addConfigItem(type) {
    const newItem = { name: "Nuevo", code: "#888888" };
    if (type === 'color') { projectState.tempColors.push(newItem); renderConfigRows('color', 'color-rows-container'); }
    else if (type === 'section') { projectState.tempSections.push(newItem); renderConfigRows('section', 'section-rows-container'); }
    else if (type === 'speaker') { projectState.tempSpeakers.push(newItem); renderConfigRows('speaker', 'speaker-rows-container'); }
}

function removeConfigItem(type, index) {
    if (type === 'color') projectState.tempColors.splice(index, 1);
    else if (type === 'section') projectState.tempSections.splice(index, 1);
    else if (type === 'speaker') projectState.tempSpeakers.splice(index, 1);
    renderConfigRows(type, type + '-rows-container');
}

// Modals Open/Save
function openColorConfig() { projectState.tempColors = JSON.parse(JSON.stringify(projectState.presetColors)); renderConfigRows('color', 'color-rows-container'); document.getElementById('color-config-modal').style.display = 'flex'; }
function saveColorConfig() { if (typeof window.debouncedSaveState === 'function') window.debouncedSaveState(); projectState.presetColors = JSON.parse(JSON.stringify(projectState.tempColors)); document.getElementById('color-config-modal').style.display = 'none'; if (typeof window.render === 'function') window.render(); }

function openSectionConfig() { projectState.tempSections = JSON.parse(JSON.stringify(projectState.presetSections)); renderConfigRows('section', 'section-rows-container'); document.getElementById('section-config-modal').style.display = 'flex'; }
function saveSectionConfig() { if (typeof window.debouncedSaveState === 'function') window.debouncedSaveState(); projectState.presetSections = JSON.parse(JSON.stringify(projectState.tempSections)); document.getElementById('section-config-modal').style.display = 'none'; if (typeof window.render === 'function') window.render(); }

function openSpeakerConfig() { projectState.tempSpeakers = JSON.parse(JSON.stringify(projectState.presetSpeakers)); renderConfigRows('speaker', 'speaker-rows-container'); document.getElementById('speaker-config-modal').style.display = 'flex'; }
function saveSpeakerConfig() { if (typeof window.debouncedSaveState === 'function') window.debouncedSaveState(); projectState.presetSpeakers = JSON.parse(JSON.stringify(projectState.tempSpeakers)); document.getElementById('speaker-config-modal').style.display = 'none'; if (typeof window.render === 'function') window.render(); }

// Tech Config (Strings)
function renderTechRows(type) {
    const container = document.getElementById(type === 'shot' ? 'shot-rows-container' : 'move-rows-container');
    if (!container) return;
    container.innerHTML = '';
    const data = (type === 'shot') ? projectState.tempShots : projectState.tempMoves;
    data.forEach((item, index) => {
        container.innerHTML += `
                <div class="config-row">
                    <input type="text" onchange="updateTempTech('${type}', ${index}, this.value)" value="${item}">
                    <button class="trash-btn" onclick="removeTechItem('${type}', ${index})">✕</button>
                </div>`;
    });
}
function updateTempTech(type, index, value) { if (type === 'shot') projectState.tempShots[index] = value; else projectState.tempMoves[index] = value; }
function addTechItem(type) { if (type === 'shot') projectState.tempShots.push("Nuevo Plano"); else projectState.tempMoves.push("Nuevo Mov."); renderTechRows(type); }
function removeTechItem(type, index) { if (type === 'shot') projectState.tempShots.splice(index, 1); else projectState.tempMoves.splice(index, 1); renderTechRows(type); }

function openTechConfig() { projectState.tempShots = JSON.parse(JSON.stringify(projectState.presetShots)); projectState.tempMoves = JSON.parse(JSON.stringify(projectState.presetMoves)); renderTechRows('shot'); renderTechRows('move'); document.getElementById('tech-config-modal').style.display = 'flex'; }
function saveTechConfig() { if (typeof window.debouncedSaveState === 'function') window.debouncedSaveState(); projectState.presetShots = JSON.parse(JSON.stringify(projectState.tempShots)); projectState.presetMoves = JSON.parse(JSON.stringify(projectState.tempMoves)); document.getElementById('tech-config-modal').style.display = 'none'; if (typeof window.render === 'function') window.render(); }

// Config Checklist
function openChecklistConfig() {
    projectState.tempChecklist = JSON.parse(JSON.stringify(projectState.projectChecklist));
    renderChecklistRows();
    document.getElementById('checklist-config-modal').style.display = 'flex';
}
function renderChecklistRows() {
    const container = document.getElementById('checklist-rows-container');
    if (!container) return;
    container.innerHTML = projectState.tempChecklist.map((item, index) => `
            <div class="config-row">
                <input type="text" value="${item.name}" onchange="updateTempChecklist(${index}, this.value)">
                <button class="trash-btn" onclick="removeChecklistRow(${index})">✕</button>
            </div>
        `).join('');
}
function updateTempChecklist(index, value) { projectState.tempChecklist[index].name = value; }
function addChecklistRow() { projectState.tempChecklist.push({ name: "Nuevo Estado", checked: false }); renderChecklistRows(); }
function removeChecklistRow(index) { projectState.tempChecklist.splice(index, 1); renderChecklistRows(); }
function saveChecklistConfig() {
    if (typeof window.debouncedSaveState === 'function') window.debouncedSaveState();
    projectState.projectChecklist = JSON.parse(JSON.stringify(projectState.tempChecklist));
    document.getElementById('checklist-config-modal').style.display = 'none';
    if (typeof window.renderChecklist === "function") window.renderChecklist();
}

// --- SELECTORES RÁPIDOS ---
function openQuickColorModal(id) {
    projectState.currentColorSceneId = id;
    document.getElementById('quick-presets-container').innerHTML = projectState.presetColors.map(p => `
            <button class="color-grid-btn" onclick="applyColorToScene('${p.code}')">
                <div class="swatch" style="background-color:${p.code}"></div><span>${p.name}</span>
            </button>`).join('');

    document.getElementById('quick-recent-container').innerHTML = (projectState.recentColors.length === 0)
        ? '<div style="color:#666; font-size:0.8rem; padding:5px;">Sin recientes</div>'
        : projectState.recentColors.map(c => `<button class="color-grid-btn" onclick="applyColorToScene('${c}')"><div class="swatch" style="background-color:${c}"></div><span>${c}</span></button>`).join('');

    document.getElementById('quick-color-modal').style.display = 'flex';
}

function openQuickSectionModal(id) {
    projectState.currentSectionSceneId = id;
    document.getElementById('quick-section-list-container').innerHTML = projectState.presetSections.map(s => `
            <button class="color-grid-btn" onclick="applySectionToScene('${s.name}', '${s.code}')">
                <div class="swatch" style="background-color:${s.code}"></div><span>${s.name}</span>
            </button>`).join('');
    document.getElementById('quick-section-modal').style.display = 'flex';
}

function openQuickSpeakerModal(id) {
    projectState.currentSpeakerSceneId = id;
    document.getElementById('quick-speaker-list-container').innerHTML = projectState.presetSpeakers.map(s => `
            <button class="color-grid-btn" onclick="applySpeakerToScene('${s.name}', '${s.code}')">
                <div class="swatch" style="background-color:${s.code}"></div><span>${s.name}</span>
            </button>`).join('');
    document.getElementById('quick-speaker-modal').style.display = 'flex';
}

// --- VIEWPORT & ZOOM ---
function updateLayoutWidth() {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    const cards = container.querySelectorAll('.scene-card');
    if (cards.length === 0) return;

    const lastCard = cards[cards.length - 1];
    const realContentWidth = lastCard.offsetLeft + lastCard.offsetWidth + 200; // 200px margen final
    const scaledWidth = realContentWidth * projectState.currentZoom;

    container.style.width = scaledWidth + "px";
}

function manualZoom(val) {
    if (typeof window.updateZoom === "function") window.updateZoom(parseFloat(val));
}

function fitAll() {
    if (projectState.scenes.length === 0) return;
    const viewport = document.getElementById('viewport');
    const container = document.getElementById('timeline-container');

    // Obtener el ancho disponible del visor
    const availableWidth = viewport.clientWidth - 100; // 50px de padding por lado

    // Calcular el ancho base real (sin escalar) sumando el offsetWidth de todas las tarjetas más sus gaps
    // Forma segura: leer la posición del borde derecho de la última tarjeta
    const cards = Array.from(container.querySelectorAll('.scene-card'));
    if (cards.length === 0) return;

    const firstCard = cards[0];
    const lastCard = cards[cards.length - 1];
    const totalRealWidth = (lastCard.offsetLeft + lastCard.offsetWidth) - firstCard.offsetLeft;

    let fitZoom = availableWidth / totalRealWidth;
    fitZoom = Math.min(Math.max(fitZoom, 0.15), 1.0); // Restringir límites

    if (typeof window.updateZoom === "function") window.updateZoom(fitZoom);
    requestAnimationFrame(() => { viewport.scrollLeft = 0; });
}

function resetView() {
    const WORK_ZOOM = 1.0;
    if (typeof window.updateZoom === "function") window.updateZoom(WORK_ZOOM);
    if (projectState.selectedId) {
        const index = projectState.scenes.findIndex(s => s.id === projectState.selectedId);
        if (index !== -1) centerOnIndex(index, WORK_ZOOM);
    }
}

function focusSelection() {
    if (!projectState.selectedId) return typeof window.showToast === "function" ? window.showToast("Selecciona primero una tarjeta") : null;
    const index = projectState.scenes.findIndex(s => s.id === projectState.selectedId);
    if (index !== -1) centerOnIndex(index, projectState.currentZoom);
}

function centerOnIndex(index, zoomLevel) {
    const viewport = document.getElementById("viewport");
    const container = document.getElementById('timeline-container');
    const cards = Array.from(container.querySelectorAll('.scene-card'));

    if (!cards[index]) return;
    const targetCard = cards[index];

    // 1. Obtener la coordenada local exacta (sin escala)
    const cardLocalX = targetCard.offsetLeft;
    const cardBaseWidth = targetCard.offsetWidth;

    // 2. Aplicar el factor de escala a la coordenada y al ancho
    const scaledCardX = cardLocalX * zoomLevel;
    const scaledCardWidth = cardBaseWidth * zoomLevel;

    // 3. Calcular el centro del viewport
    const viewportCenter = viewport.clientWidth / 2;

    // 4. Calcular el punto de scroll final
    // Queremos que el centro de la tarjeta escalada (scaledCardX + scaledCardWidth/2) coincida con el centro del viewport
    const targetScrollLeft = (scaledCardX + (scaledCardWidth / 2)) - viewportCenter;

    viewport.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
}

// --- ATAJOS DE TECLADO (UI) ---
function openShortcutsModal() {
    const categories = [
        {
            title: "💾 Globales / Archivo",
            shortcuts: [
                { keys: ["Ctrl", "S"], desc: "Guardar Proyecto / Backup" },
                { keys: ["Ctrl", "O"], desc: "Abrir Gestor de Proyectos" },
                { keys: ["Ctrl", "E"], desc: "Exportar a TXT (Diálogos)" },
                { keys: ["Ctrl", "Z"], desc: "Deshacer" },
                { keys: ["Ctrl", "Y"], desc: "Rehacer" },
                { keys: ["Shift", "?"], desc: "Abrir esta Ayuda" }
            ]
        },
        {
            title: "🎬 Gestión de Escenas",
            shortcuts: [
                { keys: ["Alt", "Enter"], desc: "Nueva Escena" },
                { keys: ["Ctrl", "D"], desc: "Duplicar Escena Seleccionada" },
                { keys: ["Supr"], desc: "Eliminar Escena" },
                { keys: ["Shift", "O"], desc: "Abrir Modal de Edición (Escena Seleccionada)" },
                { keys: ["Shift", "Espacio"], desc: "Alternar Check de Estado" }
            ]
        },
        {
            title: "🖱️ Navegación y Viewport",
            shortcuts: [
                { keys: ["←", "→"], desc: "Seleccionar Escena Anterior/Siguiente" },
                { keys: ["Ctrl", "←", "→"], desc: "Mover Escena Seleccionada" },
                { keys: ["Inicio"], desc: "Ir al inicio del timeline" },
                { keys: ["Fin"], desc: "Ir al final del timeline" },
                { keys: ["F"], desc: "Centrar Escena Seleccionada" },
                { keys: ["Shift", "F"], desc: "Ajustar Zoom (Fit All)" },
                { keys: ["0"], desc: "Restaurar Zoom (100%)" },
                { keys: ["Ctrl", "L"], desc: "Vincular Media a Escena" },
                { keys: ["Alt", "E"], desc: "Explorador Global" },
                { keys: ["Ctrl", "Enter"], desc: "Abrir/Cerrar Esquema Lateral" }
            ]
        }
    ];

    const container = document.getElementById('shortcuts-list-container');
    if (container) {
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
    }

    document.getElementById('shortcuts-modal').style.display = 'flex';
}

function closeShortcutsModal() {
    document.getElementById('shortcuts-modal').style.display = 'none';
}

// === EXPOSICIÓN GLOBAL ===
window.renderConfigRows = renderConfigRows;
window.updateTempItem = updateTempItem;
window.addConfigItem = addConfigItem;
window.removeConfigItem = removeConfigItem;
window.openColorConfig = openColorConfig;
window.saveColorConfig = saveColorConfig;
window.openSectionConfig = openSectionConfig;
window.saveSectionConfig = saveSectionConfig;
window.openSpeakerConfig = openSpeakerConfig;
window.saveSpeakerConfig = saveSpeakerConfig;
window.renderTechRows = renderTechRows;
window.updateTempTech = updateTempTech;
window.addTechItem = addTechItem;
window.removeTechItem = removeTechItem;
window.openTechConfig = openTechConfig;
window.saveTechConfig = saveTechConfig;
window.openChecklistConfig = openChecklistConfig;
window.renderChecklistRows = renderChecklistRows;
window.updateTempChecklist = updateTempChecklist;
window.addChecklistRow = addChecklistRow;
window.removeChecklistRow = removeChecklistRow;
window.saveChecklistConfig = saveChecklistConfig;
window.openQuickColorModal = openQuickColorModal;
window.openQuickSectionModal = openQuickSectionModal;
window.openQuickSpeakerModal = openQuickSpeakerModal;
window.updateLayoutWidth = updateLayoutWidth;
window.manualZoom = manualZoom;
window.fitAll = fitAll;
window.resetView = resetView;
window.focusSelection = focusSelection;
window.centerOnIndex = centerOnIndex;
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
