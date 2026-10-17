// 화면 동작 테스트 (데모 모드 + 가짜 Vimeo 플레이어)
// 실행: node tests/ui.test.mjs [스크린샷폴더]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/npm-tools/node_modules/playwright'); }
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shots = process.argv[2] || path.join(root, 'tests', 'shots');
fs.mkdirSync(shots, { recursive: true });
const url = 'file://' + path.join(root, 'index.html');
const fake = fs.readFileSync(path.join(here, 'fake-vimeo.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ✓ ' + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await pw.chromium.launch();
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 860 }, locale: 'ko-KR' });
  await ctx.route('**/player.vimeo.com/api/player.js', r => r.fulfill({ contentType: 'application/javascript', body: fake }));
  await ctx.route('**/pretendard.css', r => r.fulfill({ contentType: 'text/css', body: '' }));
  // 입장 비밀번호를 테스트용(test-pass)으로 바꿔서 제공
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'application/javascript',
    body: configSrc.replace(/SITE_PASSWORD_SHA256: '[0-9a-f]*'/, "SITE_PASSWORD_SHA256: '661ea2edce1d4894ab62edb966f83c890f6c90399109e3826193461ce333b5e1'") }));
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__FAKE_DUR = { 76979871: 62, 22439234: 196, 1084537: 596 }; });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.errors = errors;
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true });

const { ctx, page } = await newPage();
await page.goto(url);

console.log('입장 비밀번호');
await page.waitForSelector('#f-gate');
ok(!(await page.isVisible('text=데모 모드')), '비밀번호 전에는 강의실이 안 보임');
await shot(page, '00-gate');
await page.fill('#gate-pw', 'wrong');
await page.click('#f-gate button');
await page.waitForSelector('#gate-msg .msg-err');
ok(true, '틀린 비밀번호 거부');
await page.fill('#gate-pw', 'test-pass');
await page.click('#f-gate button');

console.log('로그인');
await page.waitForSelector('.auth-wrap .tabs');
ok(await page.isVisible('text=데모 모드'), '설정이 비어 있으면 데모 모드로 시작');
await shot(page, '01-login');
await page.fill('input[name=email]', 'student@demo.com');
await page.fill('input[name=pw]', 'wrong');
await page.click('form button:has-text("로그인")');
await page.waitForSelector('.msg-err');
ok((await page.textContent('.msg-err')).includes('맞지 않아요'), '틀린 비밀번호 안내');
await page.fill('input[name=email]', 'student@demo.com');
await page.fill('input[name=pw]', 'demo1234');
await page.click('form button:has-text("로그인")');
await page.waitForSelector('.course');

console.log('내 강의실');
ok((await page.textContent('.page-title')).includes('데모수강생'), '로그인 후 내 강의실');
const courses = await page.$$('.course');
ok(courses.length === 2, '강의 2개 표시');
ok(await page.isVisible('.course.locked >> text=수강 신청 후'), '권한 없는 강의는 잠금 표시');
ok(await page.isVisible('text=회차당 3회 시청'), '회차당 시청 횟수 표시');
await shot(page, '02-dashboard');

console.log('시청 · 기록');
await page.click('a.lesson >> nth=0');
await page.waitForSelector('#ov.hidden', { state: 'attached', timeout: 8000 });
ok(await page.isVisible('.watch-title'), '시청 화면 열림');
await page.evaluate(() => { window.__player.setPlaybackRate(2); window.__player.play(); });
await sleep(11500);
let st = await page.textContent('#stats');
ok(/진도율\s*\d+/.test(st), '10초마다 기록 → 진도 표시: ' + st.replace(/\s+/g, ' ').slice(0, 60));
const pct1 = Number(st.match(/진도율(\d+)/)[1]);
ok(pct1 >= 30, '2배속 11초 재생 → 진도 ' + pct1 + '% (약 22초분)');
// 앞으로 건너뛰기: 건너뛴 부분은 본 것으로 안 침
await page.evaluate(() => window.__player.setCurrentTime(50));
await sleep(3500);
await page.evaluate(() => window.__player.pause());
await sleep(800);
const ranges = await page.$$eval('#rb i', els => els.length);
ok(ranges === 2, '건너뛰면 본 구간이 2개로 나뉨');
await shot(page, '03-watch');

console.log('이어보기 · 횟수 제한');
await page.click('a:has-text("내 강의실")');
await page.waitForSelector('.course');
ok(await page.isVisible('.lesson >> text=부터'), '내 강의실에 이어보기 위치 표시');
// 사용량을 한도 직전으로 만들어 두고 다시 재생 (계산 로직 자체는 단위 테스트에서 검증)
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('lr_demo_db_v1'));
  const p = db.progress.find(x => x.user_id === 'u_student' && x.lesson_id === 'l1');
  p.played_sec = 62 * 3 - 4; localStorage.setItem('lr_demo_db_v1', JSON.stringify(db));
});
await page.click('a.lesson >> nth=0');
await page.waitForSelector('#ov.hidden', { state: 'attached', timeout: 8000 });
ok((await page.textContent('#stats')).includes('2.9'), '사용 횟수 2.9/3회 표시');
ok(await page.isVisible('.stat.warn'), '남은 시간이 적으면 강조');
await page.evaluate(() => window.__player.play());
await sleep(6000);
ok(!(await page.evaluate(() => window.__player && window.__player.playing)), '한도 도달 → 화면에서 즉시 정지');
await page.waitForSelector('#ov:not(.hidden)', { timeout: 15000 });
ok((await page.textContent('#ov')).includes('시청 횟수를 모두 사용'), '서버 응답 → 횟수 소진 안내');
await shot(page, '04-limit');
await page.click('#ov a:has-text("내 강의실로")');
await page.waitForSelector('.course');
ok(await page.isVisible('.lesson >> text=횟수 소진'), '내 강의실에 횟수 소진 표시');

console.log('동시 시청 차단');
await page.click('a.lesson >> nth=1');
await page.waitForSelector('#ov.hidden', { state: 'attached', timeout: 8000 });
await page.evaluate(() => window.__player.play());
await sleep(1500);
await page.evaluate(() => window.LRDemoBackend.openLecture('l2'));   // 다른 창에서 연 것과 같음
await page.waitForSelector('#ov:not(.hidden)', { timeout: 15000 });
ok((await page.textContent('#ov')).includes('다른 창에서'), '다른 창에서 열면 이 화면은 정지');
await shot(page, '05-replaced');
await page.click('#ov-retry');
await page.waitForSelector('#ov.hidden', { state: 'attached', timeout: 8000 });
ok(true, '[여기서 다시 보기]로 재개');

console.log('관리자');
await page.click('[data-demo="admin"]');
await page.waitForSelector('.kpis');
ok(await page.isVisible('text=가입 대기 중'), '가입 대기 초대 목록');
const rowsBefore = await page.$$eval('tr[data-uid]', r => r.length);
ok(rowsBefore >= 13, '수강생 목록 ' + rowsBefore + '행');
await shot(page, '06-admin-students');
await page.fill('#flt-q', '데모수강생');
await sleep(500);
ok((await page.$$eval('tr[data-uid]', r => r.length)) === 1, '검색');
await page.click('tr[data-uid]');
await page.waitForSelector('[data-bonus]');
ok((await page.textContent('main')).includes('3.03 / 3') || (await page.textContent('main')).includes('/ 3'), '수강생 상세: 회차별 사용 횟수');
await page.click('[data-bonus="l1"]');
await page.waitForFunction(() => document.querySelector('main').textContent.includes('(+1)'));
ok(true, '+1회 추가 반영');
ok((await page.textContent('main')).includes('시청 기록'), '시청 기록 표시');
await shot(page, '07-admin-student');

// 권한 부여: 가입자 1, 미가입 1, 잘못된 1
await page.click('a:has-text("수강생") >> nth=0');
await page.waitForSelector('#btn-grant');
await page.click('#btn-grant');
await page.fill('#g-emails', 'member1@example.com\nnewbie@example.com, bad-email');
page.once('dialog', d => d.accept());
await page.click('#g-ok');
await page.waitForSelector('.toast:has-text("바로 부여")');
const t = await page.textContent('.toast:has-text("바로 부여")');
ok(t.includes('바로 부여 1명') && t.includes('가입 대기 1명') && t.includes('실패 1건'), '여러 명 한 번에 부여: ' + t);
await sleep(600);
ok(await page.isVisible('td:has-text("newbie@example.com")'), '미가입자는 가입 대기로');

await page.click('a:has-text("강의·회차")');
await page.waitForSelector('#f-course');
await page.click('#l-new');
await page.fill('#ls-title', '4강. 테스트 회차');
await page.fill('#ls-url', '<iframe src="https://player.vimeo.com/video/22439234?h=ab12cd34ef"></iframe>');
await page.click('#ls-fetch');
await page.waitForFunction(() => document.querySelector('#ls-dur').value === '3:16');
ok(true, '임베드 코드에서 영상 ID·해시 인식 → 길이 불러오기 3:16');
await shot(page, '08-admin-lesson-modal');
await page.click('#ls-ok');
await page.waitForSelector('td:has-text("4강. 테스트 회차")');
ok(await page.isVisible('text=비공개 링크'), '회차 추가 (비공개 링크 해시 저장)');
await shot(page, '09-admin-courses');

await page.click('a:has-text("시청 통계")');
await page.waitForSelector('.heat');
ok((await page.$$('.lesson-stat')).length === 4, '회차별 통계');
ok(await page.isVisible('text=가장 많이 빠지는 구간'), '이탈 구간 안내');
await shot(page, '10-admin-stats');

console.log('회원가입 → 초대 자동 전환');
await page.click('[data-act="logout"]');
await page.waitForSelector('.auth-wrap');
await page.click('[data-tab="signup"]');
await page.fill('input[name=name]', '신규회원');
await page.fill('input[name=email]', 'newbie@example.com');
await page.fill('input[name=pw]', 'abc123');
await page.click('form button:has-text("회원가입")');
await page.waitForSelector('.course');
ok((await page.$$('.course:not(.locked)')).length === 1, '가입하자마자 초대받은 강의 수강 가능');

console.log('모바일');
const m = await newPage({ width: 390, height: 844 });
await m.page.goto(url);
await m.page.fill('#gate-pw', 'test-pass');
await m.page.click('#f-gate button');
await m.page.waitForSelector('.auth-wrap .tabs');
await m.page.click('.demo-accounts [data-demo="student"]');
await m.page.waitForSelector('.course');
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, '모바일 가로 스크롤 없음');
await shot(m.page, '11-mobile-dashboard');
await m.page.click('a.lesson >> nth=1');
await m.page.waitForSelector('#ov.hidden', { state: 'attached', timeout: 8000 });
await shot(m.page, '12-mobile-watch');
await m.page.click('[data-demo="admin"]');
await m.page.waitForSelector('.kpis');
ok(!(await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), '관리자 화면도 가로 스크롤 없음');
await shot(m.page, '13-mobile-admin');

const errs = page.errors.concat(m.page.errors);
ok(errs.length === 0, '콘솔 오류 없음' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
console.log(`\n모두 통과: ${n}개`);
