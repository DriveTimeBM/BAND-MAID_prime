// ==UserScript==
// @name         BAND-MAID Prime Playlist Builder
// @namespace    https://bandmaidprime.tokyo/
// @version      1.2
// @description  Build named playlists of BAND-MAID Prime videos and play them back-to-back with auto-advance
// @author       DriveTimeBM
// @match        https://bandmaidprime.tokyo/
// @match        https://bandmaidprime.tokyo/movies
// @match        https://bandmaidprime.tokyo/movies/
// @match        https://bandmaidprime.tokyo/movies/*
// @match        https://bandmaidprime.tokyo/movies/categories/*
// @match        https://player-api.p.uliza.jp/*
// @connect      drivetimebm.github.io
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // =====================
  // ⚙️  CONSTANTS
  // =====================

  const PRIME_JSON_URL   = 'https://drivetimebm.github.io/BAND-MAID_gpt/prime/prime.json';
  const LS_PLAYLISTS     = 'bmprime_playlists';       // { [name]: [videoId, ...] }
  const LS_STATE         = 'bmprime_playlist_state';  // { name, index, playing }
  const COUNTDOWN_SEC    = 5;

  // Pink theme (matches existing script)
  const C_BORDER = '#f2a2c0';
  const C_BG     = '#fffafc';
  const C_ACCENT = '#d12d6d';
  const C_BTN_BG = '#f9d5e2';
  const C_TEXT   = '#333';
  const C_MUTED  = '#888';

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
    if (window.location.hostname !== 'bandmaidprime.tokyo') return false;
    if (isVideoPage()) return false;
    const p = window.location.pathname;
    return p === '/'
        || p === '/movies'
        || p === '/movies/'
        || p.startsWith('/movies/categories/');
  };
  const isUlizaFrame  = () => window.location.origin === 'https://player-api.p.uliza.jp';

  // =====================
  // 📥 DATA LOADING
  // =====================

  let primeDataCache = null;
  let primeByIdCache = null;

  async function loadPrimeData() {
    if (primeDataCache) return primeDataCache;
    try {
      const res = await fetch(PRIME_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      primeDataCache = await res.json();
      primeByIdCache = {};
      for (const entry of primeDataCache) {
        const id = extractVideoId(entry.URL);
        if (id) primeByIdCache[id] = entry;
      }
      return primeDataCache;
    } catch (err) {
      console.error('[BM Playlist] Failed to load prime.json:', err);
      return [];
    }
  }

  const getEntryById = (id) => primeByIdCache ? primeByIdCache[id] : null;

  // =====================
  // 🎬 IFRAME BRIDGE (runs inside Uliza player)
  // =====================

  const setupIframeBridge = () => {
    let video = null;
    let endedSent = false;
    let autoplayRequested = false;

    const reportAutoplayBlocked = () => {
      try { window.parent.postMessage({ source: 'bm-playlist', action: 'autoplay-blocked' }, '*'); } catch {}
    };
    const reportAutoplayOk = () => {
      try { window.parent.postMessage({ source: 'bm-playlist', action: 'autoplay-ok' }, '*'); } catch {}
    };

    const tryAutoplay = (v) => {
      if (!v) return;
      const p = v.play();
      if (p && typeof p.catch === 'function') {
        p.then(reportAutoplayOk).catch(() => reportAutoplayBlocked());
      }
    };

    const attach = (v) => {
      if (v === video) return;
      video = v;
      endedSent = false;

      v.addEventListener('ended', () => {
        if (endedSent) return;
        endedSent = true;
        try { window.parent.postMessage({ source: 'bm-playlist', action: 'ended' }, '*'); } catch {}
      });

      // Reset flag if user seeks back or video replays
      v.addEventListener('play', () => { endedSent = false; });

      // If parent already requested autoplay before video was ready, try now
      if (autoplayRequested) tryAutoplay(v);
    };

    const existing = document.querySelector('video');
    if (existing) attach(existing);

    const obs = new MutationObserver(() => {
      const v = document.querySelector('video');
      if (v) attach(v);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Also honor play/seek commands from parent (reused pattern)
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.action === 'autoplay') {
        autoplayRequested = true;
        const v = document.querySelector('video');
        if (v) tryAutoplay(v);
        return;
      }
      const v = document.querySelector('video');
      if (!v) return;
      if (d.action === 'seek' && typeof d.time === 'number') {
        v.currentTime = d.time;
        v.play().catch(() => {});
      } else if (d.action === 'play') {
        v.play().catch(() => reportAutoplayBlocked());
      }
    });
  };

  // =====================
  // 🎨 SHARED STYLES
  // =====================

  const injectSharedStyles = () => {
    if (document.querySelector('#bm-playlist-styles')) return;
    const style = document.createElement('style');
    style.id = 'bm-playlist-styles';
    style.textContent = `
      .bmpl-panel {
        font-family: monospace;
        background: ${C_BG};
        border: 2px solid ${C_BORDER};
        border-radius: 12px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.15);
        color: ${C_TEXT};
        box-sizing: border-box;
      }
      .bmpl-btn {
        background: ${C_BTN_BG};
        color: ${C_TEXT};
        border: none;
        border-radius: 8px;
        padding: 6px 10px;
        font-family: monospace;
        font-size: 13px;
        cursor: pointer;
      }
      .bmpl-btn:hover { background: ${C_BORDER}; }
      .bmpl-btn.primary { background: ${C_ACCENT}; color: #fff; }
      .bmpl-btn.primary:hover { background: #a8245a; }
      .bmpl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .bmpl-input, .bmpl-select {
        padding: 6px 8px;
        border: 1px solid #ccc;
        border-radius: 6px;
        font-size: 13px;
        font-family: monospace;
        background: #fff;
        color: ${C_TEXT};
        box-sizing: border-box;
      }
      .bmpl-badge {
        display: inline-block;
        background: ${C_BORDER};
        color: #fff;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        letter-spacing: 0.5px;
      }
      .bmpl-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        border-bottom: 1px solid #f1d8e2;
      }
      .bmpl-item:last-child { border-bottom: none; }
      .bmpl-thumb {
        width: 56px; height: 32px;
        object-fit: cover;
        border-radius: 4px;
        flex-shrink: 0;
        background: #eee;
      }
      .bmpl-item-title {
        flex: 1;
        font-size: 12px;
        line-height: 1.3;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .bmpl-icon-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 14px;
        padding: 2px 4px;
        color: ${C_TEXT};
      }
      .bmpl-icon-btn:hover { color: ${C_ACCENT}; }
      .bmpl-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .bmpl-section-label {
        font-size: 11px;
        color: ${C_MUTED};
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
    `;
    document.head.appendChild(style);
  };

  // =====================
  // 🗂  LISTING-PAGE: PLAYLIST BUILDER PANEL
  // =====================

  async function mountBuilderPanel() {
    if (document.querySelector('#bm-playlist-builder')) return;
    injectSharedStyles();

    const data = await loadPrimeData();
    if (!data.length) return;

    // Build category list
    const categories = Array.from(new Set(data.map(d => d.Category || '').filter(Boolean))).sort();

    // State
    let currentPlaylistName = null;
    const playlists = getPlaylists();
    const firstName = Object.keys(playlists)[0] || null;
    if (firstName) currentPlaylistName = firstName;

    // Panel
    const panel = document.createElement('div');
    panel.id = 'bm-playlist-builder';
    panel.className = 'bmpl-panel';
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

    // Header
    const header = document.createElement('div');
    header.style.cssText = `padding:10px 12px; border-bottom:1px solid ${C_BORDER}; display:flex; align-items:center; justify-content:space-between;`;
    header.innerHTML = `<strong>🎸 Prime Playlist</strong>`;
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'bmpl-icon-btn';
    collapseBtn.textContent = '—';
    collapseBtn.title = 'Collapse';
    header.appendChild(collapseBtn);
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px; overflow-y:auto; flex:1;';
    panel.appendChild(body);

    // ---- Playlist selector row ----
    const plRow = document.createElement('div');
    plRow.innerHTML = `<div class="bmpl-section-label">Playlist</div>`;
    const plRowInner = document.createElement('div');
    plRowInner.className = 'bmpl-row';
    plRowInner.style.marginBottom = '10px';

    const plSelect = document.createElement('select');
    plSelect.className = 'bmpl-select';
    plSelect.style.flex = '1';

    const newBtn    = document.createElement('button'); newBtn.className = 'bmpl-btn'; newBtn.textContent = '+ New';
    const renameBtn = document.createElement('button'); renameBtn.className = 'bmpl-btn'; renameBtn.textContent = '✎';   renameBtn.title = 'Rename';
    const delBtn    = document.createElement('button'); delBtn.className = 'bmpl-btn'; delBtn.textContent = '🗑';        delBtn.title = 'Delete playlist';

    plRowInner.append(plSelect, newBtn, renameBtn, delBtn);
    plRow.appendChild(plRowInner);
    body.appendChild(plRow);

    // ---- Current playlist list ----
    const currentLabel = document.createElement('div');
    currentLabel.className = 'bmpl-section-label';
    currentLabel.textContent = 'Current items';
    body.appendChild(currentLabel);

    const currentList = document.createElement('div');
    currentList.style.cssText = `max-height:180px; overflow-y:auto; border:1px solid ${C_BORDER}; border-radius:6px; background:#fff; margin-bottom:10px;`;
    body.appendChild(currentList);

    // ---- Play button ----
    const playRow = document.createElement('div');
    playRow.className = 'bmpl-row';
    playRow.style.marginBottom = '12px';
    const playBtn = document.createElement('button');
    playBtn.className = 'bmpl-btn primary';
    playBtn.textContent = '▶ Play All';
    playBtn.style.flex = '1';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'bmpl-btn';
    clearBtn.textContent = 'Clear';
    playRow.append(playBtn, clearBtn);
    body.appendChild(playRow);

    // ---- Browse / add section ----
    const browseLabel = document.createElement('div');
    browseLabel.className = 'bmpl-section-label';
    browseLabel.textContent = 'Add videos';
    body.appendChild(browseLabel);

    const filterRow = document.createElement('div');
    filterRow.className = 'bmpl-row';
    filterRow.style.marginBottom = '6px';

    const search = document.createElement('input');
    search.className = 'bmpl-input';
    search.placeholder = 'Search…';
    search.style.flex = '1';

    const catSel = document.createElement('select');
    catSel.className = 'bmpl-select';
    catSel.innerHTML = `<option value="">All categories</option>` +
      categories.map(c => `<option value="${c}">${c}</option>`).join('');

    filterRow.append(search, catSel);
    body.appendChild(filterRow);

    const browseList = document.createElement('div');
    browseList.style.cssText = `max-height:260px; overflow-y:auto; border:1px solid ${C_BORDER}; border-radius:6px; background:#fff;`;
    body.appendChild(browseList);

    document.body.appendChild(panel);

    // ---- Collapse behavior ----
    let collapsed = false;
    collapseBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : '';
      collapseBtn.textContent = collapsed ? '+' : '—';
      panel.style.maxHeight = collapsed ? '' : '80vh';
    });

    // ---- Render helpers ----
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

        const row = document.createElement('div');
        row.className = 'bmpl-item';
        row.innerHTML = `
          <img class="bmpl-thumb" src="${thumb}" alt="" onerror="this.style.visibility='hidden'">
          <div class="bmpl-item-title" title="${(title || '').replace(/"/g, '&quot;')}">
            ${cat ? `<span class="bmpl-badge">${cat}</span> ` : ''}${title}
          </div>
        `;
        const upBtn   = document.createElement('button'); upBtn.className='bmpl-icon-btn';   upBtn.textContent='▲'; upBtn.title='Move up';
        const dnBtn   = document.createElement('button'); dnBtn.className='bmpl-icon-btn';   dnBtn.textContent='▼'; dnBtn.title='Move down';
        const rmBtn   = document.createElement('button'); rmBtn.className='bmpl-icon-btn';   rmBtn.textContent='✕'; rmBtn.title='Remove';
        if (i === 0) upBtn.disabled = true;
        if (i === items.length - 1) dnBtn.disabled = true;
        row.append(upBtn, dnBtn, rmBtn);

        upBtn.addEventListener('click', () => {
          [items[i-1], items[i]] = [items[i], items[i-1]];
          pls[currentPlaylistName] = items;
          savePlaylists(pls);
          renderCurrentList();
          refreshPlaylistSelect();
        });
        dnBtn.addEventListener('click', () => {
          [items[i+1], items[i]] = [items[i], items[i+1]];
          pls[currentPlaylistName] = items;
          savePlaylists(pls);
          renderCurrentList();
          refreshPlaylistSelect();
        });
        rmBtn.addEventListener('click', () => {
          items.splice(i, 1);
          pls[currentPlaylistName] = items;
          savePlaylists(pls);
          renderCurrentList();
          refreshPlaylistSelect();
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
        const hay = `${d.Title || ''} ${d.Category || ''} ${d.Members || ''} ${d.Song || ''}`.toLowerCase();
        return hay.includes(q);
      });

      browseList.innerHTML = '';
      if (!filtered.length) {
        browseList.innerHTML = `<div style="padding:10px; color:${C_MUTED}; font-size:12px; text-align:center;">No matches.</div>`;
        return;
      }

      const frag = document.createDocumentFragment();
      // Cap rendered items to keep DOM light
      const CAP = 200;
      filtered.slice(0, CAP).forEach(entry => {
        const id = extractVideoId(entry.URL);
        if (!id) return;
        const row = document.createElement('div');
        row.className = 'bmpl-item';
        row.innerHTML = `
          <img class="bmpl-thumb" src="${entry.Image || ''}" alt="" onerror="this.style.visibility='hidden'">
          <div class="bmpl-item-title" title="${(entry.Title || '').replace(/"/g, '&quot;')}">
            ${entry.Category ? `<span class="bmpl-badge">${entry.Category}</span> ` : ''}${entry.Title}
          </div>
        `;
        const addBtn = document.createElement('button');
        addBtn.className = 'bmpl-icon-btn';
        addBtn.textContent = '＋';
        addBtn.title = 'Add to current playlist';
        addBtn.addEventListener('click', () => {
          if (!currentPlaylistName) {
            alert('Create a playlist first (+ New button).');
            return;
          }
          const pls = getPlaylists();
          pls[currentPlaylistName] = pls[currentPlaylistName] || [];
          if (pls[currentPlaylistName].includes(id)) {
            addBtn.textContent = '✓'; setTimeout(()=>{addBtn.textContent='＋';},800);
            return;
          }
          pls[currentPlaylistName].push(id);
          savePlaylists(pls);
          renderCurrentList();
          refreshPlaylistSelect();
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

    // ---- Wire up controls ----
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
      refreshPlaylistSelect();
      renderCurrentList();
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
      refreshPlaylistSelect();
      renderCurrentList();
    });

    clearBtn.addEventListener('click', () => {
      if (!currentPlaylistName) return;
      if (!confirm('Clear all items from this playlist?')) return;
      const pls = getPlaylists();
      pls[currentPlaylistName] = [];
      savePlaylists(pls);
      renderCurrentList();
      refreshPlaylistSelect();
    });

    playBtn.addEventListener('click', () => {
      const pls = getPlaylists();
      const items = pls[currentPlaylistName] || [];
      if (!items.length) return;
      saveState({ name: currentPlaylistName, index: 0, playing: true });
      window.location.href = `https://bandmaidprime.tokyo/movies/${items[0]}`;
    });

    let searchDebounce;
    search.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderBrowseList, 150);
    });
    catSel.addEventListener('change', renderBrowseList);

    // Initial render
    refreshPlaylistSelect();
    renderCurrentList();
    renderBrowseList();
  }

  // =====================
  // 🎞  VIDEO-PAGE: NOW-PLAYING OVERLAY
  // =====================

  async function mountNowPlayingOverlay() {
    const state = getState();
    if (!state || !state.playing) return;

    const pls = getPlaylists();
    const items = pls[state.name];
    if (!items || !items.length) {
      saveState(null);
      return;
    }

    // Ensure current URL matches expected video; if not, user navigated away.
    const currentId = getCurrentVideoId();
    if (!currentId) return;
    const expectedId = items[state.index];
    if (currentId !== expectedId) {
      // User clicked a different video while a playlist was running.
      // Try to find this video in the playlist and resume from there; otherwise abort.
      const foundIdx = items.indexOf(currentId);
      if (foundIdx >= 0) {
        state.index = foundIdx;
        saveState(state);
      } else {
        // Not in playlist -- pause playback state silently.
        saveState({ ...state, playing: false });
        return;
      }
    }

    injectSharedStyles();
    await loadPrimeData();

    const overlay = document.createElement('div');
    overlay.id = 'bm-playlist-nowplaying';
    overlay.className = 'bmpl-panel';
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
      const title     = curEntry ? curEntry.Title : `Video ${items[i]}`;
      const cat       = curEntry ? curEntry.Category : '';

      overlay.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <strong style="font-size:13px;">▶ Playing ${i + 1} of ${items.length}</strong>
          <span style="font-size:11px; color:${C_MUTED};">${s.name}</span>
        </div>
        <div style="font-size:12px; line-height:1.3; margin-bottom:8px;">
          ${cat ? `<span class="bmpl-badge">${cat}</span> ` : ''}${title}
        </div>
        <div class="bmpl-row">
          <button class="bmpl-btn" id="bmpl-prev" ${i === 0 ? 'disabled' : ''}>⏮ Prev</button>
          <button class="bmpl-btn" id="bmpl-next" ${i + 1 >= items.length ? 'disabled' : ''}>Next ⏭</button>
          <button class="bmpl-btn" id="bmpl-stop" style="margin-left:auto;">⏹ Stop</button>
        </div>
        ${nextEntry ? `<div style="font-size:11px; color:${C_MUTED}; margin-top:6px;">Next: ${nextEntry.Title}</div>` : ''}
        <div id="bmpl-countdown" style="margin-top:8px;"></div>
      `;

      overlay.querySelector('#bmpl-prev').addEventListener('click', () => goTo(i - 1));
      overlay.querySelector('#bmpl-next').addEventListener('click', () => goTo(i + 1));
      overlay.querySelector('#bmpl-stop').addEventListener('click', stopPlaylist);
    };

    const goTo = (idx) => {
      const s = getState();
      const items = (getPlaylists()[s.name]) || [];
      if (idx < 0 || idx >= items.length) { stopPlaylist(); return; }
      saveState({ ...s, index: idx });
      window.location.href = `https://bandmaidprime.tokyo/movies/${items[idx]}`;
    };

    const stopPlaylist = () => {
      saveState(null);
      overlay.remove();
    };

    document.body.appendChild(overlay);
    render();

    // =====================
    // ⏱ AUTO-ADVANCE COUNTDOWN
    // =====================

    let countdownTimer = null;
    let countdownActive = false;

    const startCountdown = () => {
      if (countdownActive) return;
      const s = getState();
      const items = (getPlaylists()[s.name]) || [];
      if (s.index + 1 >= items.length) {
        // End of playlist
        const box = overlay.querySelector('#bmpl-countdown');
        if (box) box.innerHTML = `<div style="color:${C_ACCENT}; font-size:12px;">🎉 End of playlist</div>`;
        saveState({ ...s, playing: false });
        return;
      }
      countdownActive = true;
      let remaining = COUNTDOWN_SEC;
      const box = overlay.querySelector('#bmpl-countdown');

      const paint = () => {
        box.innerHTML = `
          <div style="font-size:12px; margin-bottom:4px;">Next up in <strong>${remaining}s</strong>…</div>
          <div class="bmpl-row">
            <button class="bmpl-btn primary" id="bmpl-skip">Skip ▶</button>
            <button class="bmpl-btn" id="bmpl-cancel">Cancel</button>
          </div>
        `;
        box.querySelector('#bmpl-skip').addEventListener('click', () => {
          clearInterval(countdownTimer); countdownActive = false;
          goTo(s.index + 1);
        });
        box.querySelector('#bmpl-cancel').addEventListener('click', () => {
          clearInterval(countdownTimer); countdownActive = false;
          box.innerHTML = `<div style="font-size:11px; color:${C_MUTED};">Auto-advance cancelled.</div>`;
        });
      };
      paint();

      countdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          countdownActive = false;
          goTo(s.index + 1);
        } else {
          const skipBtn = box.querySelector('strong');
          if (skipBtn) skipBtn.textContent = `${remaining}s`;
        }
      }, 1000);
    };

    // Listen for messages from the iframe bridge
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object' || d.source !== 'bm-playlist') return;
      if (d.action === 'ended') {
        startCountdown();
      } else if (d.action === 'autoplay-blocked') {
        showAutoplayFallback();
      } else if (d.action === 'autoplay-ok') {
        const box = overlay.querySelector('#bmpl-countdown');
        if (box) box.innerHTML = '';
      }
    });

    // Show a one-click play button when the browser blocks autoplay
    const showAutoplayFallback = () => {
      const box = overlay.querySelector('#bmpl-countdown');
      if (!box) return;
      box.innerHTML = `
        <div style="font-size:12px; margin-bottom:4px;">Browser blocked autoplay.</div>
        <button class="bmpl-btn primary" id="bmpl-clickplay" style="width:100%;">▶ Click to play</button>
      `;
      box.querySelector('#bmpl-clickplay').addEventListener('click', () => {
        const iframe = document.querySelector('iframe[src*="uliza.jp"]');
        if (iframe) iframe.contentWindow.postMessage({ action: 'play' }, '*');
        box.innerHTML = '';
      });
    };

    // Ask the iframe to autoplay once it exists (retry for a few seconds)
    const requestAutoplay = (attempt = 0) => {
      const iframe = document.querySelector('iframe[src*="uliza.jp"]');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ action: 'autoplay' }, '*');
      } else if (attempt < 20) {
        setTimeout(() => requestAutoplay(attempt + 1), 250);
      }
    };
    // Small delay so the iframe bridge has time to mount its listener
    setTimeout(requestAutoplay, 800);
  }

  // =====================
  // 🚀 ENTRY
  // =====================

  if (isUlizaFrame()) {
    setupIframeBridge();
    return;
  }

  window.addEventListener('load', () => {
    if (isVideoPage()) {
      mountNowPlayingOverlay();
    } else if (isListingPage()) {
      mountBuilderPanel();
    }
  });
})();
