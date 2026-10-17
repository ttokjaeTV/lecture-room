/* 똑재TV 3안 — 강의실 예시
   · 비메오 플레이어 SDK 로 '몇 초째인지'를 받아 5초 단위로 본 구간을 기록한다(건너뛴 구간은 진도에 안 들어감).
   · 90% 이상 보면 완료. 다음에 열면 마지막 위치부터 이어서 재생.
   · 기록은 이 브라우저(localStorage)에만 남는다. 운영자가 수강생별 진도를 보려면 로그인·DB가 있는 단계에서 바꾼다.
   · 비메오를 못 불러오는 곳(미리보기 등)에서는 '데모 재생'으로 같은 기록 흐름을 흉내 낸다(4배속). */
(function () {
  'use strict';
  var KEY = 'tj-classroom-v1', BUCKET = 5, DONE_AT = 0.9;
  var lessons = Array.prototype.map.call(document.querySelectorAll('.cr-l'), function (b) {
    return { id: b.getAttribute('data-id'), vimeo: b.getAttribute('data-vimeo'), title: b.textContent.trim(), btn: b,
             week: (function (t) { var sp = t.querySelector('span'); return sp ? sp.textContent + ' · ' + t.textContent.replace(sp.textContent, '').trim() : t.textContent.trim(); })(b.closest('.cr-week').querySelector('.cr-week__t')) };
  });
  if (!lessons.length) return;

  /* ---------------------------------------------------------------- 저장 */
  var store = { lessons: {}, last: null };
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.lessons) store = s; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function rec(id) { return store.lessons[id] || (store.lessons[id] = { pos: 0, dur: 0, b: [], done: false }); }
  function pct(id) {
    var r = store.lessons[id]; if (!r) return 0; if (r.done) return 1; if (!r.dur) return 0;
    return Math.min(1, (r.b.length * BUCKET) / r.dur);
  }
  function fmt(t) { t = Math.max(0, Math.round(t)); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  /* ---------------------------------------------------------------- 목록 그리기 */
  var C = 2 * Math.PI * 9;
  lessons.forEach(function (l) {
    var t = l.btn.textContent;
    l.btn.innerHTML = '<svg class="cr-l__ring" viewBox="0 0 22 22" aria-hidden="true"><circle class="bg" cx="11" cy="11" r="9"/><circle class="fg" cx="11" cy="11" r="9" stroke-dasharray="0 ' + C.toFixed(2) + '"/><path class="cr-l__chk" d="M6.8 11.3l2.8 2.8 5.6-5.8"/></svg><span></span><span class="cr-l__pct"></span>';
    l.btn.children[1].textContent = t;
    l.btn.addEventListener('click', function () { open(lessons.indexOf(l), true); });
  });

  var totalEl = document.querySelector('.cr-total__pct'), subEl = document.querySelector('.cr-total__sub');
  var track = document.querySelector('.cr-track');
  var lastTotal = -1;
  function paint() {
    var sum = 0, doneN = 0;
    lessons.forEach(function (l) {
      var p = pct(l.id); sum += p; if (p >= 1 || (store.lessons[l.id] || {}).done) doneN++;
      l.btn.classList.toggle('is-done', p >= 1);
      l.btn.querySelector('.fg').setAttribute('stroke-dasharray', (p * C).toFixed(2) + ' ' + C.toFixed(2));
      l.btn.querySelector('.fg').style.opacity = p > 0 ? 1 : 0;   /* 0%일 때 둥근 끝이 점으로 남지 않게 */
      l.btn.querySelector('.cr-l__pct').textContent = p >= 1 ? '완료' : (p > 0 ? Math.floor(p * 100) + '%' : '');
    });
    var total = sum / lessons.length;
    totalEl.textContent = Math.floor(total * 100) + '%';
    subEl.textContent = lessons.length + '강 중 ' + doneN + '강 완료';
    track.style.setProperty('--p', total.toFixed(4));
    track.setAttribute('aria-valuenow', Math.floor(total * 100));
    if (lastTotal >= 0 && Math.floor(total * 100) !== Math.floor(lastTotal * 100)) {
      track.classList.remove('is-walking'); void track.offsetWidth; track.classList.add('is-walking');
    }
    lastTotal = total;
    var cur = lessons[idx]; if (!cur) return;
    var p = pct(cur.id), r = rec(cur.id);
    document.querySelector('.cr-now').style.setProperty('--p', p.toFixed(4));
    document.querySelector('.cr-now__pct').textContent = Math.floor(p * 100) + '%';
    document.querySelector('.cr-now__dur').textContent = r.dur ? '· 영상 길이 ' + fmt(r.dur) : '';
    var doneBtn = document.querySelector('[data-act="done"]');
    doneBtn.setAttribute('aria-pressed', r.done ? 'true' : 'false');
    doneBtn.textContent = r.done ? '완료됨' : '완료로 표시';
  }

  /* ---------------------------------------------------------------- 시청 기록 */
  var saveTimer = null;
  function onTime(id, sec, dur) {
    var r = rec(id);
    if (dur) r.dur = dur;
    r.pos = sec;
    var k = Math.floor(sec / BUCKET);
    if (r.b.indexOf(k) < 0) r.b.push(k);
    if (!r.done && r.dur && (r.b.length * BUCKET) / r.dur >= DONE_AT) r.done = true;
    paint();
    if (!saveTimer) saveTimer = setTimeout(function () { saveTimer = null; save(); }, 1500);
  }
  function onEnded(id) { var r = rec(id); r.done = true; r.pos = 0; save(); paint(); }

  /* ---------------------------------------------------------------- 플레이어 */
  var frame = document.getElementById('player');
  var idx = 0, player = null, demo = null, vimeoOK = null;

  function resumeNote(r) {
    var el = document.querySelector('.cr-now__resume');
    if (r.pos > 10 && !r.done) { el.textContent = '지난번 ' + fmt(r.pos) + '부터 이어서 봅니다'; el.hidden = false; setTimeout(function () { el.hidden = true; }, 5000); }
    else el.hidden = true;
  }

  function mountVimeo(l) {
    frame.innerHTML = '';
    var r = rec(l.id);
    var ifr = document.createElement('iframe');
    ifr.src = 'https://player.vimeo.com/video/' + encodeURIComponent(l.vimeo) + '?dnt=1&title=0&byline=0&portrait=0';
    ifr.allow = 'autoplay; fullscreen; picture-in-picture';
    ifr.title = l.title;
    frame.appendChild(ifr);
    player = new window.Vimeo.Player(ifr);
    var timer = setTimeout(function () { if (vimeoOK !== true) { vimeoOK = false; mountDemo(l); } }, 6000);
    player.ready().then(function () {
      clearTimeout(timer); vimeoOK = true;
      return player.getDuration();
    }).then(function (d) {
      r.dur = d; paint();
      if (r.pos > 10 && !r.done) { player.setCurrentTime(r.pos).catch(function () {}); resumeNote(r); }
    }).catch(function () { clearTimeout(timer); vimeoOK = false; mountDemo(l); });
    player.on('timeupdate', function (e) { onTime(l.id, e.seconds, e.duration); });
    player.on('ended', function () { onEnded(l.id); });
  }

  /* 데모 재생기: 180초짜리 가상 영상, 4배속으로 흘러간다 */
  function mountDemo(l) {
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    if (demo && demo.timer) clearInterval(demo.timer);
    var r = rec(l.id), DUR = 180;
    if (!r.dur) r.dur = DUR;
    frame.innerHTML = '<div class="demo"><p class="demo__cap"><span>데모 재생 · 실제 영상 자리</span><span>4배속</span></p>' +
      '<button type="button" class="demo__play" aria-label="재생"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></button>' +
      '<p class="demo__title"></p><span class="demo__time"></span><div class="demo__bar" role="slider" aria-label="재생 위치" tabindex="0"><i></i></div></div>';
    frame.querySelector('.demo__title').textContent = l.title;
    demo = { t: r.done ? 0 : r.pos, playing: false, timer: null };
    var btn = frame.querySelector('.demo__play'), bar = frame.querySelector('.demo__bar'), time = frame.querySelector('.demo__time');
    function draw() { bar.style.setProperty('--d', (demo.t / r.dur * 100).toFixed(2) + '%'); time.textContent = fmt(demo.t) + ' / ' + fmt(r.dur); }
    function setPlay(on) {
      demo.playing = on;
      btn.innerHTML = on ? '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>';
      btn.setAttribute('aria-label', on ? '일시정지' : '재생');
      if (on) demo.timer = setInterval(function () {
        demo.t = Math.min(r.dur, demo.t + 1);
        onTime(l.id, demo.t, r.dur); draw();
        if (demo.t >= r.dur) { clearInterval(demo.timer); setPlay(false); onEnded(l.id); demo.t = 0; draw(); }
      }, 250);
      else clearInterval(demo.timer);
    }
    btn.addEventListener('click', function () { setPlay(!demo.playing); });
    bar.addEventListener('click', function (e) {
      var b = bar.getBoundingClientRect();
      demo.t = Math.round((e.clientX - b.left) / b.width * r.dur); draw();   /* 건너뛴 구간은 기록되지 않는다 */
    });
    draw(); paint(); resumeNote(r);
  }

  function open(i, user) {
    idx = Math.max(0, Math.min(lessons.length - 1, i));
    var l = lessons[idx];
    store.last = l.id; save();
    lessons.forEach(function (x) { x.btn.classList.toggle('is-now', x === l); x.btn.setAttribute('aria-current', x === l ? 'true' : 'false'); });
    document.querySelector('.cr-now__week').textContent = l.week;
    document.querySelector('.cr-now__t').textContent = l.title;
    if (demo && demo.timer) clearInterval(demo.timer);
    if (window.Vimeo && window.Vimeo.Player && vimeoOK !== false) mountVimeo(l); else mountDemo(l);
    paint();
    if (user && innerWidth < 1000) frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelector('[data-act="prev"]').addEventListener('click', function () { open(idx - 1, true); });
  document.querySelector('[data-act="next"]').addEventListener('click', function () { open(idx + 1, true); });
  document.querySelector('[data-act="done"]').addEventListener('click', function () {
    var r = rec(lessons[idx].id); r.done = !r.done; save(); paint();
  });
  document.querySelector('.cr-reset').addEventListener('click', function () {
    store = { lessons: {}, last: null }; save(); open(0, false);
  });

  var start = Math.max(0, lessons.map(function (l) { return l.id; }).indexOf(store.last));
  /* SDK 가 defer 로 먼저 실행되지만, 막힌 곳에서는 없으므로 바로 데모로 */
  open(start, false);
})();
