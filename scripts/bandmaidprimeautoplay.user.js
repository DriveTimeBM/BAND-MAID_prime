// ==UserScript==
// @name         BAND-MAID PRIME Autoplay
// @namespace    http://tampermonkey.net/
// @version      1.0
// @match        https://bandmaidprime.tokyo/movies/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function tryAutoplay() {
        const iframe = document.getElementById('ulizaplayer-iframe');
        if (!iframe) return;

        const url = new URL(iframe.src);
        url.searchParams.set('autoplay', '1');
        iframe.src = url.toString();
    }

    // Wait for iframe to be in the DOM
    const observer = new MutationObserver(() => {
        const iframe = document.getElementById('ulizaplayer-iframe');
        if (iframe) {
            observer.disconnect();
            tryAutoplay();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also try immediately in case DOM is already ready
    tryAutoplay();
})();