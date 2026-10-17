/* TechText — React Bits(reactbits.dev/text-animations/tech-text) 컴포넌트를 React 없이 쓰도록 옮긴 것.
   원본: Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0
   사이트 안에서 쓰는 것은 허용되고, 이 컴포넌트 자체를 따로 팔거나 배포하는 것은 금지된다.

   사용법: TechText(요소, { text: '내 기준으로.', color: '#3A2F26', ... })
   요소에는 너비·높이가 있어야 한다. 돌려받은 함수를 부르면 멈춘다. */
(function (global) {
  'use strict';

  var LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var FALLOFF_STEPS = 8, SPRING = 320, DAMPING = 22;

  function approach(c, t, dt, s) { return c + (t - c) * (1 - Math.exp(-dt / s)); }
  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
    var n = parseInt(h.slice(0, 6), 16);
    return isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')'; }
  function noise() {
    var h = 2166136261;
    for (var i = 0; i < arguments.length; i++) {
      h = Math.imul(h ^ (arguments[i] | 0), 16777619);
      h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  }
  function signed(v) { return v > 0 ? '+' + v : v < 0 ? '−' + (-v) : '0'; }

  var DEFAULTS = {
    text: 'React Bits', fontFamily: '', fontWeight: 600, fontSize: 150, letterSpacing: -0.05,
    color: '#ffffff', accentColor: '#ffffff', reach: 200, softness: 0.7, dashLength: 4, dashGap: 2,
    strokeWidth: 1.5, lineStyle: 'dashed', reveal: 'letter', specks: 15, selection: true, labels: true,
    draggable: true, sweep: true, speed: 1
  };

  function TechText(container, opts) {
    var s = {};
    for (var k in DEFAULTS) s[k] = (opts && k in opts) ? opts[k] : DEFAULTS[k];
    for (var o in (opts || {})) if (!(o in s)) s[o] = opts[o];   /* align·inset·fitWidth·fitHeight·dy (사이트용으로 더한 옵션) */

    container.classList.add('tech-text');
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', s.text);
    var canvas = document.createElement('canvas');
    canvas.className = 'tech-text-canvas';
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var scratch = document.createElement('canvas');
    var scratchCtx = scratch.getContext('2d');
    if (!ctx || !scratchCtx) return function () {};

    var reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var width = 1, height = 1, dpr = 1, raf = 0, last = performance.now();
    var visible = true, alive = true, layoutKey = '', requestedFont = '';
    var word = null, glyphs = [], presence = 0, clock = 0, pulse = 0, placed = false, dragging = -1;
    var pointer = { x: 0, y: 0, inside: false }, grab = { x: 0, y: 0 }, lens = { x: 0, y: 0 };
    var frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

    function refreshFonts() { layoutKey = ''; wake(); }
    function family() { return s.fontFamily || getComputedStyle(container).fontFamily || 'sans-serif'; }
    function fontFor(size) { return s.fontWeight + ' ' + size + 'px ' + family(); }
    function setFont(t, size) {
      t.font = fontFor(size);
      if ('letterSpacing' in t) t.letterSpacing = (s.letterSpacing * size) + 'px';
      t.textAlign = 'left'; t.textBaseline = 'alphabetic';
    }

    function sprite(view, glyph, stroke) {
      var pad = Math.ceil(s.strokeWidth * 2 + 4);
      var left = glyph.box.x1 - pad, top = glyph.box.y1 - pad;
      var w = glyph.box.x2 - glyph.box.x1 + pad * 2, h = glyph.box.y2 - glyph.box.y1 + pad * 2;
      var image = document.createElement('canvas');
      image.width = Math.max(1, Math.ceil(w * dpr));
      image.height = Math.max(1, Math.ceil(h * dpr));
      var c = image.getContext('2d');
      if (!c) return { image: image, left: left, top: top };
      c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      setFont(c, view.size);
      if (stroke) {
        c.lineJoin = 'round'; c.lineWidth = s.strokeWidth * 2; c.lineCap = 'butt'; c.strokeStyle = s.color;
        if (s.lineStyle !== 'solid') c.setLineDash([Math.max(1, s.dashLength), Math.max(1, s.dashGap)]);
        c.strokeText(glyph.char, glyph.x, view.baseline);
        c.setLineDash([]);
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000000';
        c.fillText(glyph.char, glyph.x, view.baseline);
        c.globalCompositeOperation = 'source-over';
      } else {
        c.fillStyle = s.color;
        c.fillText(glyph.char, glyph.x, view.baseline);
      }
      return { image: image, left: left, top: top };
    }

    function ensureLayout() {
      var key = [s.text, family(), s.fontWeight, s.fontSize, s.letterSpacing, s.color, s.dashLength,
        s.dashGap, s.strokeWidth, s.lineStyle, width, height, dpr].join('|');
      if (key === layoutKey && word) return word;
      layoutKey = key;
      var wanted = fontFor(64);
      if (document.fonts && wanted !== requestedFont) {
        requestedFont = wanted;
        document.fonts.load(wanted, s.text).then(refreshFonts, refreshFonts);
      }
      var probe = scratchCtx;
      setFont(probe, s.fontSize);
      var m = probe.measureText(s.text);
      var fit = Math.min(1,
        (width * (s.fitWidth || 0.9)) / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1),
        (height * (s.fitHeight || 0.66)) / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1));
      var size = s.fontSize * fit;
      setFont(probe, size);
      m = probe.measureText(s.text);
      var inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      var inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      /* align: 'left' 를 주면 왼쪽 정렬 (사이트 제목과 줄을 맞추려고 추가) */
      var x = s.align === 'left' ? m.actualBoundingBoxLeft + (s.inset || 0) : (width - inkWidth) / 2 + m.actualBoundingBoxLeft;
      var baseline = (height - inkHeight) / 2 + m.actualBoundingBoxAscent;
      baseline += (s.dy || 0) * size;   /* 사이트 글줄과 기준선을 맞추는 미세 조정 */
      var next = {
        size: size, baseline: baseline,
        left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent
      };
      word = next;

      var chars = Array.from(s.text), previous = glyphs, prefix = '';
      glyphs = [];
      chars.forEach(function (ch, i) {
        prefix += ch;
        var own = probe.measureText(ch);
        var gx = x + probe.measureText(prefix).width - own.width;
        if (!ch.trim()) return;
        var base = {
          char: ch, x: gx,
          box: { x1: gx - own.actualBoundingBoxLeft, y1: baseline - own.actualBoundingBoxAscent,
                 x2: gx + own.actualBoundingBoxRight, y2: baseline + own.actualBoundingBoxDescent }
        };
        var kept = previous[glyphs.length];
        glyphs.push({
          char: base.char, x: base.x, box: base.box,
          offset: kept && kept.char === ch ? kept.offset : { x: 0, y: 0 },
          velocity: { x: 0, y: 0 }, outline: 0, index: i,
          fill: sprite(next, base, false), dashes: sprite(next, base, true)
        });
      });
      dragging = -1; frame.index = -1;
      return next;
    }

    function glyphAt(x, y) {
      if (!word || y < word.top - 24 || y > word.bottom + 24) return -1;
      var best = -1, bestD = Infinity;
      glyphs.forEach(function (g, i) {
        var x1 = g.box.x1 + g.offset.x, x2 = g.box.x2 + g.offset.x;
        var d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
        if (d < bestD) { bestD = d; best = i; }
      });
      return bestD < 28 ? best : -1;
    }

    function falloff(t, cx, cy, radius, strength, softness) {
      var inner = Math.min(1, Math.max(0, 1 - softness));
      var g = t.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, 'rgba(0, 0, 0, ' + strength + ')');
      if (inner > 0.995) { g.addColorStop(0.995, 'rgba(0, 0, 0, ' + strength + ')'); g.addColorStop(1, 'rgba(0, 0, 0, 0)'); return g; }
      for (var i = 0; i <= FALLOFF_STEPS; i++) {
        var tt = i / FALLOFF_STEPS, e = tt * tt * (3 - 2 * tt);
        g.addColorStop(inner + (1 - inner) * tt, 'rgba(0, 0, 0, ' + (strength * (1 - e)) + ')');
      }
      return g;
    }

    function blit(t, art, dx, dy, ox, oy) {
      t.drawImage(art.image, Math.round((art.left + dx) * dpr - ox), Math.round((art.top + dy) * dpr - oy));
    }

    function drawReveal() {
      var radius = s.reach * dpr, cx = lens.x * dpr, cy = lens.y * dpr;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = falloff(ctx, cx, cy, radius, presence, s.softness);
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.globalCompositeOperation = 'source-over';
      var x0 = Math.max(0, Math.floor(cx - radius)), y0 = Math.max(0, Math.floor(cy - radius));
      var x1 = Math.min(canvas.width, Math.ceil(cx + radius)), y1 = Math.min(canvas.height, Math.ceil(cy + radius));
      if (x1 <= x0 || y1 <= y0) return;
      var w = x1 - x0, h = y1 - y0;
      if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
      scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.clearRect(0, 0, w, h);
      glyphs.forEach(function (g) { blit(scratchCtx, g.dashes, g.offset.x, g.offset.y, x0, y0); });
      scratchCtx.globalCompositeOperation = 'destination-in';
      scratchCtx.fillStyle = falloff(scratchCtx, cx - x0, cy - y0, radius, 1, s.softness);
      scratchCtx.fillRect(0, 0, w, h);
      scratchCtx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = presence;
      ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
      ctx.globalAlpha = 1;
    }

    function crisp(v) { return (Math.round(v * dpr) + 0.5) / dpr; }

    function perimeterPoint(distance, w, h) {
      var P = 2 * (w + h), d = ((distance % P) + P) % P;
      if (d < w) return [frame.x1 + d, frame.y1, 0, -1];
      d -= w; if (d < h) return [frame.x2, frame.y1 + d, 1, 0];
      d -= h; if (d < w) return [frame.x2 - d, frame.y2, 0, 1];
      d -= w; return [frame.x1, frame.y2 - d, -1, 0];
    }

    function drawSpecks(a) {
      var w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
      if (w < 2 || h < 2) return;
      var perimeter = 2 * (w + h), seed = frame.index + 1, grid = 3;
      for (var k = 0; k < s.specks; k++) {
        var period = 0.5 + noise(seed, k, 11) * 1.2;
        var t = pulse / period + noise(seed, k, 17), cycle = Math.floor(t), life = t - cycle;
        if (life > 0.7) continue;
        var pp = perimeterPoint(noise(seed, k, cycle) * perimeter, w, h);
        var pick = noise(seed, k, cycle, 2);
        var size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
        var large = size >= 8;
        var out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
        var x = frame.x1 + Math.round((pp[0] + pp[2] * out - frame.x1) / grid) * grid;
        var y = frame.y1 + Math.round((pp[1] + pp[3] * out - frame.y1) / grid) * grid;
        var tone = noise(seed, k, cycle, 3);
        var blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
        var alpha = a * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
        var left = Math.round(x - size / 2), top = Math.round(y - size / 2);
        if (tone < 0.26 || (large && tone < 0.78)) {
          ctx.strokeStyle = rgba(s.accentColor, alpha);
          ctx.strokeRect(left + 0.5, top + 0.5, size, size);
          if (large && tone > 0.5) { ctx.fillStyle = rgba(s.accentColor, alpha); ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
        } else {
          ctx.fillStyle = rgba(s.accentColor, alpha);
          ctx.fillRect(left, top, size, size);
        }
      }
      for (var j = 0; j < 2; j++) {
        var head = (pulse * 0.42 * s.speed + j * 0.5) * perimeter;
        for (var i = 0; i < 4; i++) {
          var q = perimeterPoint(head - i * 6, w, h), sz = i === 0 ? 3 : 2;
          ctx.fillStyle = rgba(s.accentColor, a * [0.95, 0.55, 0.32, 0.16][i]);
          ctx.fillRect(Math.round(q[0] - sz / 2), Math.round(q[1] - sz / 2), sz, sz);
        }
      }
    }

    function drawFrame() {
      var g = glyphs[frame.index];
      if (!g || frame.alpha < 0.01) return;
      var a = frame.alpha, x1 = crisp(frame.x1), y1 = crisp(frame.y1), x2 = crisp(frame.x2), y2 = crisp(frame.y2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var moved = Math.hypot(g.offset.x, g.offset.y);
      if (moved > 1) {
        var hx = (g.box.x1 + g.box.x2) / 2, hy = (g.box.y1 + g.box.y2) / 2;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + g.offset.x, hy + g.offset.y);
        ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = rgba(s.accentColor, 0.45 * a); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
        ctx.fillStyle = rgba(s.accentColor, 0.7 * a); ctx.fill();
      }
      ctx.beginPath(); ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(s.accentColor, 0.5 * a); ctx.stroke();
      ctx.beginPath();
      [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach(function (c) { ctx.rect(Math.round(c[0]) - 2, Math.round(c[1]) - 2, 5, 5); });
      ctx.fillStyle = rgba(s.accentColor, 0.95 * a); ctx.fill();
      if (s.specks > 0) { ctx.lineWidth = 1; drawSpecks(a); }
      if (!s.labels) return;
      ctx.font = LABEL_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(s.accentColor, 0.62 * a);
      var label = moved > 1
        ? signed(Math.round(g.offset.x)) + ', ' + signed(Math.round(-g.offset.y))
        : g.char + '  ' + Math.round(g.box.x2 - g.box.x1) + ' × ' + Math.round(g.box.y2 - g.box.y1);
      ctx.fillText(label, Math.round(frame.x1), Math.round(frame.y1) - 7);
    }

    function tick(now) {
      raf = 0;
      var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      var view = ensureLayout();
      var sweeping = s.sweep && !reducedMotion && !pointer.inside && dragging < 0;
      if (sweeping) clock += dt * s.speed;
      pulse += dt;
      var tx = pointer.x, ty = pointer.y;
      if (sweeping) {
        tx = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
        ty = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
      }
      var active = pointer.inside || sweeping || dragging >= 0;
      if (active && !placed) { lens.x = tx; lens.y = ty; }
      if (active) {
        var lag = pointer.inside ? 0.05 : 0.22;
        lens.x = approach(lens.x, tx, dt, lag); lens.y = approach(lens.y, ty, dt, lag);
      }
      placed = active;
      presence = approach(presence, s.reveal === 'area' && active && dragging < 0 ? 1 : 0, dt, 0.16);

      var moving = false;
      glyphs.forEach(function (g, i) {
        if (i === dragging) {
          g.offset.x = approach(g.offset.x, pointer.x - grab.x, dt, 0.03);
          g.offset.y = approach(g.offset.y, pointer.y - grab.y, dt, 0.03);
          g.velocity.x = 0; g.velocity.y = 0; moving = true; return;
        }
        var o = g.offset, v = g.velocity;
        if (Math.abs(o.x) < 0.05 && Math.abs(o.y) < 0.05 && Math.hypot(v.x, v.y) < 0.5) { o.x = 0; o.y = 0; v.x = 0; v.y = 0; return; }
        v.x += (-SPRING * o.x - DAMPING * v.x) * dt; v.y += (-SPRING * o.y - DAMPING * v.y) * dt;
        o.x += v.x * dt; o.y += v.y * dt; moving = true;
      });

      var focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
      if (focus >= 0 && s.selection) {
        var g = glyphs[focus];
        var bx1 = g.box.x1 + g.offset.x - 6, by1 = g.box.y1 + g.offset.y - 6;
        var bx2 = g.box.x2 + g.offset.x + 6, by2 = g.box.y2 + g.offset.y + 6;
        if (frame.index < 0 || frame.alpha < 0.02) { frame.x1 = bx1; frame.y1 = by1; frame.x2 = bx2; frame.y2 = by2; }
        var glide = focus === dragging ? 0.02 : 0.08;
        frame.x1 = approach(frame.x1, bx1, dt, glide); frame.y1 = approach(frame.y1, by1, dt, glide);
        frame.x2 = approach(frame.x2, bx2, dt, glide); frame.y2 = approach(frame.y2, by2, dt, glide);
        frame.index = focus;
      }
      frame.alpha = approach(frame.alpha, focus >= 0 && s.selection ? 1 : 0, dt, 0.1);

      glyphs.forEach(function (g, i) {
        var target = s.reveal === 'letter' && i === focus && i !== dragging ? 1 : 0;
        g.outline = approach(g.outline, target, dt, 0.09);
        if (Math.abs(g.outline - target) > 0.002) moving = true; else g.outline = target;
      });

      if (s.draggable) container.style.cursor = dragging >= 0 ? 'grabbing' : focus >= 0 && pointer.inside ? 'grab' : '';

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      glyphs.forEach(function (g) {
        var m = Math.hypot(g.offset.x, g.offset.y);
        if (m > 1) { ctx.globalAlpha = Math.min(1, m / 24) * 0.55; blit(ctx, g.dashes, 0, 0, 0, 0); ctx.globalAlpha = 1; }
      });
      glyphs.forEach(function (g) {
        if (g.outline < 0.999) { ctx.globalAlpha = 1 - g.outline; blit(ctx, g.fill, g.offset.x, g.offset.y, 0, 0); }
        if (g.outline > 0.001) { ctx.globalAlpha = g.outline; blit(ctx, g.dashes, g.offset.x, g.offset.y, 0, 0); }
        ctx.globalAlpha = 1;
      });
      if (presence > 0.001) drawReveal();
      drawFrame();

      var settling = moving ||
        Math.abs(presence - (s.reveal === 'area' && active && dragging < 0 ? 1 : 0)) > 0.002 ||
        (frame.alpha > 0.01 && frame.alpha < 0.99);
      if ((active || settling) && visible && alive) raf = requestAnimationFrame(tick);
    }

    function wake() {
      if (raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function resize() {
      width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      layoutKey = ''; wake();
    }
    function locate(e) { var r = container.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; }
    function onMove(e) { locate(e); pointer.inside = true; wake(); }
    function onLeave() { if (dragging >= 0) return; pointer.inside = false; wake(); }
    function onDown(e) {
      locate(e); pointer.inside = true;
      if (s.draggable && (e.pointerType !== 'mouse' || e.button === 0)) {
        var i = glyphAt(pointer.x, pointer.y);
        if (i >= 0) {
          dragging = i; grab.x = pointer.x - glyphs[i].offset.x; grab.y = pointer.y - glyphs[i].offset.y;
          if (container.setPointerCapture) container.setPointerCapture(e.pointerId);
        }
      }
      wake();
    }
    function onUp(e) {
      if (dragging >= 0) {
        dragging = -1;
        if (container.releasePointerCapture) container.releasePointerCapture(e.pointerId);
        var r = container.getBoundingClientRect();
        pointer.inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
      wake();
    }

    container.addEventListener('pointermove', onMove, { passive: true });
    container.addEventListener('pointerenter', onMove, { passive: true });
    container.addEventListener('pointerdown', onDown, { passive: true });
    container.addEventListener('pointerup', onUp, { passive: true });
    container.addEventListener('pointercancel', onUp, { passive: true });
    container.addEventListener('pointerleave', onLeave, { passive: true });
    var ro = new ResizeObserver(resize); ro.observe(container);
    var io = new IntersectionObserver(function (en) { visible = en[0].isIntersecting; wake(); }); io.observe(container);
    if (document.fonts) document.fonts.ready.then(refreshFonts, refreshFonts);
    resize();

    return function destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      container.removeEventListener('pointermove', onMove); container.removeEventListener('pointerenter', onMove);
      container.removeEventListener('pointerdown', onDown); container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp); container.removeEventListener('pointerleave', onLeave);
    };
  }

  global.TechText = TechText;
})(window);
