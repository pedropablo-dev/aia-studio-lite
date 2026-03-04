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
    // --- EVALUACIÓN DE ENTROPÍA: Visibilidad dinámica de la opción "Por Hablante" ---
    const uniqueSpeakers = new Set();
    state.cardsData.forEach(card => {
        if (card.metadata && card.metadata.includes('🗣️')) {
            const parts = card.metadata.split('🗣️');
            for (let i = 1; i < parts.length; i++) {
                const speakerName = parts[i].split('➔')[0].trim();
                if (speakerName) uniqueSpeakers.add(speakerName);
            }
        }
    });
    const sorter = document.getElementById('sidebar-sorter');
    const speakerOption = document.querySelector('#sidebar-sorter option[value="speaker"]');
    if (speakerOption && sorter) {
        if (uniqueSpeakers.size > 1) {
            speakerOption.style.display = '';
        } else {
            speakerOption.style.display = 'none';
            if (sorter.value === 'speaker') sorter.value = 'manual';
        }
    }

    cardsList.innerHTML = '';
    state.cardsData.forEach((card) => {
        const timeStr = calculateReadingTime(card.text) + "s";
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card-item'; cardDiv.draggable = true; cardDiv.dataset.id = card.id;

        let metaHtml = '';
        if (card.metadata) {
            const styledMeta = card.metadata.replace(/(TARJETA #[0-9]+|➔ #[0-9]+)/g, '<span style="color: #b026ff; font-weight: normal;">$1</span>');
            metaHtml = `<div class="card-meta-text" style="font-size:0.75rem; color:#888; padding:4px 6px; background:var(--bg-card); border-bottom:1px solid #333; margin-top:-2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${card.metadata}">${styledMeta}</div>`;
        }

        const checkClass = card.completed ? 'btn-check completed' : 'btn-check';
        const checkStyle = card.completed
            ? 'color: #4caf50; border: 2px solid #4caf50; background: transparent; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; outline: none; padding: 0;'
            : 'color: #555; border: 2px solid #555; background: transparent; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; outline: none; padding: 0;';

        cardDiv.innerHTML = `${metaHtml}<textarea data-id="${card.id}" spellcheck="false" rows="3" style="height: auto; min-height: 3.5rem; overflow: hidden;">${card.text}</textarea>
        <div class="card-meta">
            <span>${card.text.length} car. | ~${timeStr}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="${checkClass}" data-id="${card.id}" style="${checkStyle}" title="Marcar como completado">✓</button>
                <button class="btn-delete">Eliminar</button>
            </div>
        </div>`;
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
        // Altura inicial
        textarea.style.height = 'auto';
        if (textarea.scrollHeight > 0) {
            textarea.style.height = (textarea.scrollHeight) + 'px';
        }

        // Altura y estado dinámico en input
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

                e.target.style.height = 'auto';
                e.target.style.height = (e.target.scrollHeight) + 'px';

                clearTimeout(cardDebounceTimer);
                cardDebounceTimer = setTimeout(() => { historyManager.pushHistory(); }, 500);
            }
        });
    });

    // Intercepción de evento para el botón check (aislando la fuga del Drag & Drop)
    document.querySelectorAll('.btn-check').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            const id = parseInt(this.getAttribute('data-id'));
            const card = state.cardsData.find(c => c.id === id);
            if (card) {
                card.completed = !card.completed;
                saveToLocal();
                renderSidebar();

                // Actualizar visual en prompter si está abierto
                const prompterView = document.getElementById('prompter-view');
                if (prompterView && prompterView.style.display === 'block' && state.cardsData[state.currentCardIndex]?.id === id) {
                    const btnCompleted = document.getElementById('btn-toggle-completed');
                    if (btnCompleted) {
                        btnCompleted.style.color = card.completed ? '#4caf50' : 'white';
                        btnCompleted.style.borderColor = card.completed ? '#4caf50' : '#555';
                    }
                }
            }
        });
    });
} // Fin de renderSidebar cerrado correctamente

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
    // Al mover manualmente, el selector vuelve a "manual" para evitar confusión de UI.
    const sorter = document.getElementById('sidebar-sorter');
    if (sorter) sorter.value = 'manual';
    renderSidebar();
    saveToLocal();
    historyManager.pushHistory();
}
