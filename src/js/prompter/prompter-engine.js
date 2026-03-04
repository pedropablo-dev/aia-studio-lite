import { state } from './state.js';
import { saveToLocal } from './storage.js';
import { calculateReadingTime, updateGlobalStats } from './ui-renderer.js';

const setupView = document.getElementById('setup-view');
const prompterView = document.getElementById('prompter-view');
const prompterText = document.getElementById('prompter-text');
const progressIndicator = document.getElementById('progress-indicator');
const fontSliderPanel = document.getElementById('font-slider-panel');
const jumpMenuOverlay = document.getElementById('jump-menu-overlay');
const jumpListContent = document.getElementById('jump-list-content');
const fontSizeSlider = document.getElementById('font-size-slider');

function enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) { elem.requestFullscreen().catch(() => { }); }
    else if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); }
    else if (elem.msRequestFullscreen) { elem.msRequestFullscreen(); }
}

function exitFullscreenMode() {
    if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
        if (document.exitFullscreen) { document.exitFullscreen(); }
        else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
        else if (document.msExitFullscreen) { document.msExitFullscreen(); }
    }
}

export function startPrompter() {
    if (state.cardsData.length === 0) return;
    enterFullscreen();
    setupView.style.display = 'none'; prompterView.style.display = 'block';
    prompterText.style.textAlign = state.textAlignment || 'center';
    state.currentCardIndex = 0; renderPrompterCard();
}

export function exitPrompter() {
    exitFullscreenMode();
    prompterView.style.display = 'none'; setupView.style.display = 'flex'; fontSliderPanel.style.display = 'none';
}

function renderPrompterCard() {
    if (state.cardsData.length === 0) return;
    const currentCard = state.cardsData[state.currentCardIndex];
    prompterText.innerText = currentCard.text;
    progressIndicator.textContent = `${state.currentCardIndex + 1} / ${state.cardsData.length}`;

    // Apply alignment & per-card font
    prompterText.style.textAlign = state.textAlignment;
    const sizeToApply = currentCard.localFontSize || state.fontSize;
    prompterText.style.fontSize = sizeToApply + 'vh';
    fontSizeSlider.value = sizeToApply;

    // Actualizar telemetría de UI numérico/iconos
    const zoomLabel = document.getElementById('zoom-value-display');
    if (zoomLabel) zoomLabel.textContent = Number(sizeToApply).toFixed(1);

    const alignBtn = document.getElementById('btn-align-prompter');
    if (alignBtn) {
        const alignIcons = { 'center': '≡', 'left': '⇦', 'right': '⇨', 'justify': '≣' };
        alignBtn.textContent = alignIcons[state.textAlignment] || '≡';
    }

    const btnCompleted = document.getElementById('btn-toggle-completed');
    if (btnCompleted) {
        btnCompleted.style.color = currentCard.completed ? '#4caf50' : 'white';
        btnCompleted.style.borderColor = currentCard.completed ? '#4caf50' : '#555';
    }

    // Actualizar barra de metadatos superior
    const metaContainer = document.getElementById('prompter-top-metadata');
    if (metaContainer) {
        metaContainer.innerText = currentCard.metadata || '';
    }
}
export function nextCard() { if (state.currentCardIndex < state.cardsData.length - 1) { state.currentCardIndex++; renderPrompterCard(); } }
export function prevCard() { if (state.currentCardIndex > 0) { state.currentCardIndex--; renderPrompterCard(); } }

export function handlePrompterInput(e) {
    if (state.cardsData.length === 0) return;
    const newText = e.target.innerText;
    const currentCard = state.cardsData[state.currentCardIndex];
    currentCard.text = newText;
    const textarea = document.querySelector(`textarea[data-id="${currentCard.id}"]`);
    if (textarea) {
        textarea.value = newText;
        textarea.nextElementSibling.querySelector('span').textContent = `${newText.length} car. | ~${calculateReadingTime(newText)}s`;
    }
    const markNode = document.getElementById(`mark-${currentCard.id}`);
    if (markNode) markNode.innerText = newText;
    updateGlobalStats(); saveToLocal();
}

export function toggleFontSlider(e) {
    e.stopPropagation();
    fontSliderPanel.style.display = fontSliderPanel.style.display === 'flex' ? 'none' : 'flex';
}

export function cycleAlignment(e) {
    e.stopPropagation();
    const alignments = ['center', 'left', 'right', 'justify'];
    const currentIndex = alignments.indexOf(state.textAlignment);
    state.textAlignment = alignments[(currentIndex + 1) % alignments.length];
    prompterText.style.textAlign = state.textAlignment;

    // Actualizar feedback visual
    const alignBtn = document.getElementById('btn-align-prompter');
    if (alignBtn) {
        const alignIcons = { 'center': '≡', 'left': '⇦', 'right': '⇨', 'justify': '≣' };
        alignBtn.textContent = alignIcons[state.textAlignment] || '≡';
    }

    saveToLocal();
    import('./history-manager.js').then(module => module.historyManager.pushHistory());
}

export function openJumpMenu() {
    jumpListContent.innerHTML = '';
    state.cardsData.forEach((card, index) => {
        const item = document.createElement('div'); item.className = 'jump-item';
        const previewText = card.text.length > 60 ? card.text.substring(0, 60) + '...' : card.text;
        item.innerHTML = `<div class="jump-num">${index + 1}.</div><div class="jump-text">${previewText}</div>`;
        item.addEventListener('click', () => { state.currentCardIndex = index; renderPrompterCard(); closeJumpMenu(); });
        jumpListContent.appendChild(item);
    });
    jumpMenuOverlay.style.display = 'flex'; fontSliderPanel.style.display = 'none';
}

export function closeJumpMenu() { jumpMenuOverlay.style.display = 'none'; }

export function handleKeydown(e) {
    if (jumpMenuOverlay.style.display === 'flex') { if (e.key === 'Escape') closeJumpMenu(); return; }
    if (prompterView.style.display !== 'block') return;
    if (document.activeElement === prompterText) { if (e.key === 'Escape') { prompterText.blur(); } return; }

    const nextKeys = ['ArrowRight', 'ArrowDown', 'PageDown'];
    const prevKeys = ['ArrowLeft', 'ArrowUp', 'PageUp'];

    if (nextKeys.includes(e.key)) { e.preventDefault(); nextCard(); }
    else if (prevKeys.includes(e.key)) { e.preventDefault(); prevCard(); }
    else if (e.key === 'Escape') { exitPrompter(); }
}

export function updateFontSize(e) {
    const newSize = Number(e.target.value);
    const currentCard = state.cardsData[state.currentCardIndex];

    if (currentCard) {
        currentCard.localFontSize = newSize;
        prompterText.style.fontSize = newSize + 'vh';

        const zoomLabel = document.getElementById('zoom-value-display');
        if (zoomLabel) zoomLabel.textContent = newSize.toFixed(1);

        saveToLocal();
    }
}

export function toggleCompleted(e) {
    if (e) e.stopPropagation();
    if (state.cardsData.length === 0) return;
    const currentCard = state.cardsData[state.currentCardIndex];
    currentCard.completed = !currentCard.completed;

    // Feedback inmediato en prompter
    const btnCompleted = document.getElementById('btn-toggle-completed');
    if (btnCompleted) {
        btnCompleted.style.color = currentCard.completed ? '#4caf50' : 'white';
        btnCompleted.style.borderColor = currentCard.completed ? '#4caf50' : '#555';
    }

    saveToLocal();
    // Re-render sidebar en background
    import('./ui-renderer.js').then(m => m.renderSidebar());
}
