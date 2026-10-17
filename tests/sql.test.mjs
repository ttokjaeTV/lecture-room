// Supabase 스키마를 임베디드 Postgres(PGlite)에서 실제로 실행해 검증
// 실행: node tests/sql.test.mjs  (PGlite 설치 경로를 NODE_PATH 로 지정)
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(here, '../supabase/schema.sql'), 'utf8');

const db = new PGlite();

// --- Supabase 환경 흉내 (auth 스키마, 역할) ---
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(schema);
await db.exec(schema); // 재실행해도 안전한지

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ✓ ' + msg); };

async function su(sql, params) { await db.query('reset role'); return (await db.query(sql, params)).rows; }
async function as(uid, sql, params) {
  await db.query('reset role');
  await db.query(`select set_config('request.uid', $1, false)`, [uid || '']);
  await db.query(`set role ${uid ? 'authenticated' : 'anon'}`);
  try { return (await db.query(sql, params)).rows; }
  finally { await db.query('reset role'); }
}
async function asErr(uid, sql, params) {
  try { await as(uid, sql, params); return null; } catch (e) { return e.message; }
}
const rewind = (sid, sec) => su(`update watch_sessions set last_beat_at = now() - make_interval(secs => $2) where id = $1`, [sid, sec]);

console.log('1) 가입·초대');
const [adminU] = await su(`insert into auth.users(email) values ('Admin@Test.com') returning id`);
await su(`update profiles set is_admin = true where id = $1`, [adminU.id]);
const [course] = await su(`insert into courses(title, max_views, access_days) values ('기본반', 2, 180) returning id`);
const [lesson] = await su(`insert into lessons(course_id, title, duration_sec, sort) values ($1, '1강', 100, 1) returning id`, [course.id]);
await su(`insert into lesson_media(lesson_id, vimeo_id) values ($1, '76979871')`, [lesson.id]);

const g1 = await as(adminU.id, `select admin_grant('new@test.com', $1, 30) r`, [course.id]);
ok(g1[0].r === 'invited', '미가입 이메일은 초대로 저장');
const [stu] = await su(`insert into auth.users(email, raw_user_meta_data) values ('NEW@test.com', '{"name":"홍길동"}') returning id`);
const prof = await su(`select * from profiles where id = $1`, [stu.id]);
ok(prof[0].name === '홍길동' && prof[0].email === 'new@test.com', '가입 시 프로필 자동 생성(이메일 소문자)');
const en = await su(`select * from enrollments where user_id = $1`, [stu.id]);
ok(en.length === 1 && en[0].source === 'invite', '가입 순간 초대 → 수강 권한 전환');
const days = (new Date(en[0].expires_at) - Date.now()) / 86400000;
ok(days > 29.9 && days < 30.1, '초대의 30일은 가입일부터 계산');
ok((await su(`select count(*)::int n from enrollment_invites`))[0].n === 0, '전환된 초대는 삭제');

console.log('2) 권한(RLS)');
const errMedia = await asErr(stu.id, `select * from lesson_media`);
const media = errMedia ? [] : await as(stu.id, `select * from lesson_media`);
ok(media.length === 0, '수강생은 영상 ID 테이블을 직접 못 봄');
ok((await as(stu.id, `select * from lessons`)).length === 1, '수강생은 회차 제목·길이는 조회 가능');
ok(await asErr(null, `select * from lessons`) !== null || (await as(null, `select * from lessons`)).length === 0, '비로그인은 조회 불가');
ok(await asErr(stu.id, `update profiles set is_admin = true where id = '${stu.id}'`) !== null, '수강생이 스스로 관리자 지정 불가');
await as(stu.id, `update profiles set name = '길동' where id = $1`, [stu.id]);
ok((await su(`select name from profiles where id = $1`, [stu.id]))[0].name === '길동', '수강생은 자기 이름은 수정 가능');
ok((await as(stu.id, `select * from enrollments`)).length === 1, '자기 수강 권한만 조회');
ok(await asErr(stu.id, `select admin_grant('x@test.com', '${course.id}')`) !== null, '수강생은 관리자 함수 호출 불가');
const fake = await as(stu.id, `insert into lesson_progress(user_id, lesson_id) values ($1, $2) returning *`, [stu.id, lesson.id]).catch(e => 'denied');
ok(fake === 'denied', '수강생이 진도 테이블에 직접 쓰기 불가');

console.log('3) 강의 열기·시청 기록');
let r = (await as(stu.id, `select open_lecture($1, 'test-agent') r`, [lesson.id]))[0].r;
ok(r.ok && r.vimeo_id === '76979871' && r.max_views === 2, '수강생 강의 열기 → 영상 ID 전달');
const sid = r.session_id;

await rewind(sid, 10);
r = (await as(stu.id, `select record_watch($1, $2::jsonb, 10) r`, [sid, JSON.stringify([[0, 10]])]))[0].r;
ok(r.ok && Number(r.counted) === 10 && Number(r.unique_sec) === 10, '10초 재생 → 10초 인정');

await rewind(sid, 10);
r = (await as(stu.id, `select record_watch($1, $2::jsonb, 90) r`, [sid, JSON.stringify([[10, 90]])]))[0].r;
ok(Number(r.counted) === 23, '10초 동안 80초 재생 주장 → 2배속+3초=23초만 인정');

await rewind(sid, 10);
r = (await as(stu.id, `select record_watch($1, $2::jsonb, 25) r`, [sid, JSON.stringify([[0, 5], [20, 25]])]))[0].r;
ok(JSON.stringify(r.watched_ranges) === JSON.stringify([[0, 33]]), '되감아 다시 본 구간은 진도에 중복 반영 안 됨');
ok(Number(r.played_sec) === 43, '되감아 본 시간도 누적 재생시간(횟수)에는 반영');

await rewind(sid, 60);
r = (await as(stu.id, `select record_watch($1, $2::jsonb, 100) r`, [sid, JSON.stringify([[33, 200], ['x', 1], [50, 40]])]))[0].r;
ok(Number(r.counted) === 67, '영상 길이 밖 구간·잘못된 값은 걸러냄');
ok(Number(r.unique_sec) === 100 && Number(r.views_used) === 1.1, '진도 100%, 사용 1.1회');

console.log('4) 동시 시청 차단');
const r2 = (await as(stu.id, `select open_lecture($1) r`, [lesson.id]))[0].r;
await rewind(sid, 10);
r = (await as(stu.id, `select record_watch($1, $2::jsonb) r`, [sid, JSON.stringify([[0, 10]])]))[0].r;
ok(!r.ok && r.reason === 'replaced', '다른 창에서 열면 이전 창 기록 거부(replaced)');

console.log('5) 횟수 제한');
const sid2 = r2.session_id;
for (let i = 0; i < 4; i++) {
  await rewind(sid2, 30);
  r = (await as(stu.id, `select record_watch($1, $2::jsonb) r`, [sid2, JSON.stringify([[0, 60]])]))[0].r;
  if (!r.ok) break;
}
ok(!r.ok && r.reason === 'limit' && Number(r.views_used) >= 2, '최대 2회 도달 → limit');
r = (await as(stu.id, `select open_lecture($1) r`, [lesson.id]))[0].r;
ok(!r.ok && r.reason === 'limit', '횟수 소진 후 강의 열기 차단');
await as(adminU.id, `update lesson_progress set bonus_views = bonus_views + 1 where user_id = $1 and lesson_id = $2`, [stu.id, lesson.id]);
r = (await as(stu.id, `select open_lecture($1) r`, [lesson.id]))[0].r;
ok(r.ok && Number(r.max_views) === 3, '관리자가 +1회 추가 → 다시 시청 가능');

console.log('6) 기간 만료');
await as(adminU.id, `update enrollments set expires_at = now() - interval '1 day' where user_id = $1`, [stu.id]);
await rewind(r.session_id, 10);
const rx = (await as(stu.id, `select record_watch($1, $2::jsonb) r`, [r.session_id, JSON.stringify([[0, 10]])]))[0].r;
ok(!rx.ok && rx.reason === 'expired', '시청 중 기간 만료 → 기록 거부');
r = (await as(stu.id, `select open_lecture($1) r`, [lesson.id]))[0].r;
ok(!r.ok && r.reason === 'expired', '만료 후 강의 열기 차단');

console.log('7) 기존 회원에게 부여 / 관리자');
await as(adminU.id, `update enrollments set expires_at = null where user_id = $1`, [stu.id]);
const [stu2] = await su(`insert into auth.users(email) values ('old@test.com') returning id`);
r = (await as(stu2.id, `select open_lecture($1) r`, [lesson.id]))[0].r;
ok(!r.ok && r.reason === 'not_enrolled', '수강 권한 없으면 차단');
const g2 = await as(adminU.id, `select admin_grant(' OLD@test.com ', $1, null, '2099-01-01', '스마트스토어') r`, [course.id]);
ok(g2[0].r === 'enrolled', '가입된 회원은 즉시 부여');
r = (await as(stu2.id, `select open_lecture($1) r`, [lesson.id]))[0].r;
ok(r.ok, '부여 후 바로 시청 가능');
ok((await as(adminU.id, `select admin_grant('bad', $1) r`, [course.id]))[0].r === 'invalid', '잘못된 이메일 거부');
r = (await as(adminU.id, `select open_lecture($1) r`, [lesson.id]))[0].r;
ok(r.ok && r.max_views === null, '관리자는 수강 권한·횟수 제한 없이 미리보기');
ok((await as(adminU.id, `select * from lesson_progress`)).length >= 1, '관리자는 전체 진도 조회');
ok((await as(stu2.id, `select * from lesson_progress`)).every(x => x.user_id === stu2.id), '수강생은 남의 진도 못 봄');

console.log(`\n모두 통과: ${passed}개`);
