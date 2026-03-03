function createBaseScene(id = null) {
    return {
        id: id || createId(),
        color: "#333333",
        duration: 0,
        timingMode: 'auto',
        shot: (typeof presetShots !== 'undefined' && presetShots.length > 0) ? presetShots[0] : "Plano",
        move: (typeof presetMoves !== 'undefined' && presetMoves.length > 0) ? presetMoves[0] : "Movimiento",
        description: "",
        script: "",
        done: false,
        title: "",
        sectionName: "SECCIÓN",
        sectionColor: "transparent",
        speakerName: "Hablante",
        speakerColor: "transparent",
        linkedFile: "",
        imageSrc: "",
        imageId: null,
        tempThumbnail: ""
    };
}

function addScene() {
    if (typeof saveToHistory === 'function') saveToHistory();
    const newScene = createBaseScene();
    scenes.push(newScene);
    render();
    setTimeout(() => {
        const viewport = document.getElementById("viewport");
        viewport.scrollTo({ left: viewport.scrollWidth, behavior: 'smooth' });
    }, 100);
}

function duplicateScene(index, offset) {
    if (typeof saveToHistory === 'function') saveToHistory();
    const original = scenes[index];
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = createId();
    // Nota: imageId se mantiene, apuntando a la misma imagen en caché (eficiente)

    const insertIndex = index + offset;
    scenes.splice(insertIndex, 0, copy);
    render();
}

function deleteScene(id) {
    if (typeof saveToHistory === 'function') saveToHistory();
    scenes = scenes.filter(s => s.id !== id);
    if (selectedId === id) selectedId = null;
    render();
}

function updateData(id, field, value) {
    if (typeof saveToHistory === 'function') saveToHistory(); // Llenar pila de Undo antes de mutar
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;

    // Compatibilidad
    if (!scene.timingMode) scene.timingMode = scene.manualTiming ? 'manual' : 'auto';

    scene[field] = value;

    // 1. GESTIÓN DE DURACIÓN (Sin perder foco)
    if (field === 'duration') {
        // Pasamos a manual automáticamente
        scene.timingMode = 'manual';
        scene.manualTiming = true; // Compatibilidad

        // ACTUALIZACIÓN VISUAL DIRECTA (DOM) SIN RENDER()
        // Esto evita que se pierda el foco al escribir
        const card = document.querySelector(`.scene-card[data-id="${id}"]`);
        if (card) {
            const input = card.querySelector('input[type="number"]');
            const iconDiv = card.querySelector('.time-icon-wrapper'); // Necesitamos añadir esta clase en render
            const timeBox = card.querySelector('.time-box-wrapper');  // Necesitamos añadir esta clase en render

            if (input) {
                input.style.color = '#ff9100'; // Naranja
            }
            if (iconDiv) {
                iconDiv.innerHTML = '🔒';
                iconDiv.title = "Clic para Desbloquear (Volver a Auto)";
            }
            if (timeBox) {
                timeBox.style.borderColor = '#ff910066';
            }
        }
        calculateTotalTime();
        return; // IMPORTANTE: No llamamos a render()
    }

    // 2. AUTO-TIMING (Script)
    if (field === 'script' && scene.timingMode === 'auto') {
        const newDuration = estimateDuration(value);
        scene.duration = newDuration;

        const card = document.querySelector(`.scene-card[data-id="${id}"]`);
        if (card) {
            const durInput = card.querySelector('input[type="number"]');
            if (durInput) durInput.value = newDuration;
        }
        calculateTotalTime();
    }

    const noRenderFields = ['title', 'script', 'description'];
    if (noRenderFields.includes(field)) return;

    render();
}

function applyCustomColor(color) {
    if (!presetColors.some(p => p.code === color) && !recentColors.includes(color)) recentColors.push(color);
    applyColorToScene(color);
}

function applyColorToScene(color) {
    updateData(currentColorSceneId, 'color', color);
    document.getElementById('quick-color-modal').style.display = 'none';
}

function applySectionToScene(name, color) {
    if (typeof saveToHistory === 'function') saveToHistory();
    const s = scenes.find(x => x.id === currentSectionSceneId);
    if (s) { s.sectionName = name; s.sectionColor = color; render(); }
    document.getElementById('quick-section-modal').style.display = 'none';
}

function applySpeakerToScene(name, color) {
    if (typeof saveToHistory === 'function') saveToHistory();
    const s = scenes.find(x => x.id === currentSpeakerSceneId);
    if (s) { s.speakerName = name; s.speakerColor = color; render(); }
    document.getElementById('quick-speaker-modal').style.display = 'none';
}

function toggleCheck(id) {
    const s = scenes.find(x => x.id === id);
    if (s) { if (typeof saveToHistory === 'function') saveToHistory(); s.done = !s.done; render(); }
}

function moveScene(index, direction) {
    if ((direction === -1 && index > 0) || (direction === 1 && index < scenes.length - 1)) {
        if (typeof saveToHistory === 'function') saveToHistory();
        const targetIndex = index + direction;
        [scenes[index], scenes[targetIndex]] = [scenes[targetIndex], scenes[index]];
        render();
    }
}

window.closeAllContextMenus = function () {
    document.querySelectorAll('.context-menu').forEach(el => el.remove());
};

document.addEventListener('click', function (e) {
    if (!e.target.closest('.context-menu')) {
        closeAllContextMenus();
    }
});

window.openResetMenu = function (event, id) {
    event.stopPropagation();
    closeAllContextMenus();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `position: fixed; left: ${event.clientX}px; top: ${event.clientY}px; z-index: 9999; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 5px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 4px; min-width: 200px;`;

    const createBtn = (text, mode, color) => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.style.cssText = `background: transparent; border: none; color: ${color}; text-align: left; padding: 8px 12px; cursor: pointer; border-radius: 2px; font-size: 0.9em; transition: background 0.2s;`;
        btn.onmouseover = () => btn.style.background = '#333';
        btn.onmouseout = () => btn.style.background = 'transparent';
        btn.onclick = () => {
            executeReset(id, mode);
            closeAllContextMenus();
        };
        return btn;
    };

    menu.appendChild(createBtn('⚠️ Resetear TODO', 'all', '#ff5252'));
    menu.appendChild(createBtn('🎨 Limpiar Color', 'color', '#ccc'));
    menu.appendChild(createBtn('🚥 Limpiar Sección', 'section', '#ccc'));
    menu.appendChild(createBtn('⚙️ Limpiar Técnica', 'tech', '#ccc'));
    menu.appendChild(createBtn('🗣️ Limpiar Hablante', 'speaker', '#ccc'));

    document.body.appendChild(menu);
};

window.executeReset = function (id, mode) {
    if (typeof saveToHistory === 'function') saveToHistory();
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;

    if (mode === 'all') {
        const baseScene = createBaseScene(scene.id);
        Object.assign(scene, baseScene);
    } else if (mode === 'color') {
        scene.color = '#333333';
    } else if (mode === 'section') {
        scene.sectionName = 'SECCIÓN';
        scene.sectionColor = 'transparent';
    } else if (mode === 'tech') {
        const baseScene = createBaseScene(scene.id);
        scene.shot = baseScene.shot;
        scene.move = baseScene.move;
    } else if (mode === 'speaker') {
        scene.speakerName = 'Voz';
        scene.speakerColor = 'transparent';
    }
    render();
};

window.openAddSceneMenu = function (event, sourceId, direction = 1) {
    event.stopPropagation();
    closeAllContextMenus();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `position: fixed; left: ${event.clientX}px; top: ${event.clientY}px; z-index: 9999; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 5px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 4px; min-width: 200px;`;

    const createBtn = (text, onClickFn, color) => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.style.cssText = `background: transparent; border: none; color: ${color}; text-align: left; padding: 8px 12px; cursor: pointer; border-radius: 2px; font-size: 0.9em; transition: background 0.2s;`;
        btn.onmouseover = () => btn.style.background = '#333';
        btn.onmouseout = () => btn.style.background = 'transparent';
        btn.onclick = onClickFn;
        return btn;
    };

    const insertEmptyFn = () => {
        if (typeof saveToHistory === 'function') saveToHistory();
        const index = scenes.findIndex(s => s.id === sourceId);
        if (index !== -1) {
            const newScene = createBaseScene();
            const targetIndex = direction === -1 ? index : index + 1;
            scenes.splice(targetIndex, 0, newScene);
            render();
        }
        closeAllContextMenus();
    };

    const duplicateFn = () => {
        const index = scenes.findIndex(s => s.id === sourceId);
        if (index !== -1) {
            duplicateScene(index, direction === -1 ? 0 : 1);
        }
        closeAllContextMenus();
    };

    menu.appendChild(createBtn('▢ Insertar Vacía', insertEmptyFn, '#fff'));
    menu.appendChild(createBtn('❏ Duplicar Escena', duplicateFn, '#add8e6'));

    document.body.appendChild(menu);
};

// ================================================================
// EVENT BINDINGS (ECMA MODULES MIGRATION)
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Escenas
    document.getElementById('btn-add-scene')?.addEventListener('click', addScene);
});
