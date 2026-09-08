// target-cursor.js
// Minimal: markiert interaktive Elemente unter dem Cursor mit Neon-Lila-Rahmen.

(function () {
  'use strict';

  const config = {
    targetSelector: [
      '.cursor-target',
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '[role="button"]'
    ].join(','),
  };

  function isTouchDevice() {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const smallScreen = window.innerWidth <= 768;
    const userAgent = navigator.userAgent || '';
    const mobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent.toLowerCase()
    );

    return (hasTouch && smallScreen) || mobileUserAgent;
  }

  function initHighlightCursor() {
    if (isTouchDevice()) return; // Auf Touch-Geräten nichts tun

    let currentTarget = null;
    let lastX = 0;
    let lastY = 0;

    function updateHighlight(x, y) {
      const element = document.elementFromPoint(x, y);
      const target = element ? element.closest(config.targetSelector) : null;

      if (target === currentTarget) return;

      if (currentTarget) {
        currentTarget.classList.remove('cursor-highlight');
      }

      if (target) {
        target.classList.add('cursor-highlight');
        currentTarget = target;
      } else {
        currentTarget = null;
      }
    }

    function pointerMoveHandler(event) {
      lastX = event.clientX;
      lastY = event.clientY;
      updateHighlight(lastX, lastY);
    }

    function scrollHandler() {
      if (lastX === 0 && lastY === 0) return;
      updateHighlight(lastX, lastY);
    }

    document.addEventListener('pointermove', pointerMoveHandler);
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Cleanup-Hook, falls du ihn irgendwo aufrufen willst
    window.targetCursorCleanup = () => {
      document.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('scroll', scrollHandler);
      if (currentTarget) {
        currentTarget.classList.remove('cursor-highlight');
        currentTarget = null;
      }
      delete window.targetCursorCleanup;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHighlightCursor, { once: true });
  } else {
    initHighlightCursor();
  }
})();
