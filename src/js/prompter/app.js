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
    } catch (err) {
        console.error('Error al cargar proyectos:', err);
        document.getElementById('api-project-select').innerHTML = '<option value="">Error al conectar con el servidor</option>';
    }
}

document.getElementById('api-project-select').addEventListener('change', async (e) => {
    const id = e.target.value;
    const speakerSel = document.getElementById('api-speaker-select');
    speakerSel.disabled = true;
    speakerSel.innerHTML = '<option value="">Selecciona Hablante...</option>';
    currentApiProject = null;
    if (!id) return;
    try {
        const res = await fetch(`/api/projects/${id}`);
        currentApiProject = await res.json();
        const speakers = [...new Set(
            (currentApiProject.scenes || []).map(s => s.scene_data?.speakerName).filter(Boolean)
        )];
        speakers.forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp; opt.textContent = sp;
            speakerSel.appendChild(opt);
        });
        speakerSel.disabled = false;
    } catch (err) {
        console.error('Error al cargar el proyecto:', err);
    }
});

document.getElementById('api-speaker-select').addEventListener('change', (e) => {
    const speaker = e.target.value;
    if (!speaker || !currentApiProject) return;
    const filteredScenes = (currentApiProject.scenes || [])
        .filter(s => s.scene_data?.speakerName === speaker);

    let newCards = [];
    let newHtml = '';

    filteredScenes.forEach(scene => {
        const script = scene.scene_data?.script;
        if (!script) return;
        const phrases = script.match(/[^.!?\n]+[.!?\n]*/g) || [script];
        phrases.forEach(phrase => {
            const trimmed = phrase.trim();
            if (!trimmed) return;
            const uniqueId = Math.floor(Date.now() + Math.random() * 10000);
            newCards.push({ id: uniqueId, text: trimmed, localFontSize: null });
            newHtml += '<mark class="highlight c' + (state.colorIndex % 4) + '" id="mark-' + uniqueId + '">' + phrase + '</mark><br><br>';
            state.colorIndex++;
        });
    });

    state.cardsData = newCards;
    textContainer.innerHTML = newHtml;
    renderSidebar();
    updateGlobalStats();
    historyManager.pushHistory();
});

// --- EVENTOS DEL PANEL PRINCIPAL (SETUP) ---

document.getElementById('btn-undo').addEventListener('click', () => { historyManager.undoHistory(); });
document.getElementById('btn-refresh').addEventListener('click', () => {
    const speakerSel = document.getElementById('api-speaker-select');
    if (speakerSel.value) speakerSel.dispatchEvent(new Event('change'));
});
document.getElementById('btn-clear').addEventListener('click', () => {
    state.originalTextContent = "";
    textContainer.textContent = "";
    state.cardsData = []; cardsList.innerHTML = ''; state.colorIndex = 0;
    updateGlobalStats();
    localStorage.removeItem('prompterAutosave');
    historyManager.pushHistory();
    document.getElementById('api-project-select').value = '';
    const speakerSel = document.getElementById('api-speaker-select');
    speakerSel.innerHTML = '<option value="">Selecciona Hablante...</option>';
    speakerSel.disabled = true;
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
    const markNode = document.createElement('mark');
    markNode.className = `highlight c${state.colorIndex % 4}`; markNode.id = `mark-${cardId}`;
    try { markNode.appendChild(range.extractContents()); range.insertNode(markNode); } catch (e) { console.warn("Selección cruzada"); }

    state.cardsData.push({ id: cardId, text: selectedText });
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
