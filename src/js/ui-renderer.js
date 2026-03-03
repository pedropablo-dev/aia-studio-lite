import { projectState } from './state.js';

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 1500);
}

function updateZoom(val) {
    projectState.currentZoom = val;
    document.getElementById('zoom-slider').value = projectState.currentZoom;
    document.getElementById('zoom-display').innerText = Math.round(projectState.currentZoom * 100) + "%";
    const container = document.getElementById('timeline-container');
    container.style.transform = `scale(${projectState.currentZoom})`;
    updateLayoutWidth();
}

function render() {
    const container = document.getElementById("timeline-container");

    // A) Purgado de Huérfanos
    const validIds = new Set(projectState.scenes.map(s => s.id));
    const existingCards = Array.from(container.querySelectorAll('.scene-card'));
    existingCards.forEach(card => {
        if (!validIds.has(card.dataset.id)) {
            card.remove();
        }
    });

    // B) Verificación y Mutación Quirúrgica
    projectState.scenes.forEach((scene, index) => {
        const isSelected = (scene.id === projectState.selectedId);

        let imgSrc = '';
        if (scene.imageId && projectState.imageBank[scene.imageId]) imgSrc = projectState.imageBank[scene.imageId];
        else if (scene.tempThumbnail) imgSrc = scene.tempThumbnail;
        else if (scene.imageSrc) imgSrc = scene.imageSrc;

        const colorName = (projectState.presetColors.find(c => c.code === scene.color) || {}).name || '';
        const spkColor = scene.speakerColor || 'transparent';
        const spkName = scene.speakerName || 'Voz';

        let linkColor = '#888'; let fileType = '';
        if (scene.linkedFile) {
            const _ext = scene.linkedFile.split('.').pop().toLowerCase();
            if (['mp4', 'mov', 'avi', 'mkv', 'mxf', 'webm'].includes(_ext)) { linkColor = '#a5d6a7'; fileType = 'video'; }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(_ext)) { linkColor = '#81d4fa'; fileType = 'image'; }
            else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(_ext)) { linkColor = '#ce93d8'; fileType = 'audio'; }
        }

        const safeFileName = scene.linkedFile ? scene.linkedFile.replace(/'/g, "\\'") : "";
        const shortFileName = scene.linkedFile ? scene.linkedFile.split('/').pop() : "";
        const safeShortFileName = shortFileName.replace(/'/g, "\\'");

        let labelInner = '';
        if (scene.linkedFile) {
            let timeBadge = '';
            if (scene.startTime && scene.startTime > 0) {
                const timeStr = new Date(scene.startTime * 1000).toISOString().substr(11, 8);
                timeBadge = `<div class="time-badge" style="color:#ffb74d; font-size:0.65rem; margin-right:6px; font-weight:bold; white-space:nowrap;">⏱ ${timeStr}</div>`;
            }

            // Check if flagged as missing 
            const isMissing = scene._isMissing ? 'color:#ff5252; text-decoration:line-through;' : `color:${linkColor};`;
            const icon = scene._isMissing ? '⚠️' : '🔗';

            labelInner = `<div class="btn-copy-linked" data-filename="${safeShortFileName}" style="display:flex; align-items:center; gap:4px; width:100%; cursor:pointer;" title="Clic para copiar: ${shortFileName}"><span style="color:${linkColor}; flex-shrink:0;">${icon}</span><span class="linked-file-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; ${isMissing}">${scene.linkedFile}</span>${timeBadge}</div>`;
        } else {
            labelInner = `<span style="opacity:0; user-select:none;">&nbsp;</span>`;
        }

        const mode = scene.timingMode || (scene.manualTiming ? 'manual' : 'auto');
        let timeColor = '#e0e0e0'; let timeIcon = '✨'; let timeTitle = 'Automático (Basado en guion)';
        if (mode === 'manual') { timeColor = '#ff9100'; timeIcon = '🔒'; timeTitle = 'Manual (Bloqueado)'; }
        else if (mode === 'video') { timeColor = '#00e676'; timeIcon = '📽️'; timeTitle = 'Sincronizado con Vídeo'; }

        // Localizar Nodo Existente
        let card = container.querySelector(`.scene-card[data-id="${scene.id}"]`);

        if (!card) {
            // NODO NUEVO: Instanciación Completa
            card = document.createElement("div");
            card.className = `scene-card ${scene.done ? 'completed' : ''} ${isSelected ? 'selected' : ''}`;
            card.dataset.id = scene.id;
            card.dataset.index = index;
            if (fileType) card.dataset.type = fileType;
            card.style.borderTopColor = scene.color;
            card.style.background = `linear-gradient(180deg, ${scene.color}11 0%, #1e1e1e 20%)`;

            const linkedLabel = `<div class="linked-root" style="height: 16px; line-height: 16px; margin-top: 2px; font-family:'Consolas', monospace; font-size:0.65rem; width: 100%;">${labelInner}</div>`;

            card.innerHTML = `
                ${colorName ? `<div class="scene-type-tab" style="background-color:${scene.color}">${colorName}</div>` : '<div class="scene-type-tab" style="display:none"></div>'}
                
                <div class="card-header">
                    <div class="header-left" style="flex-direction:column; align-items:flex-start; gap:0; width: 100%;">
                        <div style="display:flex; align-items:center; width:100%; justify-content: space-between;">
                             <div style="display:flex; align-items:center; gap:8px; flex:1; min-width: 0;">
                                <span class="drag-handle" draggable="true" data-index="${index}">⋮⋮</span>
                                <span class="scene-number">#${index + 1}</span>
                                <input type="text" class="scene-title-input" title="${scene.title || ''}" placeholder="Título..." value="${scene.title || ''}" data-id="${scene.id}" style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; min-width: 0; flex: 1;">
                             </div>
                             
                             <div class="card-controls">
                                <div class="color-picker-trigger" style="background-color:${scene.color}" data-id="${scene.id}" title="Color"></div>
                                <button class="btn-danger btn-delete-scene" style="padding:2px 8px; border-radius:4px;" data-id="${scene.id}">✕</button>
                             </div>
                        </div>
                        ${linkedLabel}
                    </div>
                </div>

                <div class="drop-zone ${scene.linkedFile && !/\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile) ? 'has-image' : (imgSrc ? 'has-image' : '')}" 
                     data-id="${scene.id}">
                    ${(scene.linkedFile && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile)) ? `
                        <div class="audio-wrap" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#1a1a1a;">
                             <div style="font-size:1.8rem; margin-bottom:0;">🎵</div>
                        </div>
                        <img src="" id="img-${scene.id}" style="display:none">
                    ` : (scene.linkedFile && /\.(mp4|mov|mxf|avi|webm|jpg|jpeg|png|webp)$/i.test(scene.linkedFile)) ? `
                        <div class="thumb-loader-container" id="thumb-container-${scene.id}" style="width:100%; height:100%; position:relative; overflow:hidden; background:#111;">
                            <img data-thumb-url="http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(scene.linkedFile)}&folder=${encodeURIComponent(document.getElementById('media-path-input')?.value || '')}" 
                                 data-current-media="${scene.linkedFile.replace(/"/g, '&quot;')}"
                                 id="img-${scene.id}" style="width:100%; height:100%; object-fit:cover; display:none; opacity:0; transition:opacity 0.4s ease-in;" alt="Thumbnail">
                        </div>
                    ` : `
                        <span>Imagen</span><img ${imgSrc ? `src="${imgSrc}"` : ''} data-current-media="${imgSrc}" id="img-${scene.id}" style="${imgSrc ? 'display:block;' : 'display:none;'}">
                    `}
                    <input type="file" id="file-${scene.id}" class="hidden-file-input" accept="image/*" data-id="${scene.id}">
                </div>

                        <div class="full-row" style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                            <div class="time-box-wrapper" style="display:flex; align-items:center; background:#222; border:1px solid ${timeColor === '#e0e0e0' ? '#444' : timeColor + '66'}; border-radius:4px; padding:0 8px; height: 28px; box-sizing: border-box;">
                                <span style="font-size:0.9rem; margin-right:5px; opacity:0.7;">⏱</span>
                                <input type="number" class="time-inp" value="${scene.duration}" min="0" step="0.1" style="width:50px; text-align:center; border:none; background:transparent; color:${timeColor}; font-weight: normal; font-size: 0.85rem; padding:0; font-family: inherit;" data-id="${scene.id}" title="${timeTitle}">
                                    <span style="font-size:0.75rem; color:#666; margin-left:2px;">s</span>
                                    <div class="time-icon-wrapper btn-toggle-timing" data-id="${scene.id}" style="cursor:pointer; font-size:0.75rem; margin-left:6px; opacity:0.8; display:flex; align-items:center;" title="${mode === 'auto' ? 'Clic para Bloquear' : 'Clic para Desbloquear'}">${timeIcon}</div>
                            </div>

                            <button class="btn-time-menu" data-id="${scene.id}" title="Herramientas de Tiempo" style="height: 28px; width: 28px; padding: 0; display: flex; align-items: center; justify-content: center; background: #222; border: 1px solid #444; border-radius: 4px; font-size: 0.9rem; cursor: pointer;">⚡</button>

                            <div class="speaker-badge" data-id="${scene.id}" style="flex-grow:0; margin-left:auto; width:135px;">
                                <div class="speaker-dot" style="background-color: ${spkColor}"></div>
                                <span class="speaker-name">${spkName}</span>
                            </div>
                            <button title="Opciones de Reset" class="view-btn btn-reset-menu" data-id="${scene.id}" style="padding: 0 2px; margin-right: -2px; border: none; background: transparent; font-size: 1.1rem; flex-shrink: 0; color: #aaa; cursor: pointer;">↺</button>
                            <button class="check-btn" data-id="${scene.id}" title="Listo (Shift+Espacio)">${scene.done ? '✓' : ''}</button>
                        </div>

                        <div class="tech-row">
                            <select class="shot-sel" data-id="${scene.id}">${presetShots.map(t => `<option ${t === scene.shot ? 'selected' : ''}>${t}</option>`).join('')}</select>
                            <select class="move-sel" data-id="${scene.id}">${presetMoves.map(m => `<option ${m === scene.move ? 'selected' : ''}>${m}</option>`).join('')}</select>
                        </div>

                        <textarea class="desc-textarea" placeholder="Descripción breve..." data-id="${scene.id}">${scene.description}</textarea>

                        <div class="script-area-container">
                            <textarea class="script-preview" placeholder="Diálogo..." data-id="${scene.id}">${scene.script}</textarea>
                            <button class="expand-btn view-modal-btn" data-id="${scene.id}" title="Expandir (Shift+O)">⤢</button>
                        </div>

                        <div class="move-controls" style="display:flex; justify-content: space-between; align-items: center; margin-top: 10px; margin-bottom: 10px;">
                            <div class="move-group">
                                <button class="btn-move-left" ${index === 0 ? 'disabled' : ''} data-index="${index}" title="Mover a la izquierda (Ctrl+←)">←</button>
                                <button class="dup-btn btn-dup-left" data-id="${scene.id}">+</button>
                            </div>
                            <div style="display:flex; gap:5px;">
                                <button class="btn-link-media" data-id="${scene.id}" title="Vincular archivo multimedia (Ctrl+L)" style="background:#222; border:1px solid #444; color:#ccc; width:30px; height:28px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer;">🔗</button>
                            </div>
                            <div class="move-group">
                                <button class="dup-btn btn-dup-right" data-id="${scene.id}">+</button>
                                <button class="btn-move-right" ${index === projectState.scenes.length - 1 ? 'disabled' : ''} data-index="${index}" title="Mover a la derecha (Ctrl+→)">→</button>
                            </div>
                        </div>

                        <div class="section-bar qt-section-btn" style="background-color: ${scene.sectionColor || 'transparent'}; border-radius: 0 0 4px 4px; margin-top:0;" data-id="${scene.id}">
                            <span class="section-label" style="color: ${scene.sectionName === 'SECCIÓN' ? '#666' : '#222'}">${scene.sectionName}</span>
                        </div>
                        `;
        } else {
            // NODO VIVO: Mutación Quirúrgica
            card.className = `scene-card ${scene.done ? 'completed' : ''} ${isSelected ? 'selected' : ''}`;
            card.dataset.index = index;
            if (fileType) card.dataset.type = fileType; else delete card.dataset.type;
            card.style.borderTopColor = scene.color;
            card.style.background = `linear-gradient(180deg, ${scene.color}11 0%, #1e1e1e 20%)`;

            // Inputs Update (solo si no tienen foco)
            const titleInp = card.querySelector('.scene-title-input');
            if (titleInp && document.activeElement !== titleInp) titleInp.value = scene.title || '';
            if (titleInp) titleInp.title = scene.title || '';
            const durInp = card.querySelector('.time-inp');
            if (durInp && document.activeElement !== durInp) durInp.value = scene.duration;
            const descArea = card.querySelector('.desc-textarea');
            if (descArea && document.activeElement !== descArea) descArea.value = scene.description || '';
            const scriptArea = card.querySelector('.script-preview');
            if (scriptArea && document.activeElement !== scriptArea) scriptArea.value = scene.script || '';
            const shotSel = card.querySelector('.shot-sel');
            if (shotSel && document.activeElement !== shotSel) shotSel.value = scene.shot || presetShots[0];
            const moveSel = card.querySelector('.move-sel');
            if (moveSel && document.activeElement !== moveSel) moveSel.value = scene.move || presetMoves[0];

            // Update Labels
            const typeTab = card.querySelector('.scene-type-tab');
            if (typeTab) {
                if (colorName) { typeTab.style.display = 'block'; typeTab.style.backgroundColor = scene.color; typeTab.innerText = colorName; }
                else { typeTab.style.display = 'none'; }
            }
            const linkedLabelContainer = card.querySelector('.linked-root');
            if (linkedLabelContainer && linkedLabelContainer.innerHTML !== labelInner) { linkedLabelContainer.innerHTML = labelInner; }

            const sceneNum = card.querySelector('.scene-number');
            if (sceneNum) sceneNum.innerText = `#${index + 1}`;

            const colTrigger = card.querySelector('.color-picker-trigger');
            if (colTrigger) colTrigger.style.backgroundColor = scene.color;

            // DOM PATCHING: IMAGEN & MULTIMEDIA
            const dropZone = card.querySelector('.drop-zone');
            if (dropZone) {
                dropZone.className = `drop-zone ${scene.linkedFile && !/\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile) ? 'has-image' : (imgSrc ? 'has-image' : '')}`;
                const img = dropZone.querySelector('img');
                if (img) {
                    let newSrc = ''; let isAudio = false; let isVideoOrImg = false;
                    if (scene.linkedFile && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile)) { isAudio = true; }
                    else if (scene.linkedFile && /\.(mp4|mov|mxf|avi|webm|jpg|jpeg|png|webp)$/i.test(scene.linkedFile)) {
                        isVideoOrImg = true;
                        newSrc = `http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(scene.linkedFile)}&folder=${encodeURIComponent(document.getElementById('media-path-input')?.value || '')}`;
                    } else { newSrc = imgSrc; }

                    let currentIsAudio = dropZone.querySelector('.audio-wrap') !== null;
                    if (isAudio && !currentIsAudio) {
                        dropZone.innerHTML = `<div class="audio-wrap" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#1a1a1a;"><div style="font-size:1.8rem; margin-bottom:0;">🎵</div></div><img src="" id="img-${scene.id}" style="display:none"><input type="file" id="file-${scene.id}" class="hidden-file-input" accept="image/*" data-id="${scene.id}">`;
                    } else if (!isAudio && currentIsAudio) {
                        if (isVideoOrImg) { dropZone.innerHTML = `<div class="thumb-loader-container" id="thumb-container-${scene.id}" style="width:100%; height:100%; position:relative; overflow:hidden; background:#111;"><img data-thumb-url="${newSrc}" data-current-media="${scene.linkedFile.replace(/"/g, '&quot;')}" id="img-${scene.id}" style="width:100%; height:100%; object-fit:cover; display:none; opacity:0; transition:opacity 0.4s ease-in;" alt="Thumbnail"></div><input type="file" id="file-${scene.id}" class="hidden-file-input" accept="image/*" data-id="${scene.id}">`; }
                        else { dropZone.innerHTML = `<span>Imagen</span><img ${newSrc ? `src="${newSrc}"` : ''} data-current-media="${imgSrc}" id="img-${scene.id}" style="${newSrc ? 'display:block;' : 'display:none;'}"><input type="file" id="file-${scene.id}" class="hidden-file-input" accept="image/*" data-id="${scene.id}">`; }
                    } else {
                        // Comparativa Crítica: evita recarga parpadeante en base al media path actual
                        const targetMedia = scene.linkedFile || imgSrc || '';
                        const currentMedia = img.dataset.currentMedia || '';

                        if (currentMedia !== targetMedia) {
                            img.dataset.currentMedia = targetMedia;
                            if (isVideoOrImg) {
                                img.dataset.thumbUrl = newSrc;
                                delete img.dataset.polling;
                                img.style.display = 'none';
                                img.style.opacity = '0';
                                const c = document.getElementById(`thumb-container-${scene.id}`);
                                if (c) c.classList.remove('loading-spinner');
                            } else {
                                if (newSrc) {
                                    img.src = newSrc;
                                    img.setAttribute('src', newSrc);
                                    img.style.display = 'block';
                                } else {
                                    img.removeAttribute('src');
                                    img.style.display = 'none';
                                }
                            }
                        }
                    }
                }
            }

            // Time wrapper
            const timeBox = card.querySelector('.time-box-wrapper');
            if (timeBox) timeBox.style.borderColor = timeColor === '#e0e0e0' ? '#444' : timeColor + '66';
            if (durInp) { durInp.style.color = timeColor; durInp.title = timeTitle; }
            const timeIconWrap = card.querySelector('.time-icon-wrapper');
            if (timeIconWrap) { timeIconWrap.title = mode === 'auto' ? 'Clic para Bloquear' : 'Clic para Desbloquear'; timeIconWrap.innerHTML = timeIcon; }

            // Resto...
            const spkDot = card.querySelector('.speaker-dot'); if (spkDot) spkDot.style.backgroundColor = spkColor;
            const spkNameEl = card.querySelector('.speaker-name'); if (spkNameEl) spkNameEl.innerText = spkName;
            const checkBtn = card.querySelector('.check-btn'); if (checkBtn) checkBtn.innerText = scene.done ? '✓' : '';

            const dragHandle = card.querySelector('.drag-handle');
            if (dragHandle) { dragHandle.dataset.index = index; }

            const moveBtns = card.querySelectorAll('.move-group button');
            if (moveBtns.length >= 4) {
                moveBtns[0].disabled = (index === 0);
                moveBtns[0].dataset.index = index;
                moveBtns[1].dataset.id = scene.id;
                moveBtns[2].dataset.id = scene.id;
                moveBtns[3].disabled = (index === projectState.scenes.length - 1);
                moveBtns[3].dataset.index = index;
            }

            const secBar = card.querySelector('.section-bar');
            if (secBar) {
                secBar.style.backgroundColor = scene.sectionColor || 'transparent';
                const secLab = secBar.querySelector('.section-label');
                if (secLab) { secLab.style.color = scene.sectionName === 'SECCIÓN' ? '#666' : '#222'; secLab.innerText = scene.sectionName; }
            }
        }

        // C) Reordenación Geométrica Sin Desplazar Scroll (Solo reordena si está fuera de sitio)
        if (container.children[index] !== card) {
            container.insertBefore(card, container.children[index] || null);
        }
    });

    // POLLING THUMBNAILS: Disparar retries para asincronía FFmpeg
    document.querySelectorAll('img[data-thumb-url]').forEach(img => {
        const sceneId = img.id.replace('img-', '');
        if (img.dataset.polling !== 'true') {
            img.dataset.polling = 'true';
            if (typeof window.loadThumbnail === 'function') {
                window.loadThumbnail(sceneId, img.dataset.thumbUrl);
            }
        }
    });

    // POLLING RUTAS MUERTAS (Debounced)
    triggerRouteVerification();

    document.getElementById("scene-count").innerText = projectState.scenes.length;
    if (typeof window.calculateTotalTime === 'function') window.calculateTotalTime();
    if (typeof window.updateLayoutWidth === 'function') window.updateLayoutWidth();
    if (projectState.isTimelineOutlineOpen) renderTimelineOutline();
}

// === AUDITORÍA DE ENLACES ROTOS (FASE 9) ===
let routeVerifyTimeout = null;
function triggerRouteVerification() {
    clearTimeout(routeVerifyTimeout);
    routeVerifyTimeout = setTimeout(async () => {
        const pathsToVerify = projectState.scenes
            .filter(s => s.linkedFile)
            .map(s => s.linkedFile);

        if (!pathsToVerify.length) return;

        // Remove duplicates
        const uniquePaths = [...new Set(pathsToVerify)];

        if (typeof window.liteVerifyRoutesApi === 'function') {
            const missing = await window.liteVerifyRoutesApi(uniquePaths);
            let needsRender = false;

            projectState.scenes.forEach(s => {
                if (!s.linkedFile) return;
                const isCurrentlyMissing = missing.includes(s.linkedFile);
                if (s._isMissing !== isCurrentlyMissing) {
                    s._isMissing = isCurrentlyMissing;
                    needsRender = true;
                }
            });

            // Only re-render if state changed to avoid infinite loops
            if (needsRender) render();
        }
    }, 1000);
}

function renderChecklist() {
    const container = document.getElementById('global-checklist-container');
    container.innerHTML = projectState.projectChecklist.map((item, index) => `
                        <div class="checklist-item ${item.checked ? 'checked' : ''}" onclick="toggleGlobalCheck(${index})">
                            <div class="header-check-circle">${item.checked ? '✓' : ''}</div>
                            <span>${item.name}</span>
                        </div>
                        `).join('');
}

function sysDialog({ title = '', message = '', icon = '❓', type = 'confirm',
    defaultValue = '', confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar', confirmClass = 'btn-accent' } = {}) {
    return new Promise(resolve => {
        const overlay = document.getElementById('sys-dialog-overlay');
        const iconEl = document.getElementById('sys-dialog-icon');
        const titleEl = document.getElementById('sys-dialog-title');
        const msgEl = document.getElementById('sys-dialog-message');
        const inputEl = document.getElementById('sys-dialog-input');
        const btnsEl = document.getElementById('sys-dialog-btns');

        iconEl.textContent = icon;
        titleEl.textContent = title;
        msgEl.innerHTML = message;

        // Input visibility
        inputEl.style.display = (type === 'prompt') ? 'block' : 'none';
        if (type === 'prompt') {
            inputEl.value = defaultValue;
            setTimeout(() => inputEl.focus(), 80);
        }

        // Build buttons
        btnsEl.innerHTML = '';

        const close = (confirmed, val) => {
            overlay.style.display = 'none';
            resolve({ confirmed, value: val });
        };

        if (type !== 'alert') {
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = cancelLabel;
            cancelBtn.style.cssText = 'padding:7px 18px; background:#222; border:1px solid #444; color:#ccc; border-radius:4px; cursor:pointer;';
            cancelBtn.onclick = () => close(false, null);
            btnsEl.appendChild(cancelBtn);
        }

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmLabel;
        confirmBtn.className = confirmClass;
        confirmBtn.style.cssText = 'padding:7px 18px; border-radius:4px; cursor:pointer; font-weight:600;';
        confirmBtn.onclick = () => close(true, type === 'prompt' ? inputEl.value.trim() : null);

        // Enter on input also confirms
        inputEl.onkeydown = (e) => { if (e.key === 'Enter') confirmBtn.click(); };

        btnsEl.appendChild(confirmBtn);
        overlay.style.display = 'flex';
    });
}

const Modal = {
    overlay: () => document.getElementById('custom-modal-overlay'),
    title: () => document.getElementById('modal-title'),
    message: () => document.getElementById('modal-message'),
    input: () => document.getElementById('modal-input'),
    btnConfirm: () => document.getElementById('modal-btn-confirm'),
    btnCancel: () => document.getElementById('modal-btn-cancel'),

    confirm(title, text, isDanger = false) {
        return this._show(title, text, false, "", isDanger, true);
    },

    prompt(title, defaultValue = "") {
        return this._show(title, "", true, defaultValue, false, true);
    },

    alert(title, text) {
        return this._show(title, text, false, "", false, false);
    },

    _show(title, text, hasInput, inputVal, isDanger, showCancel) {
        return new Promise((resolve) => {
            const overlay = this.overlay();
            if (!overlay) {
                console.error("Modal overlay not found!");
                resolve(null);
                return;
            }

            // Setup UI
            this.title().innerText = title;
            this.message().innerText = text;
            this.message().style.display = text ? 'block' : 'none';

            const input = this.input();
            if (hasInput) {
                input.value = inputVal;
                input.classList.remove('hidden');
            } else {
                input.classList.add('hidden');
            }

            const btnConfirm = this.btnConfirm();
            btnConfirm.className = isDanger ? 'btn-danger' : 'btn-primary';
            this.btnCancel().style.display = showCancel ? 'inline-block' : 'none';

            // FIX v7.6: Force Flex display override
            overlay.style.display = 'flex';
            overlay.classList.remove('hidden'); // Legacy clean

            if (hasInput) {
                setTimeout(() => input.select(), 50); // Focus and select text
            } else {
                btnConfirm.focus();
            }

            // Output Handling
            const close = (result) => {
                overlay.style.display = 'none'; // FIX v7.6
                cleanup();
                resolve(result);
            };

            const onConfirm = () => {
                if (hasInput) close(input.value);
                else close(true);
            };

            const onCancel = () => close(hasInput ? null : false);

            const onKey = (e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
            };

            // Bind Listeners
            // We use onclick property to override previous listeners automatically
            btnConfirm.onclick = onConfirm;
            this.btnCancel().onclick = onCancel;
            window.addEventListener('keydown', onKey);

            const cleanup = () => {
                window.removeEventListener('keydown', onKey);
                btnConfirm.onclick = null;
                this.btnCancel().onclick = null;
            };
        });
    }
};

function renderTimelineOutline() {
    if (!projectState.isTimelineOutlineOpen) return;
    const container = document.getElementById('outline-list-container');
    if (!container) return;

    // Obtener nodos existentes para reconciliación (Zero-Flicker DOM Diffing)
    const existingNodes = Array.from(container.querySelectorAll('.outline-item'));
    const isDesynced = existingNodes.length !== projectState.scenes.length ||
        projectState.scenes.some((s, i) => !existingNodes[i] || existingNodes[i].dataset.id !== s.id);

    if (isDesynced) {
        // FALLBACK: Desincronización estructural (creación, borrado o reordenación masiva) => Reconstruir DOM
        const htmlString = projectState.scenes.map((s, i) => generateOutlineHTML(s, i)).join('');
        container.innerHTML = htmlString;
    } else {
        // RECONCILIACIÓN ZERO-FLICKER: Actualizar in-place sin destruir el DOM
        projectState.scenes.forEach((s, i) => {
            const node = existingNodes[i];

            // Reconciliación de clases (activo/inactivo)
            const isActive = s.id === projectState.selectedId;
            if (isActive && !node.classList.contains('active')) node.classList.add('active');
            else if (!isActive && node.classList.contains('active')) node.classList.remove('active');

            // Actualizar miniatura si es necesario
            const thumbHTML = generateThumbnailHTML(s);
            const thumbContainer = node.querySelector('.outline-thumb');
            if (thumbContainer && thumbContainer.innerHTML.trim() !== thumbHTML.trim()) {
                thumbContainer.innerHTML = thumbHTML;
            }

            // Actualizar barra de sección
            const secName = s.sectionName || 'SECCIÓN';
            const secColor = s.sectionColor || 'transparent';
            const secContainer = node.querySelector('.outline-sec');
            if (secContainer) {
                secContainer.style.background = secColor;
                secContainer.style.color = secName === 'SECCIÓN' ? '#666' : '#000';
                if (secContainer.innerText !== secName) secContainer.innerText = secName;
            }

            // Actualizar líneas de texto de la derecha
            const shortName = s.linkedFile ? s.linkedFile.split('/').pop() : 'Vacío';
            const colorName = (projectState.presetColors.find(c => c.code === s.color) || {}).name || 'Sin Color';
            let linkColor = '#888';
            if (s.linkedFile) {
                const _ext = s.linkedFile.split('.').pop().toLowerCase();
                if (['mp4', 'mov', 'avi', 'mkv', 'mxf', 'webm'].includes(_ext)) linkColor = '#a5d6a7';
                else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(_ext)) linkColor = '#81d4fa';
                else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(_ext)) linkColor = '#ce93d8';
            }
            const scriptText = (s.script || s.description || 'Sin guion...').replace(/(\r\n|\n|\r)/gm, " ");

            const line1 = node.querySelector('.outline-line-1');
            const newTitleLine = `<b>#${i + 1}</b> - ${s.title || 'Sin título'}`;
            if (line1 && line1.innerHTML !== newTitleLine) line1.innerHTML = newTitleLine;

            const line2 = node.querySelector('.outline-line-2');
            const newMetaLine = `<span style="color:${s.color}">⬤</span> <b>${colorName}</b> - <span style="color:${linkColor}; font-weight:600;">${shortName}</span>`;
            if (line2 && line2.innerHTML !== newMetaLine) line2.innerHTML = newMetaLine;

            const line3 = node.querySelector('.outline-line-3');
            if (line3 && line3.innerText !== scriptText) line3.innerText = scriptText;
        });
    }

    // Scroll sincronizado solo si fue necesario recrear o hacer un jump fuerte
    if (projectState.selectedId && isDesynced) {
        setTimeout(() => {
            const activeEl = container.querySelector('.outline-item.active');
            if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }
}

// === UTILS EXTRACCIÓN ZERO-FLICKER ===
function generateThumbnailHTML(s) {
    let thumb = '';
    const _mediaFolder = document.getElementById('media-path-input')?.value || '';
    if (s.linkedFile) {
        const _ext = s.linkedFile.split('.').pop().toLowerCase();
        const _audioExts = ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac'];
        if (_audioExts.includes(_ext)) {
            thumb = `<div style="width:100%; height:100%; background:#1a1a2e; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🎵</div>`;
        } else {
            const _thumbUrl = `http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(s.linkedFile)}&folder=${encodeURIComponent(_mediaFolder)}`;
            thumb = `<img src="${_thumbUrl}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">`;
        }
    } else if (s.tempThumbnail) {
        thumb = `<img src="${s.tempThumbnail}" style="width:100%; height:100%; object-fit:cover;">`;
    } else if (s.imageId && projectState.imageBank[s.imageId]) {
        if (!projectState.blobCache[s.imageId]) {
            const raw = projectState.imageBank[s.imageId];
            if (raw && raw.startsWith('data:image')) {
                try {
                    const [header, b64] = raw.split(',');
                    const mime = header.match(/:(.*?);/)[1];
                    const byteChars = atob(b64);
                    const byteArr = new Uint8Array(byteChars.length);
                    for (let _b = 0; _b < byteChars.length; _b++) byteArr[_b] = byteChars.charCodeAt(_b);
                    const blob = new Blob([byteArr], { type: mime });
                    projectState.setBlobCache(s.imageId, blob);
                } catch (_) {
                    projectState.setBlobCache(s.imageId, raw);
                }
            } else {
                projectState.setBlobCache(s.imageId, raw);
            }
        }
        thumb = `<img src="${projectState.blobCache[s.imageId]}" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
        thumb = `<div style="width:100%; height:100%; background:#111; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🎬</div>`;
    }

    let checkOverlay = s.done ? `<div class="outline-thumb-check">✓</div>` : '';
    return thumb + checkOverlay;
}

function generateOutlineHTML(s, i) {
    const shortName = s.linkedFile ? s.linkedFile.split('/').pop() : 'Vacío';
    const colorName = (projectState.presetColors.find(c => c.code === s.color) || {}).name || 'Sin Color';
    const secColor = s.sectionColor || 'transparent';
    const secName = s.sectionName || 'SECCIÓN';
    let linkColor = '#888';
    if (s.linkedFile) {
        const _ext = s.linkedFile.split('.').pop().toLowerCase();
        if (['mp4', 'mov', 'avi', 'mkv', 'mxf', 'webm'].includes(_ext)) linkColor = '#a5d6a7';
        else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(_ext)) linkColor = '#81d4fa';
        else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(_ext)) linkColor = '#ce93d8';
    }

    const thumbHTML = generateThumbnailHTML(s);
    const scriptText = (s.script || s.description || 'Sin guion...').replace(/(\r\n|\n|\r)/gm, " ");

    return `<div class="outline-item ${s.id === projectState.selectedId ? 'active' : ''}" data-id="${s.id}" onclick="timelineNavGoTo('${s.id}')">
                                    <div class="outline-left">
                                        <div class="outline-thumb">${thumbHTML}</div>
                                        <div class="outline-sec" style="background:${secColor}; color:${secName === 'SECCIÓN' ? '#666' : '#000'}">${secName}</div>
                                    </div>
                                    <div class="outline-right">
                                        <div class="outline-line-1"><b>#${i + 1}</b> - ${s.title || 'Sin título'}</div>
                                        <div class="outline-line-2"><span style="color:${s.color}">⬤</span> <b>${colorName}</b> - <span style="color:${linkColor}; font-weight:600;">${shortName}</span></div>
                                        <div class="outline-line-3">${scriptText}</div>
                                    </div>
                                </div>`;
}

// === ASYNC THUMBNAIL POLLING (FFmpeg 202 Handler) ===
window.loadThumbnail = async function (sceneId, url, retries = 5) {
    const imgEl = document.getElementById(`img-${sceneId}`);
    if (!imgEl) return;
    const container = document.getElementById(`thumb-container-${sceneId}`);

    try {
        const timestampedUrl = url + (url.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
        const response = await fetch(timestampedUrl);
        if (response.status === 202) {
            // Processing status -> Apply spinner and poll
            if (container) container.classList.add('loading-spinner');
            if (retries > 0) {
                setTimeout(() => window.loadThumbnail(sceneId, url, retries - 1), 800);
            } else {
                if (container) container.classList.remove('loading-spinner');
                imgEl.style.display = 'none';
            }
        } else if (response.ok) {
            // Ready status -> Render object URL and fade-in
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            imgEl.src = objectUrl;
            imgEl.style.display = 'block';
            if (container) container.classList.remove('loading-spinner');

            // Fade-in trigger
            requestAnimationFrame(() => {
                imgEl.style.opacity = '1';
            });
        } else {
            if (container) container.classList.remove('loading-spinner');
            imgEl.style.display = 'none';
        }
    } catch (e) {
        if (container) container.classList.remove('loading-spinner');
        imgEl.style.display = 'none';
    }
};

// EXPOSITOR GLOBAL RETROCOMPATIBILIDAD
window.render = render;
window.renderTimelineOutline = renderTimelineOutline;
window.renderChecklist = renderChecklist;
window.showToast = showToast;
window.updateZoom = updateZoom;
window.sysDialog = sysDialog;
window.Modal = Modal;

// ================================================================
// EVENT DELEGATION (LIFECYCLE & DYNAMIC BINDS)
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById("timeline-container");
    if (!container) return;

    // --- CLICK DELEGATION ---
    container.addEventListener('click', (e) => {
        const target = e.target;

        let el = target.closest('.btn-copy-linked');
        if (el) { if (typeof window.copyLinkedText === 'function') window.copyLinkedText(el.dataset.filename); return; }

        el = target.closest('.color-picker-trigger');
        if (el) { if (typeof window.openQuickColorModal === 'function') window.openQuickColorModal(el.dataset.id); return; }

        el = target.closest('.btn-delete-scene');
        if (el) { if (typeof window.deleteScene === 'function') window.deleteScene(el.dataset.id); return; }

        el = target.closest('.btn-toggle-timing');
        if (el) { if (typeof window.toggleTimingMode === 'function') window.toggleTimingMode(el.dataset.id); return; }

        el = target.closest('.btn-time-menu');
        if (el) { if (typeof window.openTimeMenu === 'function') window.openTimeMenu(e, el.dataset.id); return; }

        el = target.closest('.speaker-badge');
        if (el) { if (typeof window.openQuickSpeakerModal === 'function') window.openQuickSpeakerModal(el.dataset.id); return; }

        el = target.closest('.btn-reset-menu');
        if (el) { if (typeof window.openResetMenu === 'function') window.openResetMenu(e, el.dataset.id); return; }

        el = target.closest('.check-btn');
        if (el) { if (typeof window.toggleCheck === 'function') window.toggleCheck(el.dataset.id); return; }

        el = target.closest('.view-modal-btn');
        if (el) { if (typeof window.openModal === 'function') window.openModal(el.dataset.id); return; }

        el = target.closest('.btn-move-left');
        if (el) { if (typeof window.moveScene === 'function') window.moveScene(parseInt(el.dataset.index, 10), -1); return; }

        el = target.closest('.btn-dup-left');
        if (el) { if (typeof window.openAddSceneMenu === 'function') window.openAddSceneMenu(e, el.dataset.id, -1); return; }

        el = target.closest('.btn-move-right');
        if (el) { if (typeof window.moveScene === 'function') window.moveScene(parseInt(el.dataset.index, 10), 1); return; }

        el = target.closest('.btn-dup-right');
        if (el) { if (typeof window.openAddSceneMenu === 'function') window.openAddSceneMenu(e, el.dataset.id, 1); return; }

        el = target.closest('.btn-link-media');
        if (el) {
            projectState.selectedId = el.dataset.id;
            render();
            if (typeof window.openQuickFileModal === 'function') window.openQuickFileModal(el.dataset.id);
            return;
        }

        el = target.closest('.qt-section-btn');
        if (el) { if (typeof window.openQuickSectionModal === 'function') window.openQuickSectionModal(el.dataset.id); return; }

        el = target.closest('.scene-card');
        if (el) {
            if (typeof window.toggleSelection === 'function') window.toggleSelection(e, el.dataset.id);
        }
    });

    // --- CHANGE DELEGATION ---
    container.addEventListener('change', (e) => {
        const target = e.target;

        let el = target.closest('.hidden-file-input');
        if (el) { if (typeof window.handleImageSelect === 'function') window.handleImageSelect(el, el.dataset.id); return; }

        el = target.closest('.shot-sel');
        if (el) { if (typeof window.updateData === 'function') window.updateData(el.dataset.id, 'shot', el.value); return; }

        el = target.closest('.move-sel');
        if (el) { if (typeof window.updateData === 'function') window.updateData(el.dataset.id, 'move', el.value); return; }
    });

    // --- INPUT DELEGATION ---
    container.addEventListener('input', (e) => {
        const target = e.target;

        let el = target.closest('.scene-title-input');
        if (el) { if (typeof window.updateData === 'function') window.updateData(el.dataset.id, 'title', el.value); return; }

        el = target.closest('.time-inp');
        if (el) { if (typeof window.updateData === 'function') window.updateData(el.dataset.id, 'duration', el.value); return; }

        el = target.closest('.desc-textarea');
        if (el) { if (typeof window.updateData === 'function') window.updateData(el.dataset.id, 'description', el.value); return; }

        el = target.closest('.script-preview');
        if (el) { if (typeof window.updateData === 'function') window.updateData(el.dataset.id, 'script', el.value); return; }
    });

    // --- DRAG & DROP DELEGATION ---
    container.addEventListener('dragstart', (e) => {
        const target = e.target;
        let el = target.closest('.drag-handle');
        if (el) { if (typeof window.handleDragStart === 'function') window.handleDragStart(e, parseInt(el.dataset.index, 10)); }
    });

    container.addEventListener('dragover', (e) => {
        if (e.target.closest('.scene-card') || e.target.closest('.drop-zone')) {
            e.preventDefault();
        }
    });

    container.addEventListener('drop', (e) => {
        const target = e.target;
        let dropZone = target.closest('.drop-zone');
        if (dropZone) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.handleImageDrop === 'function') window.handleImageDrop(e, dropZone.dataset.id);
            return;
        }

        let card = target.closest('.scene-card');
        if (card) {
            e.preventDefault();
            if (typeof window.handleDrop === 'function') window.handleDrop(e, parseInt(card.dataset.index, 10));
        }
    });
});
