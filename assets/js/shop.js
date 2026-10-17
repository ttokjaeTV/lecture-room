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

/* ------------------------------------------------------------ 가격표 (상세 · 결제 화면이 함께 씀)
   가격 · 묶음가를 바꿀 때는 여기와 함께 각 상세의 표시 가격 · 묶음 칸 문구 · index.html 묶음 표(.bset)도 고친다. */
window.TJ_SHOP = (function () {
  var P = {
    lec:   { name: '평생 마르지 않는 월 현금흐름 포트폴리오 완성반', kind: '온라인 강의 · 5주 과정', price: 298000, url: 'lectures-shop.html' },
    eb:    { name: '평생 돈 걱정 없는 노후자금 시스템 만들기 노하우', kind: '전자책 · PDF 410쪽', price: 89000, url: 'ebooks-shop.html' },
    us:    { name: '미국주식 기초반', kind: '온라인 강의', price: 129000, url: 'usstock-shop.html' },
    tools: { name: '투자 Tool 멤버십', kind: '멤버십 · 월 구독', price: 8900, url: 'tools-shop.html', monthly: true }
  };
  var BUNDLE = { 'eb+us': [198000, 9], 'eb+lec': [349000, 10], 'lec+us': [379000, 11], 'eb+lec+us': [449000, 13] };
  var ORDER = ['lec', 'eb', 'us', 'tools'];
  function won(n) { return n.toLocaleString('ko-KR') + '원'; }
  function norm(keys) {   /* 순서 정리 · 중복 제거 · 멤버십은 따로 결제 */
    var k = ORDER.filter(function (x) { return keys.indexOf(x) > -1; });
    return k.indexOf('tools') > -1 && k.length > 1 ? k.filter(function (x) { return x !== 'tools'; }) : k;
  }
  function quote(keys) {
    keys = norm(keys);
    var sum = keys.reduce(function (a, k) { return a + P[k].price; }, 0);
    var b = BUNDLE[keys.slice().sort().join('+')];
    return { keys: keys, sum: sum, pay: b ? b[0] : sum, rate: b ? b[1] : 0, off: b ? sum - b[0] : 0, monthly: keys.length === 1 && !!P[keys[0]].monthly };
  }
  function link(keys) { return 'checkout.html?items=' + norm(keys).join(','); }
  return { P: P, BUNDLE: BUNDLE, won: won, norm: norm, quote: quote, link: link };
})();

/* ------------------------------------------------------------ 함께 구매 할인
   상세의 [data-bundle] 체크칸을 고르면 「선택한 상품」 · 「총 결제금액」 · 바로 구매 바 가격과
   구매 버튼(data-checkout-link)이 가리키는 결제 화면 주소가 함께 바뀐다. */
(function () {
  var S = window.TJ_SHOP;
  var links = document.querySelectorAll('[data-checkout-link]');
  var box = document.querySelector('[data-bundle]');
  if (!box) return;
  var base = box.getAttribute('data-bundle');
  var pick = document.querySelector('.pick');
  var total = pick && pick.querySelector('.total__v');
  var baseRow = pick && pick.querySelector('.pick__row');
  var bbar = document.querySelector('[data-bbar-price]');
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
    var q = S.quote(keys);
    if (pick && baseRow) {
      Array.prototype.forEach.call(pick.querySelectorAll('[data-added]'), function (r) { r.remove(); });
      var at = baseRow;
      q.keys.filter(function (k) { return k !== base; }).forEach(function (k) { var r = row(S.P[k].name, S.won(S.P[k].price)); at.after(r); at = r; });
      if (q.rate) at.after(row('묶음 할인 ' + q.rate + '%', '−' + S.won(q.off), true));
    }
    if (total) total.innerHTML = (q.rate ? '<s class="total__was">' + S.won(q.sum) + '</s>' : '') + S.won(q.pay);
    if (bbar) bbar.textContent = S.won(q.pay) + (q.rate ? ' (' + q.keys.length + '개 묶음)' : '');
    Array.prototype.forEach.call(links, function (a) { a.href = S.link(q.keys); });
  }
  box.addEventListener('change', update);
  update();
})();

/* ------------------------------------------------------------ 결제 화면 (checkout.html)
   주소의 ?items=lec,eb 로 상품을 받는다. PG(결제대행사)를 연결하기 전이라 [결제하기]는 안내만 띄운다.
   PG를 붙일 때는 아래 pay() 안에서 결제창을 여는 코드로 바꾸면 된다(주문 정보는 order 에 다 모여 있다). */
(function () {
  var root = document.querySelector('[data-checkout]');
  if (!root) return;
  var S = window.TJ_SHOP;
  var $ = function (q) { return root.querySelector(q); };
  var keys = S.norm(((new URLSearchParams(location.search)).get('items') || 'lec').split(',').filter(function (k) { return S.P[k]; }));
  if (!keys.length) keys = ['lec'];
  var list = $('[data-co-items]'), adds = $('[data-co-adds]'), sum = $('[data-co-sum]'), payBtn = $('[data-co-pay]'), msg = $('[data-co-msg]');
  var THUMB = { lec: '<span class="co-th co-th--lec">월 현금흐름<br>포트폴리오</span>', eb: '<span class="co-th co-th--eb"><img src="assets/img/ebook-cover-flat.webp" alt="" width="600" height="900"></span>', us: '<span class="co-th co-th--us">US</span>', tools: '<span class="co-th co-th--tools">TOOL</span>' };
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  function draw() {
    var q = S.quote(keys); keys = q.keys;
    history.replaceState(null, '', S.link(keys));
    root.classList.toggle('is-monthly', q.monthly);
    /* 멤버십(정기결제)은 카드만, 정기결제 동의 줄은 멤버십일 때만 */
    Array.prototype.forEach.call(root.querySelectorAll('.co-m--once'), function (el) { el.hidden = q.monthly; if (q.monthly) el.querySelector('input').checked = false; });
    $('.co-agree--monthly').hidden = !q.monthly;
    $('.co-mnote').hidden = !q.monthly;
    list.innerHTML = keys.map(function (k) {
      var p = S.P[k];
      return '<li class="co-item">' + THUMB[k] + '<span class="co-item__b"><span class="co-item__k">' + esc(p.kind) + '</span><a class="co-item__n" href="' + p.url + '">' + esc(p.name) + '</a></span>' +
        '<span class="co-item__v">' + (p.monthly ? '월 ' : '') + S.won(p.price) + '</span>' +
        (keys.length > 1 ? '<button class="co-item__x" type="button" data-rm="' + k + '" aria-label="' + esc(p.name) + ' 빼기">×</button>' : '') + '</li>';
    }).join('');
    /* 함께 담으면 할인 — 멤버십 주문에는 묶음이 없다 */
    var rest = q.monthly ? [] : ['lec', 'eb', 'us'].filter(function (k) { return keys.indexOf(k) < 0; });
    adds.hidden = !rest.length;
    adds.querySelector('[data-co-add-list]').innerHTML = rest.map(function (k) {
      var n = S.quote(keys.concat(k));
      return '<button class="co-add" type="button" data-add="' + k + '"><span class="co-add__plus" aria-hidden="true">+</span><span class="co-add__n">' + esc(S.P[k].name) + '<small>함께 담으면 ' + S.won(n.pay) + (n.rate ? ' · ' + n.rate + '% 할인' : '') + '</small></span><span class="co-add__v">+' + S.won(n.pay - q.pay) + '</span></button>';
    }).join('');
    sum.innerHTML =
      '<div class="co-sum__row"><span>상품 금액</span><span>' + (q.monthly ? '월 ' : '') + S.won(q.sum) + '</span></div>' +
      (q.rate ? '<div class="co-sum__row co-sum__row--off"><span>묶음 할인 ' + q.rate + '%</span><span>−' + S.won(q.off) + '</span></div>' : '') +
      '<div class="co-sum__total"><span>' + (q.monthly ? '매월 결제 금액' : '최종 결제 금액') + '</span><b>' + (q.monthly ? '월 ' : '') + S.won(q.pay) + '</b></div>';
    payBtn.textContent = (q.monthly ? '월 ' : '') + S.won(q.pay) + ' 결제하기';
    check();
  }

  /* 전체 동의 */
  var all = $('[data-co-all]'), req = function () { return Array.prototype.filter.call(root.querySelectorAll('[data-co-agree] input'), function (i) { return !i.closest('li').hidden; }); };
  all.addEventListener('change', function () { Array.prototype.forEach.call(root.querySelectorAll('[data-co-agree] input'), function (i) { i.checked = all.checked; }); check(); });

  function check() {
    var name = $('#co-name').value.trim(), email = $('#co-email').value.trim();
    var ok = name.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !!$('input[name="co-method"]:checked');
    var agreed = req().every(function (i) { return i.checked; });
    all.checked = agreed;
    payBtn.disabled = !(ok && agreed);
    $('[data-co-hint]').hidden = !payBtn.disabled;
  }

  function pay() {
    var q = S.quote(keys);
    var order = { items: q.keys, amount: q.pay, monthly: q.monthly, name: $('#co-name').value.trim(), email: $('#co-email').value.trim(), method: $('input[name="co-method"]:checked').value };
    /* ▼ PG 연결 자리 — 결제창 호출 → 성공 시 서버에서 금액 재확인 → 강의실 권한 부여 */
    msg.hidden = false;
    msg.innerHTML = '<b>아직 결제 기능이 연결되지 않았어요.</b> 결제대행사(PG) 연결 후 이 버튼에서 결제창이 열립니다.<br><small>주문 내용: ' + order.items.map(function (k) { return esc(S.P[k].name); }).join(' + ') + ' · ' + (order.monthly ? '월 ' : '') + S.won(order.amount) + '</small>';
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-rm],[data-add]');
    if (!t) return;
    if (t.hasAttribute('data-rm')) keys = keys.filter(function (k) { return k !== t.getAttribute('data-rm'); });
    else keys.push(t.getAttribute('data-add'));
    msg.hidden = true; draw();
  });
  root.addEventListener('input', function (e) { if (e.target.type === 'text' || e.target.type === 'email') check(); });   /* 체크칸은 change 로만 — input 이 먼저 와서 전체 동의가 풀리는 것을 막는다 */
  root.addEventListener('change', check);
  payBtn.addEventListener('click', pay);
  draw();
})();
