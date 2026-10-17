/* =========================================================
   로그인한 사람만 들어오는 페이지 (지금은 checkout.html)
   - <head> 에서 config.js 다음에 읽는다. 화면을 그리기 전에 확인해서,
     로그인 안 된 사람은 강의실 로그인 화면으로 보내고 로그인하면 이 페이지로 돌아온다
     (classroom.html?next=… — app.js 의 NEXT 가 받는다).
   - 판정은 이 브라우저에 남은 로그인 정보(Supabase 세션 / 데모 계정)로 한다.
     PG를 붙일 때 실제 결제 승인은 서버에서 회원을 한 번 더 확인해야 한다.
   - 로그인했으면 주문자 이름 · 이메일 칸을 미리 채운다.
   ========================================================= */
(function () {
  'use strict';
  var CFG = window.LR_CONFIG || {};
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function user() {
    if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
      var ref = '';
      try { ref = new URL(CFG.SUPABASE_URL).hostname.split('.')[0]; } catch (e) {}
      var key = 'sb-' + ref + '-auth-token';
      try {
        var s = JSON.parse(read(key) || 'null');
        if (s && s.currentSession) s = s.currentSession;
        if (!s || !s.refresh_token) return null;
        var u = s.user || (JSON.parse(read(key + '-user') || '{}').user) || {};
        return { email: u.email || '', name: (u.user_metadata && u.user_metadata.name) || '' };
      } catch (e) { return null; }
    }
    var uid = read('lr_demo_uid');
    if (!uid) return null;
    try {
      var db = JSON.parse(read('lr_demo_db_v2') || '{}');
      var d = (db.users || []).filter(function (x) { return x.id === uid; })[0];
      return d ? { email: d.email, name: d.name } : null;
    } catch (e) { return null; }
  }

  var u = user();
  if (!u) {
    document.documentElement.style.visibility = 'hidden';   // 결제 화면이 잠깐 비치지 않게
    var here = (location.pathname.split('/').pop() || 'checkout.html') + location.search;
    location.replace('classroom.html?next=' + encodeURIComponent(here) + '#/login');
    return;
  }
  window.LR_LOGIN_USER = u;
  document.addEventListener('DOMContentLoaded', function () {
    var n = document.getElementById('co-name'), m = document.getElementById('co-email');
    if (n && !n.value && u.name) n.value = u.name;
    if (m && !m.value && u.email) m.value = u.email;
  });
})();
