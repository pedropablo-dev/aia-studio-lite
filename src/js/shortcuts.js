// --- KEYBOARD SHORTCUTS & GLOBAL EVENTS ---

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); toggleTimelineOutline(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && selectedId) { e.preventDefault(); openQuickFileModal(selectedId); }
    if (e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); openQuickFileModal(null, ''); }
});

// --- ATAJOS DE TECLADO (HOTKEYS V1.1 - Sin Flechas) ---
document.addEventListener('keydown', (e) => {
    // Detectar si estamos escribiendo en un input o textarea
    const activeTag = document.activeElement.tagName;
    const isTyping = (activeTag === 'INPUT' || activeTag === 'TEXTAREA');

    // MODO EDICIÓN: Aislar atajos globales para no pisar el salto de línea nativo (Shift+Enter)
    if (isTyping) {
        // Permitir atajos globales SOLO si involucran Alt o Ctrl
        if (!e.altKey && !e.ctrlKey) return;
    }

    // 1. NUEVA ESCENA: Alt + Enter
    if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        addScene();
        return;
    }

    // --- LOS SIGUIENTES YA ESTÁN PROTEGIDOS POR EL RETURN PREVIO ---

    // 2. BORRAR: Tecla Supr (Delete) o Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
            deleteScene(selectedId);
        }
    }

    // 3. DUPLICAR: Ctrl + D
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedId) {
            const index = scenes.findIndex(s => s.id === selectedId);
            if (index !== -1) duplicateScene(index, 1); // 1 = Duplicar a la derecha
        }
    }

    // 4. MANUAL BACKUP: Ctrl + S
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        manualBackup();
    }
});


document.addEventListener('keydown', (e) => {
    if (e.key === '?' && document.activeElement.tagName === 'BODY') {
        openShortcutsModal();
    }
    // Cerrar con Esc (ya está cubierto, pero específico para este modal)
    if (e.key === 'Escape' && document.getElementById('shortcuts-modal').style.display === 'flex') {
        closeShortcutsModal();
    }
});


// Window Event Listeners
window.addEventListener('beforeunload', (e) => {
    if (scenes.length > 0) { e.preventDefault(); e.returnValue = ''; }
});
