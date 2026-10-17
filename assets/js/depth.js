/* 똑재TV 3안 — 깊이감: 카드 기울기와 전자책 표지 빛.
   React Bits 의 Tilted Card · Glare Hover 와 같은 발상을 몇 줄로 옮겼다.
   마우스가 있는 기기에서만, 움직임 줄이기를 켜지 않은 사람에게만 동작한다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce || !fine) return;

  function bind(box, target, maxX, maxY, onMove) {
    box.addEventListener('pointermove', function (e) {
      var r = box.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      target.style.setProperty('--ry', (px * maxY).toFixed(2) + 'deg');
      target.style.setProperty('--rx', (py * -maxX).toFixed(2) + 'deg');
      box.classList.add('is-tilting');
      if (onMove) onMove(px, py);
    });
    box.addEventListener('pointerleave', function () {
      target.style.setProperty('--ry', '0deg');
      target.style.setProperty('--rx', '0deg');
      box.classList.remove('is-tilting');
    });
  }

  /* 도구 카드·상품 카드: 아주 살짝(최대 4도) */
  Array.prototype.forEach.call(document.querySelectorAll('.tools .tool, .prods .prod'), function (el) {
    el.classList.add('tilt');
    bind(el, el, 4, 5);
  });

  /* 전자책 표지: 더 크게 기울고, 빛줄기가 마우스 반대쪽에서 스친다 */
  Array.prototype.forEach.call(document.querySelectorAll('.prod__vis--book'), function (box) {
    var cover = box.querySelector('.cover3d');
    if (!cover) return;
    var glare = cover.querySelector('.cover3d__glare');
    bind(box, cover, 12, 18, function (px) {
      if (glare) glare.style.setProperty('--gx', (100 - (px + 0.5) * 100).toFixed(1) + '%');
    });
  });
})();
