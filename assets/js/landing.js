/* 똑재TV 3안 랜딩 — 고민 아코디언.
   React Bits AccordionGallery(MIT + Commons Clause, © David Haz)의 움직임을 GSAP 없이 CSS 전환으로 옮겼다.
   - 마우스를 올리거나(넓은 화면) 누르면 그 칸이 펼쳐진다. 펼친 칸을 한 번 더 누르면 홈의 5계단으로 간다.
   - 아무도 건드리지 않으면 3.2초마다 다음 고민으로 넘어간다. 한 번이라도 건드리면 멈춘다.
   - 움직임 줄이기를 켠 사람에게는 자동 넘김이 없다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  var acc = document.querySelector('.acc');
  if (acc) {
    var panels = Array.prototype.slice.call(acc.querySelectorAll('.acc__p'));
    var n = panels.length;
    var active = 0;
    var RATIO = 0.52, TILT = 8, PARALLAX = 0.5;
    var touched = false, timer = null;

    function vertical() { return getComputedStyle(acc).flexDirection === 'column'; }

    function layout() {
      var v = vertical();
      var r = acc.getBoundingClientRect();
      var gap = parseFloat(getComputedStyle(acc).gap) || 10;
      var total = (v ? r.height : r.width) - gap * (n - 1);
      /* 세로(휴대폰)에서는 펼친 칸이 300px 안팎이 되도록 비율을 다시 잡는다 */
      var ratio = v ? Math.min(0.7, 300 / Math.max(total, 1)) : RATIO;
      var grow = (ratio * (n - 1)) / (1 - ratio);
      var media = Math.max(140, total * ratio * 1.22);
      acc.style.setProperty('--media', media.toFixed(0) + 'px');
      panels.forEach(function (p, i) {
        var on = i === active;
        p.classList.toggle('is-on', on);
        p.setAttribute('aria-expanded', on ? 'true' : 'false');
        p.style.setProperty('--grow', grow.toFixed(3));
        p.style.setProperty('--tilt', on || v ? '0deg' : (i < active ? TILT : -TILT) + 'deg');
        var drift = Math.max(-1.5, Math.min(1.5, active - i)) * PARALLAX * media * 0.06;
        p.querySelector('.acc__media').style.setProperty('--drift', on ? '0px' : drift.toFixed(1) + 'px');
      });
    }

    function set(i) {
      active = (i + n) % n; layout();
      /* 제목 단어 바꾸기·숫자 세기(fx.js)가 이 신호를 듣는다 */
      document.dispatchEvent(new CustomEvent('acc:change', { detail: { index: active, panel: panels[active] } }));
    }
    function stop() { touched = true; clearInterval(timer); timer = null; }

    panels.forEach(function (p, i) {
      p.style.setProperty('--i', i);
      p.addEventListener('mouseenter', function () { if (fine) { stop(); set(i); } });
      p.addEventListener('focus', function () { stop(); set(i); });
      p.addEventListener('click', function (e) {
        stop();
        if (i !== active) { e.preventDefault(); set(i); }   /* 접힌 칸은 펼치기만, 펼친 칸은 링크로 */
      });
      p.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); stop(); set(i + 1); panels[active].focus(); }
        if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); stop(); set(i - 1); panels[active].focus(); }
      });
    });
    acc.addEventListener('touchstart', stop, { passive: true });

    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(acc);
    else addEventListener('resize', layout);

    /* 자동 넘김: 화면에 보이고, 탭이 열려 있고, 아무도 건드리지 않았을 때만 */
    if (!reduce) {
      var inView = true;
      var tick = function () { if (!touched && inView && !document.hidden) set(active + 1); };
      setTimeout(function () { if (!touched) timer = setInterval(tick, 3200); }, 1600);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { inView = en[0].isIntersecting; }, { threshold: 0.4 }).observe(acc);
      }
    }
  }

  /* 반전 섹션의 계단 선: 화면에 들어오면 한 번 그려진다 */
  var path = document.querySelector('.path');
  if (path) {
    if (!reduce && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { path.classList.add('is-in'); io.disconnect(); }
      }, { threshold: 0.35 });
      io.observe(path);
    } else path.classList.add('is-in');
  }

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();
