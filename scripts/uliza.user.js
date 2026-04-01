// ==UserScript==
// @name         BAND-MAID PRIME Autoplay
// @namespace    http://tampermonkey.net/
// @version      1.0
// @match        https://player-api.p.uliza.jp/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function clickPlay() {
        // Uliza's play button - common class names to try
        const selectors = [
            '.vjs-big-play-button',
            '.vjs-play-button',
            'button.play',
            '[class*="play-button"]'
        ];

        for (const sel of selectors) {
            const btn = document.querySelector(sel);
            if (btn) {
                btn.click();
                return;
            }
        }
    }

    // Give the player a moment to initialize
    setTimeout(clickPlay, 2000);
})();