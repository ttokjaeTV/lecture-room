/* =========================================================
   사이트 입장 비밀번호
   - 공개 전 아무나 들어오지 못하게 막는 1차 잠금입니다.
   - 비밀번호 원문은 코드에 없고 SHA-256 값만 있습니다.
   - 한 번 맞히면 그 브라우저에서는 다시 묻지 않습니다.
   주의: GitHub Pages 같은 정적 호스팅에서는 서버 쪽 잠금이 불가능해서,
   코드를 직접 뜯어보는 사람까지 막지는 못합니다. 실제 강의 보호는
   로그인 + 수강 권한(Supabase)이 담당합니다.
   ========================================================= */
(function () {
  'use strict';

  // 순수 JS SHA-256 (crypto.subtle 을 못 쓰는 환경 대비)
  function sha256(str) {
    var bytes = unescape(encodeURIComponent(str)).split('').map(function (c) { return c.charCodeAt(0); });
    var K = [], H = [], isP = function (n) { for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
    var frac = function (x) { return ((x - Math.floor(x)) * 4294967296) >>> 0; };
    for (var n = 2, c = 0; c < 64; n++) if (isP(n)) { if (c < 8) H[c] = frac(Math.pow(n, 1 / 2)); K[c++] = frac(Math.pow(n, 1 / 3)); }
    var l = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s >= 4 ? 0 : (l >>> (s * 8)) & 255);
    var rr = function (x, r) { return (x >>> r) | (x << (32 - r)); };
    for (var o = 0; o < bytes.length; o += 64) {
      var W = [];
      for (var i = 0; i < 64; i++) {
        if (i < 16) W[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
        else {
          var s0 = rr(W[i - 15], 7) ^ rr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
          var s1 = rr(W[i - 2], 17) ^ rr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
          W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
      }
      var a = H[0], b = H[1], c2 = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        var t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c2) ^ (b & c2))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c2; c2 = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c2) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  var KEY = 'lr_gate_ok';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  /** 잠금이 풀려 있으면 바로, 아니면 비밀번호를 맞힌 뒤 resolve */
  function unlock(cfg, mount) {
    var hash = String((cfg && cfg.SITE_PASSWORD_SHA256) || '').trim().toLowerCase();
    if (!hash || get() === hash) return Promise.resolve();
    return new Promise(function (resolve) {
      mount.innerHTML =
        '<main><div class="auth-wrap"><h1 class="auth-title">' + String(cfg.SITE_NAME || '강의실').replace(/[<>&]/g, '') + '</h1>' +
        '<p class="page-sub" style="margin-bottom:22px">준비 중인 페이지예요. 입장 비밀번호를 입력해 주세요.</p>' +
        '<div class="card card-pad"><form id="f-gate"><div id="gate-msg"></div>' +
        '<label class="field"><span>입장 비밀번호</span><input class="input" type="password" id="gate-pw" autocomplete="current-password" required autofocus></label>' +
        '<button class="btn btn-primary btn-block">입장하기</button></form></div></div></main>';
      var f = mount.querySelector('#f-gate');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = mount.querySelector('#gate-pw').value;
        if (sha256(v) === hash) { set(hash); resolve(); }
        else {
          mount.querySelector('#gate-msg').innerHTML = '<div class="msg msg-err">비밀번호가 맞지 않아요.</div>';
          var i = mount.querySelector('#gate-pw'); i.value = ''; i.focus();
        }
      });
      var inp = mount.querySelector('#gate-pw'); if (inp) inp.focus();
    });
  }

  window.LRGate = { unlock: unlock, sha256: sha256 };
})();
