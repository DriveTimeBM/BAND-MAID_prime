// ==UserScript==
// @name         BAND-MAID Fanclub Playlist + Translations
// @namespace    https://bandmaid.tokyo/
// @version      1.6
// @description  Build named playlists of BAND-MAID fanclub videos, auto-advance via Vimeo API, and show auto-scrolling English translations beneath the video
// @author       DriveTimeBM
// @match        https://bandmaid.tokyo/
// @match        https://bandmaid.tokyo/movies
// @match        https://bandmaid.tokyo/movies/
// @match        https://bandmaid.tokyo/movies/*
// @match        https://bandmaid.tokyo/movies/categories/*
// @connect      drivetimebm.github.io
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // =====================
  // ⚙️  CONSTANTS
  // =====================

  const FANCLUB_JSON_URL = 'https://drivetimebm.github.io/BAND-MAID_gpt/fanclub/fanclub.json';
  const LS_PLAYLISTS     = 'bmfc_playlists';
  const LS_STATE         = 'bmfc_playlist_state';
  const COUNTDOWN_SEC    = 5;

  // Pink theme (matches Prime scripts)
  const C_BORDER   = '#f2a2c0';
  const C_BG       = '#fffafc';
  const C_ACCENT   = '#d12d6d';
  const C_BTN_BG   = '#f9d5e2';
  const C_TEXT     = '#333';
  const C_MUTED    = '#888';
  const C_HIGHLIGHT_BG = '#fff8d4';
  const C_HIGHLIGHT_BAR = '#d12d6d';

  // =====================
  // 🔧 STORAGE HELPERS
  // =====================

  const getPlaylists = () => {
    try { return JSON.parse(localStorage.getItem(LS_PLAYLISTS)) || {}; }
    catch { return {}; }
  };
  const savePlaylists = (obj) => localStorage.setItem(LS_PLAYLISTS, JSON.stringify(obj));

  const getState = () => {
    try { return JSON.parse(localStorage.getItem(LS_STATE)) || null; }
    catch { return null; }
  };
  const saveState = (s) => {
    if (s) localStorage.setItem(LS_STATE, JSON.stringify(s));
    else   localStorage.removeItem(LS_STATE);
  };

  // =====================
  // 🆔 HELPERS
  // =====================

  const extractVideoId = (url) => {
    const m = url && url.match(/movies\/(\d+)/);
    return m ? m[1] : null;
  };

  const getCurrentVideoId = () => extractVideoId(window.location.pathname);

  const isVideoPage   = () => /^\/movies\/\d+/.test(window.location.pathname);
  const isListingPage = () => {
    if (window.location.hostname !== 'bandmaid.tokyo') return false;
    if (isVideoPage()) return false;
    const p = window.location.pathname;
    return p === '/'
        || p === '/movies'
        || p === '/movies/'
        || p.startsWith('/movies/categories/');
  };

  // =====================
  // 📥 DATA LOADING
  // =====================

  let fcDataCache = null;
  let fcByIdCache = null;

  async function loadFanclubData() {
    if (fcDataCache) return fcDataCache;
    try {
      const res = await fetch(FANCLUB_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fcDataCache = await res.json();
      fcByIdCache = {};
      for (const entry of fcDataCache) {
        const id = extractVideoId(entry.URL);
        if (id) fcByIdCache[id] = entry;
      }
      return fcDataCache;
    } catch (err) {
      console.error('[BM Fanclub] Failed to load fanclub.json:', err);
      return [];
    }
  }

  const getEntryById = (id) => fcByIdCache ? fcByIdCache[id] : null;

  // =====================
  // 🎬 VIMEO PLAYER BRIDGE
  // =====================
  // Vimeo's postMessage API: https://developer.vimeo.com/player/sdk/basics
  // We find the iframe, ensure it has api=1&player_id, then send/receive JSON messages.

  const VIMEO_PLAYER_ID = 'bmfc-vimeo';

  const findVimeoIframe = () => {
    const iframes = document.querySelectorAll('iframe');
    for (const f of iframes) {
      if (f.src && /player\.vimeo\.com\/video\//.test(f.src)) return f;
    }
    return null;
  };

  // Ensure the Vimeo iframe has ?api=1&player_id=... so postMessage works.
  // Also strip muted=1 if present so the player loads with sound.
  const enableVimeoApi = (iframe) => {
    if (!iframe || !iframe.src) return false;
    if (iframe.dataset.bmfcEnhanced === '1') return true;
    try {
      const url = new URL(iframe.src);
      let changed = false;
      if (url.searchParams.get('api') !== '1') { url.searchParams.set('api', '1'); changed = true; }
      if (!url.searchParams.get('player_id')) { url.searchParams.set('player_id', VIMEO_PLAYER_ID); changed = true; }
      if (url.searchParams.has('muted')) { url.searchParams.delete('muted'); changed = true; }
      if (url.searchParams.has('background')) { url.searchParams.delete('background'); changed = true; }
      if (changed) iframe.src = url.toString();
      iframe.dataset.bmfcEnhanced = '1';
      return true;
    } catch (err) {
      console.warn('[BM Fanclub] Could not rewrite Vimeo iframe src:', err);
      return false;
    }
  };

  const postToVimeo = (iframe, method, value) => {
    if (!iframe || !iframe.contentWindow) return;
    const msg = value !== undefined ? { method, value } : { method };
    try { iframe.contentWindow.postMessage(JSON.stringify(msg), '*'); } catch {}
  };

  // Set up listeners + add event subscriptions once the iframe signals 'ready'.
  // Returns a promise-like controller so callers can subscribe to events.
  const createVimeoController = () => {
    const listeners = {}; // event name -> array of callbacks
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
        // Subscribe to the events we care about.
        // Raw postMessage API uses playProgress/finish; player.js SDK uses timeupdate/ended.
        // Subscribe to all so we catch whichever Vimeo emits.
        postToVimeo(iframe, 'addEventListener', 'ended');
        postToVimeo(iframe, 'addEventListener', 'finish');
        postToVimeo(iframe, 'addEventListener', 'timeupdate');
        postToVimeo(iframe, 'addEventListener', 'playProgress');
        postToVimeo(iframe, 'addEventListener', 'play');
        postToVimeo(iframe, 'addEventListener', 'pause');
        emit('ready');
      } else if (data.event === 'ended' || data.event === 'finish') {
        emit('ended');
      } else if (data.event === 'timeupdate' || data.event === 'playProgress') {
        emit('timeupdate', data.data || {});
      } else if (data.event === 'play') {
        emit('play');
      } else if (data.event === 'pause') {
        emit('pause');
      } else if (data.method === 'play' && data.value === false) {
        // play() was rejected (autoplay blocked)
        emit('autoplay-blocked');
      }
    });

    return {
      attach(iframeEl) {
        iframe = iframeEl;
        ready = false;
        enableVimeoApi(iframe);
      },
      on(name, cb) {
        (listeners[name] = listeners[name] || []).push(cb);
      },
      play() {
        if (!iframe) return;
        postToVimeo(iframe, 'play');
      },
      pause() {
        if (!iframe) return;
        postToVimeo(iframe, 'pause');
      },
      seekTo(seconds) {
        if (!iframe) return;
        postToVimeo(iframe, 'setCurrentTime', seconds);
      },
      setMuted(muted) {
        if (!iframe) return;
        postToVimeo(iframe, 'setMuted', !!muted);
      },
      setVolume(v) {
        if (!iframe) return;
        postToVimeo(iframe, 'setVolume', v);
      },
      isReady: () => ready,
      getIframe: () => iframe,
    };
  };

  // =====================
  // 📝 TRANSLATION PARSING
  // =====================

  // Parses a translation string (or plain text) into an array of lines.
  // Returns: [{ time: seconds | null, text: '...' }, ...]
  // A line is considered timestamped if it starts with HH:MM or MM:SS (colon-separated).
  const parseTranslation = (raw) => {
    if (!raw) return [];
    // Normalize HTML <br> sequences into real newlines, then strip any remaining tags.
    let text = String(raw)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Collapse runs of blank lines
    const rawLines = text.split(/\r?\n/).map(l => l.trim());

    const lines = [];
    // Timestamp detection: start of line, H:MM / HH:MM / MM:SS / HH:MM:SS
    const tsRe = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.*)$/;

    for (const line of rawLines) {
      if (!line) continue;
      const m = line.match(tsRe);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const c = m[3] !== undefined ? Number(m[3]) : null;
        // If we have three parts, treat as H:MM:SS
        // If two parts and first value is small (<6), we leave ambiguity unresolved:
        //   convention in these translations is MM:SS, so treat two-part as MM:SS.
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

  // Fetches a translation either from an inline field or from its URL fallback.
  const loadTranslation = async (entry) => {
    if (!entry) return [];
    if (entry.Translation && entry.Translation.trim()) {
      return parseTranslation(entry.Translation);
    }
    if (entry.TranslationURL) {
      try {
        const res = await fetch(entry.TranslationURL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        return parseTranslation(txt);
      } catch (err) {
        console.warn('[BM Fanclub] Failed to fetch TranslationURL:', err);
        return [];
      }
    }
    return [];
  };

  // =====================
  // 🎨 SHARED STYLES
  // =====================

  const injectSharedStyles = () => {
    if (document.querySelector('#bmfc-styles')) return;
    const style = document.createElement('style');
    style.id = 'bmfc-styles';
    style.textContent = `
      .bmfc-panel {
        font-family: monospace;
        background: ${C_BG};
        border: 2px solid ${C_BORDER};
        border-radius: 12px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.15);
        color: ${C_TEXT};
        box-sizing: border-box;
      }
      .bmfc-btn {
        background: ${C_BTN_BG};
        color: ${C_TEXT};
        border: none;
        border-radius: 8px;
        padding: 6px 10px;
        font-family: monospace;
        font-size: 13px;
        cursor: pointer;
      }
      .bmfc-btn:hover { background: ${C_BORDER}; }
      .bmfc-btn.primary { background: ${C_ACCENT}; color: #fff; }
      .bmfc-btn.primary:hover { background: #a8245a; }
      .bmfc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .bmfc-input, .bmfc-select {
        padding: 6px 8px;
        border: 1px solid #ccc;
        border-radius: 6px;
        font-size: 13px;
        font-family: monospace;
        background: #fff;
        color: ${C_TEXT};
        box-sizing: border-box;
      }
      .bmfc-badge {
        display: inline-block;
        background: ${C_BORDER};
        color: #fff;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        letter-spacing: 0.5px;
      }
      .bmfc-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        border-bottom: 1px solid #f1d8e2;
      }
      .bmfc-item:last-child { border-bottom: none; }
      .bmfc-thumb {
        width: 56px; height: 32px;
        object-fit: cover;
        border-radius: 4px;
        flex-shrink: 0;
        background: #eee;
      }
      .bmfc-item-title {
        flex: 1;
        font-size: 12px;
        line-height: 1.3;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .bmfc-icon-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 14px;
        padding: 2px 4px;
        color: ${C_TEXT};
      }
      .bmfc-icon-btn:hover { color: ${C_ACCENT}; }
      .bmfc-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .bmfc-section-label {
        font-size: 11px;
        color: ${C_MUTED};
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .bmfc-translation-line {
        padding: 4px 8px;
        margin: 2px 0;
        border-left: 3px solid transparent;
        border-radius: 4px;
        transition: background 0.15s, border-color 0.15s;
        cursor: default;
      }
      .bmfc-translation-line.has-time { cursor: pointer; }
      .bmfc-translation-line.active {
        background: ${C_HIGHLIGHT_BG};
        border-left-color: ${C_HIGHLIGHT_BAR};
      }
      .bmfc-timestamp {
        color: ${C_ACCENT};
        font-weight: bold;
        margin-right: 8px;
        user-select: none;
      }
    `;
    document.head.appendChild(style);
  };

  // =====================
  // 🗂 LISTING PAGE: PLAYLIST BUILDER PANEL
  // =====================

  async function mountBuilderPanel() {
    if (document.querySelector('#bmfc-playlist-builder')) return;
    injectSharedStyles();

    const data = await loadFanclubData();
    if (!data.length) return;

    // Sort by title ascending, numeric-aware
    data.sort((a, b) => (a.Title || '').localeCompare(b.Title || '', undefined, { numeric: true, sensitivity: 'base' }));

    const categories = Array.from(new Set(data.map(d => d.Category || '').filter(Boolean))).sort();

    let currentPlaylistName = null;
    const playlists = getPlaylists();
    const firstName = Object.keys(playlists)[0] || null;
    if (firstName) currentPlaylistName = firstName;

    const panel = document.createElement('div');
    panel.id = 'bmfc-playlist-builder';
    panel.className = 'bmfc-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      width: '380px',
      maxHeight: '80vh',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    });

    const header = document.createElement('div');
    header.style.cssText = `padding:10px 12px; border-bottom:1px solid ${C_BORDER}; display:flex; align-items:center; justify-content:space-between;`;
    header.innerHTML = `<strong>🎸 Fanclub Playlist</strong>`;
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'bmfc-icon-btn';
    collapseBtn.textContent = '+';
    collapseBtn.title = 'Expand';
    header.appendChild(collapseBtn);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px; overflow-y:auto; flex:1;';
    body.style.display = 'none';
    panel.appendChild(body);

    let collapsed = true;
    panel.style.maxHeight = '';
    collapseBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : '';
      collapseBtn.textContent = collapsed ? '+' : '—';
      panel.style.maxHeight = collapsed ? '' : '80vh';
    });

    // Playlist selector row
    const plRow = document.createElement('div');
    plRow.innerHTML = `<div class="bmfc-section-label">Playlist</div>`;
    const plRowInner = document.createElement('div');
    plRowInner.className = 'bmfc-row';
    plRowInner.style.marginBottom = '10px';

    const plSelect = document.createElement('select');
    plSelect.className = 'bmfc-select';
    plSelect.style.flex = '1';

    const newBtn    = document.createElement('button'); newBtn.className = 'bmfc-btn'; newBtn.textContent = '+ New';
    const renameBtn = document.createElement('button'); renameBtn.className = 'bmfc-btn'; renameBtn.textContent = '✎';   renameBtn.title = 'Rename';
    const delBtn    = document.createElement('button'); delBtn.className = 'bmfc-btn'; delBtn.textContent = '🗑';        delBtn.title = 'Delete playlist';

    plRowInner.append(plSelect, newBtn, renameBtn, delBtn);
    plRow.appendChild(plRowInner);
    body.appendChild(plRow);

    // Current list
    const currentLabel = document.createElement('div');
    currentLabel.className = 'bmfc-section-label';
    currentLabel.textContent = 'Current items';
    body.appendChild(currentLabel);

    const currentList = document.createElement('div');
    currentList.style.cssText = `max-height:180px; overflow-y:auto; border:1px solid ${C_BORDER}; border-radius:6px; background:#fff; margin-bottom:10px;`;
    body.appendChild(currentList);

    const playRow = document.createElement('div');
    playRow.className = 'bmfc-row';
    playRow.style.marginBottom = '12px';
    const playBtn = document.createElement('button');
    playBtn.className = 'bmfc-btn primary';
    playBtn.textContent = '▶ Play All';
    playBtn.style.flex = '1';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'bmfc-btn';
    clearBtn.textContent = 'Clear';
    playRow.append(playBtn, clearBtn);
    body.appendChild(playRow);

    // Browse
    const browseLabel = document.createElement('div');
    browseLabel.className = 'bmfc-section-label';
    browseLabel.textContent = 'Add videos';
    body.appendChild(browseLabel);

    const filterRow = document.createElement('div');
    filterRow.className = 'bmfc-row';
    filterRow.style.marginBottom = '6px';

    const search = document.createElement('input');
    search.className = 'bmfc-input';
    search.placeholder = 'Search…';
    search.style.flex = '1';

    const catSel = document.createElement('select');
    catSel.className = 'bmfc-select';
    catSel.innerHTML = `<option value="">All categories</option>` +
      categories.map(c => `<option value="${c}">${c}</option>`).join('');

    filterRow.append(search, catSel);
    body.appendChild(filterRow);

    const browseList = document.createElement('div');
    browseList.style.cssText = `max-height:260px; overflow-y:auto; border:1px solid ${C_BORDER}; border-radius:6px; background:#fff;`;
    body.appendChild(browseList);

    document.body.appendChild(panel);

    const refreshPlaylistSelect = () => {
      const pls = getPlaylists();
      const names = Object.keys(pls);
      plSelect.innerHTML = names.length
        ? names.map(n => `<option value="${n}"${n === currentPlaylistName ? ' selected' : ''}>${n} (${pls[n].length})</option>`).join('')
        : `<option value="">(no playlists)</option>`;
      const disabled = !names.length;
      renameBtn.disabled = disabled;
      delBtn.disabled = disabled;
      playBtn.disabled = disabled || !pls[currentPlaylistName] || !pls[currentPlaylistName].length;
      clearBtn.disabled = disabled || !pls[currentPlaylistName] || !pls[currentPlaylistName].length;
    };

    const renderCurrentList = () => {
      const pls = getPlaylists();
      const items = (currentPlaylistName && pls[currentPlaylistName]) || [];
      if (!items.length) {
        currentList.innerHTML = `<div style="padding:10px; color:${C_MUTED}; font-size:12px; text-align:center;">Empty. Add videos below.</div>`;
        playBtn.disabled = true;
        clearBtn.disabled = true;
        return;
      }
      playBtn.disabled = false;
      clearBtn.disabled = false;
      currentList.innerHTML = '';
      items.forEach((id, i) => {
        const entry = getEntryById(id);
        const title = entry ? entry.Title : `(unknown ${id})`;
        const thumb = entry ? entry.Image : '';
        const cat   = entry ? entry.Category : '';
        const titleEsc = (title || '').replace(/"/g, '&quot;');

        const row = document.createElement('div');
        row.className = 'bmfc-item';
        row.innerHTML = `
          <img class="bmfc-thumb" src="${thumb}" alt="" onerror="this.style.visibility='hidden'">
          <div class="bmfc-item-title" title="${titleEsc}">
            ${cat ? `<span class="bmfc-badge">${cat}</span> ` : ''}${title}
          </div>
        `;
        const upBtn = document.createElement('button'); upBtn.className='bmfc-icon-btn'; upBtn.textContent='▲'; upBtn.title='Move up';
        const dnBtn = document.createElement('button'); dnBtn.className='bmfc-icon-btn'; dnBtn.textContent='▼'; dnBtn.title='Move down';
        const rmBtn = document.createElement('button'); rmBtn.className='bmfc-icon-btn'; rmBtn.textContent='✕'; rmBtn.title='Remove';
        if (i === 0) upBtn.disabled = true;
        if (i === items.length - 1) dnBtn.disabled = true;
        row.append(upBtn, dnBtn, rmBtn);

        upBtn.addEventListener('click', () => {
          [items[i-1], items[i]] = [items[i], items[i-1]];
          pls[currentPlaylistName] = items; savePlaylists(pls);
          renderCurrentList(); refreshPlaylistSelect();
        });
        dnBtn.addEventListener('click', () => {
          [items[i+1], items[i]] = [items[i], items[i+1]];
          pls[currentPlaylistName] = items; savePlaylists(pls);
          renderCurrentList(); refreshPlaylistSelect();
        });
        rmBtn.addEventListener('click', () => {
          items.splice(i, 1);
          pls[currentPlaylistName] = items; savePlaylists(pls);
          renderCurrentList(); refreshPlaylistSelect();
        });

        currentList.appendChild(row);
      });
    };

    const renderBrowseList = () => {
      const q = search.value.trim().toLowerCase();
      const cat = catSel.value;
      const filtered = data.filter(d => {
        if (cat && d.Category !== cat) return false;
        if (!q) return true;
        const hay = `${d.Title || ''} ${d.Category || ''} ${d.Members || ''}`.toLowerCase();
        return hay.includes(q);
      });

      browseList.innerHTML = '';
      if (!filtered.length) {
        browseList.innerHTML = `<div style="padding:10px; color:${C_MUTED}; font-size:12px; text-align:center;">No matches.</div>`;
        return;
      }

      const frag = document.createDocumentFragment();
      const CAP = 200;
      filtered.slice(0, CAP).forEach(entry => {
        const id = extractVideoId(entry.URL);
        if (!id) return;
        const titleEsc = (entry.Title || '').replace(/"/g, '&quot;');
        const row = document.createElement('div');
        row.className = 'bmfc-item';
        row.innerHTML = `
          <img class="bmfc-thumb" src="${entry.Image || ''}" alt="" onerror="this.style.visibility='hidden'">
          <div class="bmfc-item-title" title="${titleEsc}">
            ${entry.Category ? `<span class="bmfc-badge">${entry.Category}</span> ` : ''}${entry.Title}
          </div>
        `;
        const addBtn = document.createElement('button');
        addBtn.className = 'bmfc-icon-btn';
        addBtn.textContent = '＋';
        addBtn.title = 'Add to current playlist';
        addBtn.addEventListener('click', () => {
          if (!currentPlaylistName) { alert('Create a playlist first (+ New button).'); return; }
          const pls = getPlaylists();
          pls[currentPlaylistName] = pls[currentPlaylistName] || [];
          if (pls[currentPlaylistName].includes(id)) {
            addBtn.textContent = '✓'; setTimeout(()=>{addBtn.textContent='＋';},800);
            return;
          }
          pls[currentPlaylistName].push(id);
          savePlaylists(pls);
          renderCurrentList(); refreshPlaylistSelect();
          addBtn.textContent = '✓'; setTimeout(()=>{addBtn.textContent='＋';},800);
        });
        row.appendChild(addBtn);
        frag.appendChild(row);
      });
      browseList.appendChild(frag);
      if (filtered.length > CAP) {
        const note = document.createElement('div');
        note.style.cssText = `padding:6px 10px; font-size:11px; color:${C_MUTED}; text-align:center;`;
        note.textContent = `Showing first ${CAP} of ${filtered.length}. Refine search.`;
        browseList.appendChild(note);
      }
    };

    plSelect.addEventListener('change', () => {
      currentPlaylistName = plSelect.value || null;
      renderCurrentList();
    });

    newBtn.addEventListener('click', () => {
      const name = (prompt('New playlist name:') || '').trim();
      if (!name) return;
      const pls = getPlaylists();
      if (pls[name]) { alert('A playlist with that name already exists.'); return; }
      pls[name] = [];
      savePlaylists(pls);
      currentPlaylistName = name;
      refreshPlaylistSelect(); renderCurrentList();
    });

    renameBtn.addEventListener('click', () => {
      if (!currentPlaylistName) return;
      const name = (prompt('Rename playlist:', currentPlaylistName) || '').trim();
      if (!name || name === currentPlaylistName) return;
      const pls = getPlaylists();
      if (pls[name]) { alert('A playlist with that name already exists.'); return; }
      pls[name] = pls[currentPlaylistName];
      delete pls[currentPlaylistName];
      savePlaylists(pls);
      currentPlaylistName = name;
      refreshPlaylistSelect();
    });

    delBtn.addEventListener('click', () => {
      if (!currentPlaylistName) return;
      if (!confirm(`Delete playlist "${currentPlaylistName}"?`)) return;
      const pls = getPlaylists();
      delete pls[currentPlaylistName];
      savePlaylists(pls);
      const remaining = Object.keys(pls);
      currentPlaylistName = remaining[0] || null;
      refreshPlaylistSelect(); renderCurrentList();
    });

    clearBtn.addEventListener('click', () => {
      if (!currentPlaylistName) return;
      if (!confirm('Clear all items from this playlist?')) return;
      const pls = getPlaylists();
      pls[currentPlaylistName] = [];
      savePlaylists(pls);
      renderCurrentList(); refreshPlaylistSelect();
    });

    playBtn.addEventListener('click', () => {
      const pls = getPlaylists();
      const items = pls[currentPlaylistName] || [];
      if (!items.length) return;
      saveState({ name: currentPlaylistName, index: 0, playing: true });
      window.location.href = `https://bandmaid.tokyo/movies/${items[0]}`;
    });

    let searchDebounce;
    search.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderBrowseList, 150);
    });
    catSel.addEventListener('change', renderBrowseList);

    refreshPlaylistSelect();
    renderCurrentList();
    renderBrowseList();
  }

  // =====================
  // 📄 TRANSLATION PANEL
  // =====================

  // Floating, draggable, resizable translation panel.
  // Position + size + hidden state persisted per-user across videos.
  async function mountTranslationPanel(entry, iframe) {
    const lines = await loadTranslation(entry);
    if (!lines.length) return null;

    // Load saved layout (global, not per-video)
    const LS_LAYOUT = 'bmfc_translation_layout';
    const loadLayout = () => {
      try {
        const raw = localStorage.getItem(LS_LAYOUT);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    };
    const saveLayout = (patch) => {
      const current = loadLayout() || {};
      const merged = { ...current, ...patch };
      try { localStorage.setItem(LS_LAYOUT, JSON.stringify(merged)); } catch {}
    };

    // Defaults: top-right corner, comfortable reading size
    const defaults = {
      left: Math.max(16, window.innerWidth - 420 - 24),
      top: 96,
      width: 400,
      height: 500,
      hidden: false,
    };
    const layout = { ...defaults, ...(loadLayout() || {}) };

    // Clamp into viewport in case the saved position is off-screen
    // (e.g. user had a wider monitor last time)
    layout.left = Math.min(Math.max(0, layout.left), Math.max(0, window.innerWidth - 80));
    layout.top  = Math.min(Math.max(0, layout.top),  Math.max(0, window.innerHeight - 60));

    const panel = document.createElement('div');
    panel.id = 'bmfc-translation-panel';
    panel.className = 'bmfc-panel';
    panel.style.cssText = `
      position: fixed;
      left: ${layout.left}px;
      top: ${layout.top}px;
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
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    `;

    // Header (drag handle)
    const header = document.createElement('div');
    header.id = 'bmfc-translation-header';
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
      <strong style="font-size:13px;">📝 Translation${hasTimestamps ? ' (auto-scrolls)' : ''}</strong>
      <div style="display:flex; gap:4px;">
        <button class="bmfc-icon-btn" id="bmfc-trans-minimize" title="Minimize" style="color:#fff; font-size:16px; line-height:1;">—</button>
        <button class="bmfc-icon-btn" id="bmfc-trans-reset" title="Reset position" style="color:#fff; font-size:14px; line-height:1;">⟲</button>
      </div>
    `;
    panel.appendChild(header);

    const content = document.createElement('div');
    content.id = 'bmfc-translation-content';
    content.style.cssText = `
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 10px 14px;
      color: ${C_TEXT};
      background: ${C_BG};
      border-radius: 0 0 10px 10px;
      position: relative;
    `;
    panel.appendChild(content);

    // Build line nodes
    const lineNodes = [];
    lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.className = 'bmfc-translation-line' + (line.time !== null ? ' has-time' : '');
      div.dataset.index = String(idx);
      if (line.time !== null) {
        div.dataset.time = String(line.time);
        const mins = Math.floor(line.time / 60);
        const secs = line.time % 60;
        const stamp = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
        div.innerHTML = `<span class="bmfc-timestamp">[${stamp}]</span>${escapeHtml(line.text)}`;
      } else {
        div.textContent = line.text;
      }
      content.appendChild(div);
      lineNodes.push(div);
    });

    // Resize grip (bottom-right corner)
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

    // Apply minimized state if saved
    let minimized = !!layout.hidden;
    const applyMinimized = () => {
      if (minimized) {
        content.style.display = 'none';
        grip.style.display = 'none';
        panel.style.height = 'auto';
        panel.style.minHeight = '0';
        header.querySelector('#bmfc-trans-minimize').textContent = '+';
      } else {
        content.style.display = '';
        grip.style.display = '';
        panel.style.minHeight = '120px';
        panel.style.height = `${layout.height}px`;
        header.querySelector('#bmfc-trans-minimize').textContent = '—';
      }
    };
    applyMinimized();

    // ---- Minimize button ----
    header.querySelector('#bmfc-trans-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      minimized = !minimized;
      layout.hidden = minimized;
      saveLayout({ hidden: minimized });
      applyMinimized();
    });

    // ---- Reset position button ----
    header.querySelector('#bmfc-trans-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      const fresh = {
        left: Math.max(16, window.innerWidth - 420 - 24),
        top: 96,
        width: 400,
        height: 500,
        hidden: false,
      };
      Object.assign(layout, fresh);
      panel.style.left  = `${fresh.left}px`;
      panel.style.top   = `${fresh.top}px`;
      panel.style.width = `${fresh.width}px`;
      panel.style.height = `${fresh.height}px`;
      minimized = false;
      applyMinimized();
      saveLayout(fresh);
    });

    // ---- Drag logic ----
    let dragStart = null;
    header.addEventListener('mousedown', (e) => {
      // Ignore clicks on buttons inside the header
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
      // Clamp: keep at least 40px of panel visible on-screen
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

    // ---- Resize logic ----
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

    // Highlighting / auto-scroll logic
    let activeIdx = -1;
    const timedLines = lines
      .map((l, i) => ({ time: l.time, i }))
      .filter(x => x.time !== null);

    const findActive = (t) => {
      // Binary-ish: find the last line whose time <= t
      if (!timedLines.length) return -1;
      let found = -1;
      for (let k = 0; k < timedLines.length; k++) {
        if (timedLines[k].time <= t) found = timedLines[k].i;
        else break;
      }
      return found;
    };

    const setActive = (idx) => {
      if (idx === activeIdx) return;
      if (activeIdx >= 0 && lineNodes[activeIdx]) lineNodes[activeIdx].classList.remove('active');
      activeIdx = idx;
      if (idx >= 0 && lineNodes[idx]) {
        const node = lineNodes[idx];
        node.classList.add('active');
        // Only auto-scroll if the active line is out of view within the content container.
        // Skip when minimized (content is hidden).
        if (minimized) return;
        const cRect = content.getBoundingClientRect();
        const nRect = node.getBoundingClientRect();
        const margin = 40;
        if (nRect.top < cRect.top + margin || nRect.bottom > cRect.bottom - margin) {
          // Center the line in the content pane.
          // node.offsetTop is relative to content (the nearest positioned ancestor).
          const target = node.offsetTop - (content.clientHeight / 2) + (node.clientHeight / 2);
          content.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
        }
      }
    };

    return {
      updateCurrentTime(t) {
        if (!hasTimestamps) return;
        setActive(findActive(t));
      },
      hasTimestamps,
    };
  }

  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // =====================
  // 🎞 VIDEO-PAGE: NOW-PLAYING OVERLAY + TRANSLATION
  // =====================

  async function mountVideoPage() {
    injectSharedStyles();
    await loadFanclubData();

    const videoId = getCurrentVideoId();
    if (!videoId) return;
    const entry = getEntryById(videoId);

    // Wait for the Vimeo iframe to appear (it can be late due to member-login gating)
    const iframe = await waitForVimeoIframe();
    if (!iframe) {
      // Fallback: still try to show translation if we have data
      if (entry) await mountTranslationFallback(entry);
      return;
    }

    const controller = createVimeoController();
    controller.attach(iframe);

    // Note: video is loaded/autoplayed muted. The user can unmute via Vimeo's
    // native player controls. We don't attempt to auto-unmute because:
    //   - Unmuted autoplay is blocked by browsers without a user gesture
    //   - Forcing setMuted(false) mid-playback causes Vimeo to pause
    //   - A custom unmute button runs into the same setMuted pause behavior

    // Translation panel
    let translationCtl = null;
    if (entry) {
      translationCtl = await mountTranslationPanel(entry, iframe);
    }

    // Hook translation sync to Vimeo timeupdate / playProgress
    if (translationCtl && translationCtl.hasTimestamps) {
      controller.on('timeupdate', (data) => {
        // seconds may arrive as a number or a numeric string depending on event variant
        const t = typeof data.seconds === 'number' ? data.seconds : parseFloat(data.seconds);
        if (!isNaN(t)) {
          translationCtl.updateCurrentTime(t);
        }
      });
    }

    // Now-playing overlay (only if a playlist is running)
    const state = getState();
    if (state && state.playing) {
      mountNowPlayingOverlay(controller);
    }
  }

  // Fallback used when we can't find the Vimeo iframe (e.g. script ran on a non-video page layout)
  async function mountTranslationFallback(entry) {
    const lines = await loadTranslation(entry);
    if (!lines.length) return;
    // Put it at the end of <main> or <body>
    const anchor = document.querySelector('main') || document.body;
    const placeholder = document.createElement('div');
    anchor.appendChild(placeholder);
    await mountTranslationPanel(entry, placeholder);
  }

  const waitForVimeoIframe = async (timeoutMs = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const f = findVimeoIframe();
      if (f) return f;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  };

  function mountNowPlayingOverlay(controller) {
    const state = getState();
    if (!state || !state.playing) return;

    const pls = getPlaylists();
    const items = pls[state.name];
    if (!items || !items.length) { saveState(null); return; }

    const currentId = getCurrentVideoId();
    const expectedId = items[state.index];
    if (currentId !== expectedId) {
      const foundIdx = items.indexOf(currentId);
      if (foundIdx >= 0) {
        state.index = foundIdx;
        saveState(state);
      } else {
        saveState({ ...state, playing: false });
        return;
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'bmfc-nowplaying';
    overlay.className = 'bmfc-panel';
    Object.assign(overlay.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      width: '320px',
      zIndex: '9999',
      padding: '10px 12px',
    });

    const render = () => {
      const s = getState();
      const items = (getPlaylists()[s.name]) || [];
      const i = s.index;
      const curEntry  = getEntryById(items[i]);
      const nextEntry = i + 1 < items.length ? getEntryById(items[i + 1]) : null;
      const title = curEntry ? curEntry.Title : `Video ${items[i]}`;
      const cat   = curEntry ? curEntry.Category : '';

      overlay.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <strong style="font-size:13px;">▶ Playing ${i + 1} of ${items.length}</strong>
          <span style="font-size:11px; color:${C_MUTED};">${s.name}</span>
        </div>
        <div style="font-size:12px; line-height:1.3; margin-bottom:8px;">
          ${cat ? `<span class="bmfc-badge">${cat}</span> ` : ''}${title}
        </div>
        <div class="bmfc-row">
          <button class="bmfc-btn" id="bmfc-prev" ${i === 0 ? 'disabled' : ''}>⏮ Prev</button>
          <button class="bmfc-btn" id="bmfc-next" ${i + 1 >= items.length ? 'disabled' : ''}>Next ⏭</button>
          <button class="bmfc-btn" id="bmfc-stop" style="margin-left:auto;">⏹ Stop</button>
        </div>
        ${nextEntry ? `<div style="font-size:11px; color:${C_MUTED}; margin-top:6px;">Next: ${nextEntry.Title}</div>` : ''}
        <div id="bmfc-countdown" style="margin-top:8px;"></div>
      `;
      overlay.querySelector('#bmfc-prev').addEventListener('click', () => goTo(i - 1));
      overlay.querySelector('#bmfc-next').addEventListener('click', () => goTo(i + 1));
      overlay.querySelector('#bmfc-stop').addEventListener('click', stopPlaylist);
    };

    const goTo = (idx) => {
      const s = getState();
      const its = (getPlaylists()[s.name]) || [];
      if (idx < 0 || idx >= its.length) { stopPlaylist(); return; }
      saveState({ ...s, index: idx });
      window.location.href = `https://bandmaid.tokyo/movies/${its[idx]}`;
    };

    const stopPlaylist = () => { saveState(null); overlay.remove(); };

    document.body.appendChild(overlay);
    render();

    // Countdown on 'ended'
    let countdownTimer = null;
    let countdownActive = false;

    const startCountdown = () => {
      if (countdownActive) return;
      const s = getState();
      const its = (getPlaylists()[s.name]) || [];
      if (s.index + 1 >= its.length) {
        const box = overlay.querySelector('#bmfc-countdown');
        if (box) box.innerHTML = `<div style="color:${C_ACCENT}; font-size:12px;">🎉 End of playlist</div>`;
        saveState({ ...s, playing: false });
        return;
      }
      countdownActive = true;
      let remaining = COUNTDOWN_SEC;
      const box = overlay.querySelector('#bmfc-countdown');
      const paint = () => {
        box.innerHTML = `
          <div style="font-size:12px; margin-bottom:4px;">Next up in <strong>${remaining}s</strong>…</div>
          <div class="bmfc-row">
            <button class="bmfc-btn primary" id="bmfc-skip">Skip ▶</button>
            <button class="bmfc-btn" id="bmfc-cancel">Cancel</button>
          </div>
        `;
        box.querySelector('#bmfc-skip').addEventListener('click', () => {
          clearInterval(countdownTimer); countdownActive = false;
          goTo(s.index + 1);
        });
        box.querySelector('#bmfc-cancel').addEventListener('click', () => {
          clearInterval(countdownTimer); countdownActive = false;
          box.innerHTML = `<div style="font-size:11px; color:${C_MUTED};">Auto-advance cancelled.</div>`;
        });
      };
      paint();
      countdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(countdownTimer); countdownActive = false;
          goTo(s.index + 1);
        } else {
          const strong = box.querySelector('strong');
          if (strong) strong.textContent = `${remaining}s`;
        }
      }, 1000);
    };

    controller.on('ended', startCountdown);

    // Autoplay attempt + blocked fallback
    const showAutoplayFallback = () => {
      const box = overlay.querySelector('#bmfc-countdown');
      if (!box) return;
      box.innerHTML = `
        <div style="font-size:12px; margin-bottom:4px;">Browser blocked autoplay.</div>
        <button class="bmfc-btn primary" id="bmfc-clickplay" style="width:100%;">▶ Click to play</button>
      `;
      box.querySelector('#bmfc-clickplay').addEventListener('click', () => {
        controller.play();
        box.innerHTML = '';
      });
    };

    const tryAutoplay = () => {
      const doPlay = () => {
        // Ensure muted before play() so the browser's autoplay policy lets us start.
        // (The user can unmute via the floating Unmute button.)
        controller.setMuted(true);
        controller.play();
      };
      if (!controller.isReady()) {
        controller.on('ready', doPlay);
      } else {
        doPlay();
      }
    };

    // Muted autoplay should work in all modern browsers. If it doesn't start
    // within a few seconds, show the click-to-play fallback.
    let played = false;
    controller.on('play', () => { played = true; });

    setTimeout(() => {
      tryAutoplay();
      setTimeout(() => { if (!played) showAutoplayFallback(); }, 2500);
    }, 600);
  }

  // =====================
  // 🚀 ENTRY
  // =====================

  window.addEventListener('load', () => {
    if (isVideoPage()) {
      mountVideoPage();
    } else if (isListingPage()) {
      mountBuilderPanel();
    }
  });
})();
