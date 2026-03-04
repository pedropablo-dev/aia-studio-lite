// --- IMPORTANTE: Entorno de Ejecución ---
// Este archivo DEBE abrirse a través de un servidor web local para evitar errores
// de CORS. No funcionará abriendo el HTML haciendo doble clic (file://).

import { state } from './state.js';
import { loadFromLocal, saveToLocal } from './storage.js';
import { renderSidebar, deleteCard, updateGlobalStats } from './ui-renderer.js';
import { startPrompter, exitPrompter, openJumpMenu, closeJumpMenu, toggleFontSlider, handlePrompterInput, nextCard, prevCard, handleKeydown, updateFontSize, cycleAlignment } from './prompter-engine.js';
import { historyManager } from './history-manager.js';

const textContainer = document.getElementById('text-container');
const cardsList = document.getElementById('cards-list');
const btnStart = document.getElementById('btn-start');
const prompterView = document.getElementById('prompter-view');
const prompterText = document.getElementById('prompter-text');
const fontSliderPanel = document.getElementById('font-slider-panel');
const fontSizeSlider = document.getElementById('font-size-slider');
const jumpMenuOverlay = document.getElementById('jump-menu-overlay');

// --- CLIENTE API ---

let currentApiProject = null;

// --- PERSISTENCIA DE SESIÓN ---
let lastProjectId = localStorage.getItem('prompter_lastProjectId') || '';
let activeSpeakers = JSON.parse(localStorage.getItem('prompter_activeSpeakers') || '[]');
let isAutoLoading = false; // true durante restauraciones programáticas (evita confirm)

async function fetchProjects() {
    try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        const sel = document.getElementById('api-project-select');
        sel.innerHTML = '<option value="">— Selecciona un proyecto —</option>';
        data.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.title;
            sel.appendChild(opt);
        });
        // --- Auto-restauración: recargar último proyecto ---
        if (lastProjectId) {
            sel.value = lastProjectId;
            isAutoLoading = true;
            sel.dispatchEvent(new Event('change'));
            isAutoLoading = false;
        }
    } catch (err) {
        console.error('Error al cargar proyectos:', err);
        document.getElementById('api-project-select').innerHTML = '<option value="">Error al conectar con el servidor</option>';
    }
}

document.getElementById('api-project-select').addEventListener('change', async (e) => {
    const id = e.target.value;
    const projectSel = e.target;

    // --- Guardarraíl: proteger tarjetas en proceso ---
    if (!isAutoLoading && state.cardsData.length > 0) {
        if (!window.confirm('Cambiar de proyecto eliminará las tarjetas actuales. ¿Continuar?')) {
            projectSel.value = lastProjectId;
            return;
        }
    }

    // Persistir selección y limpiar estado manualmente (sin btn-clear.click)
    lastProjectId = id;
    localStorage.setItem('prompter_lastProjectId', id);
    activeSpeakers = [];
    localStorage.setItem('prompter_activeSpeakers', '[]');
    state.originalTextContent = '';
    textContainer.innerHTML = '';
    state.cardsData = []; cardsList.innerHTML = ''; state.colorIndex = 0;
    updateGlobalStats();
    historyManager.pushHistory();

    // Resetear custom dropdown
    const speakerDropdown = document.getElementById('speaker-dropdown-menu');
    const speakerLabel = document.getElementById('speaker-select-label');
    const customSelect = document.getElementById('custom-speaker-select');
    speakerDropdown.innerHTML = '';
    speakerDropdown.style.display = 'none';
    speakerLabel.textContent = 'Selecciona Hablante...';
    customSelect.style.opacity = '0.5';
    customSelect.style.pointerEvents = 'none';

    currentApiProject = null;
    if (!id) return;
    try {
        const res = await fetch(`/api/projects/${id}`);
        currentApiProject = await res.json();
        const speakers = [...new Set(
            (currentApiProject.scenes || []).map(s => s.scene_data?.speakerName).filter(Boolean)
        )];

        // Construir checkboxes en el dropdown
        speakerDropdown.innerHTML = '';
        speakers.forEach(sp => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:6px; padding:4px 6px; cursor:pointer; white-space:nowrap;';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.value = sp;
            // Restaurar estado persistido
            if (activeSpeakers.includes(sp)) cb.checked = true;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(sp));
            speakerDropdown.appendChild(label);
        });

        customSelect.style.opacity = '1';
        customSelect.style.pointerEvents = 'auto';

        // --- Auto-restauración: recargar hablantes previos ---
        const validRestored = activeSpeakers.filter(s => speakers.includes(s));
        if (validRestored.length > 0) {
            isAutoLoading = true;
            renderSelectedScenes(validRestored);
            isAutoLoading = false;
            updateSpeakerLabel(validRestored);
        }
    } catch (err) {
        console.error('Error al cargar el proyecto:', err);
    }
});

// --- FUNCIÓN CENTRALIZADA DE RENDERIZADO ---
function updateSpeakerLabel(selected) {
    const label = document.getElementById('speaker-select-label');
    if (!label) return;
    if (selected.length === 0) { label.textContent = 'Selecciona Hablante...'; }
    else if (selected.length === 1) { label.textContent = selected[0]; }
    else if (selected.length <= 3) { label.textContent = selected.join(', '); }
    else { label.textContent = `${selected.length} hablantes seleccionados`; }
}

function renderSelectedScenes(selectedSpeakers) {
    if (!currentApiProject) return;

    // Guardarraíl (solo en cambios manuales)
    if (!isAutoLoading && state.cardsData.length > 0) {
        if (!window.confirm('Cambiar la selección eliminará las tarjetas actuales. ¿Continuar?')) {
            return false; // señal de cancelación
        }
    }

    // Persistir selección
    activeSpeakers = selectedSpeakers;
    localStorage.setItem('prompter_activeSpeakers', JSON.stringify(activeSpeakers));

    const filteredScenes = (currentApiProject.scenes || [])
        .filter(s => selectedSpeakers.includes(s.scene_data?.speakerName));

    state.cardsData = [];
    cardsList.innerHTML = '';
    state.colorIndex = 0;
    let newHtml = '';

    filteredScenes.forEach((scene) => {
        const scriptText = scene.script || (scene.scene_data && scene.scene_data.script) || '';

        if (scriptText.trim() !== '') {
            // 1. Calcular número de tarjeta absoluto
            const absoluteIndex = currentApiProject.scenes.findIndex(s => s.id === scene.id) + 1;

            // 2. Búsqueda profunda de Título
            const titleText = scene.title || (scene.scene_data && scene.scene_data.title) || '';
            const cardTitle = titleText ? `&nbsp;•&nbsp; ${titleText}` : '';

            // 3. Búsqueda profunda de Sección
            const sectionText = scene.sectionName || scene.section || (scene.scene_data && (scene.scene_data.sectionName || scene.scene_data.section)) || '';
            const cardSection = sectionText ? `&nbsp;•&nbsp; ${sectionText}` : '';

            // 4. Hablante (solo si hay múltiples seleccionados)
            const sceneSpeakerName = scene.scene_data?.speakerName || '';
            const cardSpeaker = (selectedSpeakers.length > 1 && sceneSpeakerName)
                ? `&nbsp;•&nbsp; 🗣️ ${sceneSpeakerName}` : '';

            // 5. Construir cabecera enriquecida
            newHtml += `<div contenteditable="false" style="color: #7a7a7a; font-size: 0.8rem; font-weight: bold; margin-top: 35px; margin-bottom: 10px; user-select: none; border-bottom: 1px solid #333; padding-bottom: 4px; letter-spacing: 0.5px;">`;
            newHtml += `TARJETA #${absoluteIndex}${cardTitle}${cardSection}${cardSpeaker}`;
            newHtml += `</div>`;

            // 6. Inyectar texto
            newHtml += scriptText.trim() + '<br><br>';
        }
    });

    textContainer.innerHTML = newHtml;
    renderSidebar();
    updateGlobalStats();
    historyManager.pushHistory();
    return true;
}

// --- LISTENERS DEL CUSTOM DROPDOWN DE HABLANTES ---

// Abrir / cerrar dropdown al hacer clic en el contenedor
document.getElementById('custom-speaker-select').addEventListener('click', (e) => {
    const menu = document.getElementById('speaker-dropdown-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    e.stopPropagation();
});

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', () => {
    const menu = document.getElementById('speaker-dropdown-menu');
    if (menu) menu.style.display = 'none';
});

// Delegación: cambio en cualquier checkbox
document.getElementById('speaker-dropdown-menu').addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const checked = Array.from(
        document.querySelectorAll('#speaker-dropdown-menu input[type=checkbox]:checked')
    ).map(cb => cb.value);

    updateSpeakerLabel(checked);
    if (checked.length === 0) return; // nada seleccionado: no renderizar
    renderSelectedScenes(checked);
});

// --- EVENTOS DEL PANEL PRINCIPAL (SETUP) ---

document.getElementById('btn-undo').addEventListener('click', () => { historyManager.undoHistory(); });
document.getElementById('btn-refresh').addEventListener('click', () => {
    if (activeSpeakers.length > 0) renderSelectedScenes(activeSpeakers);
});
document.getElementById('btn-clear').addEventListener('click', () => {
    // --- Guardarraíl: confirmar borrado total ---
    if (state.cardsData.length > 0) {
        if (!window.confirm('¿Borrar todo el progreso actual? Esta acción no se puede deshacer.')) return;
    }
    state.originalTextContent = '';
    textContainer.innerHTML = '';
    state.cardsData = []; cardsList.innerHTML = ''; state.colorIndex = 0;
    updateGlobalStats();
    localStorage.removeItem('prompterAutosave');
    historyManager.pushHistory();
    document.getElementById('api-project-select').value = '';
    lastProjectId = ''; localStorage.setItem('prompter_lastProjectId', '');
    activeSpeakers = []; localStorage.setItem('prompter_activeSpeakers', '[]');
    // Resetear custom dropdown
    const speakerDropdown = document.getElementById('speaker-dropdown-menu');
    const customSelect = document.getElementById('custom-speaker-select');
    speakerDropdown.innerHTML = '';
    speakerDropdown.style.display = 'none';
    document.getElementById('speaker-select-label').textContent = 'Selecciona Hablante...';
    customSelect.style.opacity = '0.5';
    customSelect.style.pointerEvents = 'none';
    currentApiProject = null;
});

let debounceTimer;
textContainer.addEventListener('input', () => {
    updateGlobalStats();
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        let node = selection.anchorNode;
        while (node && node !== textContainer) {
            if (node.nodeName === 'MARK' && node.id.startsWith('mark-')) {
                const cardId = parseInt(node.id.replace('mark-', ''));
                const newText = node.innerText;
                const cardIndex = state.cardsData.findIndex(c => c.id === cardId);
                if (cardIndex > -1) {
                    state.cardsData[cardIndex].text = newText;
                    const textarea = document.querySelector(`textarea[data-id="${cardId}"]`);
                    if (textarea) {
                        textarea.value = newText;
                        const timeStr = Math.ceil((newText.trim().split(/\s+/).length / 130) * 60) + "s";
                        textarea.nextElementSibling.querySelector('span').textContent = `${newText.length} car. | ~${timeStr}`;
                    }
                }
                break;
            }
            node = node.parentNode;
        }
    }
    saveToLocal();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { historyManager.pushHistory(); }, 500);
});

textContainer.addEventListener('mouseup', function () {
    const selection = window.getSelection();
    if (selection.isCollapsed) return;
    const selectedText = selection.toString().trim();
    if (selectedText.length === 0) return;

    const cardId = Date.now();
    const range = selection.getRangeAt(0);

    // DOM Traversal: normalizar al hijo directo de #text-container y rastrear hermanos previos
    let metaText = '';
    let currentNode = range.startContainer;

    // 1. Normalizar el nodo: asegurar que estamos operando sobre un hijo directo del text-container
    while (currentNode && currentNode.parentNode && currentNode.parentNode.id !== 'text-container') {
        currentNode = currentNode.parentNode;
    }

    // 2. Rastrear hermanos hacia atrás hasta encontrar el DIV no editable
    if (currentNode) {
        let prevNode = currentNode.previousSibling;
        while (prevNode) {
            if (prevNode.nodeType === 1 && prevNode.tagName === 'DIV' && prevNode.getAttribute('contenteditable') === 'false') {
                metaText = prevNode.innerText || prevNode.textContent;
                break;
            }
            prevNode = prevNode.previousSibling;
        }
    }

    const markNode = document.createElement('mark');
    markNode.className = `highlight c${state.colorIndex % 4}`; markNode.id = `mark-${cardId}`;
    try { markNode.appendChild(range.extractContents()); range.insertNode(markNode); } catch (e) { console.warn("Selección cruzada"); }

    state.cardsData.push({ id: cardId, text: selectedText, metadata: metaText });
    state.colorIndex++; selection.removeAllRanges();

    const markElements = Array.from(textContainer.querySelectorAll('mark.highlight'));
    const sortedCards = [];
    markElements.forEach(mark => {
        const id = parseInt(mark.id.replace('mark-', ''));
        const card = state.cardsData.find(c => c.id === id);
        if (card) sortedCards.push(card);
    });
    state.cardsData = sortedCards;

    renderSidebar(); saveToLocal();
    historyManager.pushHistory();
});

// Delegación de eventos para la lista de tarjetas
cardsList.addEventListener('click', (e) => {
    const btnDelete = e.target.closest('.btn-delete');
    if (btnDelete) {
        const cardItem = btnDelete.closest('.card-item');
        if (cardItem) {
            const id = parseInt(cardItem.dataset.id);
            deleteCard(id);
        }
    }
});


// --- EVENTOS DEL PROMPTER ---

btnStart.addEventListener('click', startPrompter);
document.getElementById('btn-exit-prompter').addEventListener('click', (e) => { e.stopPropagation(); exitPrompter(); });
document.getElementById('btn-menu-prompter').addEventListener('click', (e) => { e.stopPropagation(); openJumpMenu(); });
document.getElementById('btn-font-prompter').addEventListener('click', toggleFontSlider);
document.getElementById('btn-align-prompter').addEventListener('click', cycleAlignment);
prompterView.addEventListener('click', () => { fontSliderPanel.style.display = 'none'; });
fontSliderPanel.addEventListener('click', (e) => e.stopPropagation());
prompterText.addEventListener('input', handlePrompterInput);
document.getElementById('zone-right').addEventListener('click', nextCard);
document.getElementById('zone-left').addEventListener('click', prevCard);
fontSizeSlider.addEventListener('input', updateFontSize);
fontSizeSlider.addEventListener('change', () => { historyManager.pushHistory(); });
document.getElementById('btn-close-jump').addEventListener('click', closeJumpMenu);
jumpMenuOverlay.addEventListener('click', (e) => { if (e.target === jumpMenuOverlay) closeJumpMenu(); });
document.addEventListener('keydown', handleKeydown);

// --- ATAJOS GLOBALES DEL TECLADO ---
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        historyManager.undoHistory();
    }
});

window.addEventListener('beforeunload', (e) => {
    if (state.cardsData.length > 0) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// --- INICIALIZACIÓN ---
loadFromLocal();   // restaura preferencias de usuario (WPM, fontSize, alignment)
fetchProjects();   // puebla el selector de proyectos desde el backend
