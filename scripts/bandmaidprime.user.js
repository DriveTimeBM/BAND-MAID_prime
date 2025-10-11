// ==UserScript==
// @name         BAND-MAID Prime Video Describer (with Timestamps)
// @namespace    https://bandmaidprime.tokyo/
// @version      1.3
// @description  Display BAND-MAID Prime Okyuji info with timestamped setlist from external JSON
// @author       DriveTimeBM
// @match        https://bandmaidprime.tokyo/movies/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';
  
    const GITHUB_JSON_URL =
      'https://raw.githubusercontent.com/DriveTimeBM/BAND-MAID_prime/main/data/setlists.json';
  
    // Helper: Extract numeric video ID from URL
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
  
    const renderSummary = (data) => {
      const container = document.createElement('div');
      container.style.marginTop = '20px';
      container.style.padding = '12px 16px';
      container.style.border = '2px solid #f2a2c0';
      container.style.borderRadius = '12px';
      container.style.backgroundColor = '#fffafc';
      container.style.fontFamily = 'monospace';
      container.style.lineHeight = '1.5';
  
      let html = '';
  
      if (data) {
        html += `-`
        html += `-`
        html += `-`
        html += `-`
        html += `-`
        html += `-`
        html += `<strong>🎸 Okyuji (Live Performance)</strong><br><br>`;
        html += `<strong>Title:</strong> ${data.title}<br>`;
        if (data.tour) html += `<strong>Tour:</strong> ${data.tour}<br>`;
        if (data.venue) html += `<strong>Venue:</strong> ${data.venue}<br>`;
        if (data.date) html += `<strong>Date:</strong> ${data.date}<br>`;
        if (data.notes) html += `<strong>Notes:</strong> ${data.notes}<br><br>`;
  
        if (data.setlist && data.setlist.length) {
          html += `<strong>Setlist:</strong><br>`;
          html += `<ol style="margin-top:4px;">`;
          for (const entry of data.setlist) {
            if (entry.time) {
              const [min, sec] = entry.time.split(':').map(Number);
              const seconds = min * 60 + sec;
              html += `<li><a href="#t=${seconds}" style="color:#d12d6d; text-decoration:none;">[${entry.time}]</a> ${entry.song}</li>`;
            } else {
              html += `<li>${entry.song}</li>`;
            }
          }
          html += `</ol>`;
        }
      } else {
        html += '📺 This appears to be a non-Okyuji (interview or behind-the-scenes) video.';
      }
  
      const div = document.createElement('div');
      div.innerHTML = html;
  
      const titleElement = document.querySelector('h1, .movie-title');
      if (titleElement) titleElement.insertAdjacentElement('afterend', div);
        

      // Jump to time in video if user clicks timestamp
      div.addEventListener('click', e => {
        if (e.target.tagName === 'A' && e.target.href.includes('#t=')) {
          e.preventDefault();
          const seconds = Number(e.target.href.split('#t=')[1]);
          const video = document.querySelector('video');
          if (video) {
            video.currentTime = seconds;
            video.play();
          } else {
            // fallback: scroll to video section
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
        renderSummary(setlists[videoId]);
      } catch (err) {
        console.error('Failed to load BAND-MAID setlists:', err);
      }
    });
  })();
  