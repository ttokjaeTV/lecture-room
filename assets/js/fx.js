/* 똑재TV 3안 — React Bits 에서 골라 온 효과들 (fx.css 와 짝). 블록 이름은 fx.css 와 같다.
   React Bits: MIT + Commons Clause, © David Haz — 사이트 안에서 쓰는 것은 허용
   움직임 줄이기를 켠 사람에게는 아무것도 하지 않는다(글자는 처음부터 완성된 상태). */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  function onceVisible(el, fn, threshold) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { io.disconnect(); fn(); }
    }, { threshold: threshold || 0.4 });
    io.observe(el);
  }

  /* ------------------------------------------------------------ [stroke] 윤곽이 그려진 뒤 채워지는 제목
     글자마다 실제 위치를 재서 같은 자리에 SVG 글자를 겹친다. 같은 글꼴로 그리므로 어긋나지 않는다. */
  function buildStroke(el) {
    var old = el.querySelector('.stroke-svg');
    if (old) old.remove();
    var node = null;
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.textContent.trim()) { node = c; break; }
    if (!node) return;
    var cs = getComputedStyle(el);
    var box = el.getBoundingClientRect();
    var ctx = document.createElement('canvas').getContext('2d');
    ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var asc = ctx.measureText(node.textContent).fontBoundingBoxAscent;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'stroke-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', box.width.toFixed(1));
    svg.setAttribute('height', box.height.toFixed(1));
    svg.style.font = 'inherit';
    var range = document.createRange();
    var text = node.textContent, k = 0;
    for (var i = 0; i < text.length; i++) {
      if (!text[i].trim()) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      var r = range.getClientRects()[0];
      if (!r) continue;
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', (r.left - box.left).toFixed(2));
      t.setAttribute('y', asc.toFixed(2));
      t.style.setProperty('--i', k++);
      t.textContent = text[i];
      svg.appendChild(t);
    }
    el.appendChild(svg);
    el.classList.add('stroke-host', 'is-stroked');
  }
  var strokes = document.querySelectorAll('[data-stroke]');
  if (strokes.length) {
    fontsReady.then(function () {
      Array.prototype.forEach.call(strokes, buildStroke);
      /* 화면 폭이 바뀌면 글자 위치를 다시 잰다(애니메이션은 다시 돌지 않게 끝난 상태로) */
      var rt;
      addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () {
          Array.prototype.forEach.call(strokes, function (el) {
            buildStroke(el);
            Array.prototype.forEach.call(el.querySelectorAll('.stroke-svg text'), function (t) {
              t.style.animation = 'none'; t.style.strokeDashoffset = '0'; t.style.fillOpacity = '1'; t.style.strokeOpacity = '0';
            });
          });
        }, 150);
      });
    });
  }

  /* ------------------------------------------------------------ [count] 숫자 올라가기
     data-count="16.8" data-decimals="1" data-suffix="만" (data-sep 이면 1,000 단위 쉼표)
     고민 아코디언 안에 있으면 그 칸이 펼쳐질 때마다 다시 센다. */
  function fmt(v, dec, sep) {
    var s = v.toFixed(dec);
    if (sep) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
    return s;
  }
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var sep = el.hasAttribute('data-sep');
    var suf = el.getAttribute('data-suffix') || '';
    var dur = 1300, t0 = null;
    cancelAnimationFrame(el._raf);
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e, dec, sep) + suf;
      if (p < 1) el._raf = requestAnimationFrame(step);
    }
    el._raf = requestAnimationFrame(step);
  }
  each('[data-count]', function (el) {
    if (el.closest('.acc__p')) return;           /* 아코디언 안 숫자는 아래 acc:change 에서 */
    onceVisible(el, function () { countUp(el); }, 0.6);
  });
  document.addEventListener('acc:change', function (e) {
    var panel = e.detail && e.detail.panel;
    if (!panel) return;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-count]'), countUp);
  });

  /* ------------------------------------------------------------ [rotate] 고민 칸이 바뀔 때 제목 단어도 바뀐다 */
  each('.rot', function (rot) {
    var words = (rot.getAttribute('data-words') || '').split('|');
    var cur = rot.querySelector('.rot__w');
    function widthOf(w) {
      var m = document.createElement('span');
      m.className = 'rot__w'; m.textContent = w;
      m.style.cssText = 'position:absolute;visibility:hidden;';
      rot.appendChild(m);
      var wd = m.getBoundingClientRect().width;
      m.remove();
      return wd;
    }
    function to(w) {
      if (!w || (cur && cur.textContent === w)) return;
      rot.style.width = rot.getBoundingClientRect().width + 'px';
      var next = document.createElement('span');
      next.className = 'rot__w is-in'; next.textContent = w;
      if (cur) { cur.classList.remove('is-in'); cur.classList.add('is-out'); var gone = cur; setTimeout(function () { gone.remove(); }, 420); }
      rot.appendChild(next);
      cur = next;
      requestAnimationFrame(function () { rot.style.width = widthOf(w) + 'px'; });
      setTimeout(function () { if (cur === next) rot.style.width = ''; }, 520);
    }
    document.addEventListener('acc:change', function (e) { to(words[e.detail.index]); });
  });

  /* ------------------------------------------------------------ [flap] 출발 안내판 */
  var POOL = '가나다라마바사아자차카타파하금세계좌배당연분기월주';
  each('[data-flap]', function (el) {
    var text = el.textContent;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    el.classList.add('flap');
    /* 낱말 단위로 묶어서, 줄이 바뀌어도 낱말 중간에서 끊기지 않게 */
    var cells = [], word = null;
    Array.prototype.forEach.call(text, function (ch) {
      var s = document.createElement('span');
      s.className = 'flap__c' + (ch.trim() ? '' : ' flap__c--sp');
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch.trim() ? ch : '\u00a0';
      s._final = ch;
      if (!ch.trim()) { el.appendChild(s); word = null; }
      else {
        if (!word) { word = document.createElement('span'); word.className = 'flap__w'; el.appendChild(word); }
        word.appendChild(s);
      }
      cells.push(s);
    });
    onceVisible(el, function () {
      var lastStop = 380 + (cells.length - 1) * 55;
      setTimeout(function () { el.classList.add('is-done'); }, lastStop + 350);
      cells.forEach(function (s, i) {
        if (!s._final.trim()) return;
        var stopAt = performance.now() + 380 + i * 55, last = 0;
        (function tick(t) {
          if (t >= stopAt) { s.textContent = s._final; s.classList.remove('is-flip'); return; }
          if (t - last > 70) {
            last = t;
            s.textContent = POOL[Math.floor(Math.random() * POOL.length)];
            s.classList.remove('is-flip'); void s.offsetWidth; s.classList.add('is-flip');
          }
          requestAnimationFrame(tick);
        })(performance.now());
      });
    }, 0.5);
  });

  /* ------------------------------------------------------------ [reveal] 스크롤을 따라 단어가 또렷해진다 */
  each('[data-reveal-words]', function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    var spans = words.map(function (w, i) {
      var s = document.createElement('span');
      s.className = 'rv-word'; s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      return s;
    });
    var ticking = false;
    function update() {
      ticking = false;
      var r = el.getBoundingClientRect(), vh = innerHeight;
      /* 문단 위가 화면 85% 지점에 오면 시작, 문단 아래가 화면 55% 지점에 오면 끝 */
      var p = (vh * 0.85 - r.top) / (vh * 0.85 - vh * 0.55 + r.height);
      p = Math.max(0, Math.min(1, p));
      var n = spans.length, at = p * (n + 2);
      spans.forEach(function (s, i) { s.style.setProperty('--v', Math.max(0, Math.min(1, at - i)).toFixed(2)); });
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', req);
    update();
  });

  /* ------------------------------------------------------------ [stack] 강의 주차 카드 쌓기 */
  each('.weeks[data-stack]', function (list) {
    list.classList.add('is-stack');
    var cards = Array.prototype.slice.call(list.children);
    cards.forEach(function (c, i) { c.style.setProperty('--i', i); });
    var ticking = false;
    function update() {
      ticking = false;
      cards.forEach(function (c, i) {
        var next = cards[i + 1];
        if (!next) { c.style.setProperty('--s', 1); c.style.setProperty('--b', 1); return; }
        var a = c.getBoundingClientRect(), b = next.getBoundingClientRect();
        var cover = Math.max(0, Math.min(1, (a.bottom - b.top) / a.height));   /* 다음 카드가 얼마나 덮었나 */
        c.style.setProperty('--s', (1 - cover * 0.05).toFixed(4));
        c.style.setProperty('--b', (1 - cover * 0.06).toFixed(4));
      });
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', req);
    update();
  });

  /* ============================================================ 2차로 더한 효과 (fx.css 같은 이름 블록과 짝) */
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------------------ [pillnav] 메뉴 하이라이트 */
  each('.bar__nav', function (nav) {
    if (!fine) return;
    var pill = document.createElement('span');
    pill.className = 'nav-pill'; pill.setAttribute('aria-hidden', 'true');
    nav.insertBefore(pill, nav.firstChild);
    Array.prototype.forEach.call(nav.querySelectorAll('a:not(.btn):not(.sns)'), function (a) {
      a.addEventListener('mouseenter', function () {
        pill.style.left = (a.offsetLeft - 12) + 'px';
        pill.style.width = (a.offsetWidth + 24) + 'px';
        pill.classList.add('is-on');
      });
    });
    nav.addEventListener('mouseleave', function () { pill.classList.remove('is-on'); });
  });

  /* ------------------------------------------------------------ [magnet] 버튼이 마우스 쪽으로 */
  if (fine) each('[data-magnet]', function (el) {
    var host = el.closest('.ch') || el;              /* 채널 카드 안 버튼은 카드 전체가 자석 범위 */
    var PAD = host === el ? 40 : 0, PULL = host === el ? 0.28 : 0.12;
    function move(e) {
      var r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
      var inside = e.clientX > hr.left - PAD && e.clientX < hr.right + PAD && e.clientY > hr.top - PAD && e.clientY < hr.bottom + PAD;
      if (!inside) { reset(); return; }
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      el.classList.add('is-pulled');
      el.style.translate = (dx * PULL).toFixed(1) + 'px ' + (dy * PULL).toFixed(1) + 'px';
    }
    function reset() { el.classList.remove('is-pulled'); el.style.translate = '0px 0px'; }
    document.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerleave', reset);
  });

  /* ------------------------------------------------------------ [spot] 카드 위 노란 빛 */
  if (fine) each('.spot', function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--sx', (e.clientX - r.left).toFixed(0) + 'px');
      el.style.setProperty('--sy', (e.clientY - r.top).toFixed(0) + 'px');
    });
    el.addEventListener('pointerleave', function () { el.style.setProperty('--sx', '-400px'); el.style.setProperty('--sy', '-400px'); });
  });

  /* ------------------------------------------------------------ [marq] 흐르는 주제 띠 (스크롤 속도에 반응) */
  each('.marq', function (band) {
    var rows = Array.prototype.map.call(band.querySelectorAll('.marq__row'), function (r) {
      return { track: r.querySelector('.marq__track'), dir: parseFloat(r.getAttribute('data-dir')) || 1, x: 0 };
    });
    var lastY = scrollY, boost = 0, visible = true, last = performance.now();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(band);
    addEventListener('scroll', function () { var y = scrollY; boost += (y - lastY) * 0.9; lastY = y; }, { passive: true });
    (function frame(t) {
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      boost *= 0.9;
      if (visible) rows.forEach(function (r) {
        var half = r.track.scrollWidth / 2;                    /* 같은 줄을 두 번 이어 붙여 끊김 없이 돈다 */
        r.x += r.dir * (40 + Math.abs(boost) * 6) * dt * (boost < -2 ? -1 : 1);
        if (r.x <= -half) r.x += half; if (r.x > 0) r.x -= half;
        r.track.style.transform = 'translate3d(' + r.x.toFixed(1) + 'px,0,0)';
      });
      requestAnimationFrame(frame);
    })(last);
  });

  /* ------------------------------------------------------------ [spark] 누르면 불꽃 */
  function burst(x, y, n, len) {
    var colors = ['#F8E04A', '#96181a', '#F8E04A', '#d4554d'];
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      s.className = 'spark';
      s.style.left = x + 'px'; s.style.top = (y - 10) + 'px';
      s.style.background = colors[i % colors.length];
      document.body.appendChild(s);
      var ang = (360 / n) * i + Math.random() * 12;
      var d = len * (0.7 + Math.random() * 0.5);
      var a = s.animate([
        { transform: 'rotate(' + ang + 'deg) translateY(0) scaleY(1)', opacity: 1 },
        { transform: 'rotate(' + ang + 'deg) translateY(' + (-d) + 'px) scaleY(.2)', opacity: 0 }
      ], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
      a.onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }
  }
  each('.slot', function (el) {
    el.addEventListener('click', function (e) {
      if (el.getAttribute('aria-pressed') === 'true') burst(e.clientX || el.getBoundingClientRect().left + el.offsetWidth / 2, e.clientY || el.getBoundingClientRect().top, 9, 26);
      var box = el.closest('.slots');
      setTimeout(function () {
        if (box && box.getAttribute('data-status') === 'success' && !box._cheered) {
          box._cheered = true;
          var r = box.getBoundingClientRect();
          burst(r.left + r.width / 2, r.top + r.height / 2, 16, 60);
        }
        if (box && box.getAttribute('data-status') !== 'success') box._cheered = false;
      }, 650);
    });
  });

  /* ------------------------------------------------------------ [appear] 섹션 제목 한 번 떠오르기 */
  each('.sec__head', function (h) {
    var r = h.getBoundingClientRect();
    if (r.top < innerHeight) return;                           /* 이미 화면에 보이는 건 건드리지 않는다 */
    h.classList.add('will-appear');
    onceVisible(h, function () { h.classList.add('is-in'); }, 0.2);
  });

  /* ------------------------------------------------------------ [xp] 스크롤하면 사진이 커진다 */
  each('.xp', function (sec) {
    var fig = sec.querySelector('.xp__fig'), ticking = false;
    function update() {
      ticking = false;
      var r = sec.getBoundingClientRect(), span = r.height - innerHeight;
      var p = span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 1;
      p = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   /* 처음과 끝을 부드럽게 */
      fig.style.setProperty('--p', p.toFixed(4));
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', req);
    update();
  });
})();
