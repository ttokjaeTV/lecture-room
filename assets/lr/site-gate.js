/* =========================================================
   사이트 전체 입장 비밀번호 (공개 전 시안 보호용)
   - 모든 페이지 <head> 에서 gate.js 다음에 읽는다.
   - 한 번 맞히면 같은 브라우저에서는 어느 페이지든 다시 묻지 않는다
     (강의실 비밀번호와 같은 값·같은 저장 키를 쓴다).
   - 비밀번호를 바꾸려면 아래 HASH 값만 바꾸면 된다
     (lecture-room/tools/password-hash.html 로 값을 만든다).
   주의: 정적 호스팅이라 코드를 직접 뜯어보는 사람까지 막지는 못한다.
   ========================================================= */
(function () {
  'use strict';
  var HASH = 'c5cc15b6430ca720613daef384c58149870660959a4ecbb76ba3b55ba02ad77e';
  var KEY = 'lr_gate_ok';
  window.LR_SITE_HASH = HASH;

  var ok = false;
  try { ok = localStorage.getItem(KEY) === HASH; } catch (e) {}
  if (ok) return;

  var root = document.documentElement;
  root.classList.add('site-locked');
  var st = document.createElement('style');
  st.textContent =
    'html.site-locked body > *:not(#site-gate){display:none !important}' +
    'html.site-locked body{background:#F5EFE6 !important;padding:0 !important}' +
    '#site-gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;' +
    'font-family:"Pretendard Variable",Pretendard,-apple-system,"Malgun Gothic",sans-serif;color:#1c1815}' +
    '#site-gate .sg-box{width:100%;max-width:380px;background:#FBF7F0;border:1px solid #E5DCC8;border-radius:16px;padding:28px 24px;' +
    'box-shadow:0 1px 2px rgba(58,47,38,.06),0 12px 30px rgba(58,47,38,.08)}' +
    '#site-gate h1{margin:0 0 6px;font-size:22px;font-weight:900;letter-spacing:-.5px}' +
    '#site-gate p{margin:0 0 18px;font-size:14px;color:#6e6862;line-height:1.6}' +
    '#site-gate input{width:100%;box-sizing:border-box;height:46px;padding:0 14px;border:1px solid #E5DCC8;border-radius:10px;font-size:16px;background:#fff}' +
    '#site-gate input:focus{outline:none;border-color:#96181a;box-shadow:0 0 0 3px #F6E1DD}' +
    '#site-gate button{width:100%;height:46px;margin-top:10px;border:0;border-radius:10px;background:#96181a;color:#fff;font-size:15px;font-weight:800;cursor:pointer}' +
    '#site-gate button:hover{background:#7f1416}' +
    '#site-gate .sg-err{color:#96181a;font-size:13.5px;font-weight:700;margin:10px 0 0;min-height:1em}';
  document.head.appendChild(st);

  function build() {
    if (document.getElementById('site-gate')) return;
    var g = document.createElement('div');
    g.id = 'site-gate';
    g.innerHTML = '<form class="sg-box"><h1>똑재TV 클래스</h1><p>공개 전 준비 중인 페이지예요.<br>입장 비밀번호를 입력해 주세요.</p>' +
      '<input type="password" id="sg-pw" autocomplete="current-password" aria-label="입장 비밀번호" placeholder="입장 비밀번호" required>' +
      '<button type="submit">입장하기</button><p class="sg-err" id="sg-err" role="alert"></p></form>';
    document.body.insertBefore(g, document.body.firstChild);
    var f = g.querySelector('form'), pw = g.querySelector('#sg-pw');
    pw.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var sha = window.LRGate && window.LRGate.sha256;
      if (sha && sha(pw.value) === HASH) {
        try { localStorage.setItem(KEY, HASH); } catch (er) {}
        g.remove();
        root.classList.remove('site-locked');
        window.dispatchEvent(new Event('site-unlocked'));
      } else {
        g.querySelector('#sg-err').textContent = '비밀번호가 맞지 않아요.';
        pw.value = ''; pw.focus();
      }
    });
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
