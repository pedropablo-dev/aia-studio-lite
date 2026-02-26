function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 1500);
}

function updateZoom(val) {
    currentZoom = val;
    document.getElementById('zoom-slider').value = currentZoom;
    document.getElementById('zoom-display').innerText = Math.round(currentZoom * 100) + "%";
    const container = document.getElementById('timeline-container');
    container.style.transform = `scale(${currentZoom})`;
    updateLayoutWidth();
}

function render() {
    const container = document.getElementById("timeline-container");
    container.innerHTML = "";

    scenes.forEach((scene, index) => {
        const card = document.createElement("div");
        const isSelected = (scene.id === selectedId);

        card.className = `scene-card ${scene.done ? 'completed' : ''} ${isSelected ? 'selected' : ''}`;
        card.dataset.id = scene.id;
        // card.draggable = true; // REMOVED: Now using handle

        card.style.borderTopColor = scene.color;
        card.style.background = `linear-gradient(180deg, ${scene.color}11 0%, #1e1e1e 20%)`;

        card.onclick = (e) => toggleSelection(e, scene.id);
        // card.ondragstart = (e) => handleDragStart(e, index); // REMOVED
        card.ondragover = (e) => e.preventDefault();
        card.ondrop = (e) => handleDrop(e, index);

        // Recuperar imagen del banco si existe
        let imgSrc = '';
        if (scene.imageId && imageBank[scene.imageId]) {
            imgSrc = imageBank[scene.imageId];
        } else if (scene.tempThumbnail) {
            // Soporte para miniaturas temporales (API/URL)
            imgSrc = scene.tempThumbnail;
        } else if (scene.imageSrc) {
            // Retrocompatibilidad temporal
            imgSrc = scene.imageSrc;
        }

        const colorName = (presetColors.find(c => c.code === scene.color) || {}).name || '';
        const spkColor = scene.speakerColor || 'transparent';
        const spkName = scene.speakerName || 'Voz';

        // --- ETIQUETA INTELIGENTE V3 (Full Width + Ellipsis Real) ---

        // 1. Detectar tipo y color
        let linkColor = '#888'; // Default
        let fileType = '';      // Para data-type en la tarjeta
        if (scene.linkedFile) {
            const _ext = scene.linkedFile.split('.').pop().toLowerCase();
            if (['mp4', 'mov', 'avi', 'mkv', 'mxf', 'webm'].includes(_ext)) { linkColor = '#a5d6a7'; fileType = 'video'; }
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(_ext)) { linkColor = '#81d4fa'; fileType = 'image'; }
            else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(_ext)) { linkColor = '#ce93d8'; fileType = 'audio'; }
        }
        // Aplicar data-type a la tarjeta para que CSS pueda colorear el nombre
        if (fileType) card.dataset.type = fileType;
        else delete card.dataset.type;
        const safeFileName = scene.linkedFile ? scene.linkedFile.replace(/'/g, "\\'") : "";
        const shortFileName = scene.linkedFile ? scene.linkedFile.split('/').pop() : "";
        const safeShortFileName = shortFileName.replace(/'/g, "\\'");

        // 2. Contenido condicional
        let labelInner = '';

        if (scene.linkedFile) {
            // MODO CON ARCHIVO: Flexbox real para que el texto ocupe todo el espacio restante

            // --- TIME BADGE LOGIC ---
            let timeBadge = '';
            if (scene.startTime && scene.startTime > 0) {
                const timeStr = new Date(scene.startTime * 1000).toISOString().substr(11, 8);
                timeBadge = `<div class="time-badge" style="color:#ffb74d; font-size:0.65rem; margin-right:6px; font-weight:bold; white-space:nowrap;">⏱ ${timeStr}</div>`;
            }

            labelInner = `
                    <div style="display:flex; align-items:center; gap:4px; width:100%; cursor:pointer;"
                         title="Clic para copiar: ${shortFileName}" 
                         onclick="copyLinkedText('${safeShortFileName}')">
                        
                        <span style="color:${linkColor}; flex-shrink:0;">🔗</span>
                        
                        <span class="linked-file-name" style="
                            color:${linkColor}; 
                            white-space:nowrap; 
                            overflow:hidden; 
                            text-overflow:ellipsis; 
                            flex:1;         
                            min-width:0;    
                        ">
                            ${scene.linkedFile}
                        </span>
                        ${timeBadge}
                    </div>
                `;
        } else {
            // MODO VACÍO: Espacio reservado invisible
            labelInner = `<span style="opacity:0; user-select:none;">&nbsp;</span>`;
        }

        // ---------------------------------------------------------
        const mode = scene.timingMode || (scene.manualTiming ? 'manual' : 'auto');
        let timeColor = '#e0e0e0';
        let timeIcon = '✨';
        let timeTitle = 'Automático (Basado en guion)';

        if (mode === 'manual') {
            timeColor = '#ff9100'; timeIcon = '🔒'; timeTitle = 'Manual (Bloqueado)';
        } else if (mode === 'video') {
            timeColor = '#00e676'; timeIcon = '📽️'; timeTitle = 'Sincronizado con Vídeo';
        }
        // ---------------------------------------------------------

        // 3. Contenedor Principal (Bloque fijo de altura)
        const linkedLabel = `
                <div style="
                    height: 16px; 
                    line-height: 16px;
                    margin-top: 2px; 
                    font-family:'Consolas', monospace; 
                    font-size:0.65rem; 
                    width: 100%; /* Asegura que llegue hasta el borde derecho (debajo de la X) */
                ">
                    ${labelInner}
                </div>
            `;

        card.innerHTML = `
                ${colorName ? `<div class="scene-type-tab" style="background-color:${scene.color}">${colorName}</div>` : ''}
                
                <div class="card-header">
                    <div class="header-left" style="flex-direction:column; align-items:flex-start; gap:0; width: 100%;">
                        <div style="display:flex; align-items:center; width:100%; justify-content: space-between;">
                             <div style="display:flex; align-items:center; gap:8px; flex:1;">
                                <span class="drag-handle" draggable="true" ondragstart="handleDragStart(event, ${index})">⋮⋮</span>
                                <span class="scene-number">#${index + 1}</span>
                                <input type="text" class="scene-title-input" 
                                       placeholder="Título..." 
                                       value="${scene.title || ''}" 
                                       oninput="updateData('${scene.id}', 'title', this.value)">
                             </div>
                             
                             <div class="card-controls">
                                <div class="color-picker-trigger" style="background-color:${scene.color}" 
                                     onclick="openQuickColorModal('${scene.id}')" title="Color"></div>
                                <button class="btn-danger" style="padding:2px 8px; border-radius:4px;" onclick="deleteScene('${scene.id}')">✕</button>
                             </div>
                        </div>
                        ${linkedLabel}
                    </div>
                </div>

                <div class="drop-zone ${scene.linkedFile && !/\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile) ? 'has-image' : (imgSrc ? 'has-image' : '')}" 
                     ondragover="event.preventDefault()" ondrop="handleImageDrop(event, '${scene.id}')">
                    ${(scene.linkedFile && /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(scene.linkedFile)) ? `
                        <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#1a1a1a;">
                             <div style="font-size:1.8rem; margin-bottom:0;">\ud83c\udfb5</div>
                        </div>
                        <img src="" id="img-${scene.id}" style="display:none">
                    ` : (scene.linkedFile && /\.(mp4|mov|mxf|avi|webm|jpg|jpeg|png|webp)$/i.test(scene.linkedFile)) ? `
                        <img src="http://127.0.0.1:9999/thumbnail?path=${encodeURIComponent(scene.linkedFile)}&folder=${encodeURIComponent(document.getElementById('media-path-input')?.value || '')}" 
                             id="img-${scene.id}" 
                             style="width:100%; height:100%; object-fit:cover;"
                             onerror="this.style.display='none'; this.previousElementSibling && (this.previousElementSibling.style.display='flex');">
                    ` : `
                        <span>Imagen</span>
                        <img src="${imgSrc}" id="img-${scene.id}">
                    `}
                    <input type="file" id="file-${scene.id}" class="hidden-file-input" accept="image/*" onchange="handleImageSelect(this, '${scene.id}')">
                </div>

                <div class="full-row" style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                    
                    <div class="time-box-wrapper" style="
                        display:flex; align-items:center; 
                        background:#222; border:1px solid #444; border-radius:4px; 
                        padding:0 8px; 
                        height: 28px; 
                        box-sizing: border-box;
                        border-color: ${timeColor === '#e0e0e0' ? '#444' : timeColor + '66'}; 
                    ">
                        <span style="font-size:0.9rem; margin-right:5px; opacity:0.7;">⏱</span>
                        
                        <input type="number" value="${scene.duration}" min="0" step="0.1" 
                               style="
                                   width:50px; 
                                   text-align:center; border:none; background:transparent; 
                                   color: ${timeColor}; 
                                   font-weight: normal; 
                                   font-size: 0.85rem; 
                                   padding:0;
                                   font-family: inherit;
                               "
                               oninput="updateData('${scene.id}', 'duration', this.value)"
                               title="${timeTitle}">
                        
                        <span style="font-size:0.75rem; color:#666; margin-left:2px;">s</span>
                        
                        <div class="time-icon-wrapper" 
                             onclick="toggleTimingMode('${scene.id}')" 
                             style="cursor:pointer; font-size:0.75rem; margin-left:6px; opacity:0.8; display:flex; align-items:center;"
                             title="${mode === 'auto' ? 'Clic para Bloquear (Manual)' : 'Clic para Desbloquear (Volver a Auto)'}">
                            ${timeIcon}
                        </div>
                    </div>

                    <button onclick="openTimeMenu(event, '${scene.id}')" title="Herramientas de Tiempo" 
                            style="height: 28px; width: 28px; padding: 0; display: flex; align-items: center; justify-content: center; background: #222; border: 1px solid #444; border-radius: 4px; font-size: 0.9rem; cursor: pointer;">
                        ⚡
                    </button>

                    <div class="speaker-badge" onclick="openQuickSpeakerModal('${scene.id}')" style="flex-grow:0; margin-left:auto; width:135px;">
                        <div class="speaker-dot" style="background-color: ${spkColor}"></div>
                        <span class="speaker-name">${spkName}</span>
                    </div>

                    <button class="check-btn" onclick="toggleCheck('${scene.id}')" title="Listo">${scene.done ? '✓' : ''}</button>
                </div>
                
                <div class="tech-row">
                    <select onchange="updateData('${scene.id}', 'shot', this.value)">${presetShots.map(t => `<option ${t === scene.shot ? 'selected' : ''}>${t}</option>`).join('')}</select>
                    <select onchange="updateData('${scene.id}', 'move', this.value)">${presetMoves.map(m => `<option ${m === scene.move ? 'selected' : ''}>${m}</option>`).join('')}</select>
                </div>

                <textarea class="desc-textarea" placeholder="Descripción breve..." 
                          oninput="updateData('${scene.id}', 'description', this.value)">${scene.description}</textarea>

                <div class="script-area-container">
                    <textarea class="script-preview" placeholder="Diálogo..." 
                              oninput="updateData('${scene.id}', 'script', this.value)">${scene.script}</textarea>
                    <button class="expand-btn" onclick="openModal('${scene.id}')">⤢</button>
                </div>

                <div class="move-controls" style="display:flex; justify-content: space-between; align-items: center; margin-top: 10px; margin-bottom: 10px;">
                    <div class="move-group">
                        <button ${index === 0 ? 'disabled' : ''} onclick="moveScene(${index}, -1)">←</button>
                        <button class="dup-btn" onclick="duplicateScene(${index}, 0)">+</button>
                    </div>

                    <div style="display:flex; gap:5px;">
                        <button onclick="selectedId='${scene.id}'; render(); openQuickFileModal('${scene.id}')" title="Vincular Archivo Local" 
                                style="background:#222; border:1px solid #444; color:#ccc; width:30px; height:28px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;">
                            🔗
                        </button>
                    </div>

                    <div class="move-group">
                        <button class="dup-btn" onclick="duplicateScene(${index}, 1)">+</button>
                        <button ${index === scenes.length - 1 ? 'disabled' : ''} onclick="moveScene(${index}, 1)">→</button>
                    </div>
                </div>

                <div class="section-bar" style="background-color: ${scene.sectionColor || 'transparent'}; border-radius: 0 0 4px 4px; margin-top:0;" onclick="openQuickSectionModal('${scene.id}')">
                    <span class="section-label" style="color: ${scene.sectionName === 'SECCIÓN' ? '#666' : '#222'}">${scene.sectionName}</span>
                </div>
            `;
        container.appendChild(card);
    });
    document.getElementById("scene-count").innerText = scenes.length;
    calculateTotalTime();
    updateLayoutWidth();
    if (isTimelineOutlineOpen) renderTimelineOutline();
}

function renderChecklist() {
    const container = document.getElementById('global-checklist-container');
    container.innerHTML = projectChecklist.map((item, index) => `
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
    if (!isTimelineOutlineOpen) return;
    const container = document.getElementById('outline-list-container');
    if (!container) return;

    const htmlString = scenes.map((s, i) => {
        const shortName = s.linkedFile ? s.linkedFile.split('/').pop() : 'Vacío';
        const colorName = (presetColors.find(c => c.code === s.color) || {}).name || 'Sin Color';
        const secColor = s.sectionColor || 'transparent';
        const secName = s.sectionName || 'SECCIÓN';
        let linkColor = '#888';
        if (s.linkedFile) {
            const _ext = s.linkedFile.split('.').pop().toLowerCase();
            if (['mp4', 'mov', 'avi', 'mkv', 'mxf', 'webm'].includes(_ext)) linkColor = '#a5d6a7';
            else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(_ext)) linkColor = '#81d4fa';
            else if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(_ext)) linkColor = '#ce93d8';
        }

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
        } else if (s.imageId && imageBank[s.imageId]) {
            // Use a cached Blob URL if available; otherwise convert Base64 → Blob URL once
            if (!blobCache[s.imageId]) {
                const raw = imageBank[s.imageId];
                if (raw && raw.startsWith('data:image')) {
                    try {
                        const [header, b64] = raw.split(',');
                        const mime = header.match(/:(.*?);/)[1];
                        const byteChars = atob(b64);
                        const byteArr = new Uint8Array(byteChars.length);
                        for (let _b = 0; _b < byteChars.length; _b++) byteArr[_b] = byteChars.charCodeAt(_b);
                        const blob = new Blob([byteArr], { type: mime });
                        blobCache[s.imageId] = URL.createObjectURL(blob);
                    } catch (_) {
                        blobCache[s.imageId] = raw;
                    }
                } else {
                    blobCache[s.imageId] = raw;
                }
            }
            thumb = `<img src="${blobCache[s.imageId]}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            thumb = `<div style="width:100%; height:100%; background:#111; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🎬</div>`;
        }

        const scriptText = (s.script || s.description || 'Sin guion...').replace(/(\r\n|\n|\r)/gm, " ");
        let checkOverlay = s.done ? `<div class="outline-thumb-check">✓</div>` : '';

        return `<div class="outline-item ${s.id === selectedId ? 'active' : ''}" data-id="${s.id}" onclick="timelineNavGoTo('${s.id}')">
                <div class="outline-left">
                    <div class="outline-thumb">
                        ${thumb}
                        ${checkOverlay}
                    </div>
                    <div class="outline-sec" style="background:${secColor}; color:${secName === 'SECCIÓN' ? '#666' : '#000'}">${secName}</div>
                </div>
                <div class="outline-right">
                    <div class="outline-line-1"><b>#${i + 1}</b> - ${s.title || 'Sin título'}</div>
                    <div class="outline-line-2"><span style="color:${s.color}">⬤</span> <b>${colorName}</b> - <span style="color:${linkColor}; font-weight:600;">${shortName}</span></div>
                    <div class="outline-line-3">${scriptText}</div>
                </div>
            </div>`;
    }).join('');

    console.log("[DEBUG OUTLINE] HTML Generado: ", htmlString);
    container.innerHTML = htmlString;

    if (selectedId) {
        setTimeout(() => {
            const activeEl = container.querySelector('.outline-item.active');
            if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }
}

