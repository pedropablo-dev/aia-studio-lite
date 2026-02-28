// --- KEYBOARD SHORTCUTS & GLOBAL EVENTS ---

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); toggleTimelineOutline(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && selectedId) { e.preventDefault(); openQuickFileModal(selectedId); }
    if (e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); openQuickFileModal(null, ''); }
});

// --- ATAJOS DE TECLADO (HOTKEYS V1.2 - 10/10) ---
document.addEventListener('keydown', (e) => {
    // Detectar si estamos escribiendo en un input o textarea
    const activeTag = document.activeElement.tagName;
    const isTyping = (activeTag === 'INPUT' || activeTag === 'TEXTAREA');

    // MODO EDICIÓN: Aislar atajos globales para no pisar la escritura
    if (isTyping) {
        // Permitir atajos globales SOLO si involucran Alt o Ctrl/Meta
        if (!e.altKey && !e.ctrlKey && !e.metaKey) return;
    }

    // --- ACCIONES VINCULADAS AL PROYECTO ---
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (typeof openProjectManagerModal === 'function') openProjectManagerModal();
        return;
    }

    if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (typeof openExportModal === 'function') openExportModal('txt');
        return;
    }

    if (e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (typeof openExportModal === 'function') openExportModal('md');
        return;
    }

    // --- ACCIONES CON SHIFT Y SIN MODIFICADORES (Protegidas por isTyping) ---

    // F: Centrar selección
    if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (typeof focusSelection === 'function') focusSelection();
        return;
    }

    // Shift + F: Fit All
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (typeof fitAll === 'function') fitAll();
        return;
    }

    // 0: Reset View
    if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === '0') {
        e.preventDefault();
        if (typeof resetView === 'function') resetView();
        return;
    }

    // Shift + O: Expandir modal de edición
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (selectedId && typeof openModal === 'function') openModal(selectedId);
        return;
    }

    // Shift + Espacio: Marcar completado
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === ' ') {
        e.preventDefault();
        if (selectedId && typeof toggleCheck === 'function') {
            toggleCheck(selectedId);
        }
        return;
    }

    // --- NAVEGACIÓN Y SELECCIÓN ---

    // Tecla Supr (Delete)
    if (e.key === 'Delete') {
        if (selectedId && typeof deleteScene === 'function') {
            deleteScene(selectedId);
            return;
        }
    }

    // NUEVA ESCENA: Alt + Enter
    if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        if (typeof addScene === 'function') addScene();
        return;
    }

    // DUPLICAR: Ctrl + D
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selectedId && typeof duplicateScene === 'function' && typeof scenes !== 'undefined') {
            const index = scenes.findIndex(s => s.id === selectedId);
            if (index !== -1) duplicateScene(index, 1);
        }
        return;
    }

    // MANUAL BACKUP: Ctrl + S
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (typeof manualBackup === 'function') manualBackup();
        return;
    }

    // FLECHAS: Navegación de selección vs Mover escena
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (typeof scenes === 'undefined' || scenes.length === 0) return;

        let currentIndex = -1;
        if (selectedId) {
            currentIndex = scenes.findIndex(s => s.id === selectedId);
        }

        // Si no hay seleccionada y pulsamos flechas, seleccionamos la primera o última instintivamente
        if (currentIndex === -1) {
            currentIndex = e.key === 'ArrowLeft' ? scenes.length - 1 : 0;
            selectedId = scenes[currentIndex].id;
            if (typeof render === 'function') render();
            if (typeof centerOnIndex === 'function') centerOnIndex(currentIndex, typeof currentZoom !== 'undefined' ? currentZoom : 1);
            return;
        }

        const direction = e.key === 'ArrowRight' ? 1 : -1;

        if (e.ctrlKey || e.metaKey) {
            // MOVER ESCENA
            e.preventDefault(); // Evitar scroll de la ventana
            if (typeof moveScene === 'function') moveScene(currentIndex, direction);
        } else {
            // CAMBIAR SELECCIÓN
            e.preventDefault(); // Evitar scroll de la ventana
            const newIndex = currentIndex + direction;
            if (newIndex >= 0 && newIndex < scenes.length) {
                selectedId = scenes[newIndex].id;
                if (typeof render === 'function') render();
                if (typeof centerOnIndex === 'function') centerOnIndex(newIndex, typeof currentZoom !== 'undefined' ? currentZoom : 1);
            }
        }
    }

    // Inicio / Fin: Primera / Última Escena
    if (e.key === 'Home' || e.key === 'End') {
        if (typeof scenes === 'undefined' || scenes.length === 0) return;
        e.preventDefault();

        let targetIndex = e.key === 'Home' ? 0 : scenes.length - 1;
        selectedId = scenes[targetIndex].id;

        if (typeof render === 'function') render();
        if (typeof centerOnIndex === 'function') centerOnIndex(targetIndex, typeof currentZoom !== 'undefined' ? currentZoom : 1);
        return;
    }

    // Modal de Ayuda (?)
    if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (typeof openShortcutsModal === 'function') openShortcutsModal();
    }

    if (e.key === 'Escape') {
        // Prioridad 1: Cerrar modales abiertos
        const openModals = Array.from(document.querySelectorAll('.modal-overlay')).filter(m => window.getComputedStyle(m).display === 'flex');
        if (openModals.length > 0) {
            openModals.forEach(m => m.style.display = 'none');
            // Asegurar limpieza adicional si es necesario
            if (typeof closeModal === 'function') closeModal(false);
            if (typeof closeShortcutsModal === 'function') closeShortcutsModal();
            return;
        }

        // Prioridad 2: Limpiar selección y renderizar
        if (typeof selectedId !== 'undefined' && selectedId !== null) {
            selectedId = null;
            if (typeof render === 'function') render();
        }
    }
});


// Window Event Listeners
window.addEventListener('beforeunload', (e) => {
    if (scenes.length > 0) { e.preventDefault(); e.returnValue = ''; }
});
