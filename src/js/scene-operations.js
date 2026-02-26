function addScene() {
    debouncedSaveState();
    const newScene = {
        id: createId(), color: presetColors[0].code, duration: 0,
        timingMode: 'auto', // ESTADOS: 'auto', 'manual', 'video'
        shot: presetShots[0], move: presetMoves[0], description: "", script: "", done: false,
        title: "", sectionName: "SECCIÓN", sectionColor: "transparent",
        speakerName: "Voz", speakerColor: "transparent",
        linkedFile: "" // New primary source of truth
    };
    scenes.push(newScene);
    render();
    setTimeout(() => {
        const viewport = document.getElementById("viewport");
        viewport.scrollTo({ left: viewport.scrollWidth, behavior: 'smooth' });
    }, 100);
}

function duplicateScene(index, offset) {
    debouncedSaveState();
    const original = scenes[index];
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = createId();
    // Nota: imageId se mantiene, apuntando a la misma imagen en caché (eficiente)

    const insertIndex = index + offset;
    scenes.splice(insertIndex, 0, copy);
    render();
}

function deleteScene(id) {
    debouncedSaveState();
    scenes = scenes.filter(s => s.id !== id);
    if (selectedId === id) selectedId = null;
    render();
}

function updateData(id, field, value) {
    debouncedSaveState();
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
    debouncedSaveState();
    const s = scenes.find(x => x.id === currentSectionSceneId);
    if (s) { s.sectionName = name; s.sectionColor = color; render(); }
    document.getElementById('quick-section-modal').style.display = 'none';
}

function applySpeakerToScene(name, color) {
    debouncedSaveState();
    const s = scenes.find(x => x.id === currentSpeakerSceneId);
    if (s) { s.speakerName = name; s.speakerColor = color; render(); }
    document.getElementById('quick-speaker-modal').style.display = 'none';
}

function toggleCheck(id) {
    const s = scenes.find(x => x.id === id);
    if (s) { debouncedSaveState(); s.done = !s.done; render(); }
}

function moveScene(index, direction) {
    if ((direction === -1 && index > 0) || (direction === 1 && index < scenes.length - 1)) {
        debouncedSaveState();
        const targetIndex = index + direction;
        [scenes[index], scenes[targetIndex]] = [scenes[targetIndex], scenes[index]];
        render();
    }
}

