import { state } from './state.js';
import { updateGlobalStats, renderSidebar } from './ui-renderer.js';
import { historyManager } from './history-manager.js';

const textContainer = document.getElementById('text-container');
const autosaveIndicator = document.getElementById('autosave-indicator');

export function saveToLocal() {
    if (!textContainer.innerText.trim() && state.cardsData.length === 0) return;
    const projectData = { originalText: state.originalTextContent, currentHtml: textContainer.innerHTML, cards: state.cardsData, colorIndex: state.colorIndex, WPM: state.WPM, fontSize: state.fontSize, textAlignment: state.textAlignment };
    localStorage.setItem('prompterAutosave', JSON.stringify(projectData));
    autosaveIndicator.style.opacity = '1'; setTimeout(() => { autosaveIndicator.style.opacity = '0'; }, 1500);
}

export function loadFromLocal() {
    const savedData = localStorage.getItem('prompterAutosave');
    if (savedData) {
        try {
            const projectData = JSON.parse(savedData);
            state.originalTextContent = projectData.originalText || "";
            state.cardsData = projectData.cards || []; state.colorIndex = projectData.colorIndex || 0;
            state.WPM = projectData.WPM || 130; state.fontSize = projectData.fontSize || 8;
            state.textAlignment = projectData.textAlignment || 'center';
            renderSidebar();
            historyManager.pushHistory();
        } catch (e) { console.warn("No se pudo recuperar el autoguardado."); }
    }
}
