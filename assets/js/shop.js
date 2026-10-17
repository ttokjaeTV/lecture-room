/* 똑재TV 3안 — 상품형 상세 페이지. 이 파일을 빼도 내용은 그대로 읽힌다(사진 넘김·탭 표시·바로 구매 바만 빠짐). */
(function () {
  'use strict';
  var each = function (sel, fn, root) { Array.prototype.forEach.call((root || document).querySelectorAll(sel), fn); };

  /* 사진 — 작은 칸을 누르면 큰 칸이 바뀐다. 화살표 키로도 넘긴다 */
  each('.gal', function (gal) {
    var ths = gal.querySelectorAll('.gal__th');
    var slides = gal.querySelectorAll('.gal__slide');
    var cur = -1;
    function show(i) {
      /* 강의 표지 칸으로 돌아오면 장면을 처음부터 다시 재생 */
      if (cur !== -1 && cur !== i) {
        var cov = slides[i] && slides[i].querySelector('[data-cov]');
        if (cov) { cov.classList.remove('is-play'); void cov.offsetWidth; cov.classList.add('is-play'); }
      }
      cur = i;
      Array.prototype.forEach.call(ths, function (t, k) {
        var on = k === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      Array.prototype.forEach.call(slides, function (s, k) {
        s.classList.toggle('is-on', k === i);
        s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
      });
    }
    Array.prototype.forEach.call(ths, function (t, i) {
      t.addEventListener('click', function () { show(i); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!n) return;
        e.preventDefault();
        var j = (i + n + ths.length) % ths.length;
        show(j); ths[j].focus();
      });
    });
    show(0);
    /* 「책 펼쳐보기」 — 장면을 처음부터 다시 */
    Array.prototype.forEach.call(gal.querySelectorAll('[data-replay]'), function (btn) {
      btn.addEventListener('click', function () {
        var cov = btn.closest('[data-cov]');
        if (cov) { cov.classList.remove('is-play'); void cov.offsetWidth; cov.classList.add('is-play'); }
      });
    });
  });

  /* 강의 표지 칸 기울기 — 마우스가 있는 쪽으로 최대 5도 */
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fine && !still) each('[data-tilt]', function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.classList.add('is-tilting');
      el.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg');
      el.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
    });
    el.addEventListener('pointerleave', function () {
      el.classList.remove('is-tilting');
      el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg');
    });
  });

  /* 탭 — 지금 읽고 있는 칸에 밑줄. 누르면 그 칸으로 */
  var tabs = document.querySelectorAll('.tab');
  var secs = [];
  each('.tab', function (t) {
    var s = document.getElementById((t.getAttribute('href') || '').slice(1));
    if (s) secs.push({ tab: t, sec: s });
  });
  function mark() {
    var y = (window.scrollY || pageYOffset) + 170, cur = null;
    secs.forEach(function (o) { if (o.sec.getBoundingClientRect().top + (window.scrollY || pageYOffset) <= y) cur = o; });
    Array.prototype.forEach.call(tabs, function (t) { t.classList.toggle('is-on', !!cur && t === cur.tab); });
    if (cur && cur.tab.scrollIntoView && cur.tab.parentNode.scrollWidth > cur.tab.parentNode.clientWidth) {
      var p = cur.tab.parentNode, l = cur.tab.offsetLeft - 20;
      if (l < p.scrollLeft || l + cur.tab.offsetWidth > p.scrollLeft + p.clientWidth) p.scrollLeft = l;
    }
  }

  /* 바로 구매 바 — 위 상품 블록의 구매 버튼이 화면에서 사라지면 나타난다. 맨 아래 바닥글에서는 비켜 준다 */
  var bbar = document.querySelector('.bbar');
  var buy = document.querySelector('.buy');
  var foot = document.querySelector('.foot');
  function dock() {
    if (!bbar || !buy) return;
    var r = buy.getBoundingClientRect();
    var past = r.bottom < 0;
    var atFoot = foot && foot.getBoundingClientRect().top < window.innerHeight - 40;
    bbar.classList.toggle('is-on', past && !atFoot);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; mark(); dock(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  mark(); dock();
})();

/* ------------------------------------------------------------ 함께 구매 할인
   상세의 [data-bundle] 체크칸을 고르면 「선택한 상품」 · 「총 결제금액」 · 바로 구매 바 가격이 묶음가로 바뀐다.
   값을 바꿀 때는 각 상세의 표시 가격 · 묶음 칸 문구 · index.html 묶음 표(.bset)도 함께 고친다. */
(function () {
  var box = document.querySelector('[data-bundle]');
  if (!box) return;
  var PRICE = { lec: 298000, eb: 89000, us: 129000 };
  var NAME = { lec: '평생 마르지 않는 월 현금흐름 포트폴리오 완성반', eb: '노후자금 시스템 만들기 노하우 · PDF', us: '미국주식 기초반' };
  var BUNDLE = { 'eb+us': [198000, 9], 'eb+lec': [349000, 10], 'lec+us': [379000, 11], 'eb+lec+us': [449000, 13] };
  var base = box.getAttribute('data-bundle');
  var pick = document.querySelector('.pick');
  var total = pick && pick.querySelector('.total__v');
  var baseRow = pick && pick.querySelector('.pick__row');
  var bbar = document.querySelector('[data-bbar-price]');
  function won(n) { return n.toLocaleString('ko-KR') + '원'; }
  function row(n, v, off) {
    var r = document.createElement('div');
    r.className = 'pick__row' + (off ? ' pick__row--off' : '');
    r.setAttribute('data-added', '');
    r.innerHTML = '<span class="pick__n"></span><span class="pick__v"></span>';
    r.firstChild.textContent = n; r.lastChild.textContent = v;
    return r;
  }
  function update() {
    var keys = [base];
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) {
      i.closest('.bundle__opt').classList.toggle('is-on', i.checked);
      if (i.checked) keys.push(i.value);
    });
    var sum = keys.reduce(function (a, k) { return a + PRICE[k]; }, 0);
    var b = BUNDLE[keys.slice().sort().join('+')];
    var pay = b ? b[0] : sum;
    if (pick && baseRow) {
      Array.prototype.forEach.call(pick.querySelectorAll('[data-added]'), function (r) { r.remove(); });
      var at = baseRow;
      keys.slice(1).forEach(function (k) { var r = row(NAME[k], won(PRICE[k])); at.after(r); at = r; });
      if (b) at.after(row('묶음 할인 ' + b[1] + '%', '−' + won(sum - pay), true));
    }
    if (total) total.innerHTML = (b ? '<s class="total__was">' + won(sum) + '</s>' : '') + won(pay);
    if (bbar) bbar.textContent = won(pay) + (b ? ' (' + (keys.length) + '개 묶음)' : '');
  }
  box.addEventListener('change', update);
  update();
})();
