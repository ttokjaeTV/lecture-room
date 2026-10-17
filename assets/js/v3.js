/* 똑재TV 3안 — 이 파일을 빼도 사이트는 그대로 읽힌다. */
(function () {
  'use strict';

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 바닥글 연도 */
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* 아직 열지 않은 버튼·링크(data-todo)는 막고 한 줄 안내를 띄운다.
     값이 연결되면 data-todo 와 aria-disabled 를 지우면 된다. */
  var toast, timer;
  function say(msg) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-todo]') : null;
    if (!el) return;
    e.preventDefault();
    var kind = el.getAttribute('data-todo');
    say(kind === 'link' ? '주소를 연결하는 중입니다. 곧 열립니다.' : '아직 준비 중입니다. 정식 오픈 후에 열립니다.');
  });

  /* 상단바: 스크롤 진행선 + 그림자 */
  var bar = document.querySelector('.bar');
  var progress;
  if (bar) {
    progress = document.createElement('div');
    progress.className = 'bar__progress';
    progress.setAttribute('aria-hidden', 'true');
    bar.appendChild(progress);
  }

  /* 계단: 화면에 들어오면 한 번만 솟는다 */
  var stairs = document.querySelector('.stairs-wrap');
  if (stairs) {
    if (!reduce && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { stairs.classList.add('is-in'); io.disconnect(); }
      }, { threshold: 0.25 });
      io.observe(stairs);
    } else {
      stairs.classList.add('is-in');
    }
  }


  /* 내 계단 채우기 — 아는 계단을 누르면 칸이 찬다. 다 차면 하나로 합쳐지며 체크.
     건너뛴 계단이 있으면 그 칸을 짚고 무료 영상으로 보낸다. 고른 칸은 이 브라우저에만 남는다. */
  var climb = document.querySelector('.climb');
  if (climb) {
    var slotEls = climb.querySelectorAll('.slot');
    var stepEls = document.querySelectorAll('.stairs .step');
    var slotsBox = climb.querySelector('.slots');
    var msg = climb.querySelector('.climb__msg');
    var KEY = 'tj-climb-v1';
    var known = [false, false, false, false, false];
    try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.length === 5) known = saved.map(Boolean); } catch (e) {}

    /* ---- 계단 오르기: 아는 계단을 앞에서부터 이어서 채운 만큼 캐릭터가 한 칸씩 뛰어 오른다.
       아무것도 안 채우면 1번 계단 앞 바닥, 건너뛴 칸이 있으면 그 앞에서 고개를 젓고, 다 채우면 꼭대기에서 점프. */
    var climber = (function () {
      var wrap = document.querySelector('.stairs-wrap');
      var desk = wrap && wrap.querySelector('.stairs__char');
      var mob = slotsBox.querySelector('.slots__char');
      var mq = window.matchMedia ? matchMedia('(min-width: 980px)') : { matches: true };
      var DEPTH = 26;
      var pos = null, target = -1, mood = null, running = false;
      function who() { return mq.matches ? desk : mob; }
      /* 위치는 transform(등장 애니메이션·눌림)의 영향을 받지 않는 레이아웃 좌표(offset)로 잰다 */
      function spot(i) {
        var c = who(); if (!c) return { x: 0, y: 0 };
        var cw = c.offsetWidth || 66, ch = c.offsetHeight || 99, st, ox, oy;
        if (mq.matches) {
          var list = stepEls[0].offsetParent;            /* .stairs */
          ox = list.offsetLeft; oy = list.offsetTop;
          if (i < 0) { st = stepEls[0]; return { x: ox + st.offsetLeft - cw - 4, y: oy + st.offsetTop + st.offsetHeight - ch }; }
          st = stepEls[i];
          return { x: ox + st.offsetLeft + st.offsetWidth / 2 + DEPTH * 0.5 - cw / 2, y: oy + st.offsetTop - ch + DEPTH * 0.45 };
        }
        st = slotEls[Math.max(0, i)];
        return { x: st.offsetLeft + st.offsetWidth / 2 - cw / 2, y: st.offsetTop - ch + 3 + (i < 0 ? 10 : 0) };
      }
      function tf(p, extra) { return 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)' + (extra || ''); }
      function place(i) { var c = who(); if (!c) return; c.style.transform = tf(spot(i)); pos = i; }
      function play(frames, dur) {
        return new Promise(function (res) {
          var c = who();
          if (!c || reduce || !c.animate) { res(); return; }
          var a = c.animate(frames, { duration: dur, easing: 'ease-in-out' });
          a.onfinish = res; a.oncancel = res;
        });
      }
      function hop(from, to) {
        var a = spot(from), b = spot(to);
        var face = b.x < a.x ? ' scaleX(-1)' : '';
        var peak = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 46 };
        return play([
          { transform: tf(a, face), offset: 0 },
          { transform: tf(a, face + ' scale(1.06,.9)'), offset: .12 },
          { transform: tf(peak, face), offset: .55 },
          { transform: tf(b, face + ' scale(1.06,.9)'), offset: .88 },
          { transform: tf(b, face), offset: 1 }
        ], 380).then(function () { who().style.transform = tf(b); pos = to; });
      }
      function shake() {
        var p = spot(pos);
        return play([
          { transform: tf(p) }, { transform: tf(p, ' rotate(-9deg)') }, { transform: tf(p, ' rotate(8deg)') },
          { transform: tf(p, ' rotate(-6deg)') }, { transform: tf(p, ' rotate(4deg)') }, { transform: tf(p) }
        ], 620);
      }
      function cheer() {
        var p = spot(pos), up = { x: p.x, y: p.y - 34 };
        var j = [{ transform: tf(p) }, { transform: tf(up, ' rotate(-6deg)'), offset: .3 }, { transform: tf(p, ' scale(1.06,.9)'), offset: .55 },
                 { transform: tf(up, ' rotate(6deg)'), offset: .8 }, { transform: tf(p) }];
        return play(j, 900);
      }
      function run() {
        if (running) return;
        running = true;
        (function next() {
          if (pos === target) {
            running = false;
            if (mood === 'gap') shake(); else if (mood === 'done') cheer();
            mood = null;
            return;
          }
          var step = pos + (target > pos ? 1 : -1);
          if (reduce) { place(target); next(); return; }
          hop(pos, step).then(next);
        })();
      }
      function go(t, m, instant) {
        target = t; mood = m;
        if (pos === null || instant) { place(t); return; }
        run();
      }
      addEventListener('resize', function () { if (!running && pos !== null) place(pos); });
      if (mq.addEventListener) mq.addEventListener('change', function () { if (pos !== null) place(pos); });
      addEventListener('load', function () { if (!running && pos !== null) place(pos); });
      return { go: go };
    })();

    var info = Array.prototype.map.call(stepEls, function (st) {
      var a = st.querySelector('.step__go a');
      return { title: (st.querySelector('.step__t') || {}).textContent || '', href: a ? a.href : '' };
    });
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function video(i) { return info[i] && info[i].href ? '<a href="' + esc(info[i].href) + '" target="_blank" rel="noopener">무료 영상 보기</a>' : ''; }

    function render(order) {
      var count = known.filter(Boolean).length;
      var first = known.indexOf(false);
      var skipped = first >= 0 && known.slice(first + 1).some(Boolean);
      Array.prototype.forEach.call(slotEls, function (el, i) {
        el.setAttribute('aria-pressed', known[i] ? 'true' : 'false');
        el.style.setProperty('--delay', (order && order[i] != null ? order[i] : 0) + 'ms');
        el.classList.toggle('is-gap', skipped && i === first);
        if (stepEls[i]) stepEls[i].classList.toggle('is-known', known[i]);
      });
      slotsBox.setAttribute('data-status', count === 5 ? 'success' : 'idle');
      /* 캐릭터는 앞에서부터 이어서 채운 마지막 계단 위로 */
      climber.go(first === -1 ? 4 : first - 1, count === 5 ? 'done' : skipped ? 'gap' : null, render.first);
      if (count === 0) msg.innerHTML = '아는 계단을 눌러 채워 보세요.';
      else if (count === 5) msg.innerHTML = '다섯 계단을 다 아신다면, 이제 남은 건 <b>꾸준히 굴리는 일</b>입니다.';
      else if (skipped) msg.innerHTML = '<b>' + (first + 1) + '번 ‘' + esc(info[first].title) + '’</b> 계단이 비었어요. 건너뛰면 결국 다시 내려오게 됩니다.' + video(first);
      else msg.innerHTML = '다음은 <b>' + (first + 1) + '번 ‘' + esc(info[first].title) + '’</b> 계단입니다.' + video(first);
      try { localStorage.setItem(KEY, JSON.stringify(known)); } catch (e) {}
    }

    Array.prototype.forEach.call(slotEls, function (el, i) {
      el.addEventListener('click', function () { known[i] = !known[i]; render(); });
    });
    var reset = climb.querySelector('.slots__reset');
    if (reset) reset.addEventListener('click', function () {
      /* 마지막 칸부터 차례로 빠진다 */
      known = [false, false, false, false, false];
      render([120, 90, 60, 30, 0]);
      slotEls[0].focus();
    });
    /* 저장된 칸이 있으면 첫 칸부터 차례로 채우며 되살린다 */
    render.first = true;
    render(known.some(Boolean) ? [0, 40, 80, 120, 160] : null);
    render.first = false;
  }

  /* 히어로 그래프: 화면 비율에 맞춰 끼우고, 끝점 위에 캐릭터를 세운다 */
  var chart = document.querySelector('.hero__chart');
  function placeChart() {
    if (!chart) return;
    var svg = chart.querySelector('svg');
    var end = chart.querySelector('.hc-end');
    if (!svg || !end || !svg.getScreenCTM) return;
    var w = chart.clientWidth, h = chart.clientHeight;
    if (!w || !h) return;
    var vb = svg.viewBox.baseVal;
    svg.setAttribute('preserveAspectRatio', (w / h > vb.width / vb.height) ? 'xMaxYMax meet' : 'xMaxYMax slice');
    var m = svg.getScreenCTM();
    var box = svg.getBoundingClientRect();
    if (!m) return;
    var cx = end.cx.baseVal.value, cy = end.cy.baseVal.value;
    chart.style.setProperty('--cx', (m.a * cx + m.c * cy + m.e - box.left).toFixed(1) + 'px');
    chart.style.setProperty('--cy', (m.b * cx + m.d * cy + m.f - box.top).toFixed(1) + 'px');
    chart.classList.add('is-placed');
  }
  placeChart();
  addEventListener('resize', placeChart);
  addEventListener('load', placeChart);

  /* 스크롤·마우스 시차 (한 프레임에 한 번) */
  var hero = document.querySelector('.hero');
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var mx = 0, my = 0, tx = 0, ty = 0, ticking = false;
  function frame() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    var max = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    if (bar) bar.classList.toggle('is-scrolled', y > 8);
    if (hero && !reduce) {
      if (y < hero.offsetHeight) hero.style.setProperty('--sy', y.toFixed(1));
      mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
      hero.style.setProperty('--mx', mx.toFixed(3));
      hero.style.setProperty('--my', my.toFixed(3));
      if (Math.abs(tx - mx) > 0.002 || Math.abs(ty - my) > 0.002) request();
    }
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  if (hero && fine && !reduce) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      request();
    });
    hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; request(); });
  }
  request();
})();
