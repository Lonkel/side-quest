// target-cursor.js
// Vanilla-JavaScript-Version für eine bestehende HTML/CSS/JS-Anwendung.
// Abhängigkeit: GSAP muss vor dieser Datei geladen werden.

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
    spinDuration: 2,
    hideDefaultCursor: false, //false = normaler Cursor
    hoverDuration: 0.2,
    parallaxOn: true,
    cursorColor: '#ffffff',
    cursorColorOnTarget: '#00d4ff',
    borderWidth: 3,
    cornerSize: 12
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

  function getContainingBlock(element) {
    let node = element?.parentElement;

    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);

      if (
        style.transform !== 'none' ||
        style.perspective !== 'none' ||
        style.filter !== 'none' ||
        style.willChange.includes('transform') ||
        style.willChange.includes('perspective') ||
        style.willChange.includes('filter') ||
        /paint|layout|strict|content/.test(style.contain)
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return null;
  }

  function getContainingBlockOffset(block) {
    if (!block) return { x: 0, y: 0 };

    const rect = block.getBoundingClientRect();
    return {
      x: rect.left + block.clientLeft,
      y: rect.top + block.clientTop
    };
  }

  function createCursorElement() {
    const cursor = document.createElement('div');
    cursor.id = 'targetCursor';
    cursor.className = 'target-cursor-wrapper';
    cursor.innerHTML = `
      <div class="target-cursor-dot"></div>
      <div class="target-cursor-corner corner-tl"></div>
      <div class="target-cursor-corner corner-tr"></div>
      <div class="target-cursor-corner corner-br"></div>
      <div class="target-cursor-corner corner-bl"></div>
    `;

    document.body.appendChild(cursor);
    return cursor;
  }

  function initTargetCursor() {
    if (isTouchDevice()) return;

    if (typeof gsap === 'undefined') {
      console.error('Target Cursor: GSAP wurde nicht gefunden.');
      return;
    }

    const existingCursor = document.getElementById('targetCursor');
    const cursor = existingCursor || createCursorElement();
    const dot = cursor.querySelector('.target-cursor-dot');
    const corners = Array.from(cursor.querySelectorAll('.target-cursor-corner'));

    if (corners.length !== 4) {
      console.error('Target Cursor: Vier Cursor-Ecken wurden nicht gefunden.');
      return;
    }

    const originalCursor = document.body.style.cursor;
    if (config.hideDefaultCursor) {
      document.body.style.cursor = 'none';
    }

    const containingBlockRef = { current: getContainingBlock(cursor) };
    const state = {
      activeTarget: null,
      targetPositions: null,
      activeStrength: { value: 0 },
      leaveHandler: null,
      resumeTimeout: null,
      spinTimeline: null,
      ticker: null
    };

    const getOffset = () => getContainingBlockOffset(containingBlockRef.current);

    function moveCursor(x, y) {
      const offset = getOffset();

      gsap.to(cursor, {
        x: x - offset.x,
        y: y - offset.y,
        duration: 0.1,
        ease: 'power3.out',
        overwrite: 'auto'
      });
    }

    function resetCornerPositions() {
      const size = config.cornerSize;
      const positions = [
        { x: -size * 1.5, y: -size * 1.5 },
        { x: size * 0.5, y: -size * 1.5 },
        { x: size * 0.5, y: size * 0.5 },
        { x: -size * 1.5, y: size * 0.5 }
      ];

      corners.forEach((corner, index) => {
        gsap.to(corner, {
          x: positions[index].x,
          y: positions[index].y,
          duration: 0.3,
          ease: 'power3.out',
          overwrite: 'auto'
        });
      });
    }

    function setTargetColor(color) {
      gsap.to(corners, {
        borderColor: color,
        duration: 0.15,
        ease: 'power2.out',
        overwrite: 'auto'
      });

      gsap.to(dot, {
        backgroundColor: color,
        duration: 0.15,
        ease: 'power2.out',
        overwrite: 'auto'
      });
    }

    function startSpin() {
      if (state.spinTimeline) state.spinTimeline.kill();

      state.spinTimeline = gsap.timeline({ repeat: -1 }).to(cursor, {
        rotation: '+=360',
        duration: config.spinDuration,
        ease: 'none'
      });
    }

    function stopSpin() {
      if (state.spinTimeline) {
        state.spinTimeline.pause();
      }

      gsap.killTweensOf(cursor, 'rotation');
      gsap.set(cursor, { rotation: 0 });
    }

    function updateParallax() {
      if (!state.targetPositions || state.activeStrength.value === 0) return;

      const cursorX = Number(gsap.getProperty(cursor, 'x')) || 0;
      const cursorY = Number(gsap.getProperty(cursor, 'y')) || 0;
      const strength = state.activeStrength.value;

      corners.forEach((corner, index) => {
        const currentX = Number(gsap.getProperty(corner, 'x')) || 0;
        const currentY = Number(gsap.getProperty(corner, 'y')) || 0;
        const target = state.targetPositions[index];
        const duration = strength >= 0.99 && config.parallaxOn ? 0.2 : 0.05;

        gsap.to(corner, {
          x: currentX + (target.x - cursorX - currentX) * strength,
          y: currentY + (target.y - cursorY - currentY) * strength,
          duration,
          ease: duration === 0 ? 'none' : 'power1.out',
          overwrite: 'auto'
        });
      });
    }

    function leaveTarget(target) {
      if (state.ticker) gsap.ticker.remove(state.ticker);

      if (state.leaveHandler && target) {
        target.removeEventListener('mouseleave', state.leaveHandler);
      }

      state.leaveHandler = null;
      state.activeTarget = null;
      state.targetPositions = null;
      state.activeStrength.value = 0;

      setTargetColor(config.cursorColor);
      resetCornerPositions();

      if (state.resumeTimeout) clearTimeout(state.resumeTimeout);

      state.resumeTimeout = setTimeout(() => {
        if (!state.activeTarget) startSpin();
        state.resumeTimeout = null;
      }, 50);
    }

    function enterTarget(target) {
      if (!target || state.activeTarget === target) return;

      if (state.activeTarget) leaveTarget(state.activeTarget);
      if (state.resumeTimeout) clearTimeout(state.resumeTimeout);

      state.activeTarget = target;
      stopSpin();

      if (config.cursorColorOnTarget) {
        setTargetColor(config.cursorColorOnTarget);
      }

      const rect = target.getBoundingClientRect();
      const offset = getOffset();
      const cursorX = Number(gsap.getProperty(cursor, 'x')) || 0;
      const cursorY = Number(gsap.getProperty(cursor, 'y')) || 0;
      const { borderWidth, cornerSize } = config;

      state.targetPositions = [
        { x: rect.left - borderWidth - offset.x, y: rect.top - borderWidth - offset.y },
        { x: rect.right + borderWidth - cornerSize - offset.x, y: rect.top - borderWidth - offset.y },
        { x: rect.right + borderWidth - cornerSize - offset.x, y: rect.bottom + borderWidth - cornerSize - offset.y },
        { x: rect.left - borderWidth - offset.x, y: rect.bottom + borderWidth - cornerSize - offset.y }
      ];

      gsap.to(state.activeStrength, {
        value: 1,
        duration: config.hoverDuration,
        ease: 'power2.out',
        overwrite: true
      });

      corners.forEach((corner, index) => {
        gsap.to(corner, {
          x: state.targetPositions[index].x - cursorX,
          y: state.targetPositions[index].y - cursorY,
          duration: 0.2,
          ease: 'power2.out',
          overwrite: 'auto'
        });
      });

      state.ticker = updateParallax;
      gsap.ticker.add(state.ticker);

      state.leaveHandler = () => leaveTarget(target);
      target.addEventListener('mouseleave', state.leaveHandler);
    }

    const initialOffset = getOffset();
    gsap.set(cursor, {
      xPercent: -50,
      yPercent: -50,
      x: window.innerWidth / 2 - initialOffset.x,
      y: window.innerHeight / 2 - initialOffset.y,
      autoAlpha: 1
    });

    corners.forEach(corner => {
      gsap.set(corner, {
        borderColor: config.cursorColor,
        x: 0,
        y: 0
      });
    });

    gsap.set(dot, { backgroundColor: config.cursorColor });
    startSpin();

    const moveHandler = event => moveCursor(event.clientX, event.clientY);

    const mouseOverHandler = event => {
      const target = event.target.closest(config.targetSelector);
      if (target) enterTarget(target);
    };

    const scrollHandler = () => {
      if (!state.activeTarget) return;

      const offset = getOffset();
      const mouseX = (Number(gsap.getProperty(cursor, 'x')) || 0) + offset.x;
      const mouseY = (Number(gsap.getProperty(cursor, 'y')) || 0) + offset.y;
      const element = document.elementFromPoint(mouseX, mouseY);
      const stillOverTarget = element && (
        element === state.activeTarget ||
        element.closest(config.targetSelector) === state.activeTarget
      );

      if (!stillOverTarget) leaveTarget(state.activeTarget);
    };

    const mouseDownHandler = () => {
      gsap.to(dot, { scale: 0.7, duration: 0.3 });
      gsap.to(cursor, { scale: 0.9, duration: 0.2 });
    };

    const mouseUpHandler = () => {
      gsap.to(dot, { scale: 1, duration: 0.3 });
      gsap.to(cursor, { scale: 1, duration: 0.2 });
    };

    const resizeHandler = () => {
      containingBlockRef.current = getContainingBlock(cursor);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseover', mouseOverHandler, { passive: true });
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('mouseup', mouseUpHandler);
    window.addEventListener('resize', resizeHandler);

    window.targetCursorCleanup = () => {
      if (state.ticker) gsap.ticker.remove(state.ticker);
      if (state.activeTarget && state.leaveHandler) {
        state.activeTarget.removeEventListener('mouseleave', state.leaveHandler);
      }
      if (state.resumeTimeout) clearTimeout(state.resumeTimeout);
      if (state.spinTimeline) state.spinTimeline.kill();

      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseover', mouseOverHandler);
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('mousedown', mouseDownHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
      window.removeEventListener('resize', resizeHandler);

      document.body.style.cursor = originalCursor;
      cursor.remove();
      delete window.targetCursorCleanup;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTargetCursor, { once: true });
  } else {
    initTargetCursor();
  }
})();

