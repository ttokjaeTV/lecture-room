// js/core.js 단위 테스트 — SQL 테스트(sql.test.mjs)와 같은 시나리오로 결과가 같은지 확인
// 실행: node tests/core.test.js
const assert = require('node:assert/strict');
const C = require('../js/core.js');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ✓ ' + m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' → ' + JSON.stringify(a));

console.log('구간 병합');
eq(C.mergeRanges([], 0, 10), [[0, 10]], '첫 구간');
eq(C.mergeRanges([[0, 10]], 10.3, 20), [[0, 20]], '0.5초 이내 틈은 이어붙임');
eq(C.mergeRanges([[0, 10]], 11, 20), [[0, 10], [11, 20]], '1초 틈은 분리');
eq(C.mergeRanges([[0, 10], [20, 30]], 5, 25), [[0, 30]], '가운데를 메우면 하나로');
ok(C.rangesTotal([[0, 10], [20, 25.5]]) === 15.5, '중복 없이 본 시간 합계');

console.log('하트비트 반영 (SQL 테스트와 동일 시나리오)');
let p = { watched_ranges: [], played_sec: 0, bonus_views: 0, last_position: 0 };
let r = C.applySegments(p, 100, [[0, 10]], 10, 10); p = r.progress;
ok(r.counted === 10, '10초 재생 → 10초 인정');
r = C.applySegments(p, 100, [[10, 90]], 10, 90); p = r.progress;
ok(r.counted === 23, '2배속+3초 상한 → 23초');
r = C.applySegments(p, 100, [[0, 5], [20, 25]], 10, 25); p = r.progress;
eq(p.watched_ranges, [[0, 33]], '되감기 구간 중복 없음');
ok(p.played_sec === 43, '누적 재생시간 43초');
r = C.applySegments(p, 100, [[33, 200], ['x', 1], [50, 40]], 60, 100); p = r.progress;
ok(r.counted === 67 && p.unique_sec === 100, '범위 밖·잘못된 값 거름, 진도 100%');
ok(C.viewsUsed(p.played_sec, 100) === 1.1, '사용 1.1회');

console.log('횟수·완료');
ok(C.viewLimit({ max_views: 2 }, { bonus_views: 1 }) === 3, '최대 횟수 = 기본 + 추가분');
ok(C.viewLimit({ max_views: null }, {}) === null, '무제한');
ok(C.remainingSec({ max_views: 2 }, { played_sec: 110, bonus_views: 0 }, 100) === 90, '남은 시청 가능 90초');
ok(C.isComplete({ unique_sec: 90 }, 100) && !C.isComplete({ unique_sec: 89 }, 100), '90% 이상 완료');
eq(C.coverage([[0, 50]], 100, 4), [1, 1, 0, 0], '구간별 시청 비율');

console.log('Vimeo 주소 해석');
eq(C.parseVimeo('https://vimeo.com/76979871'), { id: '76979871', hash: null }, '공개 링크');
eq(C.parseVimeo('https://vimeo.com/123456789/abcdef1234'), { id: '123456789', hash: 'abcdef1234' }, '비공개 링크');
eq(C.parseVimeo('https://player.vimeo.com/video/123456789?h=abcdef1234&badge=0'), { id: '123456789', hash: 'abcdef1234' }, '임베드 주소');
eq(C.parseVimeo('<iframe src="https://player.vimeo.com/video/987654321?h=0a1b2c3d4e"></iframe>'), { id: '987654321', hash: '0a1b2c3d4e' }, '임베드 코드 통째로');
ok(C.parseVimeo('youtube.com/xyz') === null, '잘못된 주소');
ok(C.fmtTime(3725) === '1:02:05' && C.fmtTime(65) === '1:05', '시간 표기');

console.log(`\n모두 통과: ${n}개`);
