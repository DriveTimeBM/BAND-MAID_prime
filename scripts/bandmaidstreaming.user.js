// ==UserScript==
// @name         BAND-MAID Streaming Links Search
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Search and display streaming links for BAND-MAID songs
// @author       You
// @match        https://drivetimebm.github.io/BAND-MAID_*/index.html
// @grant        GM_xmlhttpRequest
// @connect      drivetimebm.github.io
// ==/UserScript==

(function() {
    'use strict';

    let streamingData = [];

    // Create and inject search box
    function createSearchBox() {
        const searchContainer = document.createElement('div');
        searchContainer.id = 'bm-search-container';
        searchContainer.style.cssText = `
            position: fixed;
            top: 40px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            min-width: 300px;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
        `;

        searchContainer.innerHTML = `
            <div style="margin-bottom: 10px;">
                <input type="text" id="bm-search-input" placeholder="Search songs..."
                    style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div id="bm-search-results" style="margin-top: 10px;"></div>
        `;

        document.body.appendChild(searchContainer);

        // Add event listener for search
        const searchInput = document.getElementById('bm-search-input');
        searchInput.addEventListener('input', performSearch);
    }

    // Fetch streaming links JSON
    function fetchStreamingData() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://drivetimebm.github.io/BAND-MAID_gpt/songs/streaming_links.json',
            onload: function(response) {
                try {
                    streamingData = JSON.parse(response.responseText);
                    console.log('Streaming data loaded:', streamingData.length, 'entries');
                } catch (e) {
                    console.error('Error parsing streaming data:', e);
                }
            },
            onerror: function(error) {
                console.error('Error fetching streaming data:', error);
            }
        });
    }

    // Perform search
    function performSearch() {
        const query = document.getElementById('bm-search-input').value.toLowerCase().trim();
        const resultsContainer = document.getElementById('bm-search-results');

        if (query.length === 0) {
            resultsContainer.innerHTML = '';
            return;
        }

        // Filter data based on Song and Title fields
        const matches = streamingData.filter(item =>
            item.Song.toLowerCase().includes(query) ||
            item.Title.toLowerCase().includes(query)
        );

        // Display results
        if (matches.length === 0) {
            resultsContainer.innerHTML = '<div style="color: #666; font-style: italic;">No results found</div>';
            return;
        }

        // Group by Song for better display
        const grouped = {};
        matches.forEach(item => {
            if (!grouped[item.Song]) {
                grouped[item.Song] = [];
            }
            grouped[item.Song].push(item);
        });

        let html = '';
        for (const song in grouped) {
            html += `<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">`;
            html += `<div style="font-weight: bold; margin-bottom: 8px; color: #333;">${song}</div>`;

            grouped[song].forEach(item => {
                const streamText = item.Streams > 0 ? item.Streams.toLocaleString() : 'N/A';
                html += `
                    <div style="margin-left: 10px; margin-bottom: 5px;">
                        <a href="${item.URL}" target="_blank" style="color: #0066cc; text-decoration: none; display: block; padding: 4px 0;">
                            ${item.Service} • ${item.Title} • ${streamText}
                        </a>
                    </div>
                `;
            });

            html += '</div>';
        }

        resultsContainer.innerHTML = html;
    }

    // Initialize
    window.addEventListener('load', function() {
        createSearchBox();
        fetchStreamingData();
    });
})();