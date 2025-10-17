// ==UserScript==
// @name         BAND-MAID Prime Video Describer (with Timestamps & Navigation)
// @namespace    https://bandmaidprime.tokyo/
// @version      2.0
// @description  Show Okyuji info with timestamps and next/previous part links from external JSON
// @author       DriveTimeBM
// @match        https://bandmaidprime.tokyo/movies/*
// @connect      raw.githubusercontent.com
// @connect      drivetimebm.github.io
// ==/UserScript==

(function() {
  'use strict';

  const GITHUB_JSON_URL =
    'https://raw.githubusercontent.com/DriveTimeBM/BAND-MAID_prime/main/data/setlists.json';

  const PRIME_JSON_URL = 'https://drivetimebm.github.io/BAND-MAID_gpt/prime/prime.json';

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
  // 🔍 SEARCH FUNCTIONS
  // =====================

  let primeDataCache = null;

  /**
   * Loads the prime.json file and caches it.
   */
  async function loadPrimeData() {
    if (primeDataCache) return primeDataCache;

    try {
      const res = await fetch(PRIME_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      primeDataCache = await res.json();
      console.info('Loaded Prime JSON:', primeDataCache.length, 'entries');
      return primeDataCache;
    } catch (err) {
      console.error('Failed to load prime.json:', err);
      return [];
    }
  }

  /**
   * Creates and injects the search box above or below your overlay.
   */
  async function createSearchBox(container) {
    // Avoid duplicates
    if (document.querySelector('#bandmaid-search-box')) return;

    // Wait for overlay to actually render
    await new Promise(resolve => setTimeout(resolve, 300));

    const wrapper = document.createElement('div');
    wrapper.id = 'bandmaid-search-box';
    wrapper.style.margin = '15px 0 25px 0';
    wrapper.style.textAlign = 'left';
    wrapper.style.fontFamily = 'monospace';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '🔍 Search BAND-MAID Prime (e.g., BTS, DAY OF MAID)...';
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

    // Always visible: appended to body and positioned below overlay
    document.body.appendChild(wrapper);

    // Wait for overlay to finish expanding before positioning search box
    let lastHeight = 0;
    const tryPosition = () => {
      const overlay = document.querySelector('#bandmaid-summary-box');
      if (!overlay) return;

      const rect = overlay.getBoundingClientRect();
      if (rect.height !== lastHeight) {
        lastHeight = rect.height;
        setTimeout(tryPosition, 300);
        return;
      }

      const topOffset = window.scrollY + rect.bottom;
      const leftOffset = rect.left;
      const width = 300;

      Object.assign(wrapper.style, {
        position: 'absolute',
        left: `${leftOffset}px`,
        top: `${topOffset}px`,
        width: `${width}px`,
        zIndex: 9999,
        background: '#fffafc',
        border: '2px solid #f2a2c0',
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
      });
    };

    tryPosition();
    wrapper.style.marginTop = '40px';

    // Search behavior
    input.addEventListener('input', async e => {
      const query = e.target.value.trim().toLowerCase();
      resultsBox.innerHTML = '';

      if (!query) return;

      const data = await loadPrimeData();
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

  // Create the overlay
  const renderSummary = (data, setlists) => {
    const existing = document.querySelector('#bandmaid-summary-box');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'bandmaid-summary-box';
    container.style.marginTop = '20px';
    container.style.padding = '12px 16px';
    container.style.border = '2px solid #f2a2c0';
    container.style.borderRadius = '12px';
    container.style.backgroundColor = '#fffafc';
    container.style.fontFamily = 'monospace';
    container.style.lineHeight = '1.5';
      
    let html = '<br><br><br><br>';

    if (data) {
      html += `<strong>🎸 Supplemental Information 🎸</strong><br><br>`;
      html += `<strong>Title:</strong> ${data.title}<br>`;
      if (data.tour) html += `<strong>Tour:</strong> ${data.tour}<br>`;
      if (data.venue) html += `<strong>Venue:</strong> ${data.venue}<br>`;
      if (data.date) html += `<strong>Date:</strong> ${data.date}<br>`;
      if (data.notes) html += `<strong>Notes:</strong> ${data.notes}<br><br>`;

      if (data.setlist && data.setlist.length) {
        html += `<strong>Contents:</strong><br><ol style="margin-top:4px;">`;
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

      // Navigation buttons
      if (data.previous || data.next) {
        html += `<div style="margin-top:16px;">`;
        if (data.previous) {
          const prev = setlists[data.previous];
          html += `<a href="https://bandmaidprime.tokyo/movies/${data.previous}" style="margin-right:12px; color:#333; text-decoration:none; background:#f9d5e2; padding:6px 10px; border-radius:8px;">⬅️ Prev: ${prev ? prev.title.replace(/\[OKYUJI\]\s*/,'') : 'Part -'}</a><br><br>`;
        }
        if (data.next) {
          const next = setlists[data.next];
          html += `<a href="https://bandmaidprime.tokyo/movies/${data.next}" style="color:#333; text-decoration:none; background:#f9d5e2; padding:6px 10px; border-radius:8px;">Next: ${next ? next.title.replace(/\[OKYUJI\]\s*/,'') : 'Part +' } ➡️</a>`;
        }
        html += `</div>`;
      }
    } else {
      html += '<br>';
    }

    const div = document.createElement('div');
    div.innerHTML = html;

    const titleElement = document.querySelector('h1, .movie-title');
    if (titleElement) titleElement.insertAdjacentElement('afterend', div);

    createSearchBox(container);

    // Timestamp jump
    div.addEventListener('click', e => {
      if (e.target.tagName === 'A' && e.target.href.includes('#t=')) {
        e.preventDefault();
        const seconds = Number(e.target.href.split('#t=')[1]);
        const video = document.querySelector('video');
        if (video) {
          video.currentTime = seconds;
          video.play();
        } else {
          window.location.hash = `t=${seconds}`;
        }
      }
    });
  };

  // Main
  window.addEventListener('load', async () => {
    const videoId = getVideoId();
    if (!videoId) return;

    try {
      const setlists = await loadSetlists();
      renderSummary(setlists[videoId], setlists);
    } catch (err) {
      console.error('Failed to load BAND-MAID setlists:', err);
    }
  });
})();