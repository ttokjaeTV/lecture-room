-- =====================================================================
--  강의실 DB 설정 (Supabase)
--  사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run
--  여러 번 실행해도 안전하도록 작성했습니다(테이블은 없을 때만 생성).
--
--  규칙 요약 (js/core.js 와 같음)
--   · 시청 횟수 = 누적 재생시간 ÷ 영상 길이   (빨리감기·반복 모두 반영)
--   · 진도율    = 중복 없이 본 시간 ÷ 영상 길이 (90% 이상이면 완료)
--   · 기록은 10초마다 서버로 전송, 서버는 '최대 2배속 + 3초'를 넘는
--     재생량은 인정하지 않음 (조작 방지)
--   · 같은 계정으로 다른 창/기기에서 재생을 시작하면 이전 창은 중지
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 회원 정보 (가입하면 자동 생성)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 강의(과정)
create table if not exists public.courses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  max_views     numeric(6,2) check (max_views is null or max_views > 0), -- 회차당 최대 시청 횟수, 비우면 무제한
  access_days   int check (access_days is null or access_days > 0),      -- 기본 수강 기간(일), 비우면 무제한
  sort          int not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 회차(강의 영상). 제목·길이는 수강생에게 공개
create table if not exists public.lessons (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  title         text not null,
  duration_sec  int  not null check (duration_sec > 0),
  sort          int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists lessons_course_idx on public.lessons(course_id, sort);

-- 영상 ID. 수강 권한을 확인한 뒤 open_lecture 함수로만 전달 (직접 조회 불가)
create table if not exists public.lesson_media (
  lesson_id   uuid primary key references public.lessons(id) on delete cascade,
  vimeo_id    text not null,
  vimeo_hash  text            -- 비공개(Unlisted) 링크의 해시값
);

-- 수강 권한
create table if not exists public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,                -- 비우면 무제한
  status      text not null default 'active' check (status in ('active','revoked')),
  source      text not null default 'manual', -- manual / invite / payment(결제 연동 시)
  memo        text,
  created_at  timestamptz not null default now(),
  unique (user_id, course_id)
);

-- 아직 가입하지 않은 이메일에 미리 준 수강 권한 → 가입하는 순간 자동 전환
create table if not exists public.enrollment_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  course_id   uuid not null references public.courses(id) on delete cascade,
  days        int,          -- 가입일부터 N일
  until_at    timestamptz,  -- 또는 특정 날짜까지
  memo        text,
  created_at  timestamptz not null default now(),
  unique (email, course_id)
);

-- 회차별 진도
create table if not exists public.lesson_progress (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  lesson_id         uuid not null references public.lessons(id) on delete cascade,
  watched_ranges    jsonb not null default '[]'::jsonb, -- [[시작초, 끝초], ...] 중복 없이 본 구간
  unique_sec        numeric not null default 0,         -- 중복 없이 본 시간
  played_sec        numeric not null default 0,         -- 누적 재생시간(반복 포함) → 횟수 계산
  bonus_views       numeric(6,2) not null default 0,    -- 관리자가 추가로 준 횟수
  last_position     numeric not null default 0,         -- 이어보기 위치
  first_watched_at  timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index if not exists lesson_progress_lesson_idx on public.lesson_progress(lesson_id);

-- 시청 세션(창 하나 = 세션 하나). 시청 기록 로그 겸 동시 시청 차단용
create table if not exists public.watch_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_beat_at  timestamptz not null default now(),
  played_sec    numeric not null default 0,
  ended_reason  text,   -- null=시청 중 / replaced=다른 창에서 시작 / limit=횟수 소진 / expired=기간 만료
  user_agent    text
);
create index if not exists watch_sessions_user_idx on public.watch_sessions(user_id, started_at desc);
create index if not exists watch_sessions_open_idx on public.watch_sessions(user_id) where ended_reason is null;

-- ---------------------------------------------------------------------
-- 2. 보조 함수
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- 구간 병합 (js/core.js mergeRanges 와 동일: 0.5초 이내 틈은 이어붙임, 소수 1자리)
create or replace function public._merge_ranges(p_ranges jsonb, p_from numeric, p_to numeric)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  r record; cur_s numeric; cur_e numeric; result jsonb := '[]'::jsonb;
begin
  for r in
    select s, e from (
      select (x->>0)::numeric as s, (x->>1)::numeric as e
        from jsonb_array_elements(coalesce(p_ranges, '[]'::jsonb)) x
      union all
      select p_from, p_to where p_from is not null and p_to is not null
    ) t
    where e > s
    order by s, e
  loop
    if cur_s is null then
      cur_s := r.s; cur_e := r.e;
    elsif r.s <= cur_e + 0.5 then
      cur_e := greatest(cur_e, r.e);
    else
      result := result || jsonb_build_array(jsonb_build_array(round(cur_s, 1), round(cur_e, 1)));
      cur_s := r.s; cur_e := r.e;
    end if;
  end loop;
  if cur_s is not null then
    result := result || jsonb_build_array(jsonb_build_array(round(cur_s, 1), round(cur_e, 1)));
  end if;
  return result;
end $$;

create or replace function public._ranges_total(p_ranges jsonb)
returns numeric language sql immutable set search_path = public as $$
  select coalesce(round(sum((x->>1)::numeric - (x->>0)::numeric), 1), 0)
    from jsonb_array_elements(coalesce(p_ranges, '[]'::jsonb)) x
$$;

-- 수강 권한이 지금 유효한지
create or replace function public._enrollment_state(p_user uuid, p_course uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when e.id is null then 'not_enrolled'
    when e.status <> 'active' then 'not_enrolled'
    when e.starts_at > now() then 'not_started'
    when e.expires_at is not null and e.expires_at < now() then 'expired'
    else 'ok' end
  from (select 1) d
  left join public.enrollments e on e.user_id = p_user and e.course_id = p_course
$$;

-- ---------------------------------------------------------------------
-- 3. 가입 시 프로필 생성 + 미리 받은 수강 권한 전환
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email),
          coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.enrollments (user_id, course_id, expires_at, memo, source)
  select new.id, i.course_id,
         coalesce(i.until_at, case when i.days is not null then now() + make_interval(days => i.days) end),
         i.memo, 'invite'
    from public.enrollment_invites i
   where lower(i.email) = lower(new.email)
  on conflict (user_id, course_id) do nothing;

  delete from public.enrollment_invites where lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. 강의 열기 / 시청 기록 (수강생이 호출하는 함수)
-- ---------------------------------------------------------------------

create or replace function public.open_lecture(p_lesson uuid, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin();
  l public.lessons; c public.courses; m public.lesson_media; p public.lesson_progress;
  v_state text; v_used numeric; v_lim numeric; v_sid uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'login'); end if;

  select * into l from public.lessons where id = p_lesson;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into c from public.courses where id = l.course_id;

  if not v_admin then
    if not c.is_published then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    v_state := public._enrollment_state(v_uid, c.id);
    if v_state <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_state); end if;
  end if;

  select * into m from public.lesson_media where lesson_id = l.id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_media'); end if;

  select * into p from public.lesson_progress where user_id = v_uid and lesson_id = l.id;
  v_used := round(coalesce(p.played_sec, 0) / l.duration_sec, 2);
  v_lim  := case when v_admin or c.max_views is null then null
                 else c.max_views + coalesce(p.bonus_views, 0) end;

  if v_lim is not null and v_used >= v_lim then
    return jsonb_build_object('ok', false, 'reason', 'limit', 'views_used', v_used, 'max_views', v_lim);
  end if;

  -- 같은 계정으로 열려 있던 다른 창은 중지
  update public.watch_sessions set ended_reason = 'replaced'
   where user_id = v_uid and ended_reason is null;

  insert into public.watch_sessions (user_id, lesson_id, user_agent)
  values (v_uid, l.id, left(p_user_agent, 200))
  returning id into v_sid;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_sid,
    'lesson_id', l.id,
    'title', l.title,
    'vimeo_id', m.vimeo_id,
    'vimeo_hash', m.vimeo_hash,
    'duration_sec', l.duration_sec,
    'last_position', coalesce(p.last_position, 0),
    'watched_ranges', coalesce(p.watched_ranges, '[]'::jsonb),
    'unique_sec', coalesce(p.unique_sec, 0),
    'played_sec', coalesce(p.played_sec, 0),
    'views_used', v_used,
    'max_views', v_lim
  );
end $$;

-- p_segments: [[시작초, 끝초], ...] 지난 전송 이후 실제로 재생된 구간
create or replace function public.record_watch(p_session uuid, p_segments jsonb, p_position numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin();
  s public.watch_sessions; l public.lessons; c public.courses; p public.lesson_progress;
  v_state text; v_elapsed numeric; v_allowed numeric; v_total numeric := 0;
  v_seg jsonb; a numeric; b numeric; v_len numeric; v_ranges jsonb;
  v_used numeric; v_lim numeric; v_reason text; v_n int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'login'); end if;

  select * into s from public.watch_sessions where id = p_session and user_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;
  if s.ended_reason is not null then return jsonb_build_object('ok', false, 'reason', s.ended_reason); end if;

  select * into l from public.lessons where id = s.lesson_id;
  select * into c from public.courses where id = l.course_id;

  if not v_admin then
    v_state := public._enrollment_state(v_uid, c.id);
    if v_state <> 'ok' then
      update public.watch_sessions set ended_reason = 'expired' where id = s.id;
      return jsonb_build_object('ok', false, 'reason', 'expired');
    end if;
  end if;

  v_elapsed := greatest(0, extract(epoch from (now() - s.last_beat_at)));
  v_allowed := v_elapsed * 2 + 3;   -- 최대 2배속 + 네트워크 여유 3초

  insert into public.lesson_progress (user_id, lesson_id) values (v_uid, l.id)
  on conflict (user_id, lesson_id) do nothing;
  select * into p from public.lesson_progress where user_id = v_uid and lesson_id = l.id for update;
  v_ranges := p.watched_ranges;

  if jsonb_typeof(p_segments) = 'array' then
    for v_seg in select value from jsonb_array_elements(p_segments) loop
      v_n := v_n + 1;
      exit when v_n > 50 or v_total >= v_allowed;
      continue when jsonb_typeof(v_seg) <> 'array'
                 or jsonb_typeof(v_seg->0) <> 'number'
                 or jsonb_typeof(v_seg->1) <> 'number';
      a := greatest(0, least((v_seg->>0)::numeric, l.duration_sec));
      b := greatest(0, least((v_seg->>1)::numeric, l.duration_sec));
      continue when b <= a;
      v_len := round(least(b - a, v_allowed - v_total), 1);
      continue when v_len <= 0;
      b := a + v_len;
      v_ranges := public._merge_ranges(v_ranges, a, b);
      v_total := v_total + v_len;
    end loop;
  end if;

  update public.lesson_progress
     set watched_ranges   = v_ranges,
         unique_sec       = public._ranges_total(v_ranges),
         played_sec       = played_sec + v_total,
         last_position    = coalesce(greatest(0, least(p_position, l.duration_sec)), last_position),
         first_watched_at = coalesce(first_watched_at, case when v_total > 0 then now() end),
         updated_at       = now()
   where user_id = v_uid and lesson_id = l.id
  returning * into p;

  update public.watch_sessions
     set last_beat_at = now(), played_sec = played_sec + v_total
   where id = s.id;

  v_used := round(p.played_sec / l.duration_sec, 2);
  v_lim  := case when v_admin or c.max_views is null then null else c.max_views + p.bonus_views end;
  if v_lim is not null and p.played_sec >= v_lim * l.duration_sec then
    update public.watch_sessions set ended_reason = 'limit' where id = s.id;
    v_reason := 'limit';
  end if;

  return jsonb_build_object(
    'ok', v_reason is null,
    'reason', v_reason,
    'counted', round(v_total, 1),
    'played_sec', p.played_sec,
    'unique_sec', p.unique_sec,
    'watched_ranges', v_ranges,
    'views_used', v_used,
    'max_views', v_lim
  );
end $$;

-- ---------------------------------------------------------------------
-- 5. 관리자 함수
-- ---------------------------------------------------------------------

-- 이메일로 수강 권한 부여. 가입된 회원이면 즉시, 아니면 가입 시 자동 적용
-- p_days: 오늘(초대는 가입일)부터 N일 / p_until: 특정 날짜까지 / 둘 다 비우면 무제한
create or replace function public.admin_grant(p_email text, p_course uuid, p_days int default null,
                                              p_until timestamptz default null, p_memo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_exp timestamptz;
begin
  if not public.is_admin() then raise exception '관리자만 사용할 수 있습니다'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'invalid'; end if;

  select id into v_user from public.profiles where lower(email) = v_email;
  if found then
    v_exp := coalesce(p_until, case when p_days is not null then now() + make_interval(days => p_days) end);
    insert into public.enrollments (user_id, course_id, expires_at, memo, status, source)
    values (v_user, p_course, v_exp, p_memo, 'active', 'manual')
    on conflict (user_id, course_id) do update
      set expires_at = excluded.expires_at, status = 'active',
          starts_at = least(public.enrollments.starts_at, now()),
          memo = coalesce(excluded.memo, public.enrollments.memo);
    return 'enrolled';
  else
    insert into public.enrollment_invites (email, course_id, days, until_at, memo)
    values (v_email, p_course, p_days, p_until, p_memo)
    on conflict (email, course_id) do update
      set days = excluded.days, until_at = excluded.until_at, memo = excluded.memo;
    return 'invited';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. 접근 권한 (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.courses            enable row level security;
alter table public.lessons            enable row level security;
alter table public.lesson_media       enable row level security;
alter table public.enrollments        enable row level security;
alter table public.enrollment_invites enable row level security;
alter table public.lesson_progress    enable row level security;
alter table public.watch_sessions     enable row level security;

-- 비로그인(anon)은 아무것도 못 봄
revoke all on public.profiles, public.courses, public.lessons, public.lesson_media,
              public.enrollments, public.enrollment_invites, public.lesson_progress,
              public.watch_sessions from anon;

-- 회원은 자기 이름만 수정 가능 (관리자 여부 등은 못 바꿈)
revoke insert, update, delete on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

do $$
declare t text;
begin
  -- 기존 정책 정리 (재실행 대비)
  for t in select unnest(array['profiles','courses','lessons','lesson_media','enrollments',
                               'enrollment_invites','lesson_progress','watch_sessions']) loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('drop policy if exists own_select on public.%I', t);
  end loop;
end $$;
drop policy if exists own_update on public.profiles;
drop policy if exists member_select on public.courses;
drop policy if exists member_select on public.lessons;

-- 관리자: 모든 테이블 전체 권한
create policy admin_all on public.profiles           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.courses            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.lessons            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.lesson_media       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.enrollments        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.enrollment_invites for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.lesson_progress    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.watch_sessions     for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 회원: 자기 데이터만 조회
create policy own_select on public.profiles        for select to authenticated using (id = auth.uid());
create policy own_update on public.profiles        for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy own_select on public.enrollments     for select to authenticated using (user_id = auth.uid());
create policy own_select on public.lesson_progress for select to authenticated using (user_id = auth.uid());
create policy own_select on public.watch_sessions  for select to authenticated using (user_id = auth.uid());
-- 공개된 강의의 목록·회차 제목은 로그인한 회원 누구나 조회 (영상 ID는 lesson_media라 안 보임)
create policy member_select on public.courses for select to authenticated using (is_published);
create policy member_select on public.lessons for select to authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.is_published));

-- 함수 실행 권한
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public._enrollment_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.open_lecture(uuid, text) from public, anon;
revoke execute on function public.record_watch(uuid, jsonb, numeric) from public, anon;
revoke execute on function public.admin_grant(text, uuid, int, timestamptz, text) from public, anon;
grant  execute on function public.open_lecture(uuid, text) to authenticated;
grant  execute on function public.record_watch(uuid, jsonb, numeric) to authenticated;
grant  execute on function public.admin_grant(text, uuid, int, timestamptz, text) to authenticated;
grant  execute on function public.is_admin() to authenticated;

-- =====================================================================
--  마지막 단계: 본인 계정을 관리자로 지정
--  강의실 페이지에서 먼저 회원가입한 뒤, 아래 이메일을 바꿔서 실행하세요.
--
--  update public.profiles set is_admin = true where email = '내이메일@example.com';
-- =====================================================================
