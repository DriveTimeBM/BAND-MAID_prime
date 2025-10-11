// ==UserScript==
// @name         BAND-MAID Prime Video Describer (with Timestamps & Navigation)
// @namespace    https://bandmaidprime.tokyo/
// @version      1.4
// @description  Show Okyuji info with timestamps and next/previous part links from external JSON
// @author       DriveTimeBM
// @match        https://bandmaidprime.tokyo/movies/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';
  
    const GITHUB_JSON_URL =
      'https://raw.githubusercontent.com/DriveTimeBM/BAND-MAID_prime/main/data/setlists.json';
  
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
  
    // Create the overlay
    const renderSummary = (data, setlists) => {
      // 💥 Always remove any existing overlay first
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
        
      //let html = '<div style="height:120px;"></div>'; // spacer to push lower
      let html = '<br><br><br><br>'; // spacer to push lower
  
      if (data) {
        html += `<strong>🎸 Okyuji (Live Performance)</strong><br><br>`;
        html += `<strong>Title:</strong> ${data.title}<br>`;
        if (data.tour) html += `<strong>Tour:</strong> ${data.tour}<br>`;
        if (data.venue) html += `<strong>Venue:</strong> ${data.venue}<br>`;
        if (data.date) html += `<strong>Date:</strong> ${data.date}<br>`;
        if (data.notes) html += `<strong>Notes:</strong> ${data.notes}<br><br>`;
  
        if (data.setlist && data.setlist.length) {
          html += `<strong>Setlist:</strong><br><ol style="margin-top:4px;">`;
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
          // Super-Hackey fix for TamperMonkey duplicate issue.
          html += `<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br></div>`;
        }
      } else {
        html += '<br>';
      }
  
      const div = document.createElement('div');
      div.innerHTML = html;
  
      const titleElement = document.querySelector('h1, .movie-title');
      if (titleElement) titleElement.insertAdjacentElement('afterend', div);
  
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
  