let dragSrcIndex = null;
let _liteDraggedPath = null;
let _dragScrollInterval = null;

function handleDragStart(e, index) {
    dragSrcIndex = index;
    e.dataTransfer.effectAllowed = 'move';

    // Set ghost image to the whole card, not just the handle
    const card = e.target.closest('.scene-card');
    if (card) {
        e.dataTransfer.setDragImage(card, 0, 0);
        card.classList.add('dragging');
    }
}

function handleDrop(e, dropIndex) {
    e.stopPropagation();
    if (dragSrcIndex !== null && dragSrcIndex !== dropIndex) {
        debouncedSaveState();
        const i = scenes.splice(dragSrcIndex, 1)[0];
        scenes.splice(dropIndex, 0, i);
        render();
    }
    return false;
}

function _onFileDragStart(event, filePath) {
    _liteDraggedPath = filePath;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', filePath);
}

function _onFolderDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.style.borderColor = 'var(--accent)';

    // Auto-scroll: dynamic geometry — activates within 25% of container height from each edge
    const container = document.getElementById('quick-file-modal').querySelector('.modal-content');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const hitbox = rect.height * 0.40; // 40% of visible area — only 20% neutral zone
    const speed = 40;

    clearInterval(_dragScrollInterval);

    if (relativeY < hitbox) {
        // scroll up
        _dragScrollInterval = setInterval(() => { if (container.scrollTop > 0) container.scrollTop -= speed; }, 20);
    } else if (relativeY > rect.height - hitbox) {
        // scroll down
        _dragScrollInterval = setInterval(() => { container.scrollTop += speed; }, 20);
    }
}

function _onFolderDragLeave(event) {
    event.currentTarget.style.borderColor = '';
    clearInterval(_dragScrollInterval);
}

function _onFolderDrop(event, folderPath) {
    event.preventDefault();
    clearInterval(_dragScrollInterval);
    event.currentTarget.style.borderColor = '';

    // Normalize source path (replace Windows backslashes)
    const src = (_liteDraggedPath || event.dataTransfer.getData('text/plain')).replace(/\\/g, '/');
    if (!src) return;

    // Resolve the real destination path
    let destPath;
    if (folderPath === '..') {
        // Navigate up from the current browse path
        const cur = currentBrowsePath.replace(/\\/g, '/').replace(/\/+$/, '');
        const lastSlash = cur.lastIndexOf('/');
        destPath = lastSlash > 0 ? cur.substring(0, lastSlash) : '';
    } else {
        destPath = folderPath;
    }

    // Guard: don't drop on itself
    if (src === destPath || destPath.startsWith(src + '/')) return;

    liteMoveFileTo(src, destPath);
    _liteDraggedPath = null;
}

