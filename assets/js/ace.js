/* 똑재TV 3안 — Aceternity UI 에서 아이디어만 가져와 새로 짠 효과들 (ace.css 와 짝, 블록 이름 동일) */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  function onScroll(fn) {
    var ticking = false;
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; fn(); }); } }
    addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); fn();
  }
  function progress(el, startAt, endAt) {       /* 요소 윗변이 화면 startAt 지점 → endAt 지점까지 올 때 0→1 */
    var r = el.getBoundingClientRect(), vh = innerHeight;
    return Math.max(0, Math.min(1, (vh * startAt - r.top) / (vh * (startAt - endAt))));
  }

  /* [floatnav] */
  each('.bar', function (bar) {
    onScroll(function () { bar.classList.toggle('is-float', (window.scrollY || pageYOffset) > 140); });
  });

  if (reduce) return;   /* 아래는 움직임이라, 움직임 줄이기를 켠 사람에게는 끝난 상태로 둔다 */

  /* [textgen] */
  each('.hero__sub', function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (w, i) {
      var s = document.createElement('span'); s.className = 'tg-w'; s.style.setProperty('--i', i); s.textContent = w;
      el.appendChild(s); if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.add('is-tg');
  });

  /* [contscroll] */
  each('.cs', function (cs) {
    var f = cs.querySelector('.cs__frame');
    onScroll(function () { f.style.setProperty('--p', progress(cs, 1.0, 0.35).toFixed(4)); });
  });

  /* [glowbd] 카드 빛(--sx, --sy)은 fx.js 의 [spot] 이 이미 넣어 준다 */
  if (fine) each('.prods .prod, .ch, .tools .tool', function (el) { el.classList.add('glowbd'); });

  /* [dirhover] 들어온 쪽(위·아래·왼·오른)에서 채우고, 나간 쪽으로 빠진다 */
  if (fine) each('.chip', function (c) {
    function side(e) {
      var r = c.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      return Math.abs(x) > Math.abs(y) * (r.width / r.height) * 0.5 ? (x < 0 ? ['-101%', '0'] : ['101%', '0']) : (y < 0 ? ['0', '-101%'] : ['0', '101%']);
    }
    c.addEventListener('mouseenter', function (e) {
      var s = side(e);
      c.classList.remove('is-in'); c.style.transition = 'none';
      c.style.setProperty('--fx', s[0]); c.style.setProperty('--fy', s[1]);
      void c.offsetWidth; c.style.transition = '';
      c.classList.add('is-in');
    });
    c.addEventListener('mouseleave', function (e) {
      var s = side(e);
      c.style.setProperty('--fx', s[0]); c.style.setProperty('--fy', s[1]);
      c.classList.remove('is-in');
    });
  });

  /* [timeline] */
  each('.tl', function (tl) {
    var items = tl.querySelectorAll('.tl__item');
    onScroll(function () {
      var p = progress(tl, 0.7, 0.7 - tl.offsetHeight / innerHeight);
      tl.style.setProperty('--p', p.toFixed(4));
      var mark = tl.getBoundingClientRect().top + p * tl.offsetHeight;
      Array.prototype.forEach.call(items, function (it) { it.classList.toggle('is-lit', it.getBoundingClientRect().top + 14 <= mark + 1); });
    });
  });

  /* [lamp] */
  each('.lamp', function (l) {
    if (!('IntersectionObserver' in window)) { l.classList.add('is-on'); return; }
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { l.classList.add('is-on'); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(l);
  });
})();
