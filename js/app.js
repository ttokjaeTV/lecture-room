/* =========================================================
   강의실 화면 (로그인 · 내 강의실 · 시청 · 관리자)
   ========================================================= */
(function () {
  'use strict';
  var C = window.LRCore;
  var CFG = window.LR_CONFIG || {};
  var DAY = 86400000;
  var B = null;
  var app = document.getElementById('app');
  var S = { user: null, courses: [], lessons: [], enrollments: [], progress: [], sessions: [] };
  var A = null;          // 관리자 데이터 캐시
  var tracker = null;    // 현재 시청 기록기
  var player = null;     // 현재 Vimeo 플레이어

  // ---------------------------------------------------------------- 유틸
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(v) { if (!v) return '-'; var d = new Date(v); return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }
  function fmtDT(v) { if (!v) return '-'; var d = new Date(v); return pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ago(v) {
    if (!v) return '-';
    var s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 86400 * 30) return Math.floor(s / 86400) + '일 전';
    return fmtDate(v);
  }
  function daysLeft(v) { return v ? Math.ceil((new Date(v).getTime() - Date.now()) / DAY) : null; }
  function remainText(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec >= 600) return C.fmtMinutes(sec);
    var m = Math.floor(sec / 60), r = sec % 60;
    return (m ? m + '분 ' : '') + r + '초';
  }
  function pct(x) { return Math.round(Math.max(0, Math.min(1, x || 0)) * 100); }
  function n2(x) { return (Math.round((x || 0) * 10) / 10).toString(); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function toast(msg) {
    var w = $('.toast-wrap'); if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; document.body.appendChild(w); }
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; w.appendChild(t);
    setTimeout(function () { t.remove(); }, 2800);
  }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function errMsg(e) { return (e && e.message) || String(e); }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if ($('script[src="' + src + '"]')) { res(); return; }
      var s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('스크립트를 불러오지 못했어요: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadVimeo() { return window.Vimeo && window.Vimeo.Player ? Promise.resolve() : loadScript('https://player.vimeo.com/api/player.js'); }
  function vimeoOpts(id, hash, extra) {
    var o = hash ? { url: 'https://vimeo.com/' + id + '/' + hash } : { id: Number(id) };
    return Object.assign(o, { dnt: true, playsinline: true, title: false, byline: false, portrait: false }, extra || {});
  }
  function parseDur(s) {
    s = String(s || '').trim(); if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);
    var p = s.split(':').map(Number); if (p.some(isNaN)) return null;
    return p.reduce(function (a, x) { return a * 60 + x; }, 0);
  }
  function modal(title, body, foot) {
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>' + esc(title) +
      '</h3><button class="btn btn-ghost btn-sm" data-close aria-label="닫기">✕</button></div><div class="modal-body">' + body +
      '</div>' + (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div>';
    function close() { bg.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    var f = $('input, textarea, select', bg); if (f) f.focus();
    bg.close = close;
    return bg;
  }

  function enrState(e) {
    if (!e) return 'none';
    if (e.status !== 'active') return 'revoked';
    if (new Date(e.starts_at) > new Date()) return 'pending';
    if (e.expires_at && new Date(e.expires_at) < new Date()) return 'expired';
    return 'active';
  }
  function periodChip(e) {
    var st = enrState(e);
    if (st === 'revoked') return '<span class="chip chip-gray">해지됨</span>';
    if (st === 'expired') return '<span class="chip chip-gray">기간 만료 · ' + fmtDate(e.expires_at) + '</span>';
    if (st === 'pending') return '<span class="chip chip-warn">' + fmtDate(e.starts_at) + ' 시작</span>';
    if (!e.expires_at) return '<span class="chip chip-green">기간 무제한</span>';
    var d = daysLeft(e.expires_at);
    return '<span class="chip ' + (d <= 7 ? 'chip-warn' : 'chip-green') + '">D-' + d + ' · ' + fmtDate(e.expires_at) + '까지</span>';
  }
  var REASONS = {
    login: ['🔒', '다시 로그인해 주세요', '로그인이 풀렸어요.'],
    not_found: ['🔍', '강의를 찾을 수 없어요', '삭제되었거나 비공개로 바뀐 강의예요.'],
    not_enrolled: ['🔒', '수강 권한이 필요해요', '이 강의는 수강 신청 후 볼 수 있어요.'],
    not_started: ['⏳', '아직 수강 시작 전이에요', '수강 시작일부터 볼 수 있어요.'],
    expired: ['📅', '수강 기간이 끝났어요', ''],
    limit: ['🎬', '시청 횟수를 모두 사용했어요', ''],
    replaced: ['📱', '다른 창에서 시청을 시작했어요', '같은 계정은 한 곳에서만 재생할 수 있어서 이 화면은 멈췄어요.'],
    no_media: ['🎞️', '영상이 아직 등록되지 않았어요', '관리자에게 문의해 주세요.'],
    no_session: ['⚠️', '시청 세션이 끊겼어요', '다시 열어 주세요.'],
    error: ['⚠️', '문제가 생겼어요', '잠시 후 다시 시도해 주세요.']
  };

  // ---------------------------------------------------------------- 공통 틀
  function shell(inner, nav) {
    var u = S.user;
    var demo = B.mode === 'demo'
      ? '<div class="demo-bar"><span><b>데모 모드</b> · 서버 연결 전 체험용이에요. 기록은 이 브라우저에만 저장돼요.</span>' +
        '<button data-demo="student">수강생 화면</button><button data-demo="admin">관리자 화면</button><button data-demo="reset">데모 초기화</button></div>'
      : '';
    var home = CFG.HOME_URL ? '<a class="home-link" href="' + esc(CFG.HOME_URL) + '">← 홈페이지</a>' : '';
    var navHtml = u ? '<nav class="nav"><a href="#/" class="' + (nav === 'home' ? 'on' : '') + '">내 강의실</a>' +
      (u.is_admin ? '<a href="#/admin" class="' + (nav === 'admin' ? 'on' : '') + '">관리자</a>' : '') + '</nav>' : '';
    var userHtml = u ? '<div class="user"><span class="user-name">' + esc(u.name || u.email) + '<small>' + esc(u.email) + '</small></span>' +
      '<button class="btn btn-sm" data-act="logout">로그아웃</button></div>' : '';
    app.innerHTML = demo + '<header class="topbar"><div class="topbar-in">' + home +
      '<a class="brand" href="#/"><span class="brand-dot"></span>' + esc(CFG.SITE_NAME || '강의실') + '</a>' +
      navHtml + '<span class="spacer"></span>' + userHtml + '</div></header><main id="main">' + inner + '</main>';
  }

  document.addEventListener('click', function (e) {
    var d = e.target.closest('[data-demo]');
    if (d && B.mode === 'demo') {
      var v = d.getAttribute('data-demo');
      if (v === 'reset') { if (confirm('데모 데이터를 처음 상태로 되돌릴까요?')) { S.user = null; A = null; B.resetDemo(); go('#/login'); } return; }
      B.loginAs(v).then(function (u) { S.user = u; A = null; go(v === 'admin' ? '#/admin' : '#/'); });
      return;
    }
    if (e.target.closest('[data-act="logout"]')) {
      cleanupWatch(); S.user = null; A = null;
      B.signOut().then(function () { go('#/login'); });
    }
  });

  // ---------------------------------------------------------------- 로그인
  function viewAuth(tab, msg) {
    tab = tab || 'login';
    var t = function (k, label) { return '<button data-tab="' + k + '" class="' + (tab === k ? 'on' : '') + '">' + label + '</button>'; };
    var form = '';
    if (tab === 'login') {
      form = '<form id="f-auth"><label class="field"><span>이메일</span><input class="input" type="email" name="email" autocomplete="email" required></label>' +
        '<label class="field"><span>비밀번호</span><input class="input" type="password" name="pw" autocomplete="current-password" required></label>' +
        '<button class="btn btn-primary btn-block">로그인</button>' +
        '<p class="small muted" style="text-align:center;margin:14px 0 0"><a href="#" data-tab="reset">비밀번호를 잊으셨나요?</a></p></form>';
    } else if (tab === 'signup') {
      form = '<form id="f-auth"><label class="field"><span>이름</span><input class="input" name="name" autocomplete="name" required></label>' +
        '<label class="field"><span>이메일</span><input class="input" type="email" name="email" autocomplete="email" required><em>강의를 구매할 때 쓴 이메일로 가입하면 수강 권한이 자동으로 연결돼요.</em></label>' +
        '<label class="field"><span>비밀번호 (6자 이상)</span><input class="input" type="password" name="pw" minlength="6" autocomplete="new-password" required></label>' +
        '<button class="btn btn-primary btn-block">회원가입</button></form>';
    } else {
      form = '<form id="f-auth"><p class="small muted" style="margin-top:0">가입한 이메일로 비밀번호 재설정 링크를 보내드려요.</p>' +
        '<label class="field"><span>이메일</span><input class="input" type="email" name="email" required></label>' +
        '<button class="btn btn-primary btn-block">재설정 메일 받기</button></form>';
    }
    var demoBox = B.mode === 'demo'
      ? '<div class="demo-accounts"><b>데모 계정</b> (비밀번호 demo1234)<br>수강생 student@demo.com · 관리자 admin@demo.com' +
        '<div class="row"><button class="btn btn-sm btn-dark" data-demo="student">수강생으로 체험</button><button class="btn btn-sm" data-demo="admin">관리자로 체험</button></div></div>'
      : '';
    shell('<div class="auth-wrap"><h1 class="auth-title">' + esc(CFG.SITE_NAME || '강의실') + '</h1>' +
      '<p class="page-sub" style="margin-bottom:22px">구매한 강의를 여기서 수강할 수 있어요.</p>' +
      '<div class="card card-pad"><div class="tabs">' + t('login', '로그인') + t('signup', '회원가입') + '</div>' +
      (msg ? '<div class="msg ' + (msg.ok ? 'msg-ok' : 'msg-err') + '">' + esc(msg.text) + '</div>' : '') + form + '</div>' + demoBox + '</div>');

    $$('[data-tab]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); viewAuth(b.getAttribute('data-tab')); }); });
    $('#f-auth').addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = e.target, btn = $('button', f); btn.disabled = true;
      var email = f.email.value, pw = f.pw && f.pw.value;
      try {
        if (tab === 'login') {
          S.user = await B.signIn(email, pw);
          go('#/');
        } else if (tab === 'signup') {
          var r = await B.signUp(email, pw, f.name.value.trim());
          if (r.needConfirm) viewAuth('login', { ok: true, text: email + ' 로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.' });
          else { S.user = await B.init(); go('#/'); }
        } else {
          await B.resetPassword(email);
          viewAuth('login', { ok: true, text: '재설정 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.' });
        }
      } catch (err) { viewAuth(tab, { ok: false, text: errMsg(err) }); }
    });
  }

  function viewSetPassword() {
    shell('<div class="auth-wrap"><h1 class="auth-title">새 비밀번호 설정</h1><div class="card card-pad"><form id="f-pw">' +
      '<label class="field"><span>새 비밀번호 (6자 이상)</span><input class="input" type="password" name="pw" minlength="6" required autocomplete="new-password"></label>' +
      '<button class="btn btn-primary btn-block">저장</button></form></div></div>');
    $('#f-pw').addEventListener('submit', async function (e) {
      e.preventDefault();
      try { await B.updatePassword(e.target.pw.value); toast('비밀번호를 바꿨어요.'); go('#/'); }
      catch (err) { toast(errMsg(err)); }
    });
  }

  // ---------------------------------------------------------------- 내 강의실
  async function loadMine() {
    var r = await Promise.all([B.listCourses(), B.listLessons(), B.myEnrollments(), B.myProgress(), B.mySessions(8)]);
    S.courses = r[0]; S.lessons = r[1]; S.enrollments = r[2]; S.progress = r[3]; S.sessions = r[4];
  }
  function myEnr(courseId) { return S.enrollments.find(function (e) { return e.course_id === courseId; }) || null; }
  function myProg(lessonId) { return S.progress.find(function (p) { return p.lesson_id === lessonId; }) || null; }
  function lessonsOf(courseId) { return S.lessons.filter(function (l) { return l.course_id === courseId; }); }
  function courseSummary(c) {
    var ls = lessonsOf(c.id), tot = 0, seen = 0, done = 0;
    ls.forEach(function (l) { var p = myProg(l.id); tot += l.duration_sec; seen += p ? Math.min(p.unique_sec, l.duration_sec) : 0; if (C.isComplete(p, l.duration_sec)) done++; });
    return { ratio: tot ? seen / tot : 0, done: done, count: ls.length, total: tot };
  }

  function lessonRow(c, l, i, canWatch, side, currentId) {
    var p = myProg(l.id);
    var ratio = p ? p.unique_sec / l.duration_sec : 0;
    var lim = S.user.is_admin ? null : C.viewLimit(c, p);
    var used = C.viewsUsed(p && p.played_sec, l.duration_sec);
    var done = C.isComplete(p, l.duration_sec);
    var exhausted = lim != null && used >= lim;
    var status = done ? '<span class="chip chip-green">완료</span>'
      : exhausted ? '<span class="chip chip-gray">횟수 소진</span>'
      : p && p.last_position > 5 ? '<span class="chip chip-accent">' + C.fmtTime(p.last_position) + '부터</span>'
      : '';
    var sub = '<span>' + C.fmtTime(l.duration_sec) + '</span>' +
      (lim != null ? '<span>사용 ' + n2(used) + ' / ' + n2(lim) + '회</span>' : (p ? '<span>' + n2(used) + '회 시청</span>' : ''));
    var tag = canWatch ? 'a href="#/watch/' + esc(l.id) + '"' : 'div';
    var cls = 'lesson' + (done ? ' done' : '') + (canWatch ? '' : ' locked') + (l.id === currentId ? ' current' : '');
    if (side) {
      return '<' + tag + ' class="' + cls + '"><span class="lesson-no">' + (done ? '✓' : i + 1) + '</span>' +
        '<span><span class="lesson-title" style="font-size:14px">' + esc(l.title) + '</span><span class="lesson-sub">' + sub + '</span></span>' +
        '<span class="small" style="font-weight:800;color:var(--ink-soft)">' + pct(ratio) + '%</span></' + tag.split(' ')[0] + '>';
    }
    return '<' + tag + ' class="' + cls + '"><span class="lesson-no">' + (done ? '✓' : i + 1) + '</span>' +
      '<span><span class="lesson-title">' + esc(l.title) + '</span><span class="lesson-sub">' + sub + '</span></span>' +
      '<span>' + status + '</span>' +
      '<span class="lesson-mini"><span>' + pct(ratio) + '%</span><span class="bar"><i style="width:' + pct(ratio) + '%"></i></span></span></' + tag.split(' ')[0] + '>';
  }

  async function viewHome() {
    shell('<div class="empty">불러오는 중…</div>', 'home');
    try { await loadMine(); } catch (e) { $('#main').innerHTML = '<div class="msg msg-err">' + esc(errMsg(e)) + '</div>'; return; }
    var cards = S.courses.map(function (c) {
      var e = myEnr(c.id), st = S.user.is_admin ? 'active' : enrState(e);
      return { c: c, e: e, st: st, order: st === 'active' ? 0 : st === 'none' ? 2 : 1 };
    }).sort(function (a, b) { return a.order - b.order || a.c.sort - b.c.sort; });

    var mine = cards.filter(function (x) { return x.st === 'active'; }).length;
    var html = '<div class="page-head"><div><h1 class="page-title">' + esc(S.user.name || '회원') + '님의 강의실</h1>' +
      '<p class="page-sub">지금 들을 수 있는 강의 ' + mine + '개' + (S.user.is_admin ? ' · 관리자는 모든 강의를 미리 볼 수 있어요' : '') + '</p></div></div><div class="grid">';

    if (!cards.length) html += '<div class="card empty">아직 등록된 강의가 없어요.</div>';
    cards.forEach(function (x) {
      var c = x.c, ls = lessonsOf(c.id), can = x.st === 'active';
      var sm = courseSummary(c);
      var meta = (S.user.is_admin && !x.e ? '<span class="chip chip-dark">관리자 미리보기</span>' : (x.e ? periodChip(x.e) : '')) +
        (c.max_views != null ? '<span class="chip">회차당 ' + n2(c.max_views) + '회 시청</span>' : '<span class="chip">시청 횟수 무제한</span>') +
        '<span class="chip">' + ls.length + '강 · ' + C.fmtMinutes(sm.total) + '</span>';
      html += '<section class="card course' + (can ? '' : ' locked') + '"><div class="course-head"><div><h2 class="course-title">' + esc(c.title) + '</h2>' +
        (c.description ? '<p class="course-desc">' + esc(c.description) + '</p>' : '') + '<div class="course-meta">' + meta + '</div></div>' +
        (can ? '<div class="course-progress"><div class="small muted" style="font-weight:700">전체 진도 · 완료 ' + sm.done + '/' + sm.count + '강</div><b>' + pct(sm.ratio) + '%</b><div class="bar"><i style="width:' + pct(sm.ratio) + '%"></i></div></div>' : '') +
        '</div><div class="lessons">' + (ls.length ? ls.map(function (l, i) { return lessonRow(c, l, i, can); }).join('') : '<div class="empty">회차가 아직 없어요.</div>') + '</div>';
      if (!can) {
        var why = x.st === 'expired' ? '수강 기간이 ' + fmtDate(x.e.expires_at) + '에 끝났어요. ' + esc(CFG.CONTACT_TEXT || '')
          : x.st === 'revoked' ? '수강 권한이 해지됐어요. ' + esc(CFG.CONTACT_TEXT || '')
          : x.st === 'pending' ? fmtDate(x.e.starts_at) + '부터 수강할 수 있어요.'
          : '수강 신청 후 들을 수 있어요.';
        html += '<div class="lock-cta"><span class="small" style="font-weight:700">' + why + '</span>' +
          (x.st === 'none' && CFG.PURCHASE_URL ? '<a class="btn btn-primary btn-sm" href="' + esc(CFG.PURCHASE_URL) + '">수강 신청하기</a>' : '') + '</div>';
      }
      html += '</section>';
    });
    html += '</div>';

    if (S.sessions.length) {
      html += '<section class="card card-pad" style="margin-top:18px"><h2 class="section-title">최근 시청 기록</h2><ul class="history-list">' +
        S.sessions.filter(function (s) { return s.played_sec > 0; }).map(function (s) {
          var l = byId(S.lessons, s.lesson_id);
          return '<li><span>' + esc(l ? l.title : '삭제된 회차') + '</span><span class="muted nowrap">' + fmtDT(s.started_at) + ' · ' + C.fmtMinutes(s.played_sec) + ' 시청</span></li>';
        }).join('') + '</ul></section>';
    }
    $('#main').innerHTML = html;
  }

  // ---------------------------------------------------------------- 시청
  function cleanupWatch() {
    if (tracker) { tracker.destroy(); tracker = null; }
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
  }

  async function viewWatch(lessonId) {
    shell('<div class="empty">불러오는 중…</div>', 'home');
    try { if (!S.lessons.length) await loadMine(); } catch (e) {}
    var l = byId(S.lessons, lessonId);
    var c = l ? byId(S.courses, l.course_id) : null;
    var ls = c ? lessonsOf(c.id) : [];
    var idx = l ? ls.indexOf(l) : -1;
    var prev = idx > 0 ? ls[idx - 1] : null, next = idx >= 0 && idx < ls.length - 1 ? ls[idx + 1] : null;

    $('#main').innerHTML =
      '<div class="watch"><div>' +
      '<div class="crumb"><a href="#/">내 강의실</a> › ' + esc(c ? c.title : '') + '</div>' +
      '<h1 class="watch-title">' + esc(l ? l.title : '강의') + '</h1>' +
      '<div class="player-box"><div class="player-slot" id="slot"></div><div class="overlay" id="ov"><div><div class="spinner"></div><p>강의를 여는 중…</p></div></div></div>' +
      '<div class="rangebar-wrap"><div class="rangebar-label"><span>내가 본 구간</span><span id="rb-txt"></span></div><div class="rangebar" id="rb"></div></div>' +
      '<div class="stats" id="stats"></div>' +
      '<div class="rule-note"><b>시청 횟수 계산</b> · 영상 길이만큼 재생하면 1회로 계산돼요. 되감아 다시 보거나 반복한 시간도 포함되고, 건너뛴 부분은 빠져요. 같은 계정은 한 창에서만 재생돼요.</div>' +
      '<div class="next-wrap">' + (prev ? '<a class="btn" href="#/watch/' + esc(prev.id) + '">← 이전 강의</a>' : '<span></span>') +
      (next ? '<a class="btn btn-dark" href="#/watch/' + esc(next.id) + '">다음 강의 →</a>' : '') + '</div>' +
      '</div><aside class="card side" style="overflow:hidden"><div class="side-head"><span class="small muted" style="font-weight:700">커리큘럼</span><b>' + esc(c ? c.title : '') + '</b></div>' +
      '<div id="side-list">' + (c ? ls.map(function (x, i) { return lessonRow(c, x, i, true, true, lessonId); }).join('') : '') + '</div></aside></div>';

    var ov = $('#ov');
    function overlay(reason, extra) {
      var R = REASONS[reason] || REASONS.error;
      var desc = R[2];
      if (reason === 'limit') desc = '이 회차는 최대 ' + n2(extra && extra.max_views) + '회까지 볼 수 있어요. ' + (CFG.CONTACT_TEXT || '');
      if (reason === 'expired') desc = (CFG.CONTACT_TEXT || '');
      var btns = '<a class="btn" href="#/">내 강의실로</a>';
      if (reason === 'replaced' || reason === 'no_session') btns += ' <button class="btn btn-primary" id="ov-retry">여기서 다시 보기</button>';
      if (reason === 'not_enrolled' && CFG.PURCHASE_URL) btns += ' <a class="btn btn-primary" href="' + esc(CFG.PURCHASE_URL) + '">수강 신청하기</a>';
      if (reason === 'login') btns = '<a class="btn btn-primary" href="#/login">로그인</a>';
      ov.innerHTML = '<div><div class="icon">' + R[0] + '</div><h3>' + esc(R[1]) + '</h3><p>' + esc(desc) + '</p>' + btns + '</div>';
      ov.classList.remove('hidden');
      var rt = $('#ov-retry'); if (rt) rt.addEventListener('click', function () { cleanupWatch(); viewWatch(lessonId); });
    }

    var info;
    try { info = await B.openLecture(lessonId); } catch (e) { overlay('error'); return; }
    if (location.hash !== '#/watch/' + lessonId) return;   // 그사이 다른 화면으로 이동
    if (!info.ok) { overlay(info.reason, info); renderStats(null); return; }

    var duration = info.duration_sec;
    var cur = { played: Number(info.played_sec) || 0, unique: Number(info.unique_sec) || 0, ranges: info.watched_ranges || [], max: info.max_views, pos: 0 };

    function renderStats() {
      var used = C.viewsUsed(cur.played, duration);
      var remain = cur.max == null ? null : Math.max(0, cur.max * duration - cur.played);
      var warn = remain != null && remain < duration * 0.5;
      $('#stats').innerHTML =
        '<div class="stat"><div class="stat-label">진도율</div><div class="stat-value">' + pct(cur.unique / duration) + '<small>%</small></div></div>' +
        '<div class="stat"><div class="stat-label">사용한 횟수</div><div class="stat-value">' + n2(used) + '<small>' + (cur.max == null ? '회 · 무제한' : ' / ' + n2(cur.max) + '회') + '</small></div></div>' +
        '<div class="stat' + (warn ? ' warn' : '') + '"><div class="stat-label">남은 시청 시간</div><div class="stat-value">' + (remain == null ? '무제한' : remainText(remain)) + '</div></div>';
      $('#rb').innerHTML = cur.ranges.map(function (r) {
        return '<i style="left:' + (r[0] / duration * 100) + '%;width:' + ((r[1] - r[0]) / duration * 100) + '%"></i>';
      }).join('') + '<span class="head" id="rb-head" style="left:' + (cur.pos / duration * 100) + '%"></span>';
      $('#rb-txt').textContent = C.fmtTime(cur.unique) + ' / ' + C.fmtTime(duration) + ' 시청';
    }
    renderStats();

    try { await loadVimeo(); } catch (e) { overlay('error'); return; }
    if (location.hash !== '#/watch/' + lessonId) return;
    cleanupWatch();
    player = new window.Vimeo.Player($('#slot'), vimeoOpts(info.vimeo_id, info.vimeo_hash, { responsive: false }));

    player.ready().then(function () {
      ov.classList.add('hidden');
      return player.getDuration();
    }).then(function (d) {
      if (!tracker || !player) return;
      if (B.mode === 'demo' && B.syncDuration(lessonId, d)) { duration = Math.round(d); tracker.o.duration = duration; if (cur.max != null) tracker.o.limitSec = cur.max * duration; renderStats(); }
      var lp = Number(info.last_position) || 0;
      if (lp > 5 && lp < duration - 10) {
        player.setCurrentTime(lp).then(function () { toast(C.fmtTime(lp) + '부터 이어서 볼 수 있어요'); }).catch(function () {});
      }
    }).catch(function () {
      if (!player) return;
      overlay('error');
      ov.querySelector('p').textContent = '영상을 불러오지 못했어요. Vimeo 영상의 공개 범위와 도메인 허용 설정을 확인해 주세요.';
    });

    tracker = new window.LRWatchTracker(player, {
      sessionId: info.session_id,
      duration: duration,
      playedSec: cur.played,
      limitSec: cur.max == null ? null : cur.max * duration,
      send: function (segs, pos) { return B.recordWatch(info.session_id, segs, pos); },
      sendKeepalive: function (segs, pos) { B.recordWatchKeepalive(info.session_id, segs, pos); },
      onTime: function (t) { cur.pos = t; var h = $('#rb-head'); if (h) h.style.left = (t / duration * 100) + '%'; },
      onResult: function (r) {
        if (!r) return;
        if (r.played_sec != null) cur.played = Number(r.played_sec);
        if (r.unique_sec != null) cur.unique = Number(r.unique_sec);
        if (r.watched_ranges) cur.ranges = r.watched_ranges;
        if (r.max_views !== undefined && r.max_views !== null) cur.max = Number(r.max_views);
        renderStats();
        // 커리큘럼 진도도 갱신
        var p = myProg(lessonId);
        if (!p) { p = { lesson_id: lessonId, user_id: S.user.id, bonus_views: 0 }; S.progress.push(p); }
        p.played_sec = cur.played; p.unique_sec = cur.unique; p.watched_ranges = cur.ranges; p.last_position = cur.pos;
        var sl = $('#side-list'); if (sl && c) sl.innerHTML = ls.map(function (x, i) { return lessonRow(c, x, i, true, true, lessonId); }).join('');
      },
      onStop: function (reason) {
        overlay(reason, { max_views: cur.max });
        setTimeout(function () { if (player) { try { player.destroy(); } catch (e) {} player = null; } }, 300);
      },
      onFailing: function (failing) {
        if (failing) {
          ov.innerHTML = '<div><div class="icon">📶</div><h3>시청 기록을 저장하지 못했어요</h3><p>인터넷 연결을 확인해 주세요. 연결되면 다시 재생할 수 있어요.</p><button class="btn btn-primary" id="ov-retry2">다시 시도</button></div>';
          ov.classList.remove('hidden');
          $('#ov-retry2').addEventListener('click', function () { tracker.flush().then(function () { if (!tracker.fails) ov.classList.add('hidden'); }); });
        } else if (!tracker.stopped) ov.classList.add('hidden');
      }
    });
  }

  // ---------------------------------------------------------------- 관리자: 공통
  async function loadAdmin(force) {
    if (A && !force) return A;
    var r = await Promise.all([B.listCourses(), B.listLessons(), B.admin.listProfiles(), B.admin.listEnrollments(), B.admin.listInvites(), B.admin.listProgress({})]);
    A = { courses: r[0], lessons: r[1], profiles: r[2], enrollments: r[3], invites: r[4], progress: r[5] };
    return A;
  }
  function adminTabs(on) {
    var t = function (k, href, label) { return '<a href="' + href + '" class="' + (on === k ? 'on' : '') + '">' + label + '</a>'; };
    return '<div class="admin-tabs">' + t('students', '#/admin', '수강생') + t('courses', '#/admin/courses', '강의·회차') + t('stats', '#/admin/stats', '시청 통계') + '</div>';
  }
  function courseOptions(sel, withAll) {
    return (withAll ? '<option value="">전체 강의</option>' : '') + A.courses.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.title) + '</option>';
    }).join('');
  }
  function enrSummary(e) {
    var ls = A.lessons.filter(function (l) { return l.course_id === e.course_id; });
    var tot = 0, seen = 0, done = 0, last = null;
    ls.forEach(function (l) {
      var p = A.progress.find(function (x) { return x.user_id === e.user_id && x.lesson_id === l.id; });
      tot += l.duration_sec;
      if (p) {
        seen += Math.min(p.unique_sec, l.duration_sec);
        if (C.isComplete(p, l.duration_sec)) done++;
        if (p.first_watched_at && (!last || p.updated_at > last)) last = p.updated_at;
      }
    });
    return { ratio: tot ? seen / tot : 0, done: done, count: ls.length, last: last };
  }

  // ---------------------------------------------------------------- 관리자: 수강생
  var stuFilter = { course: '', q: '', st: '' };
  async function viewAdminStudents() {
    shell(adminTabs('students') + '<div class="empty">불러오는 중…</div>', 'admin');
    try { await loadAdmin(true); } catch (e) { $('#main').innerHTML = '<div class="msg msg-err">' + esc(errMsg(e)) + '</div>'; return; }
    renderStudents();
  }
  function renderStudents() {
    var active = A.enrollments.filter(function (e) { return enrState(e) === 'active'; });
    var weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
    var watchers = {};
    var activeIds = {}; active.forEach(function (e) { activeIds[e.user_id] = 1; });
    A.progress.forEach(function (p) { if (activeIds[p.user_id] && p.updated_at > weekAgo && p.played_sec > 0) watchers[p.user_id] = 1; });
    var soon = active.filter(function (e) { var d = daysLeft(e.expires_at); return d != null && d <= 7; }).length;
    var avg = active.length ? active.reduce(function (s, e) { return s + enrSummary(e).ratio; }, 0) / active.length : 0;

    var rows = A.enrollments.map(function (e) {
      return { e: e, u: byId(A.profiles, e.user_id) || { name: '(탈퇴)', email: '' }, c: byId(A.courses, e.course_id) || { title: '-' }, st: enrState(e), sm: enrSummary(e) };
    }).filter(function (r) {
      if (stuFilter.course && r.e.course_id !== stuFilter.course) return false;
      if (stuFilter.st && r.st !== stuFilter.st) return false;
      if (stuFilter.q) { var q = stuFilter.q.toLowerCase(); if ((r.u.name || '').toLowerCase().indexOf(q) < 0 && (r.u.email || '').toLowerCase().indexOf(q) < 0 && (r.e.memo || '').toLowerCase().indexOf(q) < 0) return false; }
      return true;
    }).sort(function (a, b) { return (b.sm.last || '') < (a.sm.last || '') ? -1 : 1; });

    var stLabel = { active: '<span class="chip chip-green">수강 중</span>', expired: '<span class="chip chip-gray">만료</span>', revoked: '<span class="chip chip-gray">해지</span>', pending: '<span class="chip chip-warn">시작 전</span>' };
    var html = adminTabs('students') +
      '<div class="kpis"><div class="stat"><div class="stat-label">수강 중</div><div class="stat-value">' + active.length + '<small>명</small></div></div>' +
      '<div class="stat"><div class="stat-label">최근 7일 시청자</div><div class="stat-value">' + Object.keys(watchers).length + '<small>명</small></div></div>' +
      '<div class="stat"><div class="stat-label">평균 진도율</div><div class="stat-value">' + pct(avg) + '<small>%</small></div></div>' +
      '<div class="stat' + (soon ? ' warn' : '') + '"><div class="stat-label">7일 안에 만료</div><div class="stat-value">' + soon + '<small>명</small></div></div></div>' +
      '<div class="card card-pad"><div class="toolbar"><select class="input" id="flt-course">' + courseOptions(stuFilter.course, true) + '</select>' +
      '<select class="input" id="flt-st"><option value="">전체 상태</option><option value="active"' + (stuFilter.st === 'active' ? ' selected' : '') + '>수강 중</option><option value="expired"' + (stuFilter.st === 'expired' ? ' selected' : '') + '>만료</option><option value="revoked"' + (stuFilter.st === 'revoked' ? ' selected' : '') + '>해지</option></select>' +
      '<input class="input grow" id="flt-q" placeholder="이름·이메일·메모 검색" value="' + esc(stuFilter.q) + '"><span class="spacer"></span>' +
      '<button class="btn btn-primary" id="btn-grant">+ 수강 권한 부여</button></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>수강생</th><th>강의</th><th>기간</th><th>진도율</th><th class="num">완료</th><th>최근 시청</th><th>상태</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) {
        return '<tr class="click" data-uid="' + esc(r.e.user_id) + '"><td><b>' + esc(r.u.name) + '</b><div class="tbl-email">' + esc(r.u.email) + (r.e.memo ? ' · ' + esc(r.e.memo) : '') + '</div></td>' +
          '<td>' + esc(r.c.title) + '</td><td class="nowrap">' + (r.e.expires_at ? fmtDate(r.e.expires_at) + (r.st === 'active' ? ' <span class="muted small">(D-' + daysLeft(r.e.expires_at) + ')</span>' : '') : '무제한') + '</td>' +
          '<td style="min-width:120px"><div class="small" style="font-weight:800">' + pct(r.sm.ratio) + '%</div><div class="bar" style="margin-top:3px"><i style="width:' + pct(r.sm.ratio) + '%"></i></div></td>' +
          '<td class="num">' + r.sm.done + '/' + r.sm.count + '</td><td class="nowrap">' + (r.sm.last ? ago(r.sm.last) : '<span class="muted">시청 전</span>') + '</td><td>' + (stLabel[r.st] || '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">조건에 맞는 수강생이 없어요.</td></tr>') +
      '</tbody></table></div></div>';

    if (A.invites.length) {
      html += '<div class="card card-pad" style="margin-top:18px"><h2 class="section-title">가입 대기 중 (' + A.invites.length + ')</h2>' +
        '<p class="small muted" style="margin-top:-6px">아직 가입하지 않은 이메일이에요. 이 이메일로 가입하는 순간 수강 권한이 자동으로 생겨요.</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>이메일</th><th>강의</th><th>기간</th><th>메모</th><th>등록일</th><th></th></tr></thead><tbody>' +
        A.invites.map(function (i) {
          var c = byId(A.courses, i.course_id);
          return '<tr><td>' + esc(i.email) + '</td><td>' + esc(c ? c.title : '-') + '</td><td>' + (i.until_at ? fmtDate(i.until_at) + '까지' : i.days ? '가입일부터 ' + i.days + '일' : '무제한') + '</td>' +
            '<td>' + esc(i.memo || '') + '</td><td class="nowrap">' + fmtDate(i.created_at) + '</td><td class="num"><button class="btn btn-sm btn-danger" data-del-inv="' + esc(i.id) + '">취소</button></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    $('#main').innerHTML = html;

    $('#flt-course').addEventListener('change', function (e) { stuFilter.course = e.target.value; renderStudents(); });
    $('#flt-st').addEventListener('change', function (e) { stuFilter.st = e.target.value; renderStudents(); });
    var qT; $('#flt-q').addEventListener('input', function (e) { clearTimeout(qT); qT = setTimeout(function () { stuFilter.q = e.target.value; renderStudents(); var q = $('#flt-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); });
    $$('tr[data-uid]').forEach(function (tr) { tr.addEventListener('click', function () { location.hash = '#/admin/student/' + tr.getAttribute('data-uid'); }); });
    $$('[data-del-inv]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('이 초대를 취소할까요?')) return;
        await B.admin.deleteInvite(b.getAttribute('data-del-inv')); await loadAdmin(true); renderStudents(); toast('초대를 취소했어요.');
      });
    });
    $('#btn-grant').addEventListener('click', function () { openGrant(); });
  }

  function openGrant(onDone) {
    if (!A.courses.length) { toast('먼저 강의를 만들어 주세요.'); return; }
    var c0 = byId(A.courses, stuFilter.course) || A.courses[0];
    var m = modal('수강 권한 부여',
      '<label class="field"><span>이메일 (여러 명은 줄바꿈이나 쉼표로 구분)</span><textarea class="input" id="g-emails" placeholder="buyer1@example.com&#10;buyer2@example.com"></textarea>' +
      '<em>가입한 회원은 바로, 가입 전이면 그 이메일로 가입할 때 자동으로 수강 권한이 생겨요.</em></label>' +
      '<label class="field"><span>강의</span><select class="input" id="g-course">' + courseOptions(c0.id) + '</select></label>' +
      '<label class="field"><span>수강 기간</span><select class="input" id="g-mode"><option value="default">강의 기본 기간</option><option value="days">직접 입력 (일)</option><option value="until">특정 날짜까지</option><option value="none">무제한</option></select></label>' +
      '<div class="row hidden" id="g-days-row" style="margin:-4px 0 14px"><input class="input grow" type="number" min="1" id="g-days" placeholder="예: 365"><span class="small muted">일</span></div>' +
      '<div class="hidden" id="g-until-row" style="margin:-4px 0 14px"><input class="input" type="date" id="g-until"></div>' +
      '<p class="small muted" id="g-default-hint" style="margin:-6px 0 14px"></p>' +
      '<label class="field"><span>메모 (선택)</span><input class="input" id="g-memo" placeholder="예: 스마트스토어 10/17 주문"></label>',
      '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="g-ok">부여하기</button>');
    function hint() {
      var c = byId(A.courses, $('#g-course', m).value), mode = $('#g-mode', m).value;
      $('#g-days-row', m).classList.toggle('hidden', mode !== 'days');
      $('#g-until-row', m).classList.toggle('hidden', mode !== 'until');
      $('#g-default-hint', m).textContent = mode === 'default' ? (c && c.access_days ? '오늘(가입 전이면 가입일)부터 ' + c.access_days + '일' : '이 강의는 기본 기간이 무제한이에요.') : '';
    }
    $('#g-course', m).addEventListener('change', hint); $('#g-mode', m).addEventListener('change', hint); hint();
    $('#g-ok', m).addEventListener('click', async function () {
      var emails = $('#g-emails', m).value.split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!emails.length) { toast('이메일을 입력해 주세요.'); return; }
      var cid = $('#g-course', m).value, c = byId(A.courses, cid), mode = $('#g-mode', m).value;
      var days = null, until = null;
      if (mode === 'default') days = c.access_days || null;
      if (mode === 'days') { days = parseInt($('#g-days', m).value, 10); if (!(days > 0)) { toast('기간(일)을 입력해 주세요.'); return; } }
      if (mode === 'until') { var v = $('#g-until', m).value; if (!v) { toast('날짜를 골라 주세요.'); return; } until = new Date(v + 'T23:59:59').toISOString(); }
      var memo = $('#g-memo', m).value.trim() || null;
      this.disabled = true;
      var cnt = { enrolled: 0, invited: 0, invalid: 0 }, bad = [];
      for (var i = 0; i < emails.length; i++) {
        try { var r = await B.admin.grant(emails[i], cid, days, until, memo); cnt[r] = (cnt[r] || 0) + 1; if (r === 'invalid') bad.push(emails[i]); }
        catch (e) { cnt.invalid++; bad.push(emails[i]); }
      }
      m.close();
      toast('바로 부여 ' + cnt.enrolled + '명 · 가입 대기 ' + cnt.invited + '명' + (cnt.invalid ? ' · 실패 ' + cnt.invalid + '건' : ''));
      if (bad.length) setTimeout(function () { alert('처리하지 못한 이메일:\n' + bad.join('\n')); }, 300);
      await loadAdmin(true);
      if (onDone) onDone(); else renderStudents();
    });
  }

  // ---------------------------------------------------------------- 관리자: 수강생 상세
  async function viewAdminStudent(uid) {
    shell(adminTabs('students') + '<div class="empty">불러오는 중…</div>', 'admin');
    var sessions;
    try { await loadAdmin(!A); sessions = (await B.admin.listSessions(uid)).filter(function (s) { return s.played_sec > 0 || (!s.ended_reason && Date.now() - new Date(s.last_beat_at).getTime() < 60000); }); A.progress = A.progress.filter(function (p) { return p.user_id !== uid; }).concat(await B.admin.listProgress({ userId: uid })); }
    catch (e) { $('#main').innerHTML = '<div class="msg msg-err">' + esc(errMsg(e)) + '</div>'; return; }
    var u = byId(A.profiles, uid);
    if (!u) { $('#main').innerHTML = adminTabs('students') + '<div class="card empty">회원을 찾을 수 없어요.</div>'; return; }
    var ens = A.enrollments.filter(function (e) { return e.user_id === uid; });

    function device(ua) {
      ua = ua || ''; if (ua === 'demo') return '-';
      var mob = /Mobi|Android|iPhone|iPad/i.test(ua) ? '모바일' : 'PC';
      var br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /Whale/.test(ua) ? '웨일' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
      return mob + (br ? ' · ' + br : '');
    }
    var endLabel = { replaced: '다른 창에서 시작', limit: '횟수 소진', expired: '기간 만료', closed: '종료' };

    var html = adminTabs('students') + '<div class="crumb"><a href="#/admin">수강생</a> › ' + esc(u.name) + '</div>' +
      '<div class="page-head"><div><h1 class="page-title">' + esc(u.name) + '</h1><p class="page-sub">' + esc(u.email) + ' · ' + fmtDate(u.created_at) + ' 가입' + (u.is_admin ? ' · 관리자' : '') + '</p></div>' +
      '<button class="btn btn-primary" id="btn-add-course">+ 강의 권한 추가</button></div><div class="grid">';

    if (!ens.length) html += '<div class="card empty">수강 중인 강의가 없어요.</div>';
    ens.forEach(function (e) {
      var c = byId(A.courses, e.course_id); if (!c) return;
      var ls = A.lessons.filter(function (l) { return l.course_id === c.id; });
      var st = enrState(e);
      html += '<section class="card card-pad" data-enr="' + esc(e.id) + '"><div class="row" style="justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
        '<div><h2 class="section-title" style="margin-bottom:6px">' + esc(c.title) + '</h2><div class="course-meta" style="margin-top:0">' + periodChip(e) +
        '<span class="chip">' + fmtDate(e.starts_at) + ' 시작</span><span class="chip">' + ({ manual: '직접 부여', invite: '초대 가입', payment: '결제' }[e.source] || esc(e.source)) + '</span>' + (e.memo ? '<span class="chip">' + esc(e.memo) + '</span>' : '') + '</div></div>' +
        '<div class="row"><button class="btn btn-sm" data-ext="30">+30일</button><button class="btn btn-sm" data-ext="90">+90일</button><button class="btn btn-sm" data-ext="date">날짜 지정</button><button class="btn btn-sm" data-ext="none">무제한</button>' +
        (st === 'revoked' ? '<button class="btn btn-sm" data-status="active">권한 복구</button>' : '<button class="btn btn-sm btn-danger" data-status="revoked">권한 해지</button>') + '</div></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>회차</th><th>진도율</th><th class="num">사용 / 최대</th><th class="num">이어보기 위치</th><th>최근 시청</th><th></th></tr></thead><tbody>' +
        ls.map(function (l, i) {
          var p = A.progress.find(function (x) { return x.user_id === uid && x.lesson_id === l.id; });
          var used = C.viewsUsed(p && p.played_sec, l.duration_sec), lim = C.viewLimit(c, p);
          var r = p ? p.unique_sec / l.duration_sec : 0;
          return '<tr><td><b>' + esc(l.title) + '</b><div class="tbl-email">' + C.fmtTime(l.duration_sec) + '</div></td>' +
            '<td style="min-width:140px"><div class="small" style="font-weight:800">' + pct(r) + '%' + (C.isComplete(p, l.duration_sec) ? ' · 완료' : '') + '</div>' +
            '<div class="rangebar" style="height:8px;margin-top:4px">' + (p ? p.watched_ranges.map(function (g) { return '<i style="left:' + (g[0] / l.duration_sec * 100) + '%;width:' + ((g[1] - g[0]) / l.duration_sec * 100) + '%"></i>'; }).join('') : '') + '</div></td>' +
            '<td class="num">' + n2(used) + ' / ' + (lim == null ? '무제한' : n2(lim) + (p && p.bonus_views ? ' <span class="muted small">(+' + n2(p.bonus_views) + ')</span>' : '')) + '</td>' +
            '<td class="num">' + (p ? C.fmtTime(p.last_position) : '-') + '</td><td class="nowrap">' + (p && p.played_sec > 0 ? ago(p.updated_at) : '<span class="muted">시청 전</span>') + '</td>' +
            '<td class="num nowrap"><button class="btn btn-sm" data-bonus="' + esc(l.id) + '" title="이 회차 시청 횟수 1회 추가">+1회</button> ' +
            '<button class="btn btn-sm btn-ghost" data-reset="' + esc(l.id) + '" title="사용 횟수를 0으로 (진도는 유지)">횟수 초기화</button></td></tr>';
        }).join('') + '</tbody></table></div></section>';
    });

    html += '<section class="card card-pad"><h2 class="section-title">시청 기록</h2>' +
      (sessions.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>시작</th><th>회차</th><th class="num">시청 시간</th><th>마지막 기록</th><th>종료</th><th>기기</th></tr></thead><tbody>' +
        sessions.map(function (s) {
          var live = !s.ended_reason && Date.now() - new Date(s.last_beat_at).getTime() < 60000;
          var l = byId(A.lessons, s.lesson_id);
          return '<tr><td class="nowrap">' + fmtDT(s.started_at) + '</td><td>' + esc(l ? l.title : '삭제된 회차') + '</td><td class="num">' + C.fmtTime(s.played_sec) + '</td>' +
            '<td class="nowrap">' + fmtDT(s.last_beat_at) + '</td><td>' + (s.ended_reason ? esc(endLabel[s.ended_reason] || s.ended_reason) : live ? '<span class="chip chip-accent">시청 중</span>' : '창 닫음') + '</td><td class="small">' + esc(device(s.user_agent)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">아직 시청 기록이 없어요.</div>') + '</section></div>';
    $('#main').innerHTML = html;

    $$('[data-enr]').forEach(function (sec) {
      var e = byId(A.enrollments, sec.getAttribute('data-enr'));
      var c = byId(A.courses, e.course_id);
      $$('[data-ext]', sec).forEach(function (b) {
        b.addEventListener('click', async function () {
          var v = b.getAttribute('data-ext'), exp;
          if (v === 'none') exp = null;
          else if (v === 'date') {
            var s = prompt('만료일을 입력하세요 (예: 2027-12-31)', e.expires_at ? e.expires_at.slice(0, 10) : '');
            if (!s) return; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { toast('날짜 형식은 2027-12-31 처럼 입력해 주세요.'); return; }
            exp = new Date(s + 'T23:59:59').toISOString();
          } else {
            var base = e.expires_at && new Date(e.expires_at) > new Date() ? new Date(e.expires_at).getTime() : Date.now();
            exp = new Date(base + Number(v) * DAY).toISOString();
          }
          await B.admin.updateEnrollment(e.id, { expires_at: exp });
          toast('기간을 ' + (exp ? fmtDate(exp) + '까지로' : '무제한으로') + ' 바꿨어요.');
          await loadAdmin(true); viewAdminStudent(uid);
        });
      });
      $$('[data-status]', sec).forEach(function (b) {
        b.addEventListener('click', async function () {
          var v = b.getAttribute('data-status');
          if (v === 'revoked' && !confirm(c.title + ' 수강 권한을 해지할까요? 시청 기록은 남아요.')) return;
          await B.admin.updateEnrollment(e.id, { status: v });
          toast(v === 'revoked' ? '권한을 해지했어요.' : '권한을 복구했어요.');
          await loadAdmin(true); viewAdminStudent(uid);
        });
      });
      $$('[data-bonus]', sec).forEach(function (b) {
        b.addEventListener('click', async function () {
          var lid = b.getAttribute('data-bonus');
          var p = A.progress.find(function (x) { return x.user_id === uid && x.lesson_id === lid; });
          await B.admin.updateProgress(uid, lid, { bonus_views: Number((p && p.bonus_views) || 0) + 1 });
          toast('시청 횟수를 1회 추가했어요.'); viewAdminStudent(uid);
        });
      });
      $$('[data-reset]', sec).forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!confirm('이 회차의 사용 횟수를 0으로 되돌릴까요? (진도율은 그대로 유지)')) return;
          await B.admin.updateProgress(uid, b.getAttribute('data-reset'), { played_sec: 0, bonus_views: 0 });
          toast('사용 횟수를 초기화했어요.'); viewAdminStudent(uid);
        });
      });
    });
    $('#btn-add-course').addEventListener('click', function () {
      openGrant(function () { viewAdminStudent(uid); });
      var t = $('#g-emails'); if (t) t.value = u.email;
    });
  }

  // ---------------------------------------------------------------- 관리자: 강의·회차
  var selCourse = null;
  async function viewAdminCourses() {
    shell(adminTabs('courses') + '<div class="empty">불러오는 중…</div>', 'admin');
    var media;
    try { await loadAdmin(true); media = await B.admin.listMedia(); } catch (e) { $('#main').innerHTML = '<div class="msg msg-err">' + esc(errMsg(e)) + '</div>'; return; }
    if (!selCourse || !byId(A.courses, selCourse)) selCourse = A.courses[0] ? A.courses[0].id : 'new';
    var c = selCourse === 'new' ? { title: '', description: '', max_views: 3, access_days: 180, sort: A.courses.length + 1, is_published: true } : byId(A.courses, selCourse);
    var ls = c.id ? A.lessons.filter(function (l) { return l.course_id === c.id; }) : [];

    var html = adminTabs('courses') + '<div class="two-col"><div class="card" style="overflow:hidden"><div class="side-head row" style="justify-content:space-between"><b>강의 목록</b><button class="btn btn-sm btn-primary" id="c-new">+ 새 강의</button></div>' +
      (A.courses.length ? A.courses.map(function (x) {
        var n = A.lessons.filter(function (l) { return l.course_id === x.id; }).length;
        var k = A.enrollments.filter(function (e) { return e.course_id === x.id && enrState(e) === 'active'; }).length;
        return '<a class="lesson' + (x.id === selCourse ? ' current' : '') + '" href="#" data-sel="' + esc(x.id) + '" style="grid-template-columns:1fr auto;padding:13px 16px"><span><span class="lesson-title">' + esc(x.title) + '</span><span class="lesson-sub"><span>' + n + '강</span><span>수강 중 ' + k + '명</span>' + (x.is_published ? '' : '<span>비공개</span>') + '</span></span><span class="muted">›</span></a>';
      }).join('') : '<div class="empty">강의가 없어요.</div>') + '</div>' +

      '<div class="grid"><section class="card card-pad"><h2 class="section-title">' + (c.id ? '강의 정보' : '새 강의 만들기') + '</h2><form id="f-course">' +
      '<label class="field"><span>강의명</span><input class="input" name="title" required value="' + esc(c.title) + '"></label>' +
      '<label class="field"><span>설명 (선택)</span><input class="input" name="description" value="' + esc(c.description || '') + '"></label>' +
      '<div class="row" style="align-items:flex-start"><label class="field grow"><span>회차당 최대 시청 횟수</span><input class="input" name="max_views" type="number" min="0.5" step="0.5" value="' + (c.max_views == null ? '' : esc(c.max_views)) + '" placeholder="비우면 무제한"><em>영상 길이만큼 재생 = 1회</em></label>' +
      '<label class="field grow"><span>기본 수강 기간 (일)</span><input class="input" name="access_days" type="number" min="1" value="' + (c.access_days == null ? '' : esc(c.access_days)) + '" placeholder="비우면 무제한"><em>권한 부여할 때 기본값</em></label>' +
      '<label class="field" style="width:90px"><span>정렬 순서</span><input class="input" name="sort" type="number" value="' + esc(c.sort) + '"></label></div>' +
      '<label class="check" style="margin-bottom:16px"><input type="checkbox" name="is_published"' + (c.is_published ? ' checked' : '') + '> 수강생에게 공개</label>' +
      '<div class="row"><button class="btn btn-primary">' + (c.id ? '저장' : '만들기') + '</button>' + (c.id ? '<span class="spacer"></span><button type="button" class="btn btn-danger btn-ghost" id="c-del">강의 삭제</button>' : '') + '</div></form></section>';

    if (c.id) {
      html += '<section class="card card-pad"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h2 class="section-title" style="margin:0">회차 (' + ls.length + ')</h2><button class="btn btn-sm btn-primary" id="l-new">+ 회차 추가</button></div>' +
        (ls.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="num">순서</th><th>회차명</th><th class="num">길이</th><th>Vimeo</th><th></th></tr></thead><tbody>' +
          ls.map(function (l) {
            var m = media.find(function (x) { return x.lesson_id === l.id; });
            return '<tr><td class="num">' + esc(l.sort) + '</td><td><b>' + esc(l.title) + '</b></td><td class="num">' + C.fmtTime(l.duration_sec) + '</td>' +
              '<td class="small">' + (m ? esc(m.vimeo_id) + (m.vimeo_hash ? ' <span class="chip">비공개 링크</span>' : '') : '<span class="chip chip-warn">미등록</span>') + '</td>' +
              '<td class="num nowrap"><button class="btn btn-sm" data-edit="' + esc(l.id) + '">수정</button> <button class="btn btn-sm btn-ghost btn-danger" data-ldel="' + esc(l.id) + '">삭제</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty">회차를 추가해 주세요.</div>') + '</section>';
    }
    html += '</div></div>';
    $('#main').innerHTML = html;

    $$('[data-sel]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); selCourse = a.getAttribute('data-sel'); viewAdminCourses(); }); });
    $('#c-new').addEventListener('click', function () { selCourse = 'new'; viewAdminCourses(); });
    $('#f-course').addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = e.target;
      var row = {
        id: c.id, title: f.title.value.trim(), description: f.description.value.trim() || null,
        max_views: f.max_views.value === '' ? null : Number(f.max_views.value),
        access_days: f.access_days.value === '' ? null : parseInt(f.access_days.value, 10),
        sort: parseInt(f.sort.value, 10) || 0, is_published: f.is_published.checked
      };
      try { var saved = await B.admin.saveCourse(row); selCourse = saved.id; toast('저장했어요.'); viewAdminCourses(); }
      catch (err) { toast(errMsg(err)); }
    });
    var cd = $('#c-del');
    if (cd) cd.addEventListener('click', async function () {
      if (!confirm('"' + c.title + '" 강의를 삭제할까요?\n회차·수강 권한·시청 기록이 모두 함께 삭제되고 되돌릴 수 없어요.')) return;
      await B.admin.deleteCourse(c.id); selCourse = null; toast('삭제했어요.'); viewAdminCourses();
    });
    var ln = $('#l-new');
    if (ln) ln.addEventListener('click', function () { openLesson(c, null, null, ls.length + 1); });
    $$('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var l = byId(A.lessons, b.getAttribute('data-edit'));
        openLesson(c, l, media.find(function (x) { return x.lesson_id === l.id; }));
      });
    });
    $$('[data-ldel]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var l = byId(A.lessons, b.getAttribute('data-ldel'));
        if (!confirm('"' + l.title + '" 회차를 삭제할까요? 이 회차의 시청 기록도 함께 삭제돼요.')) return;
        await B.admin.deleteLesson(l.id); toast('삭제했어요.'); viewAdminCourses();
      });
    });
  }

  function openLesson(c, l, m, nextSort) {
    var link = m ? (m.vimeo_hash ? 'https://vimeo.com/' + m.vimeo_id + '/' + m.vimeo_hash : 'https://vimeo.com/' + m.vimeo_id) : '';
    var md = modal(l ? '회차 수정' : '회차 추가',
      '<label class="field"><span>회차명</span><input class="input" id="ls-title" value="' + esc(l ? l.title : '') + '" placeholder="예: 1강. 왜 월배당 ETF인가"></label>' +
      '<label class="field"><span>Vimeo 영상 주소</span><input class="input" id="ls-url" value="' + esc(link) + '" placeholder="https://vimeo.com/123456789/abcdef1234">' +
      '<em>Vimeo에서 [공유] → 링크 복사한 주소, 임베드 코드, 영상 번호 모두 붙여넣을 수 있어요.</em></label>' +
      '<div class="row" style="align-items:flex-end"><label class="field grow" style="margin-bottom:0"><span>영상 길이</span><input class="input" id="ls-dur" value="' + (l ? C.fmtTime(l.duration_sec) : '') + '" placeholder="예: 12:34"></label>' +
      '<button class="btn" type="button" id="ls-fetch">길이 불러오기</button>' +
      '<label class="field" style="width:90px;margin-bottom:0"><span>순서</span><input class="input" id="ls-sort" type="number" value="' + esc(l ? l.sort : nextSort) + '"></label></div>' +
      '<p class="small muted" id="ls-msg" style="margin:10px 0 0">길이는 시청 횟수 계산의 기준이라 정확해야 해요. [길이 불러오기]를 누르면 Vimeo에서 가져와요.</p>' +
      '<div id="ls-probe" style="position:absolute;width:1px;height:1px;overflow:hidden;left:-9999px"></div>',
      '<button class="btn" data-close>취소</button><button class="btn btn-primary" id="ls-ok">저장</button>');
    $('#ls-fetch', md).addEventListener('click', async function () {
      var v = C.parseVimeo($('#ls-url', md).value);
      var msg = $('#ls-msg', md);
      if (!v) { msg.textContent = 'Vimeo 주소를 먼저 입력해 주세요.'; return; }
      msg.textContent = '불러오는 중…';
      try {
        await loadVimeo();
        var probe = new window.Vimeo.Player($('#ls-probe', md), vimeoOpts(v.id, v.hash, { width: 320 }));
        var d = await Promise.race([probe.getDuration(), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 12000); })]);
        $('#ls-dur', md).value = C.fmtTime(d);
        msg.textContent = '영상 길이 ' + C.fmtTime(d) + ' 를 가져왔어요.';
        try { probe.destroy(); } catch (e) {}
      } catch (e) {
        msg.textContent = '불러오지 못했어요. 이 페이지 주소가 Vimeo 도메인 허용 목록에 있는지 확인하거나, 길이를 직접 입력해 주세요.';
      }
    });
    $('#ls-ok', md).addEventListener('click', async function () {
      var title = $('#ls-title', md).value.trim();
      var v = C.parseVimeo($('#ls-url', md).value);
      var dur = parseDur($('#ls-dur', md).value);
      if (!title) { toast('회차명을 입력해 주세요.'); return; }
      if (!v) { toast('Vimeo 주소를 확인해 주세요.'); return; }
      if (!(dur > 0)) { toast('영상 길이를 입력해 주세요. 예: 12:34'); return; }
      try {
        await B.admin.saveLesson({ id: l ? l.id : undefined, course_id: c.id, title: title, duration_sec: Math.round(dur), sort: parseInt($('#ls-sort', md).value, 10) || 0 }, { vimeo_id: v.id, vimeo_hash: v.hash });
        md.close(); toast('저장했어요.'); viewAdminCourses();
      } catch (e) { toast(errMsg(e)); }
    });
  }

  // ---------------------------------------------------------------- 관리자: 시청 통계
  var statCourse = null;
  async function viewAdminStats() {
    shell(adminTabs('stats') + '<div class="empty">불러오는 중…</div>', 'admin');
    try { await loadAdmin(true); } catch (e) { $('#main').innerHTML = '<div class="msg msg-err">' + esc(errMsg(e)) + '</div>'; return; }
    if (!A.courses.length) { $('#main').innerHTML = adminTabs('stats') + '<div class="card empty">강의가 없어요.</div>'; return; }
    if (!statCourse || !byId(A.courses, statCourse)) statCourse = A.courses[0].id;
    var c = byId(A.courses, statCourse);
    var ls = A.lessons.filter(function (l) { return l.course_id === c.id; });
    var ens = A.enrollments.filter(function (e) { return e.course_id === c.id && e.status === 'active'; });
    var students = ens.map(function (e) { return e.user_id; });
    var BINS = 20;

    var completeAll = students.filter(function (uid) {
      return ls.length && ls.every(function (l) { return C.isComplete(A.progress.find(function (p) { return p.user_id === uid && p.lesson_id === l.id; }), l.duration_sec); });
    }).length;
    var started = students.filter(function (uid) { return A.progress.some(function (p) { return p.user_id === uid && p.played_sec > 0 && ls.some(function (l) { return l.id === p.lesson_id; }); }); }).length;
    var avg = ens.length ? ens.reduce(function (s, e) { return s + enrSummary(e).ratio; }, 0) / ens.length : 0;

    var html = adminTabs('stats') + '<div class="toolbar"><select class="input" id="st-course">' + courseOptions(statCourse) + '</select>' +
      '<span class="small muted">수강 권한이 있는 회원 기준 (해지 제외)</span></div>' +
      '<div class="kpis"><div class="stat"><div class="stat-label">수강생</div><div class="stat-value">' + students.length + '<small>명</small></div></div>' +
      '<div class="stat"><div class="stat-label">한 번이라도 시청</div><div class="stat-value">' + started + '<small>명 · ' + pct(students.length ? started / students.length : 0) + '%</small></div></div>' +
      '<div class="stat"><div class="stat-label">평균 진도율</div><div class="stat-value">' + pct(avg) + '<small>%</small></div></div>' +
      '<div class="stat"><div class="stat-label">완강</div><div class="stat-value">' + completeAll + '<small>명 · ' + pct(students.length ? completeAll / students.length : 0) + '%</small></div></div></div>' +
      '<section class="card card-pad"><h2 class="section-title">회차별 시청 현황</h2><p class="small muted" style="margin-top:-6px">막대는 영상을 20구간으로 나눴을 때 각 구간을 본 사람의 비율이에요. 막대가 뚝 떨어지는 곳이 이탈 지점이에요.</p>';

    if (!ls.length) html += '<div class="empty">회차가 없어요.</div>';
    ls.forEach(function (l, i) {
      var rows = A.progress.filter(function (p) { return p.lesson_id === l.id && students.indexOf(p.user_id) >= 0 && p.played_sec > 0; });
      var viewers = rows.length;
      var avgP = viewers ? rows.reduce(function (s, p) { return s + Math.min(1, p.unique_sec / l.duration_sec); }, 0) / viewers : 0;
      var done = rows.filter(function (p) { return C.isComplete(p, l.duration_sec); }).length;
      var avgUsed = viewers ? rows.reduce(function (s, p) { return s + C.viewsUsed(p.played_sec, l.duration_sec); }, 0) / viewers : 0;
      var exhausted = rows.filter(function (p) { var lim = C.viewLimit(c, p); return lim != null && C.viewsUsed(p.played_sec, l.duration_sec) >= lim; }).length;
      var heat = [];
      for (var b = 0; b < BINS; b++) heat.push(0);
      rows.forEach(function (p) { C.coverage(p.watched_ranges, l.duration_sec, BINS).forEach(function (v, k) { if (v >= 0.5) heat[k]++; }); });
      var hp = heat.map(function (x) { return viewers ? x / viewers : 0; });
      var drop = null;
      for (var k = 1; k < BINS; k++) { var dd = hp[k - 1] - hp[k]; if (dd > 0.1 && (!drop || dd > drop.d)) drop = { d: dd, k: k }; }
      var w = l.duration_sec / BINS;
      html += '<div class="lesson-stat"><div><b>' + esc(l.title) + '</b> <span class="muted small">' + C.fmtTime(l.duration_sec) + '</span>' +
        '<div class="nums"><span>시청자 <b>' + viewers + '</b>명 (' + pct(students.length ? viewers / students.length : 0) + '%)</span><span>평균 진도 <b>' + pct(avgP) + '%</b></span>' +
        '<span>완료 <b>' + done + '</b>명</span><span>평균 사용 <b>' + n2(avgUsed) + '</b>회</span>' + (exhausted ? '<span>횟수 소진 <b>' + exhausted + '</b>명</span>' : '') + '</div>' +
        (drop ? '<div class="small" style="margin-top:6px;color:var(--accent-dark);font-weight:700">가장 많이 빠지는 구간: ' + C.fmtTime(drop.k * w) + ' 전후 (' + pct(drop.d) + '%p 감소)</div>' : '') + '</div>' +
        '<div><div class="heat" title="구간별 시청 비율">' + hp.map(function (v, k) { return '<i style="height:' + Math.max(3, Math.round(v * 100)) + '%" title="' + C.fmtTime(k * w) + '~' + C.fmtTime((k + 1) * w) + ' : ' + pct(v) + '%"></i>'; }).join('') + '</div>' +
        '<div class="heat-axis"><span>0:00</span><span>' + C.fmtTime(l.duration_sec / 2) + '</span><span>' + C.fmtTime(l.duration_sec) + '</span></div></div></div>';
    });
    html += '</section>';
    $('#main').innerHTML = html;
    $('#st-course').addEventListener('change', function (e) { statCourse = e.target.value; viewAdminStats(); });
  }

  // ---------------------------------------------------------------- 라우터
  function route() {
    var h = location.hash || '#/';
    if (!/^#\/watch\//.test(h)) cleanupWatch();
    if (B.isRecovery && B.isRecovery()) { viewSetPassword(); return; }
    if (!S.user) { viewAuth('login'); return; }
    if (h === '#/login') { location.hash = '#/'; return; }
    var m;
    if ((m = h.match(/^#\/watch\/(.+)$/))) { cleanupWatch(); viewWatch(decodeURIComponent(m[1])); return; }
    if (/^#\/admin/.test(h) && !S.user.is_admin) { location.hash = '#/'; return; }
    if (h === '#/admin') { viewAdminStudents(); return; }
    if ((m = h.match(/^#\/admin\/student\/(.+)$/))) { viewAdminStudent(decodeURIComponent(m[1])); return; }
    if (h === '#/admin/courses') { viewAdminCourses(); return; }
    if (h === '#/admin/stats') { viewAdminStats(); return; }
    viewHome();
  }

  async function boot() {
    if (window.LRGate) await window.LRGate.unlock(CFG, app);
    var useSb = CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY;
    try {
      if (useSb) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
        B = window.LRMakeSupabaseBackend(CFG);
      } else {
        B = window.LRDemoBackend;
      }
      S.user = await B.init();
    } catch (e) {
      app.innerHTML = '<main><div class="msg msg-err">강의실을 시작하지 못했어요: ' + esc(errMsg(e)) + '</div></main>';
      return;
    }
    B.onAuthChange(function (u, event) {
      var was = S.user && S.user.id;
      S.user = u;
      if (event === 'PASSWORD_RECOVERY' || (u && u.id) !== was) route();
    });
    window.addEventListener('hashchange', route);
    route();
  }
  boot();
})();
