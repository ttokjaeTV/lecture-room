/* 똑재TV — 스크립트는 두 가지 일만 한다. */
(function () {
  'use strict';

  /* 바닥글 연도 */
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* 아직 열지 않은 버튼(data-todo)은 눌러도 아무 데도 가지 않게 막고,
     화면 아래에 한 줄 안내를 잠깐 띄운다. 결제·신청이 연결되면 data-todo 를 지우면 된다. */
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
    if (el) {
      e.preventDefault();
      say('아직 준비 중입니다. 정식 오픈 후에 열립니다.');
    }
  });
})();
