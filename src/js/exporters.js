// =============================================================
// EXPORT SYSTEM V3 — Unified multi-speaker modal
// =============================================================

// -- Pure content generators (no side-effects) ----------------

function generateTXTContent(filteredScenes) {
    let t = '';
    filteredScenes.forEach(s => {
        const speaker = (s.speakerName && s.speakerName !== 'Voz')
            ? s.speakerName.toUpperCase() : 'HABLANTES';
        t += `${speaker}:\n${s.script || ''}\n\n`;
    });
    return t;
}

function generateMDContent(filteredScenes, speakerLabel) {
    let md = `# GUION DE VIDEO\nGenerado con AIA Studio\n`;
    if (speakerLabel) md += `*Filtrado por: **${speakerLabel}***\n`;
    md += '\n';
    filteredScenes.forEach((s, i) => {
        const sectionHeader = s.sectionName !== 'SECCI\u00d3N' ? ` [${s.sectionName}]` : '';
        const speakerHeader = s.speakerName && s.speakerName !== 'Voz'
            ? `**\ud83d\udde3\ufe0f ${s.speakerName}**\n` : '';
        md += `### Escena ${i + 1}${sectionHeader} (${s.duration}s) ${s.done ? '\u2705' : ''}\n`;
        md += `**Visual:** ${s.shot} | ${s.move}\n**Descripci\u00f3n:** ${s.description}\n\n`;
        md += `**Di\u00e1logo:**\n${speakerHeader}${s.script || ''}\n\n---\n\n`;
    });
    return md;
}

// -- Blob download helper -------------------------------------
function _downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
}

// -- Checkbox row builder -------------------------------------
function _makeCheckRow(label, id, checked) {
    const row = document.createElement('label');
    row.htmlFor = id;
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid transparent;transition:background 0.12s,border-color 0.12s;color:#d0d0d0;font-size:0.875rem;';
    row.onmouseenter = () => { row.style.background = '#252525'; row.style.borderColor = '#3a3a3a'; };
    row.onmouseleave = () => { row.style.background = ''; row.style.borderColor = 'transparent'; };
    const ckb = document.createElement('input');
    ckb.type = 'checkbox'; ckb.id = id; ckb.checked = checked;
    ckb.style.cssText = 'width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;';
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(ckb); row.appendChild(span);
    return row;
}

// -- Unified modal entry-point ---------------------------------
function openExportModal(format) {
    const activeSpeakers = [...new Set(scenes.map(s => s.speakerName).filter(Boolean))];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(5px);';

    const box = document.createElement('div');
    box.style.cssText = 'position:relative;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:12px;padding:26px 30px;min-width:300px;max-width:400px;width:92%;min-height:480px;max-height:85vh;box-shadow:0 0 50px rgba(0,0,0,0.9);display:flex;flex-direction:column;gap:0;';

    const destroy = () => document.body.removeChild(overlay);

    const closeX = document.createElement('div');
    closeX.className = 'close-modal-x';
    closeX.innerHTML = '×';
    closeX.onclick = destroy;
    box.appendChild(closeX);

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:18px;';
    const iconEl = document.createElement('span');
    iconEl.textContent = format === 'txt' ? '\ud83d\udcc4' : '\u2b07\ufe0f';
    iconEl.style.fontSize = '1.3rem';
    const hTitle = document.createElement('div');
    const displayFormat = format === 'txt' ? 'Dialogo (TXT)' : 'Guion Técnico (MD)';
    hTitle.innerHTML = `<span style="font-size:1rem;font-weight:700;color:#fff;">Exportar ${displayFormat}</span><br><span style="font-size:0.75rem;color:#666;">Selecciona los hablantes a incluir</span>`;
    header.appendChild(iconEl); header.appendChild(hTitle);
    box.appendChild(header);

    // Checkbox list
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;margin-bottom:20px;padding-right:4px;';

    const allRow = _makeCheckRow('\ud83d\udccb Todos los hablantes', 'ckb-todos', true);
    const allCkb = allRow.querySelector('input');
    listWrap.appendChild(allRow);

    const speakerCkbs = activeSpeakers.map(spk => {
        const row = _makeCheckRow('\ud83c\udf99\ufe0f ' + spk, 'ckb-' + spk, true);
        const ckb = row.querySelector('input');
        ckb.dataset.speaker = spk;
        ckb.addEventListener('change', () => {
            if (!ckb.checked) allCkb.checked = false;
            else if (speakerCkbs.every(c => c.checked)) allCkb.checked = true;
        });
        listWrap.appendChild(row);
        return ckb;
    });

    allCkb.addEventListener('change', () => {
        speakerCkbs.forEach(c => c.checked = allCkb.checked);
    });

    box.appendChild(listWrap);

    // Button row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';

    const getFiltered = () => {
        if (allCkb.checked) return { scenes, label: null, suffix: '' };
        const selected = speakerCkbs.filter(c => c.checked).map(c => c.dataset.speaker);
        if (!selected.length) { showToast('\u26a0\ufe0f Selecciona al menos un hablante'); return null; }
        return {
            scenes: scenes.filter(s => selected.includes(s.speakerName)),
            label: selected.join(', '),
            suffix: '_' + selected.map(s => s.replace(/\s+/g, '_')).join('-')
        };
    };

    const mkBtn = (html, css, handler) => {
        const b = document.createElement('button');
        b.innerHTML = html;
        b.style.cssText = 'padding:8px 18px;border-radius:6px;font-weight:600;cursor:pointer;font-size:0.875rem;' + css;
        b.onclick = handler;
        return b;
    };

    // Cancelar
    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = 'Cancelar';
    cancelBtn.className = 'btn-danger';
    cancelBtn.onclick = destroy;
    btnRow.appendChild(cancelBtn);

    // Copiar
    btnRow.appendChild(mkBtn('\ud83d\udccb\u00a0Copiar', 'background:#2a2a2a;border:1px solid #555;color:#e0e0e0;', () => {
        const r = getFiltered(); if (!r) return;
        const content = format === 'txt' ? generateTXTContent(r.scenes) : generateMDContent(r.scenes, r.label);
        navigator.clipboard.writeText(content).then(() => { showToast('\u2705 Copiado al portapapeles'); destroy(); });
    }));

    // Exportar
    const expBtn = mkBtn('\u2b07\ufe0f\u00a0Exportar', 'background:var(--accent);border:none;color:#fff;', () => {
        const r = getFiltered(); if (!r) return;
        const ext = format === 'txt' ? 'txt' : 'md';
        const mime = format === 'txt' ? 'text/plain' : 'text/markdown';
        const content = format === 'txt' ? generateTXTContent(r.scenes) : generateMDContent(r.scenes, r.label);
        _downloadBlob(content, `guion${r.suffix}.${ext}`, mime);
        showToast('\u2705 Archivo descargado');
        destroy();
    });
    btnRow.appendChild(expBtn);

    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.onclick = e => { if (e.target === overlay) destroy(); };
    document.body.appendChild(overlay);
}



// --- DAVINCI RESOLVE AUTO-CONFORM V7.0 (FINAL PRO) ---
// Soporta: Rutas Relativas, In-Points precisos (24fps) y Nombre de Proyecto dinámico.
function exportDaVinci() {
    const width = 3840; const height = 2160;
    const fps = 24;
    const frameBase = 24; // Base pura para cálculos de frame exactos

    // Helpers matemáticos locales
    const toFrames = (seconds) => Math.round((seconds || 0) * fps);
    const fmt = (frames) => `${frames}/${frameBase}s`;

    // 1. CAPTURAR NOMBRE DEL PROYECTO
    // Intenta buscar el input del título. Si no existe, usa un genérico.
    // ASEGÚRATE de que tu input en el HTML tenga id="project-title-input" o cambia esta línea:
    let projectNameElement = document.getElementById('project-title-input') || document.getElementById('project-title');
    let projectName = projectNameElement ? projectNameElement.value.trim() : "";
    if (!projectName) projectName = `AIA_Sequence_${Date.now()}`;

    // 2. OBTENER RUTA BASE (MEDIA ROOT)
    let mediaPath = document.getElementById('media-path-input').value.trim();
    const mediaExt = document.getElementById('media-ext-input').value.trim();

    let useRealMedia = false;
    if (mediaPath.length > 0) {
        useRealMedia = true;
        mediaPath = mediaPath.replace(/\\/g, '/');
        if (!mediaPath.endsWith('/')) mediaPath += '/';
        if (!mediaPath.startsWith('file:///')) {
            if (mediaPath.startsWith('/')) mediaPath = 'file://' + mediaPath;
            else mediaPath = 'file:///' + mediaPath;
        }
    }

    // CABECERA XML (FCPXML 1.9)
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
    <resources>
        <format id="r1" name="FFVideoFormat${height}p${fps}" frameDuration="1/${frameBase}s" width="${width}" height="${height}" colorSpace="1-1-1 (Rec. 709)"/>
`;

    // 3. GENERACIÓN DE RECURSOS (ASSETS)
    if (!useRealMedia) {
        xml += `        <asset id="r2" name="AIA_Placeholder" src="file:///dummy/path/placeholder.mov" start="0s" duration="0s" hasVideo="1" format="r1" />\n`;
    } else {
        scenes.forEach((s, i) => {
            // Lógica v7.0: Si hay ruta relativa (linkedFile), úsala. Si no, fallback al sistema antiguo.
            let filename = (s.linkedFile && s.linkedFile.length > 0) ? s.linkedFile : `${i + 1}${mediaExt}`;

            filename = filename.replace(/\\/g, '/');
            if (filename.startsWith('/')) {
                filename = filename.substring(1);
            }

            // Construir ruta absoluta para DaVinci
            let fullPath = `${mediaPath}${filename}`;
            fullPath = encodeURI(fullPath);

            const safeName = filename.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safePath = fullPath.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename);
            const hasAudioVal = isImage ? "0" : "1";

            // Duración "infinita" en el asset para evitar problemas de lectura
            xml += `        <asset id="asset_${i}" name="${safeName}" src="${safePath}" start="0s" duration="3600s" hasVideo="1" hasAudio="${hasAudioVal}" />\n`;
        });
    }

    xml += `    </resources>
    <library>
        <event name="AIA Import">
            <project name="${projectName}">
                <sequence format="r1">
                    <spine>
`;

    // 4. LÍNEA DE TIEMPO (PRECISIÓN DE FRAMES)
    let currentOffsetFrames = 0; // Cursor del timeline global

    scenes.forEach((s, i) => {
        // DATOS DEL CLIP
        const durationSec = Math.max(1, s.duration || 2);
        const inPointSec = s.startTime || 0; // Punto de entrada (Trim)

        // CÁLCULOS
        const clipDurationFrames = toFrames(durationSec);
        const clipStartFrames = toFrames(inPointSec); // Frame exacto de inicio en el bruto

        // FORMATOS STRING
        const durationString = fmt(clipDurationFrames);
        const offsetString = fmt(currentOffsetFrames);
        const startString = fmt(clipStartFrames); // EL DATO CLAVE

        // LIMPIEZA DE TEXTOS
        const cleanScript = (s.script || "").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const cleanTitle = (s.title || `Escena ${i + 1}`).replace(/&/g, '&amp;').replace(/</g, '&lt;');

        let refId = useRealMedia ? `asset_${i}` : "r2";
        let rawFilename = useRealMedia ? ((s.linkedFile && s.linkedFile.length > 0) ? s.linkedFile : `${i + 1}${mediaExt}`) : cleanTitle;
        let clipName = rawFilename.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(rawFilename);

        // --- ESTRUCTURA DE ANIDAMIENTO (WRAPPED NESTING) ---
        // Vital para mantener el sync Audio/Video en DaVinci Resolve

        // 1. CLIP (CONTENEDOR)
        xml += `                        <clip name="${clipName}" offset="${offsetString}" duration="${durationString}" start="0s">
            `;

        // 2. VIDEO (CONTENIDO) - Aquí aplicamos el In-Point (startString)
        xml += `                <video name="${clipName}" offset="0s" duration="${durationString}" start="${startString}" ref="${refId}">`;

        // 3. AUDIO (SOMBRA) - Debe coincidir exactamente con el video
        if (useRealMedia && !isImage) {
            xml += `
                                    <audio ref="${refId}" lane="-1" offset="0s" duration="${durationString}" start="${startString}" role="dialogue" />`;
        }

        xml += `
                                    <note>${cleanScript}</note>
                                </video>
            `;

        // MARCADOR (Para ver el guion en el timeline)
        xml += `                <marker start="0s" duration="1/24s" value="${cleanTitle}" note="${cleanScript}"/>
                        </clip>
`;
        // Avanzar cursor
        currentOffsetFrames += clipDurationFrames;
    });

    xml += `                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;

    // 5. DESCARGAR ARCHIVO
    const blob = new Blob([xml], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Nombre de archivo seguro
    const safeFilename = projectName.replace(/[^a-z0-9_\-]/gi, '_') || "AIA_Sequence";
    a.download = `${safeFilename}.fcpxml`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// --- NUEVO: EXPORTADOR DE SUBTÍTULOS (.SRT) ---
function formatTimeSRT(seconds) {
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss},${ms}`;
}

function exportSRT() {
    let srtContent = "";
    let currentTime = 0;

    scenes.forEach((scene, index) => {
        const duration = Math.max(1, scene.duration || 2);
        const startTime = formatTimeSRT(currentTime);
        const endTime = formatTimeSRT(currentTime + duration);

        // Limpieza de saltos de línea para que no rompan el SRT
        const cleanScript = (scene.script || "Sin guion").replace(/\n/g, ' ');

        // Formato SRT: Número \n Tiempo \n Texto \n\n
        srtContent += `${index + 1}\n`;
        srtContent += `${startTime} --> ${endTime}\n`;
        srtContent += `${cleanScript}\n\n`;

        currentTime += duration;
    });

    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "guion_subtitulos.srt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// --- EXPORTADOR DE MARCADORES DE LÍNEA DE TIEMPO (.EDL) ---
function secondsToTimecode(seconds, fps = 24) {
    // Convertimos segundos a Frames totales
    const totalFrames = Math.round(seconds * fps);

    const h = Math.floor(totalFrames / (3600 * fps));
    const m = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
    const s = Math.floor((totalFrames % (60 * fps)) / fps);
    const f = totalFrames % fps;

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

// --- HELPER: PALETA OFICIAL DAVINCI RESOLVE (16 COLORES) ---
function getMarkerColor(hex) {
    if (!hex || hex === 'transparent') return "Blue";

    // Nombres exactos que usa DaVinci internamente (Case Sensitive)
    const davinciColors = {
        "Red": [255, 0, 0],
        "Green": [0, 255, 0],
        "Blue": [0, 0, 255],
        "Cyan": [0, 255, 255],
        "Fuchsia": [255, 0, 128], // DaVinci llama 'Fuchsia' al Magenta
        "Yellow": [255, 255, 0],
        "Pink": [255, 192, 203],
        "Purple": [128, 0, 128],
        "Rose": [255, 0, 127],
        "Lavender": [230, 230, 250],
        "Sky": [135, 206, 235],
        "Mint": [189, 252, 201],
        "Lemon": [255, 250, 205],
        "Sand": [244, 164, 96], // El "Naranja" de DaVinci
        "Cocoa": [210, 105, 30], // El "Marrón"
        "Cream": [255, 253, 208]  // El "Blanco"
    };

    // Convertir Hex a RGB
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = "0x" + hex[1] + hex[1]; g = "0x" + hex[2] + hex[2]; b = "0x" + hex[3] + hex[3];
    } else if (hex.length === 7) {
        r = "0x" + hex[1] + hex[2]; g = "0x" + hex[3] + hex[4]; b = "0x" + hex[5] + hex[6];
    }
    r = +r; g = +g; b = +b;

    // Buscar el color más cercano
    let minDistance = Infinity;
    let closestColor = "Blue";

    for (const [name, rgb] of Object.entries(davinciColors)) {
        const distance = Math.sqrt(
            Math.pow(r - rgb[0], 2) +
            Math.pow(g - rgb[1], 2) +
            Math.pow(b - rgb[2], 2)
        );
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = name;
        }
    }
    return closestColor;
}

// --- EXPORTADOR DE MARCADORES (.EDL) - V5.0 (CON DESCRIPCIÓN Y SECCIÓN) ---
function exportMarkersEDL() {
    const fps = 24; // Asegúrate que coincida con tu proyecto (24, 25, 30...)
    let edl = `TITLE: AIA_MARKERS\nFCM: NON-DROP FRAME\n\n`;
    let currentTime = 0;

    scenes.forEach((scene, i) => {
        const duration = Math.max(1, scene.duration || 2);

        const startTimecode = secondsToTimecode(currentTime, fps);
        // EDL Evento de 1 frame de duración
        const oneFrameLater = secondsToTimecode(currentTime + (1 / fps), fps);

        // 1. COLOR: Basado en la Sección
        const colorName = getMarkerColor(scene.sectionColor);

        // 2. NOMBRE (Name): El Título de la tarjeta (Limpiamos saltos de línea)
        let cleanTitle = (scene.title || `Escena ${i + 1}`).replace(/(\r\n|\n|\r)/gm, " ").trim();

        // 3. KEYWORD/NOTAS: 
        // Como EDL no tiene campo 'Keyword', ponemos la SECCIÓN al principio de la nota en mayúsculas.
        // Formato: [SECCIÓN] Descripción...
        const cleanSection = (scene.sectionName || "GENÉRICO").toUpperCase().replace(/(\r\n|\n|\r)/gm, " ").trim();
        const cleanDesc = (scene.description || "").replace(/(\r\n|\n|\r)/gm, " ").trim();

        // Construimos el contenido visible de la nota
        const noteContent = `[${cleanSection}] ${cleanDesc}`;

        const index = String(i + 1).padStart(3, '0');

        // --- GENERACIÓN EDL ---
        // Línea de evento
        edl += `${index}  001      V     C        ${startTimecode} ${oneFrameLater} ${startTimecode} ${oneFrameLater}\n`;

        // Línea Locator estándar
        edl += `* LOC: ${startTimecode} ${colorName} ${cleanTitle}\n`;

        // Línea Mágica de DaVinci:
        // Ponemos el contenido de la nota primero.
        // Al final añadimos las etiquetas de sistema (|C:Color, |M:Nombre, |D:Duración)
        edl += `* NOTE: ${noteContent} |C:ResolveColor${colorName} |M:${cleanTitle} |D:1\n\n`;

        currentTime += duration;
    });

    const blob = new Blob([edl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "timeline_markers_v5.edl";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
