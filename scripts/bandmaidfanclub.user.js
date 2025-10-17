// ==UserScript==
// @name         BAND-MAID FanClub Video Helper (MV3 Compatible)
// @namespace    https://bandmaid.tokyo/
// @version      1.3
// @description  Displays video titles, categories, and translation links from JSON for BAND-MAID Fan Club videos
// @author       DriveTimeBM
// @match        https://bandmaid.tokyo/movies/*
// @match        https://www.bandmaid.tokyo/movies/*
// @run-at       document-end
// @grant        none
// @connect      drivetimebm.github.io
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // CONFIG
  // -----------------------------------------------------------------------

  const FANCLUB_JSON_URL =
    'https://drivetimebm.github.io/BAND-MAID_gpt/fanclub/fanclub.json';

  const TRANSLATION_BASE =
    'https://drivetimebm.github.io/BAND-MAID_prime/translations/';

  // -----------------------------------------------------------------------
  // UTILITIES
  // -----------------------------------------------------------------------

  function getVideoId() {
    const m = location.pathname.match(/movies\/(\d+)/);
    return m ? m[1] : null;
  }

  function isFanClubMember() {
    // Detect MEMBER'S ONLY marker
    if (document.title.toUpperCase().startsWith("MEMBER'S ONLY")) return false;
    const heading = document.querySelector('h1, h2, .page-title');
    if (heading && heading.textContent.toUpperCase().includes("MEMBER'S ONLY"))
      return false;
    if (!document.querySelector('iframe, video')) return false;
    return true;
  }

  async function loadFanClubData() {
    try {
      // short MV3 delay to keep worker alive
      await new Promise(r => setTimeout(r, 250));

      const res = await fetch(FANCLUB_JSON_URL, { mode: 'cors' });
      if (!res.ok) throw new Error(res.statusText);

      const json = await res.json();
      console.log(`[BAND-MAID] Loaded fanclub.json (${Object.keys(json).length} items)`);
      return json;
    } catch (err) {
      console.error('[BAND-MAID] Failed to load fanclub.json:', err);
      return {};
    }
  }

  function createLinkButton(label, href, color = '#333', bg = '#f9d5e2') {
    const style = `
      color:${color};
      text-decoration:none;
      background:${bg};
      padding:6px 10px;
      border-radius:8px;
      display:inline-block;
      margin:4px;
    `;
    return `<a href="${href}" target="_blank" style="${style}">${label}</a>`;
  }

  // -----------------------------------------------------------------------
  // MAIN DISPLAY
  // -----------------------------------------------------------------------

  async function init() {
    console.log('[BAND-MAID] Initializing script...');

    const videoId = getVideoId();
    if (!videoId) {
      console.warn('[BAND-MAID] No videoId detected in URL');
      return;
    }

    const data = await loadFanClubData();
    const entry = data[videoId];
    if (!entry) {
      console.warn('[BAND-MAID] No entry found for video', videoId);
      return;
    }

    // Build info box
    const box = document.createElement('div');
    box.style.cssText = `
      background:#fff;
      border:2px solid #f09;
      border-radius:10px;
      padding:10px 14px;
      margin:10px auto;
      max-width:680px;
      font-family:Segoe UI, Roboto, sans-serif;
      font-size:14px;
      line-height:1.5;
      color:#222;
      box-shadow:0 2px 5px rgba(0,0,0,0.15);
    `;

    let html = `<h2 style="margin-top:0;color:#f09;">${entry.title}</h2>`;
    html += `<p><strong>Category:</strong> ${entry.venue || ''}</p>`;
    html += `<p><strong>Date:</strong> ${entry.date || ''}</p>`;

    // Previous / Next
    if (entry.previous || entry.next) {
      html += `<div style="margin-top:6px;">`;
      if (entry.previous)
        html += createLinkButton('⬅️ Previous', `https://bandmaid.tokyo/movies/${entry.previous}`);
      if (entry.next)
        html += createLinkButton('Next ➡️', `https://bandmaid.tokyo/movies/${entry.next}`);
      html += `</div>`;
    }

    // Translation link logic
    if (isFanClubMember() && entry.translation) {
      html += createLinkButton(
        'English Translation 🔠',
        `${TRANSLATION_BASE}${entry.translation}.txt`,
        '#fff',
        '#e83e8c'
      );
    } else if (!isFanClubMember() && entry.translation) {
      html += `<p style="margin-top:8px; color:#666; font-style:italic;">Translation available for members only 🔒</p>`;
    }

    box.innerHTML = html;

    // Insert box at top of body
    document.body.insertBefore(box, document.body.firstChild);
    console.log('[BAND-MAID] Info box inserted');
  }

  // -----------------------------------------------------------------------
  // INITIALIZE SAFELY (MV3 FIX)
  // -----------------------------------------------------------------------

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      await new Promise(r => setTimeout(r, 250)); // small MV3 delay
      await init();
      console.log('[BAND-MAID] Initialized successfully');
    } catch (err) {
      console.error('[BAND-MAID] Fatal init error:', err);
    }
  });
})();
