import { state } from './state.js';
import { saveToLocal } from './storage.js';
import { historyManager } from './history-manager.js';

const textContainer = document.getElementById('text-container');
const cardsList = document.getElementById('cards-list');
const statsHeader = document.getElementById('global-stats-header');
const statsSidebar = document.getElementById('global-stats-sidebar');
const btnStart = document.getElementById('btn-start');

export function calculateReadingTime(text) { return Math.ceil((text.trim().split(/\s+/).length / state.WPM) * 60); }

export function updateGlobalStats() {
    const fullText = textContainer.innerText || "";
    const tSecsDoc = calculateReadingTime(fullText);
    const minDoc = Math.floor(tSecsDoc / 60); const secDoc = tSecsDoc % 60;
    const timeStrDoc = minDoc > 0 ? `${minDoc}m ${secDoc}s` : `${secDoc}s`;
    statsHeader.textContent = `${fullText.length} car. | ~${timeStrDoc}`;

    let totalCardsWords = 0; let totalCardsChars = 0;
    state.cardsData.forEach(card => { totalCardsChars += card.text.length; totalCardsWords += card.text.trim().split(/\s+/).length; });
    const tSecsCards = Math.ceil((totalCardsWords / state.WPM) * 60);
    const minCards = Math.floor(tSecsCards / 60); const secCards = tSecsCards % 60;
    const timeStrCards = minCards > 0 ? `${minCards}m ${secCards}s` : `${secCards}s`;

    statsSidebar.textContent = `Tarjetas: ${state.cardsData.length} | ${totalCardsChars} car. | ~${timeStrCards}`;
    btnStart.style.display = state.cardsData.length > 0 ? 'block' : 'none';
}

export function renderSidebar() {
    cardsList.innerHTML = '';
    state.cardsData.forEach((card) => {
        const timeStr = calculateReadingTime(card.text) + "s";
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card-item'; cardDiv.draggable = true; cardDiv.dataset.id = card.id;

        let metaHtml = '';
        if (card.metadata) {
            metaHtml = `<div class="card-meta-text" style="font-size:0.75rem; color:#888; padding:4px 6px; background:var(--bg-card); border-bottom:1px solid #333; margin-top:-2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${card.metadata}">${card.metadata}</div>`;
        }

        cardDiv.innerHTML = `${metaHtml}<textarea data-id="${card.id}" spellcheck="false">${card.text}</textarea><div class="card-meta"><span>${card.text.length} car. | ~${timeStr}</span><button class="btn-delete">Eliminar</button></div>`;

        cardDiv.addEventListener('dragstart', (e) => { state.draggedCardId = card.id; e.dataTransfer.effectAllowed = 'move'; });
        cardDiv.addEventListener('dragover', (e) => { e.preventDefault(); cardDiv.classList.add('drag-over'); });
        cardDiv.addEventListener('dragleave', () => cardDiv.classList.remove('drag-over'));
        cardDiv.addEventListener('drop', (e) => {
            e.preventDefault(); cardDiv.classList.remove('drag-over');
            const targetId = card.id; if (state.draggedCardId && state.draggedCardId !== targetId) swapCards(state.draggedCardId, targetId);
        });
        cardsList.appendChild(cardDiv);
    });
    updateGlobalStats();

    let cardDebounceTimer;
    document.querySelectorAll('.card-item textarea').forEach(textarea => {
        textarea.addEventListener('input', function (e) {
            const id = parseInt(e.target.getAttribute('data-id'));
            const cardIndex = state.cardsData.findIndex(c => c.id === id);
            if (cardIndex > -1) {
                state.cardsData[cardIndex].text = e.target.value;
                const timeStr = calculateReadingTime(e.target.value) + "s";
                e.target.nextElementSibling.querySelector('span').textContent = `${e.target.value.length} car. | ~${timeStr}`;
                const markNode = document.getElementById(`mark-${id}`);
                if (markNode) markNode.innerText = e.target.value;
                updateGlobalStats(); saveToLocal();

                clearTimeout(cardDebounceTimer);
                cardDebounceTimer = setTimeout(() => { historyManager.pushHistory(); }, 500);
            }
        });
    });
}

export function deleteCard(id) {
    state.cardsData = state.cardsData.filter(c => c.id !== id);
    const markNode = document.getElementById(`mark-${id}`);
    if (markNode) { const textNode = document.createTextNode(markNode.innerText); markNode.replaceWith(textNode); }
    renderSidebar(); saveToLocal();
    historyManager.pushHistory();
}

export function swapCards(idA, idB) {
    const indexA = state.cardsData.findIndex(c => c.id === idA);
    const indexB = state.cardsData.findIndex(c => c.id === idB);
    const tempCard = state.cardsData[indexA];
    state.cardsData[indexA] = state.cardsData[indexB];
    state.cardsData[indexB] = tempCard;

    // El panel de texto izquierdo permanece INMUTABLE (Phase 5.4.8).
    // Solo re-renderizamos la barra lateral para reflejar el nuevo estado visual.
    renderSidebar();
    saveToLocal();
    historyManager.pushHistory();
}
