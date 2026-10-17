/* =========================================================
   데모 백엔드 — 브라우저 저장소(localStorage)에 가짜 DB를 만들어
   Supabase 없이도 모든 화면과 시청 기록 로직을 체험할 수 있게 한다.
   규칙은 supabase/schema.sql 과 같다 (js/core.js 사용).
   ========================================================= */
(function () {
  'use strict';
  var C = window.LRCore;
  var KEY = 'lr_demo_db_v2';   // v2: 상품 4종(전자책·멤버십) 추가
  var SKEY = 'lr_demo_uid';
  var DAY = 86400000;

  function uid() { return 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function iso(t) { return new Date(t).toISOString(); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  var mem = null; // localStorage 를 못 쓰는 환경 대비
  function load() {
    try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {}
    return mem;
  }
  function save(db) { mem = db; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function getUid() { try { return localStorage.getItem(SKEY); } catch (e) { return mem && mem.__uid; } }
  function setUid(v) {
    try { v ? localStorage.setItem(SKEY, v) : localStorage.removeItem(SKEY); } catch (e) {}
    if (mem) mem.__uid = v;
  }

  // ---------- 데모 데이터 ----------
  function seed() {
    var now = Date.now();
    var db = { users: [], courses: [], lessons: [], media: [], enrollments: [], invites: [], progress: [], sessions: [], downloads: [] };
    var admin = { id: 'u_admin', email: 'admin@demo.com', password: 'demo1234', name: '운영자', is_admin: true, created_at: iso(now - 90 * DAY) };
    var me = { id: 'u_student', email: 'student@demo.com', password: 'demo1234', name: '데모수강생', is_admin: false, created_at: iso(now - 20 * DAY) };
    db.users.push(admin, me);

    var c1 = { id: 'c_basic', title: 'ETF 노후 시스템 기본반 (데모)', description: '월배당 ETF로 노후 현금흐름을 설계하는 기본 과정', max_views: 3, access_days: 180, sort: 1, is_published: true, kind: 'lecture', slug: 'nubugong', shop_url: 'lectures-shop.html', created_at: iso(now - 60 * DAY) };
    var c2 = { id: 'c_adv', title: '연금계좌 절세 심화반 (데모)', description: '연금저축·IRP 인출 순서와 세금', max_views: 2, access_days: 90, sort: 2, is_published: true, kind: 'lecture', slug: 'usstock', shop_url: 'usstock-shop.html', created_at: iso(now - 30 * DAY) };
    var c3 = { id: 'c_ebook', title: '노후자금 시스템 만들기 노하우 (데모 전자책)', description: 'PDF · V5.0 개정판', max_views: null, access_days: null, sort: 50, is_published: true, kind: 'ebook', slug: 'ebook-v5', file_path: 'demo/ebook.pdf', file_name: '노후자금 시스템 만들기 (데모).pdf', shop_url: 'ebooks-shop.html', created_at: iso(now - 60 * DAY) };
    var c4 = { id: 'c_tools', title: '투자 Tool 멤버십 (데모)', description: '배당 · 절세계좌 · 은퇴 자금 · 물타기 계산기', max_views: null, access_days: 365, sort: 90, is_published: true, kind: 'membership', slug: 'tools', link_url: 'https://ttokjaetv.github.io/', shop_url: 'tools-shop.html', created_at: iso(now - 60 * DAY) };
    db.courses.push(c1, c2, c3, c4);

    // 공개된 Vimeo 영상으로 시연 (실제 강의는 관리자 화면에서 교체)
    var L = [
      ['l1', c1.id, '1강. 왜 월배당 ETF인가', 79, '90509568', '1주차 · 기초'],
      ['l2', c1.id, '2강. 내 노후에 필요한 월 현금흐름 계산', 185, '22439234', '2주차 · 설계와 실전'],
      ['l3', c1.id, '3강. 포트폴리오 짜기 실전', 597, '1084537', '2주차 · 설계와 실전'],
      ['l4', c2.id, '1강. 연금 인출 순서의 기본', 79, '90509568']
    ];
    L.forEach(function (x, i) {
      db.lessons.push({ id: x[0], course_id: x[1], title: x[2], section: x[5] || null, duration_sec: x[3], sort: i + 1, created_at: iso(now - 60 * DAY) });
      db.media.push({ lesson_id: x[0], vimeo_id: x[4], vimeo_hash: null });
    });

    db.enrollments.push({ id: uid(), user_id: me.id, course_id: c1.id, starts_at: iso(now - 20 * DAY), expires_at: iso(now + 160 * DAY), status: 'active', source: 'manual', memo: '데모', created_at: iso(now - 20 * DAY) });
    db.enrollments.push({ id: uid(), user_id: me.id, course_id: c3.id, starts_at: iso(now - 20 * DAY), expires_at: null, status: 'active', source: 'manual', memo: '데모', created_at: iso(now - 20 * DAY) });
    db.enrollments.push({ id: uid(), user_id: me.id, course_id: c4.id, starts_at: iso(now - 20 * DAY), expires_at: iso(now + 345 * DAY), status: 'active', source: 'manual', memo: '데모', created_at: iso(now - 20 * DAY) });

    // 통계 화면용 가상 수강생 12명
    var names = ['김민수', '이서연', '박지훈', '최유진', '정하늘', '강도윤', '조수아', '윤서준', '장예린', '임건우', '한지민', '오태양'];
    var rnd = (function (s) { return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })(7);
    names.forEach(function (nm, i) {
      var u = { id: 'u_fake' + i, email: 'member' + (i + 1) + '@example.com', password: 'x', name: nm, is_admin: false, created_at: iso(now - (30 + i) * DAY) };
      db.users.push(u);
      var exp = i === 3 ? now - 2 * DAY : now + (40 + i * 10) * DAY;
      db.enrollments.push({ id: uid(), user_id: u.id, course_id: c1.id, starts_at: iso(now - (30 + i) * DAY), expires_at: iso(exp), status: 'active', source: i % 3 ? 'invite' : 'manual', memo: i % 4 === 0 ? '스마트스토어' : null, created_at: iso(now - (30 + i) * DAY) });
      // 회차가 뒤로 갈수록, 영상 후반으로 갈수록 이탈하는 현실적인 패턴
      [['l1', 79], ['l2', 185], ['l3', 597]].forEach(function (ld, k) {
        if (rnd() < k * 0.25) return;
        var d = ld[1];
        var stop = Math.min(1, 0.45 + rnd() * 0.75 - k * 0.12);
        var ranges = C.mergeRanges([], 0, Math.round(d * stop));
        if (rnd() < 0.3) ranges = C.mergeRanges(ranges, Math.round(d * 0.7), Math.round(d * 0.85));
        var uniq = C.rangesTotal(ranges);
        var played = uniq * (1 + rnd() * 1.4);
        db.progress.push({ user_id: u.id, lesson_id: ld[0], watched_ranges: ranges, unique_sec: uniq, played_sec: C.r1(played), bonus_views: 0, last_position: ranges[ranges.length - 1][1], first_watched_at: iso(now - (25 - k * 3 + i % 5) * DAY), updated_at: iso(now - (i % 6) * DAY - k * 3600000) });
        db.sessions.push({ id: uid(), user_id: u.id, lesson_id: ld[0], started_at: iso(now - (i % 6) * DAY - k * 3600000 - played * 1000), last_beat_at: iso(now - (i % 6) * DAY - k * 3600000), played_sec: C.r1(played), ended_reason: 'closed', user_agent: 'demo' });
      });
    });
    db.invites.push({ id: uid(), email: 'buyer@example.com', course_id: c1.id, days: 180, until_at: null, memo: '가입 대기 예시', created_at: iso(now - DAY) });
    return db;
  }

  function db() { var d = load(); if (!d) { d = seed(); save(d); } return d; }
  function me(d) { var id = getUid(); return id ? d.users.find(function (u) { return u.id === id; }) : null; }
  function pub(u) { return u ? { id: u.id, email: u.email, name: u.name, is_admin: !!u.is_admin, created_at: u.created_at } : null; }
  function wait(v) { return new Promise(function (res) { setTimeout(function () { res(clone(v)); }, 60); }); }
  function fail(msg) { return Promise.reject(new Error(msg)); }
  function requireAdmin(d) { var u = me(d); if (!u || !u.is_admin) throw new Error('관리자만 사용할 수 있습니다'); return u; }

  function enrollmentState(d, userId, courseId) {
    var e = d.enrollments.find(function (x) { return x.user_id === userId && x.course_id === courseId; });
    if (!e || e.status !== 'active') return 'not_enrolled';
    if (new Date(e.starts_at) > new Date()) return 'not_started';
    if (e.expires_at && new Date(e.expires_at) < new Date()) return 'expired';
    return 'ok';
  }
  function progressOf(d, userId, lessonId, create) {
    var p = d.progress.find(function (x) { return x.user_id === userId && x.lesson_id === lessonId; });
    if (!p && create) {
      p = { user_id: userId, lesson_id: lessonId, watched_ranges: [], unique_sec: 0, played_sec: 0, bonus_views: 0, last_position: 0, first_watched_at: null, updated_at: iso(Date.now()) };
      d.progress.push(p);
    }
    return p;
  }

  var listeners = [];
  function emit() { setTimeout(function () { var u = pub(me(db())); listeners.forEach(function (cb) { cb(u); }); }, 0); }

  var B = {
    mode: 'demo',
    init: function () { return wait(pub(me(db()))); },
    onAuthChange: function (cb) { listeners.push(cb); },
    signIn: function (email, pw) {
      var d = db();
      var u = d.users.find(function (x) { return x.email === String(email).trim().toLowerCase() && x.password === pw; });
      if (!u) return fail('이메일 또는 비밀번호가 맞지 않아요.');
      setUid(u.id); emit(); return wait(pub(u));
    },
    signUp: function (email, pw, name) {
      var d = db(); email = String(email).trim().toLowerCase();
      if (d.users.some(function (x) { return x.email === email; })) return fail('이미 가입된 이메일이에요.');
      var u = { id: uid(), email: email, password: pw, name: name || email.split('@')[0], is_admin: false, created_at: iso(Date.now()) };
      d.users.push(u);
      // 초대 → 수강 권한 전환 (schema.sql handle_new_user 와 동일)
      d.invites.filter(function (i) { return i.email === email; }).forEach(function (i) {
        var exp = i.until_at || (i.days ? iso(Date.now() + i.days * DAY) : null);
        d.enrollments.push({ id: uid(), user_id: u.id, course_id: i.course_id, starts_at: iso(Date.now()), expires_at: exp, status: 'active', source: 'invite', memo: i.memo, created_at: iso(Date.now()) });
      });
      d.invites = d.invites.filter(function (i) { return i.email !== email; });
      save(d); setUid(u.id); emit();
      return wait({ needConfirm: false });
    },
    signOut: function () { setUid(null); emit(); return wait(true); },
    resetPassword: function () { return wait(true); },
    updatePassword: function () { return wait(true); },
    updateName: function (name) { var d = db(); var u = me(d); u.name = name; save(d); return wait(pub(u)); },

    // 상품(영문 이름) 이용 가능 여부 — schema/products.sql my_access 와 동일
    myAccess: function (slug) {
      var d = db(); var u = me(d);
      if (!u) return wait({ ok: false, reason: 'login' });
      var c = d.courses.find(function (x) { return x.slug === slug; });
      if (!c || (!c.is_published && !u.is_admin)) return wait({ ok: false, reason: 'not_found' });
      if (u.is_admin) return wait({ ok: true, admin: true, kind: c.kind, title: c.title, expires_at: null });
      var e = d.enrollments.find(function (x) { return x.user_id === u.id && x.course_id === c.id; });
      var st = enrollmentState(d, u.id, c.id);
      return wait({ ok: st === 'ok', reason: st === 'ok' ? null : st, kind: c.kind, title: c.title, starts_at: e && e.starts_at, expires_at: e ? e.expires_at : null, shop_url: c.shop_url });
    },
    // 전자책 받기 — 데모는 한 쪽짜리 PDF를 만들어 준다
    ebookOpen: function (courseId) {
      var d = db(); var u = me(d);
      if (!u) return wait({ ok: false, reason: 'login' });
      var c = d.courses.find(function (x) { return x.id === courseId && x.kind === 'ebook'; });
      if (!c || (!c.is_published && !u.is_admin)) return wait({ ok: false, reason: 'not_found' });
      if (!u.is_admin) {
        var st = enrollmentState(d, u.id, c.id);
        if (st !== 'ok') return wait({ ok: false, reason: st });
        var n = (d.downloads || []).filter(function (x) { return x.user_id === u.id && Date.now() - new Date(x.created_at).getTime() < DAY; }).length;
        if (n >= 10) return wait({ ok: false, reason: 'too_many' });
      }
      if (!c.file_path) return wait({ ok: false, reason: 'no_file' });
      d.downloads = d.downloads || [];
      d.downloads.push({ id: uid(), user_id: u.id, course_id: c.id, created_at: iso(Date.now()), user_agent: navigator.userAgent.slice(0, 200) });
      save(d);
      var pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj ' +
        '4 0 obj<</Length 44>>stream\nBT /F1 16 Tf 30 60 Td (Demo e-book) Tj ET\nendstream endobj ' +
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
      var url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      return wait({ ok: true, url: url, file_name: c.file_name || (c.title + '.pdf') });
    },

    listCourses: function () {
      var d = db(); var u = me(d);
      return wait(d.courses.filter(function (c) { return c.is_published || (u && u.is_admin); }).sort(function (a, b) { return a.sort - b.sort; }));
    },
    listLessons: function () {
      var d = db(); var u = me(d);
      var ok = d.courses.filter(function (c) { return c.is_published || (u && u.is_admin); }).map(function (c) { return c.id; });
      return wait(d.lessons.filter(function (l) { return ok.indexOf(l.course_id) >= 0; }).sort(function (a, b) { return a.sort - b.sort; }));
    },
    myEnrollments: function () { var d = db(); var u = me(d); return wait(d.enrollments.filter(function (e) { return u && e.user_id === u.id; })); },
    myProgress: function () { var d = db(); var u = me(d); return wait(d.progress.filter(function (p) { return u && p.user_id === u.id; })); },
    mySessions: function (limit) {
      var d = db(); var u = me(d);
      return wait(d.sessions.filter(function (s) { return u && s.user_id === u.id; }).sort(function (a, b) { return b.started_at < a.started_at ? -1 : 1; }).slice(0, limit || 20));
    },

    openLecture: function (lessonId) {
      var d = db(); var u = me(d);
      if (!u) return wait({ ok: false, reason: 'login' });
      var l = d.lessons.find(function (x) { return x.id === lessonId; });
      if (!l) return wait({ ok: false, reason: 'not_found' });
      var c = d.courses.find(function (x) { return x.id === l.course_id; });
      if (!u.is_admin) {
        if (!c.is_published) return wait({ ok: false, reason: 'not_found' });
        var st = enrollmentState(d, u.id, c.id);
        if (st !== 'ok') return wait({ ok: false, reason: st });
      }
      var m = d.media.find(function (x) { return x.lesson_id === l.id; });
      if (!m) return wait({ ok: false, reason: 'no_media' });
      var p = progressOf(d, u.id, l.id, false) || {};
      var used = C.viewsUsed(p.played_sec, l.duration_sec);
      var lim = u.is_admin ? null : C.viewLimit(c, p);
      if (lim != null && used >= lim) return wait({ ok: false, reason: 'limit', views_used: used, max_views: lim });
      d.sessions.forEach(function (s) { if (s.user_id === u.id && !s.ended_reason) s.ended_reason = 'replaced'; });
      var s = { id: uid(), user_id: u.id, lesson_id: l.id, started_at: iso(Date.now()), last_beat_at: iso(Date.now()), played_sec: 0, ended_reason: null, user_agent: navigator.userAgent.slice(0, 200) };
      d.sessions.push(s); save(d);
      return wait({
        ok: true, session_id: s.id, lesson_id: l.id, title: l.title, vimeo_id: m.vimeo_id, vimeo_hash: m.vimeo_hash,
        duration_sec: l.duration_sec, last_position: p.last_position || 0, watched_ranges: p.watched_ranges || [],
        unique_sec: p.unique_sec || 0, played_sec: p.played_sec || 0, views_used: used, max_views: lim
      });
    },

    recordWatch: function (sessionId, segments, position) {
      var d = db(); var u = me(d);
      if (!u) return wait({ ok: false, reason: 'login' });
      var s = d.sessions.find(function (x) { return x.id === sessionId && x.user_id === u.id; });
      if (!s) return wait({ ok: false, reason: 'no_session' });
      if (s.ended_reason) return wait({ ok: false, reason: s.ended_reason });
      var l = d.lessons.find(function (x) { return x.id === s.lesson_id; });
      var c = d.courses.find(function (x) { return x.id === l.course_id; });
      if (!u.is_admin && enrollmentState(d, u.id, c.id) !== 'ok') { s.ended_reason = 'expired'; save(d); return wait({ ok: false, reason: 'expired' }); }
      var elapsed = (Date.now() - new Date(s.last_beat_at).getTime()) / 1000;
      var p = progressOf(d, u.id, l.id, true);
      var r = C.applySegments(p, l.duration_sec, segments, elapsed, position);
      p.watched_ranges = r.progress.watched_ranges; p.unique_sec = r.progress.unique_sec;
      p.played_sec = C.r1(r.progress.played_sec); p.last_position = r.progress.last_position;
      if (r.counted > 0 && !p.first_watched_at) p.first_watched_at = iso(Date.now());
      p.updated_at = iso(Date.now());
      s.last_beat_at = iso(Date.now()); s.played_sec = C.r1(s.played_sec + r.counted);
      var lim = u.is_admin ? null : C.viewLimit(c, p);
      var reason = null;
      if (lim != null && p.played_sec >= lim * l.duration_sec) { s.ended_reason = 'limit'; reason = 'limit'; }
      save(d);
      return wait({ ok: !reason, reason: reason, counted: r.counted, played_sec: p.played_sec, unique_sec: p.unique_sec, watched_ranges: p.watched_ranges, views_used: C.viewsUsed(p.played_sec, l.duration_sec), max_views: lim });
    },
    recordWatchKeepalive: function (sessionId, segments, position) { B.recordWatch(sessionId, segments, position); },

    // 데모 전용: 실제 영상 길이로 회차 길이 보정
    syncDuration: function (lessonId, sec) {
      var d = db(); var l = d.lessons.find(function (x) { return x.id === lessonId; });
      if (l && sec > 0 && Math.abs(l.duration_sec - sec) >= 1) { l.duration_sec = Math.round(sec); save(d); return true; }
      return false;
    },
    resetDemo: function () { save(seed()); setUid(null); emit(); },
    loginAs: function (role) { setUid(role === 'admin' ? 'u_admin' : 'u_student'); emit(); return wait(pub(me(db()))); },

    // ---------- 관리자 ----------
    admin: {
      listProfiles: function () { var d = db(); requireAdmin(d); return wait(d.users.map(pub)); },
      listEnrollments: function () { var d = db(); requireAdmin(d); return wait(d.enrollments); },
      listInvites: function () { var d = db(); requireAdmin(d); return wait(d.invites); },
      grant: function (email, courseId, days, until, memo) {
        var d = db(); requireAdmin(d);
        email = String(email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return wait('invalid');
        var u = d.users.find(function (x) { return x.email === email; });
        if (u) {
          var exp = until || (days ? iso(Date.now() + days * DAY) : null);
          var e = d.enrollments.find(function (x) { return x.user_id === u.id && x.course_id === courseId; });
          if (e) { e.expires_at = exp; e.status = 'active'; if (memo) e.memo = memo; if (new Date(e.starts_at) > new Date()) e.starts_at = iso(Date.now()); }
          else d.enrollments.push({ id: uid(), user_id: u.id, course_id: courseId, starts_at: iso(Date.now()), expires_at: exp, status: 'active', source: 'manual', memo: memo || null, created_at: iso(Date.now()) });
          save(d); return wait('enrolled');
        }
        var inv = d.invites.find(function (x) { return x.email === email && x.course_id === courseId; });
        if (inv) { inv.days = days || null; inv.until_at = until || null; inv.memo = memo || null; }
        else d.invites.push({ id: uid(), email: email, course_id: courseId, days: days || null, until_at: until || null, memo: memo || null, created_at: iso(Date.now()) });
        save(d); return wait('invited');
      },
      updateEnrollment: function (id, patch) {
        var d = db(); requireAdmin(d);
        var e = d.enrollments.find(function (x) { return x.id === id; }); Object.assign(e, patch); save(d); return wait(e);
      },
      deleteInvite: function (id) { var d = db(); requireAdmin(d); d.invites = d.invites.filter(function (x) { return x.id !== id; }); save(d); return wait(true); },
      listProgress: function (f) {
        var d = db(); requireAdmin(d); f = f || {};
        return wait(d.progress.filter(function (p) { return (!f.userId || p.user_id === f.userId) && (!f.lessonIds || f.lessonIds.indexOf(p.lesson_id) >= 0); }));
      },
      updateProgress: function (userId, lessonId, patch) {
        var d = db(); requireAdmin(d);
        var p = progressOf(d, userId, lessonId, true); Object.assign(p, patch); p.updated_at = iso(Date.now()); save(d); return wait(p);
      },
      listSessions: function (userId) {
        var d = db(); requireAdmin(d);
        return wait(d.sessions.filter(function (s) { return s.user_id === userId; }).sort(function (a, b) { return b.started_at < a.started_at ? -1 : 1; }).slice(0, 50));
      },
      saveCourse: function (c) {
        var d = db(); requireAdmin(d);
        if (c.id) { Object.assign(d.courses.find(function (x) { return x.id === c.id; }), c); }
        else { c.id = uid(); c.created_at = iso(Date.now()); d.courses.push(c); }
        save(d); return wait(c);
      },
      deleteCourse: function (id) {
        var d = db(); requireAdmin(d);
        var ls = d.lessons.filter(function (l) { return l.course_id === id; }).map(function (l) { return l.id; });
        d.courses = d.courses.filter(function (x) { return x.id !== id; });
        d.lessons = d.lessons.filter(function (l) { return l.course_id !== id; });
        d.media = d.media.filter(function (m) { return ls.indexOf(m.lesson_id) < 0; });
        d.enrollments = d.enrollments.filter(function (e) { return e.course_id !== id; });
        d.progress = d.progress.filter(function (p) { return ls.indexOf(p.lesson_id) < 0; });
        save(d); return wait(true);
      },
      listMedia: function () { var d = db(); requireAdmin(d); return wait(d.media); },
      uploadEbook: function (courseId, file) {
        var d = db(); requireAdmin(d);
        return wait('demo/' + courseId + '-' + Date.now() + '.pdf');
      },
      listDownloads: function (userId) {
        var d = db(); requireAdmin(d);
        return wait((d.downloads || []).filter(function (x) { return !userId || x.user_id === userId; })
          .sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; }).slice(0, 50));
      },
      saveLesson: function (l, media) {
        var d = db(); requireAdmin(d);
        if (l.id) Object.assign(d.lessons.find(function (x) { return x.id === l.id; }), l);
        else { l.id = uid(); l.created_at = iso(Date.now()); d.lessons.push(l); }
        var m = d.media.find(function (x) { return x.lesson_id === l.id; });
        if (m) { m.vimeo_id = media.vimeo_id; m.vimeo_hash = media.vimeo_hash; }
        else d.media.push({ lesson_id: l.id, vimeo_id: media.vimeo_id, vimeo_hash: media.vimeo_hash });
        save(d); return wait(l);
      },
      deleteLesson: function (id) {
        var d = db(); requireAdmin(d);
        d.lessons = d.lessons.filter(function (x) { return x.id !== id; });
        d.media = d.media.filter(function (x) { return x.lesson_id !== id; });
        d.progress = d.progress.filter(function (x) { return x.lesson_id !== id; });
        save(d); return wait(true);
      }
    }
  };

  window.LRDemoBackend = B;
})();
