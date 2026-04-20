// ==UserScript==
// @name         BAND-MAID FanClub Video Describer (with Timestamps & Navigation)
// @namespace    https://bandmaid.tokyo/
// @version      2.6
// @description  Show video info with timestamps, next/previous part links, and a draggable floating translation panel
// @author       DriveTimeBM
// @match        https://bandmaid.tokyo/movies/*
// @connect      raw.githubusercontent.com
// @connect      drivetimebm.github.io
// ==/UserScript==

(function() {
  'use strict';

  const GITHUB_JSON_URL =
    'https://raw.githubusercontent.com/DriveTimeBM/BAND-MAID_prime/main/data/fanclub.json';

  const FANCLUB_JSON_URL = 'https://drivetimebm.github.io/BAND-MAID_gpt/fanclub/fanclub.json';

  const LS_TRANS_LAYOUT = 'bmfc_describer_translation_layout';

  // Extract numeric video ID from URL
  const getVideoId = () => {
    const match = window.location.pathname.match(/movies\/(\d+)/);
    return match ? match[1] : null;
  };

  // Fetch JSON from GitHub (MV3-compatible)
  const loadSetlists = async () => {
    try {
      const res = await fetch(GITHUB_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to load setlists:', err);
      return {};
    }
  };

  // =====================
  // 🎬 VIMEO PLAYER BRIDGE
  // =====================
  // Communicates with the Vimeo iframe via postMessage so we can seek the video
  // on timestamp clicks and receive playProgress events for translation sync.

  const VIMEO_PLAYER_ID = 'bmfc-describer-vimeo';

  const findVimeoIframe = () => {
    const iframes = document.querySelectorAll('iframe');
    for (const f of iframes) {
      if (f.src && /player\.vimeo\.com\/video\//.test(f.src)) return f;
    }
    return null;
  };

  const enableVimeoApi = (iframe) => {
    if (!iframe || !iframe.src) return false;
    if (iframe.dataset.bmfcDescEnhanced === '1') return true;
    try {
      const url = new URL(iframe.src);
      let changed = false;
      if (url.searchParams.get('api') !== '1') { url.searchParams.set('api', '1'); changed = true; }
      if (!url.searchParams.get('player_id')) { url.searchParams.set('player_id', VIMEO_PLAYER_ID); changed = true; }
      if (changed) iframe.src = url.toString();
      iframe.dataset.bmfcDescEnhanced = '1';
      return true;
    } catch (err) {
      console.warn('[BM Describer] Could not rewrite Vimeo iframe src:', err);
      return false;
    }
  };

  const postToVimeo = (iframe, method, value) => {
    if (!iframe || !iframe.contentWindow) return;
    const msg = value !== undefined ? { method, value } : { method };
    try { iframe.contentWindow.postMessage(JSON.stringify(msg), '*'); } catch {}
  };

  const createVimeoController = () => {
    const listeners = {};
    let iframe = null;
    let ready = false;

    const emit = (name, data) => {
      (listeners[name] || []).forEach(cb => { try { cb(data); } catch {} });
    };

    window.addEventListener('message', (e) => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      let data = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== 'object') return;

      if (data.event === 'ready') {
        ready = true;
        postToVimeo(iframe, 'addEventListener', 'timeupdate');
        postToVimeo(iframe, 'addEventListener', 'playProgress');
        emit('ready');
      } else if (data.event === 'timeupdate' || data.event === 'playProgress') {
        emit('timeupdate', data.data || {});
      }
    });

    return {
      attach(iframeEl) {
        iframe = iframeEl;
        ready = false;
        enableVimeoApi(iframe);
      },
      on(name, cb) { (listeners[name] = listeners[name] || []).push(cb); },
      seekTo(seconds) {
        if (!iframe) return;
        postToVimeo(iframe, 'setCurrentTime', seconds);
        postToVimeo(iframe, 'play');
      },
      isReady: () => ready,
      getIframe: () => iframe,
    };
  };

  const waitForVimeoIframe = async (timeoutMs = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const f = findVimeoIframe();
      if (f) return f;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  };

  // =====================
  // 🔍 SEARCH FUNCTIONS
  // =====================

  let fanclubDataCache = null;

  async function loadFanClubData() {
    if (fanclubDataCache) return fanclubDataCache;
    try {
      const res = await fetch(FANCLUB_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fanclubDataCache = await res.json();
      console.info('Loaded FanClub JSON:', fanclubDataCache.length, 'entries');
      return fanclubDataCache;
    } catch (err) {
      console.error('Failed to load fanclub.json:', err);
      return [];
    }
  }

  async function createSearchBox(container) {
    if (document.querySelector('#fanclub-search-box')) return;

    await new Promise(resolve => setTimeout(resolve, 300));

    const wrapper = document.createElement('div');
    wrapper.id = 'fanclub-search-box';
    wrapper.style.margin = '15px 0 25px 0';
    wrapper.style.textAlign = 'left';
    wrapper.style.fontFamily = 'monospace';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '🔍 Search BAND-MAID Fan Club (e.g., BTS, DAY OF MAID)...';
    input.style.width = '100%';
    input.style.padding = '8px 10px';
    input.style.border = '1px solid #ccc';
    input.style.borderRadius = '8px';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    input.style.background = '#fffafc';
    input.style.color = '#333';
    input.style.backgroundColor = '#fff';

    input.addEventListener('focus', () => {
      input.style.outline = 'none';
      input.style.boxShadow = '0 0 4px #f2a2c0';
    });
    input.addEventListener('blur', () => {
      input.style.boxShadow = 'none';
    });

    const resultsBox = document.createElement('div');
    resultsBox.style.marginTop = '10px';
    resultsBox.style.fontSize = '14px';
    resultsBox.style.lineHeight = '1.5';
    resultsBox.style.maxHeight = '200px';
    resultsBox.style.overflowY = 'auto';
    resultsBox.style.borderTop = '1px solid #eee';
    resultsBox.style.paddingTop = '10px';

    wrapper.appendChild(input);
    wrapper.appendChild(resultsBox);

    // Style as an inline block in the normal document flow, positioned after
    // the summary box. It scrolls with the page like any other element —
    // typically ends up below the video area, requiring a scroll to reach.
    Object.assign(wrapper.style, {
      width: '300px',
      maxWidth: '90%',
      border: '2px solid #f2a2c0',
      borderRadius: '12px',
      padding: '12px 16px',
      boxSizing: 'border-box',
    });

    // Insert right after the summary box, or fall back to body append.
    if (container && container.insertAdjacentElement) {
      container.insertAdjacentElement('afterend', wrapper);
    } else {
      document.body.appendChild(wrapper);
    }

    input.addEventListener('input', async e => {
      const query = e.target.value.trim().toLowerCase();
      resultsBox.innerHTML = '';
      if (!query) return;

      const data = await loadFanClubData();
      const matches = data.filter(entry =>
        (entry.Title && entry.Title.toLowerCase().includes(query)) ||
        (entry.Category && entry.Category.toLowerCase().includes(query))
      );

      if (!matches.length) {
        resultsBox.innerHTML = `<div style="color:#888;">No matches found.</div>`;
        return;
      }

      resultsBox.innerHTML = matches
        .map(entry => {
          const title = entry.Title || '(No Title)';
          const cat = entry.Category ? `<span style="color:#999;">[${entry.Category}]</span> ` : '';
          const url = entry.URL || entry.Link || '#';
          return `<div style="margin-bottom:6px;"><a href="${url}" target="_blank" style="text-decoration:none; color:#d12d6d;">${cat}${title}</a></div>`;
        })
        .join('');
    });
  }

  function isFanClubMember() {
    const title = document.title.trim().toUpperCase();
    if (title.startsWith("MEMBER'S ONLY")) return false;

    const restricted = Array.from(document.querySelectorAll("h1, h2, .page-title"))
      .some(el => el.textContent.trim().toUpperCase().includes("MEMBER'S ONLY"));
    if (restricted) return false;

    if (!document.querySelector("iframe, video")) return false;

    return true;
  }

  // =====================
  // 📝 TRANSLATION PARSING
  // =====================

  const parseTranslation = (raw) => {
    if (!raw) return [];
    let text = String(raw)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const rawLines = text.split(/\r?\n/).map(l => l.trim());
    const lines = [];
    const tsRe = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.*)$/;

    for (const line of rawLines) {
      if (!line) continue;
      const m = line.match(tsRe);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const c = m[3] !== undefined ? Number(m[3]) : null;
        let seconds;
        if (c !== null) {
          seconds = a * 3600 + b * 60 + c;
        } else {
          seconds = a * 60 + b;
        }
        lines.push({ time: seconds, text: m[4] });
      } else {
        lines.push({ time: null, text: line });
      }
    }
    return lines;
  };

  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // =====================
  // 📄 FLOATING TRANSLATION PANEL
  // =====================

  // Opens a draggable, resizable floating panel with translation text.
  // Position/size/hidden state persisted to localStorage.
  // Returns { close } or null if fetching failed.
  async function openTranslationPanel(translationUrl, controller, summaryBoxAnchor) {
    // Remove any existing panel first
    const existing = document.querySelector('#bmfc-translation-panel');
    if (existing) existing.remove();

    // Fetch translation text
    let rawText = '';
    try {
      const res = await fetch(translationUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawText = await res.text();
    } catch (err) {
      console.error('[BM Describer] Failed to fetch translation:', err);
      alert('Failed to load translation. See console for details.');
      return null;
    }

    const lines = parseTranslation(rawText);
    if (!lines.length) {
      alert('Translation file is empty.');
      return null;
    }

    // Layout persistence
    const loadLayout = () => {
      try { return JSON.parse(localStorage.getItem(LS_TRANS_LAYOUT)) || null; }
      catch { return null; }
    };
    const saveLayout = (patch) => {
      const current = loadLayout() || {};
      try { localStorage.setItem(LS_TRANS_LAYOUT, JSON.stringify({ ...current, ...patch })); } catch {}
    };

    // Default position: below the summary box area on the left side of the page.
    let defaultLeft = 24;
    let defaultTop = 200;
    if (summaryBoxAnchor) {
      const r = summaryBoxAnchor.getBoundingClientRect();
      defaultLeft = Math.max(16, r.left);
      defaultTop = Math.max(16, window.scrollY + r.bottom + 12);
    }
    const defaults = {
      left: defaultLeft,
      top: defaultTop,
      width: 400,
      height: 500,
      hidden: false,
    };
    const layout = { ...defaults, ...(loadLayout() || {}) };
    layout.left = Math.min(Math.max(0, layout.left), Math.max(0, window.innerWidth - 80));
    layout.top  = Math.min(Math.max(0, layout.top),  Math.max(0, window.innerHeight + window.scrollY - 60));

    const C_BORDER = '#f2a2c0';
    const C_BG     = '#fffafc';
    const C_ACCENT = '#d12d6d';
    const C_TEXT   = '#333';

    const panel = document.createElement('div');
    panel.id = 'bmfc-translation-panel';
    panel.style.cssText = `
      position: fixed;
      left: ${layout.left}px;
      top: ${Math.max(16, layout.top - window.scrollY)}px;
      width: ${layout.width}px;
      height: ${layout.height}px;
      min-width: 240px;
      min-height: 120px;
      z-index: 9998;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      background: ${C_BG};
      border: 2px solid ${C_BORDER};
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      color: ${C_TEXT};
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: ${C_BORDER};
      color: #fff;
      border-radius: 10px 10px 0 0;
      cursor: move;
      user-select: none;
      flex-shrink: 0;
    `;
    const hasTimestamps = lines.some(l => l.time !== null);
    header.innerHTML = `
      <strong style="font-size:13px;">📄 English Translation${hasTimestamps ? ' (auto-scrolls)' : ''}</strong>
      <div style="display:flex; gap:4px;">
        <button id="bmfc-trans-minimize" title="Minimize" style="background:transparent;border:none;color:#fff;font-size:16px;line-height:1;cursor:pointer;padding:2px 6px;">—</button>
        <button id="bmfc-trans-reset" title="Reset position" style="background:transparent;border:none;color:#fff;font-size:14px;line-height:1;cursor:pointer;padding:2px 6px;">⟲</button>
        <button id="bmfc-trans-close" title="Close" style="background:transparent;border:none;color:#fff;font-size:16px;line-height:1;cursor:pointer;padding:2px 6px;">✕</button>
      </div>
    `;
    panel.appendChild(header);

    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 10px 14px;
      background: ${C_BG};
      border-radius: 0 0 10px 10px;
      position: relative;
    `;
    panel.appendChild(content);

    // Build line nodes
    const lineNodes = [];
    lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.style.cssText = `
        padding: 4px 8px;
        margin: 2px 0;
        border-left: 3px solid transparent;
        border-radius: 4px;
        transition: background 0.15s, border-color 0.15s;
        ${line.time !== null ? 'cursor: pointer;' : ''}
      `;
      if (line.time !== null) {
        div.dataset.time = String(line.time);
        const mins = Math.floor(line.time / 60);
        const secs = line.time % 60;
        const stamp = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
        div.innerHTML = `<span style="color:${C_ACCENT};font-weight:bold;margin-right:8px;user-select:none;">[${stamp}]</span>${escapeHtml(line.text)}`;
        div.addEventListener('click', () => {
          if (controller) controller.seekTo(line.time);
        });
      } else {
        div.textContent = line.text;
      }
      content.appendChild(div);
      lineNodes.push(div);
    });

    // Resize grip
    const grip = document.createElement('div');
    grip.style.cssText = `
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, ${C_BORDER} 50%);
      border-radius: 0 0 8px 0;
      z-index: 2;
    `;
    panel.appendChild(grip);

    document.body.appendChild(panel);

    // Minimized state
    let minimized = !!layout.hidden;
    const applyMinimized = () => {
      const minBtn = header.querySelector('#bmfc-trans-minimize');
      if (minimized) {
        content.style.display = 'none';
        grip.style.display = 'none';
        panel.style.height = 'auto';
        panel.style.minHeight = '0';
        minBtn.textContent = '+';
      } else {
        content.style.display = '';
        grip.style.display = '';
        panel.style.minHeight = '120px';
        panel.style.height = `${layout.height}px`;
        minBtn.textContent = '—';
      }
    };
    applyMinimized();

    header.querySelector('#bmfc-trans-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      minimized = !minimized;
      layout.hidden = minimized;
      saveLayout({ hidden: minimized });
      applyMinimized();
    });

    header.querySelector('#bmfc-trans-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      const fresh = { left: 24, top: 200, width: 400, height: 500, hidden: false };
      Object.assign(layout, fresh);
      panel.style.left  = `${fresh.left}px`;
      panel.style.top   = `${fresh.top}px`;
      panel.style.width = `${fresh.width}px`;
      panel.style.height = `${fresh.height}px`;
      minimized = false;
      applyMinimized();
      saveLayout(fresh);
    });

    // Wrapper object that the caller can attach an onClose callback to.
    const handle = {
      close: () => {
        panel.remove();
        if (typeof handle.onClose === 'function') handle.onClose();
      },
      onClose: null,
    };

    header.querySelector('#bmfc-trans-close').addEventListener('click', (e) => {
      e.stopPropagation();
      handle.close();
    });

    // Drag
    let dragStart = null;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragStart = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panelX: panel.offsetLeft,
        panelY: panel.offsetTop,
      };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.mouseX;
      const dy = e.clientY - dragStart.mouseY;
      let nx = dragStart.panelX + dx;
      let ny = dragStart.panelY + dy;
      nx = Math.min(Math.max(-panel.offsetWidth + 40, nx), window.innerWidth - 40);
      ny = Math.min(Math.max(0, ny), window.innerHeight - 40);
      panel.style.left = `${nx}px`;
      panel.style.top  = `${ny}px`;
    });
    window.addEventListener('mouseup', () => {
      if (!dragStart) return;
      dragStart = null;
      layout.left = panel.offsetLeft;
      layout.top  = panel.offsetTop;
      saveLayout({ left: layout.left, top: layout.top });
    });

    // Resize
    let resizeStart = null;
    grip.addEventListener('mousedown', (e) => {
      resizeStart = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panelW: panel.offsetWidth,
        panelH: panel.offsetHeight,
      };
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener('mousemove', (e) => {
      if (!resizeStart) return;
      const dw = e.clientX - resizeStart.mouseX;
      const dh = e.clientY - resizeStart.mouseY;
      const nw = Math.max(240, resizeStart.panelW + dw);
      const nh = Math.max(120, resizeStart.panelH + dh);
      panel.style.width  = `${nw}px`;
      panel.style.height = `${nh}px`;
    });
    window.addEventListener('mouseup', () => {
      if (!resizeStart) return;
      resizeStart = null;
      layout.width  = panel.offsetWidth;
      layout.height = panel.offsetHeight;
      saveLayout({ width: layout.width, height: layout.height });
    });

    // Auto-scroll / highlight
    if (hasTimestamps && controller) {
      let activeIdx = -1;
      const timedLines = lines
        .map((l, i) => ({ time: l.time, i }))
        .filter(x => x.time !== null);

      const findActive = (t) => {
        let found = -1;
        for (let k = 0; k < timedLines.length; k++) {
          if (timedLines[k].time <= t) found = timedLines[k].i;
          else break;
        }
        return found;
      };

      const setActive = (idx) => {
        if (idx === activeIdx) return;
        if (activeIdx >= 0 && lineNodes[activeIdx]) {
          lineNodes[activeIdx].style.background = '';
          lineNodes[activeIdx].style.borderLeftColor = 'transparent';
        }
        activeIdx = idx;
        if (idx >= 0 && lineNodes[idx]) {
          const node = lineNodes[idx];
          node.style.background = '#fff8d4';
          node.style.borderLeftColor = C_ACCENT;
          if (minimized) return;
          const cRect = content.getBoundingClientRect();
          const nRect = node.getBoundingClientRect();
          const margin = 40;
          if (nRect.top < cRect.top + margin || nRect.bottom > cRect.bottom - margin) {
            const target = node.offsetTop - (content.clientHeight / 2) + (node.clientHeight / 2);
            content.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
          }
        }
      };

      controller.on('timeupdate', (data) => {
        const t = typeof data.seconds === 'number' ? data.seconds : parseFloat(data.seconds);
        if (!isNaN(t)) setActive(findActive(t));
      });
    }

    return handle;
  }

  // =====================
  // 🧱 OVERLAY RENDER
  // =====================

  const renderSummary = (data, setlists, controller) => {
    const existing = document.querySelector('#fanclub-summary-box');
    if (existing) existing.remove();

    let html = '';

    if (data) {
      // Header bar with title + minimize toggle
      html += `
        <div id="fanclub-summary-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong>🎸 Supplemental Information 🎸</strong>
          <button id="fanclub-summary-toggle" title="Minimize" style="background:transparent; border:none; cursor:pointer; font-size:16px; line-height:1; color:#333; padding:2px 6px;">—</button>
        </div>
        <div id="fanclub-summary-body">
      `;
      html += `<strong>Title:</strong> ${data.title}<br>`;
      if (data.tour) html += `<strong>Tour:</strong> ${data.tour}<br>`;
      if (data.venue) html += `<strong>Venue:</strong> ${data.venue}<br>`;
      if (data.date) html += `<strong>Date:</strong> ${data.date}<br>`;
      if (data.notes) html += `<strong>Notes:</strong> ${data.notes}<br><br>`;

      if (data.setlist && data.setlist.length) {
        html += `<strong>Contents:</strong><br><ol style="margin-top:4px;padding-left:24px;">`;
        for (const entry of data.setlist) {
          if (entry.time) {
            const [min, sec] = entry.time.split(':').map(Number);
            const seconds = min * 60 + sec;
            html += `<li><a href="#t=${seconds}" style="color:#d12d6d; text-decoration:none;">[${entry.time}]</a> ${entry.song}</li>`;
          } else {
            html += `<li>${entry.song}</li>`;
          }
        }
        html += `</ol><br>`;
      }

      // Navigation buttons + translation button
      if (data.previous || data.next || data.translation) {
        html += `<div style="margin-top:12px;">`;
        if (data.previous) {
          const prev = setlists[data.previous];
          html += `<a href="https://bandmaid.tokyo/movies/${data.previous}" style="margin-right:12px; color:#333; text-decoration:none; background:#f9d5e2; padding:6px 10px; border-radius:8px;">⬅️ Prev: ${prev ? prev.title.replace(/\[OKYUJI\]\s*/,'') : 'Part -'}</a><br><br>`;
        }
        if (data.next) {
          const next = setlists[data.next];
          html += `<a href="https://bandmaid.tokyo/movies/${data.next}" style="color:#333; text-decoration:none; background:#f9d5e2; padding:6px 10px; border-radius:8px;">Next: ${next ? next.title.replace(/\[OKYUJI\]\s*/,'') : 'Part +' } ➡️</a>`;
        }
        if (isFanClubMember() && data.translation) {
          html += `<br><button id="bmfc-open-translation" style="color:#f09; border:2px solid #f09; text-decoration:none; padding:5px 9px; border-radius:8px; background:transparent; display:inline-block; margin-top:6px; cursor:pointer; font-family:monospace;">📄 English Translation</button>`;
        }
        html += `</div>`;
      }

      html += `</div>`; // close #fanclub-summary-body
    } else {
      html += '<br>';
    }

    // Build the actual summary box element
    const summaryBox = document.createElement('div');
    summaryBox.id = 'fanclub-summary-box';
    summaryBox.innerHTML = html;
    Object.assign(summaryBox.style, {
      padding: '12px 16px',
      border: '2px solid #f2a2c0',
      borderRadius: '12px',
      fontFamily: 'monospace',
      lineHeight: '1.5',
      marginTop: '20px',
      // Constrain width so it doesn't stretch across the page and cover the video controls.
      width: 'fit-content',
      maxWidth: 'min(480px, 30vw)',
      boxSizing: 'border-box',
    });

    const titleElement = document.querySelector('h1, .movie-title');
    if (titleElement) titleElement.insertAdjacentElement('afterend', summaryBox);

    createSearchBox(summaryBox);

    // Minimize / restore toggle for the summary box itself
    const summaryToggle = summaryBox.querySelector('#fanclub-summary-toggle');
    const summaryBody = summaryBox.querySelector('#fanclub-summary-body');
    let summaryMinimized = false;
    const setSummaryMinimized = (on) => {
      summaryMinimized = on;
      if (summaryBody) summaryBody.style.display = on ? 'none' : '';
      if (summaryToggle) summaryToggle.textContent = on ? '+' : '—';
      if (summaryToggle) summaryToggle.title = on ? 'Expand' : 'Minimize';
    };
    if (summaryToggle) {
      summaryToggle.addEventListener('click', () => setSummaryMinimized(!summaryMinimized));
    }

    // Translation button click — open floating panel, minimize summary box
    const translationBtn = summaryBox.querySelector('#bmfc-open-translation');
    if (translationBtn && data && data.translation) {
      const translationUrl = `https://drivetimebm.github.io/BAND-MAID_prime/Translations/${data.translation}.txt`;
      translationBtn.addEventListener('click', async () => {
        const panel = await openTranslationPanel(translationUrl, controller, summaryBox);
        if (panel) {
          setSummaryMinimized(true);
          // When user closes the translation panel, restore the summary
          panel.onClose = () => setSummaryMinimized(false);
        }
      });
    }

    // Setlist timestamp clicks — seek via Vimeo controller
    summaryBox.addEventListener('click', e => {
      if (e.target.tagName === 'A' && e.target.href.includes('#t=')) {
        e.preventDefault();
        const seconds = Number(e.target.href.split('#t=')[1]);
        if (controller) {
          controller.seekTo(seconds);
        } else {
          const video = document.querySelector('video');
          if (video) {
            video.currentTime = seconds;
            video.play();
          } else {
            window.location.hash = `t=${seconds}`;
          }
        }
      }
    });
  };

  // =====================
  // 🚀 MAIN
  // =====================

  window.addEventListener('load', async () => {
    const videoId = getVideoId();
    if (!videoId) return;

    // Set up Vimeo controller so setlist timestamp clicks + translation sync work
    const controller = createVimeoController();
    waitForVimeoIframe().then(iframe => {
      if (iframe) controller.attach(iframe);
    });

    try {
      const setlists = await loadSetlists();
      renderSummary(setlists[videoId], setlists, controller);
    } catch (err) {
      console.error('Failed to load BAND-MAID setlists:', err);
    }
  });
})();
