// ==UserScript==
// @name         BAND-MAID FanClub Video Describer (with Timestamps & Navigation)
// @namespace    https://bandmaid.tokyo/
// @version      1.0
// @description  Show video info with timestamps and next/previous part links from external JSON
// @author       DriveTimeBM
// @match        https://bandmaid.tokyo/movies/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';
  
    const GITHUB_JSON_URL =
      'https://raw.githubusercontent.com/DriveTimeBM/BAND-MAID_prime/main/data/fanclub.json';
  
    // Extract numeric video ID from URL
    const getVideoId = () => {
      const match = window.location.pathname.match(/movies\/(\d+)/);
      return match ? match[1] : null;
    };
  
    // Fetch JSON from GitHub
    const loadSetlists = () =>
      new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: GITHUB_JSON_URL,
          onload: res => {
            try {
              resolve(JSON.parse(res.responseText));
            } catch (e) {
              reject(e);
            }
          },
          onerror: reject
        });
      });
  
    // ** SEARCH **
// =====================
// 🔍 SEARCH FUNCTIONS
// =====================

// URL of your FanClub data JSON
const FANCLUB_JSON_URL = 'https://drivetimebm.github.io/BAND-MAID_gpt/fanclub/fanclub.json';

let fanclubDataCache = null;

/**
 * Loads the fanclub.json file and caches it.
 */
async function loadFanClubData() {
  if (fanclubDataCache) return fanclubDataCache;

  try {
    const res = await fetch(FANCLUB_JSON_URL);
    fanclubDataCache = await res.json();
    console.info('Loaded FanClub JSON:', fanclubDataCache.length, 'entries');
    return fanclubDataCache;
  } catch (err) {
    console.error('Failed to load fanclub.json:', err);
    return [];
  }
}

/**
 * Creates and injects the search box above or below your overlay.
 * @param {HTMLElement} container The overlay container element.
 */
async function createSearchBox(container) {
  // Avoid duplicates
  if (document.querySelector('#fanclub-search-box')) return;

  // Wait for overlay to actually render
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
  input.style.color = '#333';              // dark gray readable text
  input.style.backgroundColor = '#fff';    // solid white background
  
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

  // ** Insertion block **

// ✅ Always visible: appended to body and positioned *below* overlay
if (document.querySelector('#fanclub-search-box')) return;

document.body.appendChild(wrapper);

document.body.appendChild(wrapper);

// ✅ Wait for overlay to finish expanding before positioning search box
let lastHeight = 0;
const tryPosition = () => {
  const overlay = document.querySelector('fanclub-summary-box');
  if (!overlay) return;

  const rect = overlay.getBoundingClientRect();
  if (rect.height !== lastHeight) {
    lastHeight = rect.height;
    // Keep checking until height stops changing
    setTimeout(tryPosition, 300);
    return;
  }

  // Once stable, position the search box
  const topOffset = window.scrollY + rect.bottom + 0; // adjust spacing here
  const leftOffset = rect.left;
  //const width = rect.width;
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

// Start checking right away
tryPosition();



// *END Insertion block
  
  // Add spacing so it never overlaps site header
  wrapper.style.marginTop = '40px';
  

  // --- Search behavior ---
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


    // ** end SEARCH **

    function isFanClubMember() {
      // Normalize text for comparison
      const title = document.title.trim().toUpperCase();
    
      // 1. Title check
      if (title.startsWith("MEMBER'S ONLY")) {
        return false;
      }
    
      // 2. Visible heading check
      const restricted = Array.from(document.querySelectorAll("h1, h2, .page-title"))
        .some(el => el.textContent.trim().toUpperCase().includes("MEMBER'S ONLY"));
    
      if (restricted) return false;
    
      // 3. No video iframe or player present (extra fallback)
      if (!document.querySelector("iframe, video")) {
        return false;
      }
    
      // If none of the above matched, assume the user is logged in
      return true;
    }
    

    // Create the overlay
    const renderSummary = (data, setlists) => {
      // 💥 Always remove any existing overlay first
      const existing = document.querySelector('fanclub-summary-box');
      if (existing) existing.remove();

      const container = document.createElement('div');
      container.id = 'fanclub-summary-box';
      container.style.marginTop = '20px';
      container.style.padding = '12px 16px';
      container.style.border = '2px solid #f2a2c0';
      container.style.borderRadius = '12px';
      container.style.backgroundColor = '#fffafc';
      container.style.fontFamily = 'monospace';
      container.style.lineHeight = '1.5';
        
      //let html = '<div style="height:120px;"></div>'; // spacer to push lower
      let html = '<br><br><br><br>'; // spacer to push lower
  
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
        if (data.previous || data.next || data.translation) {
          html += `<div style="margin-top:16px;">`;
          if (data.previous) {
            const prev = setlists[data.previous];
            html += `<a href="https://bandmaid.tokyo/movies/${data.previous}" style="margin-right:12px; color:#333; text-decoration:none; background:#f9d5e2; padding:6px 10px; border-radius:8px;">⬅️ Prev: ${prev ? prev.title.replace(/\[OKYUJI\]\s*/,'') : 'Part -'}</a><br><br>`;
          }
          if (data.next) {
            const next = setlists[data.next];
            html += `<a href="https://bandmaid.tokyo/movies/${data.next}" style="color:#333; text-decoration:none; background:#f9d5e2; padding:6px 10px; border-radius:8px;">Next: ${next ? next.title.replace(/\[OKYUJI\]\s*/,'') : 'Part +' } ➡️</a>`;
          }
          if (isFanClubMember() && data.translation) {
            html += `<br><a href="https://drivetimebm.github.io/BAND-MAID_prime/Translations/${data.translation}.txt" target="_blank" style="color:#f09; border:2px solid #f09; text-decoration:none; padding:5px 9px; border-radius:8px; background:transparent; display:inline-block; margin-top:6px;">English Translation: 🔠</a>`;
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
  
      // ** SEARCH **
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
  