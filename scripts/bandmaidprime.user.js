// ==UserScript==
// @name         BAND-MAID Prime Video Describer (with Timestamps & Navigation)
// @namespace    https://bandmaidprime.tokyo/
// @version      2.3
// @description  Show Okyuji info with timestamps and next/previous part links from external JSON
// @author       DriveTimeBM
// @match        https://bandmaidprime.tokyo/movies/*
// @match        https://player-api.p.uliza.jp/*
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

  let setlistCache = null;

  // Fetch JSON from GitHub (MV3-compatible)
  const loadSetlists = async () => {
    if (setlistCache) return setlistCache;

    try {
      const res = await fetch(GITHUB_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setlistCache = await res.json();
      return setlistCache;
    } catch (err) {
      console.error('Failed to load setlists:', err);
      return {};
    }
  };

  // =====================
  // 🎬 IFRAME BRIDGE
  // =====================

  // Runs inside the Uliza iframe: listens for seek commands from parent
  // and controls the actual <video> element.
  const setupVideoControlMessageListener = () => {
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.action !== 'seek') return;

      // Video element may not be present yet; wait for it.
      const tryApply = () => {
        const video = document.querySelector('video');
        if (video) {
          video.currentTime = event.data.time;
          video.play();
          return true;
        }
        return false;
      };

      if (tryApply()) return;

      const observer = new MutationObserver((mutations, obs) => {
        if (tryApply()) obs.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  };

  // =====================
  // 🕒 TIME HELPERS
  // =====================

  const getSecondsFromTimeString = (timeStr) => {
    const [min, sec] = timeStr.split(':').map(Number);
    return min * 60 + sec;
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
        border: '2px solid #f2a2c0',
        borderRadius: '12px',
        padding: '12px 16px',
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

      // Search for song matches within setlists
      const setlists = await loadSetlists();
      const songMatches = [];
      for (const [vid, setlistObj] of Object.entries(setlists)) {
        if (Array.isArray(setlistObj.setlist)) {
          for (const entry of setlistObj.setlist) {
            if (entry.song && entry.song.toLowerCase().includes(query)) {
              songMatches.push({
                videoId: vid,
                title: setlistObj.title,
                song: entry.song,
                time: entry.time || null
              });
            }
          }
        }
      }

      if (!matches.length && !songMatches.length) {
        resultsBox.innerHTML = `<div style="color:#888;">No matches found.</div>`;
        return;
      }

      let html = '';
      if (matches.length) {
        html += matches
          .map(entry => {
            const title = entry.Title || '(No Title)';
            const cat = entry.Category ? `<span style="color:#999;">[${entry.Category}]</span> ` : '';
            const url = entry.URL || entry.Link || '#';
            return `<div style="margin-bottom:6px;"><a href="${url}" target="_blank" style="text-decoration:none; color:#d12d6d;">${cat}${title}</a></div>`;
          })
          .join('');
      }
      if (songMatches.length) {
        html += '<div style="margin:12px 0 4px 0;"><strong>In Setlists</strong></div>';
        html += songMatches
          .map(match => {
            const primeEntry = data.find(d => d.URL && d.URL.includes(match.videoId));
            const catText = primeEntry && primeEntry.Category ? `<span style="color:#999;">[${primeEntry.Category}]</span> ` : '';
            const seconds = match.time ? getSecondsFromTimeString(match.time) : null;
            const link = `https://bandmaidprime.tokyo/movies/${match.videoId}` + (seconds != null ? `#t=${seconds}` : '');
            const timeLabel = match.time ? `<span style="color:#888;">[${match.time}]</span> ` : '';
            return `<div style="margin-bottom:6px;"><a href="${link}" style="text-decoration:none; color:#2d6dd1;">${catText}${match.song} ${timeLabel}<span style="color:#999;">in</span> <span style="color:#d12d6d;">${match.title}</span></a></div>`;
          })
          .join('');
      }
      resultsBox.innerHTML = html;
    });
  }

  // =====================
  // 📋 OVERLAY
  // =====================

  // Create the overlay
  const renderSummary = (data, setlists) => {
    const existing = document.querySelector('#bandmaid-summary-box');
    if (existing) existing.remove();

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
            const seconds = getSecondsFromTimeString(entry.time);
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
    div.id = 'bandmaid-summary-box';
    div.innerHTML = html;
    Object.assign(div.style, {
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
    if (titleElement) titleElement.insertAdjacentElement('afterend', div);

    createSearchBox(div);

    // Timestamp jump
    div.addEventListener('click', e => {
      if (e.target.tagName === 'A' && e.target.href.includes('#t=')) {
        e.preventDefault();
        const seconds = Number(e.target.href.split('#t=')[1]);
        const video = document.querySelector('video');
        const videoIframe = document.querySelector('iframe[src*="uliza.jp"]');
        if (video) {
          video.currentTime = seconds;
          video.play();
        } else if (videoIframe) {
          videoIframe.contentWindow.postMessage({ action: 'seek', time: seconds }, '*');
        } else {
          window.location.hash = `t=${seconds}`;
        }
      }
    });
  };

  // =====================
  // 🚀 MAIN
  // =====================

  window.addEventListener('load', async () => {
    // If running inside the Uliza iframe, set up the video controller and stop.
    if (window.location.origin === 'https://player-api.p.uliza.jp') {
      setupVideoControlMessageListener();
      return;
    }

    const videoId = getVideoId();
    if (!videoId) return;

    // Handle #t=NNN arriving from "In Setlists" cross-page links
    if (window.location.hash.startsWith('#t=')) {
      const seconds = Number(window.location.hash.split('=')[1]);
      // Wait briefly for iframe to exist, then send seek
      const trySeek = (attempts = 0) => {
        const videoIframe = document.querySelector('iframe[src*="uliza.jp"]');
        if (videoIframe) {
          // Give the iframe's script a moment to mount its listener
          setTimeout(() => {
            videoIframe.contentWindow.postMessage({ action: 'seek', time: seconds }, '*');
          }, 1000);
        } else if (attempts < 20) {
          setTimeout(() => trySeek(attempts + 1), 250);
        }
      };
      trySeek();
      // Clean up the hash so refreshes don't re-seek
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    try {
      const setlists = await loadSetlists();
      renderSummary(setlists[videoId], setlists);
    } catch (err) {
      console.error('Failed to load BAND-MAID setlists:', err);
    }
  });
})();