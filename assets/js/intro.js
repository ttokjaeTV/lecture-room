/* 똑재TV 3안 — 랜딩(들어오는 길)을 메인 위에 붙이고, 메인에 들어서면 접어 없앤다.
   · 스크롤로 내려와 메인 상단바가 화면 꼭대기에 닿으면 → 그 자리에서 조용히 접힌다(화면은 그대로, 위로 올려도 다시 안 나옴)
   · '들어가기'·'내 계단 확인하기'·로고를 누르면 → 랜딩이 위로 접혀 날아가고 밑에 메인이 와 있다
   · 이번 브라우저 창에서는 다시 안 나온다(sessionStorage). 푸터 '처음 화면 다시 보기'로 다시 볼 수 있다 */
(function () {
  'use strict';
  var root = document.documentElement, intro = document.getElementById('intro');
  if (!intro) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function on() { return root.classList.contains('intro-on'); }
  function remember() { try { sessionStorage.setItem('tj-intro-done', '1'); } catch (e) {} }
  function jump(y) { try { window.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); } }
  function settled() { remember(); dispatchEvent(new Event('resize')); }   /* 그래프·캐릭터 위치를 다시 잰다 */

  /* 스크롤로 지나가면: 랜딩이 화면 위로 다 올라간 순간 빼고, 같은 화면이 보이도록 스크롤을 당긴다 */
  function check() {
    if (!on()) return;
    var r = intro.getBoundingClientRect();
    if (r.bottom > 0) return;
    var h = intro.offsetHeight, y = window.scrollY || pageYOffset;
    root.classList.remove('intro-on'); root.classList.add('intro-skip');
    jump(Math.max(0, y - h));
    settled();
  }
  addEventListener('scroll', check, { passive: true });

  /* 눌러서 들어가면: 접혀 날아가는 장면 */
  function targetY(t) {
    if (t === 'top') return 0;
    var el = document.getElementById(t);
    return el ? el.getBoundingClientRect().top + (window.scrollY || pageYOffset) - 70 : 0;
  }
  function enter(t) {
    if (!on()) { jump(targetY(t)); return; }
    if (reduce) {
      root.classList.remove('intro-on'); root.classList.add('intro-skip');
      jump(targetY(t)); settled(); return;
    }
    var top = intro.getBoundingClientRect().top;
    intro.style.top = top + 'px';
    intro.classList.add('is-folding');          /* 화면에 고정된 채 접힌다. 메인은 그 밑에서 맨 위로 올라와 있다 */
    root.classList.remove('intro-on');           /* 메인 히어로 첫 장면이 이때 시작된다 */
    jump(targetY(t));
    setTimeout(function () {
      root.classList.add('intro-skip');
      intro.classList.remove('is-folding'); intro.style.top = '';
      settled();
    }, 980);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-enter]') : null;
    if (a) { e.preventDefault(); enter(a.getAttribute('data-enter')); return; }
    var r = e.target.closest ? e.target.closest('[data-replay]') : null;
    if (r) {
      e.preventDefault();
      try { sessionStorage.removeItem('tj-intro-done'); } catch (err) {}
      root.classList.remove('intro-skip'); root.classList.add('intro-on');
      jump(0); dispatchEvent(new Event('resize'));
    }
  });
})();
