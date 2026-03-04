// --- IMPORTANTE: Entorno de Ejecución ---
// Este archivo DEBE abrirse a través de un servidor web local para evitar errores
// de CORS. No funcionará abriendo el HTML haciendo doble clic (file://).

import { state } from './state.js';
import { loadFromLocal, saveToLocal } from './storage.js';
import { renderSidebar, deleteCard, updateGlobalStats } from './ui-renderer.js';
import { startPrompter, exitPrompter, openJumpMenu, closeJumpMenu, toggleFontSlider, handlePrompterInput, nextCard, prevCard, handleKeydown, updateFontSize, cycleAlignment, toggleCompleted } from './prompter-engine.js';
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

    // Resetear modal de hablantes
    const speakerModalList = document.getElementById('speaker-modal-list');
    const speakerLabel = document.getElementById('speaker-select-label');
    const customSelect = document.getElementById('custom-speaker-select');
    speakerModalList.innerHTML = '';
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

        // Construir checkboxes en la modal
        speakerModalList.innerHTML = '';
        speakers.forEach(sp => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 4px; cursor:pointer; font-size:0.9rem;';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.value = sp;
            // Restaurar estado persistido
            if (activeSpeakers.includes(sp)) cb.checked = true;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(sp));
            speakerModalList.appendChild(label);
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

    // --- 1. Calcular speakers añadidos y quitados respecto al estado previo ---
    const removedSpeakers = activeSpeakers.filter(s => !selectedSpeakers.includes(s));

    // --- 2. Si se quitaron hablantes, depurar state.cardsData por metadata ---
    if (removedSpeakers.length > 0) {
        state.cardsData = state.cardsData.filter(card => {
            // Eliminar si el metadata de la tarjeta menciona alguno de los hablantes quitados
            return !removedSpeakers.some(sp =>
                card.metadata && card.metadata.includes(sp)
            );
        });
    }

    // --- 3. Persistir selección ---
    activeSpeakers = selectedSpeakers;
    localStorage.setItem('prompter_activeSpeakers', JSON.stringify(activeSpeakers));

    // Si no hay ningún hablante, limpiar y salir
    if (selectedSpeakers.length === 0) {
        state.cardsData = []; cardsList.innerHTML = ''; state.colorIndex = 0;
        textContainer.innerHTML = '';
        renderSidebar(); updateGlobalStats(); historyManager.pushHistory();
        return true;
    }

    // --- 4. Construir HTML recorriendo el proyecto en ORDEN ORIGINAL ---
    const allScenes = currentApiProject.scenes || [];
    let newHtml = '';

    allScenes.forEach((scene) => {
        const sceneSpeakerName = scene.scene_data?.speakerName || '';
        if (!selectedSpeakers.includes(sceneSpeakerName)) return;

        const scriptText = scene.script || (scene.scene_data && scene.scene_data.script) || '';
        if (!scriptText.trim()) return;

        // 4a. Construir cabecera
        const absoluteIndex = allScenes.findIndex(s => s.id === scene.id) + 1;
        const titleText = scene.title || (scene.scene_data && scene.scene_data.title) || '';
        const cardTitle = titleText ? `&nbsp;•&nbsp; ${titleText}` : '';
        const sectionText = scene.sectionName || scene.section ||
            (scene.scene_data && (scene.scene_data.sectionName || scene.scene_data.section)) || '';
        const cardSection = sectionText ? `&nbsp;•&nbsp; ${sectionText}` : '';
        const cardSpeaker = sceneSpeakerName ? `&nbsp;•&nbsp; 🗣️ ${sceneSpeakerName}` : '';

        newHtml += `<div contenteditable="false" style="color: #7a7a7a; font-size: 0.8rem; margin-top: 35px; margin-bottom: 10px; user-select: none; border-bottom: 2px solid #333; padding-bottom: 4px; letter-spacing: 0.5px;">`;
        newHtml += `<span style="color: #b026ff;">TARJETA #${absoluteIndex}</span>${cardTitle}${cardSection}${cardSpeaker}`;
        newHtml += `</div>`;

        // 4b. Cruzar scriptText con tarjetas existentes para re-envolver marks
        let bodyHtml = scriptText.trim();
        state.cardsData.forEach(card => {
            // Solo cruzar tarjetas cuyo metadata apunte a este bloque
            if (!bodyHtml.includes(card.text)) return;
            const colorClass = `highlight c${state.cardsData.indexOf(card) % 4}`;
            const markHtml = `<mark class="${colorClass}" id="mark-${card.id}">${card.text}</mark>`;
            // Reemplazar solo la primera ocurrencia para evitar duplicados
            bodyHtml = bodyHtml.replace(card.text, markHtml);
        });
        newHtml += `<div class="scene-text-block" data-scene-id="${scene.id}" style="display: block;">${bodyHtml}</div><br>`;
    });

    textContainer.innerHTML = newHtml;

    renderSidebar();
    updateGlobalStats();
    historyManager.pushHistory();
    return true;
}

// --- LISTENERS DE LA MODAL DE HABLANTES ---

// Abrir modal al hacer clic en el trigger
document.getElementById('custom-speaker-select').addEventListener('click', () => {
    document.getElementById('speaker-modal-overlay').style.display = 'flex';
});

// Cerrar modal: botón X
document.getElementById('btn-close-speaker-modal').addEventListener('click', () => {
    document.getElementById('speaker-modal-overlay').style.display = 'none';
});

// Cerrar modal: clic en el overlay (fuera del contenido)
document.getElementById('speaker-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('speaker-modal-overlay')) {
        document.getElementById('speaker-modal-overlay').style.display = 'none';
    }
});

// Delegación: cambio en cualquier checkbox de la modal
document.getElementById('speaker-modal-list').addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const checked = Array.from(
        document.querySelectorAll('#speaker-modal-list input[type=checkbox]:checked')
    ).map(cb => cb.value);

    updateSpeakerLabel(checked);
    renderSelectedScenes(checked);
});

// --- EVENTOS DEL PANEL PRINCIPAL (SETUP) ---

document.getElementById('btn-undo').addEventListener('click', () => { historyManager.undoHistory(); });
document.getElementById('btn-refresh').addEventListener('click', () => {
    // Leer hablantes marcados en la modal
    const checked = Array.from(
        document.querySelectorAll('#speaker-modal-list input[type=checkbox]:checked')
    ).map(cb => cb.value);
    if (checked.length === 0) return;

    // Guardarraíl: confirmar borrado de tarjetas actuales
    if (state.cardsData.length > 0) {
        if (!window.confirm('Recargar el guion eliminará todas las tarjetas y marcas actuales. ¿Continuar?')) return;
    }

    // Limpieza total del estado (reset a guión limpio sin marks)
    state.cardsData = []; cardsList.innerHTML = ''; state.colorIndex = 0;
    textContainer.innerHTML = '';

    // Re-renderizar como carga limpia
    isAutoLoading = true;
    renderSelectedScenes(checked);
    isAutoLoading = false;
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
    // Resetear modal de hablantes
    const speakerModalListClear = document.getElementById('speaker-modal-list');
    const customSelectClear = document.getElementById('custom-speaker-select');
    if (speakerModalListClear) speakerModalListClear.innerHTML = '';
    document.getElementById('speaker-select-label').textContent = 'Selecciona Hablante...';
    customSelectClear.style.opacity = '0.5';
    customSelectClear.style.pointerEvents = 'none';
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

    // --- BLOQUEO DE COLISIONES (Exclusión Mutua) ---
    const isInsideMark = (node) => {
        if (!node) return false;
        const element = node.nodeType === 3 ? node.parentNode : node;
        return element.closest ? element.closest('mark.highlight') !== null : false;
    };
    const fragment = range.cloneContents();
    const containsMark = fragment.querySelector('mark.highlight') !== null;
    const startInMark = isInsideMark(range.startContainer);
    const endInMark = isInsideMark(range.endContainer);
    if (containsMark || startInMark || endInMark) {
        selection.removeAllRanges();
        console.warn('Bloqueo de colisión: Violación de exclusión mutua en selección.');
        return;
    }

    // 1. Helper: DOM Traversal con closest() — compatible con la nueva estructura de scene-text-block
    const getHeaderFromNode = (node) => {
        const element = node.nodeType === 3 ? node.parentNode : node;
        const sceneBlock = element.closest('.scene-text-block');
        if (sceneBlock) {
            const header = sceneBlock.previousElementSibling;
            if (header && header.getAttribute('contenteditable') === 'false') {
                return header.innerText || header.textContent;
            }
        }
        return '';
    };

    // 2. Escaneo de rango extendido (Origen y Destino)
    let startMeta = getHeaderFromNode(range.startContainer);
    let endMeta = getHeaderFromNode(range.endContainer);

    // 3. Formateo de Salida
    let metaText = startMeta;
    if (startMeta && endMeta && startMeta.trim() !== endMeta.trim()) {
        // Remover "TARJETA " del destino para ser más conciso (ej: "TARJETA #1 ... ➔ #2 ...")
        let cleanEndMeta = endMeta.replace('TARJETA ', '').trim();
        metaText = `${startMeta.trim()} ➔ ${cleanEndMeta}`;
    } else if (!startMeta && endMeta) {
        metaText = endMeta;
    }

    const markNode = document.createElement('mark');
    markNode.className = `highlight c${state.colorIndex % 4}`; markNode.id = `mark-${cardId}`;
    try { markNode.appendChild(range.extractContents()); range.insertNode(markNode); } catch (e) { console.warn("Selección cruzada"); }

    state.cardsData.push({ id: cardId, text: selectedText, metadata: metaText });
    state.colorIndex++; selection.removeAllRanges();

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

    const btnCheck = e.target.closest('.btn-check');
    if (btnCheck) {
        const cardItem = btnCheck.closest('.card-item');
        if (cardItem) {
            const id = parseInt(cardItem.dataset.id);
            const card = state.cardsData.find(c => c.id === id);
            if (card) {
                card.completed = !card.completed;
                saveToLocal();
                renderSidebar();
                // Si el prompter está activo y estamos en esta tarjeta, sincronizar
                if (prompterView.style.display === 'block' && state.cardsData[state.currentCardIndex]?.id === id) {
                    const btnCompleted = document.getElementById('btn-toggle-completed');
                    if (btnCompleted) {
                        btnCompleted.style.color = card.completed ? '#4caf50' : 'white';
                        btnCompleted.style.borderColor = card.completed ? '#4caf50' : '#555';
                    }
                }
            }
        }
    }
});


// --- EVENTOS DEL PROMPTER ---

btnStart.addEventListener('click', startPrompter);
document.getElementById('btn-exit-prompter').addEventListener('click', (e) => { e.stopPropagation(); exitPrompter(); });
document.getElementById('btn-menu-prompter').addEventListener('click', (e) => { e.stopPropagation(); openJumpMenu(); });
document.getElementById('btn-font-prompter').addEventListener('click', toggleFontSlider);
document.getElementById('btn-align-prompter').addEventListener('click', cycleAlignment);
document.getElementById('btn-toggle-completed').addEventListener('click', toggleCompleted);
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

// --- EXPORTACIÓN JSON (💾 btn-save) ---
document.getElementById('btn-save').addEventListener('click', () => {
    if (state.cardsData.length === 0) { alert('No hay tarjetas para exportar.'); return; }
    const activeSpeakers = Array.from(
        document.querySelectorAll('#speaker-modal-list input[type=checkbox]:checked')
    ).map(cb => cb.value);
    const payload = {
        timestamp: Date.now(),
        project: currentApiProject,
        activeSpeakers,
        cards: state.cardsData
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompter_project_backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// --- SORTING DINÁMICO DE TARJETAS ---
function applyCurrentSorting() {
    const mode = document.getElementById('sidebar-sorter').value;
    if (mode === 'manual') { renderSidebar(); return; }

    if (mode === 'number') {
        state.cardsData.sort((a, b) => {
            const matchA = (a.metadata || '').match(/#(\d+)/);
            const matchB = (b.metadata || '').match(/#(\d+)/);
            return (matchA ? parseInt(matchA[1]) : Infinity) - (matchB ? parseInt(matchB[1]) : Infinity);
        });
    } else if (mode === 'speaker') {
        state.cardsData.sort((a, b) => {
            const getSpeaker = (meta) => {
                const m = (meta || '').match(/🗣️\s*([^\u25ba\n]+)/);
                return m ? m[1].trim() : (meta || '').split('•').slice(-1)[0].trim();
            };
            const getNum = (meta) => { const m = (meta || '').match(/#(\d+)/); return m ? parseInt(m[1]) : Infinity; };
            const spkCmp = getSpeaker(a.metadata).localeCompare(getSpeaker(b.metadata), 'es');
            return spkCmp !== 0 ? spkCmp : getNum(a.metadata) - getNum(b.metadata);
        });
    } else if (mode === 'status') {
        state.cardsData.sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));
    }
    saveToLocal();
    renderSidebar();
}
document.getElementById('sidebar-sorter').addEventListener('change', applyCurrentSorting);
document.getElementById('btn-refresh-sorter').addEventListener('click', applyCurrentSorting);

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
