/* =========================================================
   Supabase 백엔드 — 실제 운영용
   js/config.js 에 SUPABASE_URL / SUPABASE_ANON_KEY 를 넣으면 사용된다.
   (anon key 는 공개용 키라 홈페이지 코드에 넣어도 됩니다.
    데이터 보호는 schema.sql 의 RLS 정책이 담당합니다.)
   ========================================================= */
(function () {
  'use strict';

  function makeSupabaseBackend(cfg) {
    var url = cfg.SUPABASE_URL.replace(/\/+$/, '');
    var key = cfg.SUPABASE_ANON_KEY;
    var sb = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    var token = null;
    var profile = null;
    var listeners = [];
    var recovery = false;

    function chk(res) {
      if (res.error) {
        var m = res.error.message || String(res.error);
        if (/Invalid login credentials/i.test(m)) m = '이메일 또는 비밀번호가 맞지 않아요.';
        else if (/Email not confirmed/i.test(m)) m = '이메일 인증을 먼저 완료해 주세요. 받은편지함(스팸함 포함)을 확인해 주세요.';
        else if (/already registered/i.test(m)) m = '이미 가입된 이메일이에요.';
        else if (/Password should be at least/i.test(m)) m = '비밀번호는 6자 이상이어야 해요.';
        throw new Error(m);
      }
      return res.data;
    }
    // Supabase API는 한 번에 최대 1,000행만 주므로 나눠서 모두 받기
    async function all(build) {
      var out = [], from = 0, size = 1000;
      for (;;) {
        var d = chk(await build().range(from, from + size - 1));
        out = out.concat(d);
        if (d.length < size) return out;
        from += size;
      }
    }
    function redirectUrl() { return location.href.split('#')[0]; }

    async function loadProfile(user) {
      if (!user) { profile = null; return null; }
      var res = await sb.from('profiles').select('id,email,name,is_admin,created_at').eq('id', user.id).maybeSingle();
      profile = chk(res) || { id: user.id, email: user.email, name: user.email, is_admin: false };
      return profile;
    }

    sb.auth.onAuthStateChange(function (event, session) {
      token = session ? session.access_token : null;
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
        setTimeout(function () {
          loadProfile(session && session.user).then(function (p) {
            listeners.forEach(function (cb) { cb(p, event); });
          });
        }, 0);
      }
    });

    var B = {
      mode: 'supabase',
      isRecovery: function () { return recovery; },
      init: async function () {
        var s = chk(await sb.auth.getSession());
        token = s.session ? s.session.access_token : null;
        return loadProfile(s.session && s.session.user);
      },
      onAuthChange: function (cb) { listeners.push(cb); },
      signIn: async function (email, pw) {
        var d = chk(await sb.auth.signInWithPassword({ email: String(email).trim(), password: pw }));
        token = d.session.access_token;
        return loadProfile(d.user);
      },
      // meta: 가입 동의 시각(이용약관·개인정보·만 14세) → 회원 정보(auth.users)에 함께 남는다
      signUp: async function (email, pw, name, meta) {
        var data = Object.assign({}, meta || {}, { name: name || '' });
        var d = chk(await sb.auth.signUp({
          email: String(email).trim(), password: pw,
          options: { data: data, emailRedirectTo: redirectUrl() }
        }));
        if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) {
          throw new Error('이미 가입된 이메일이에요.');
        }
        return { needConfirm: !d.session };
      },
      signOut: async function () { chk(await sb.auth.signOut()); profile = null; return true; },
      resetPassword: async function (email) {
        chk(await sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: redirectUrl() }));
        return true;
      },
      updatePassword: async function (pw) { chk(await sb.auth.updateUser({ password: pw })); recovery = false; return true; },
      updateName: async function (name) {
        chk(await sb.from('profiles').update({ name: name }).eq('id', profile.id));
        profile.name = name; return profile;
      },

      listCourses: async function () { return chk(await sb.from('courses').select('*').order('sort').order('created_at')); },
      listLessons: async function () { return chk(await sb.from('lessons').select('*').order('sort').order('created_at')); },
      myEnrollments: async function () { return chk(await sb.from('enrollments').select('*').eq('user_id', profile.id)); },
      myProgress: async function () { return chk(await sb.from('lesson_progress').select('*').eq('user_id', profile.id)); },
      mySessions: async function (limit) {
        return chk(await sb.from('watch_sessions').select('*').eq('user_id', profile.id)
          .order('started_at', { ascending: false }).limit(limit || 20));
      },

      openLecture: async function (lessonId) {
        return chk(await sb.rpc('open_lecture', { p_lesson: lessonId, p_user_agent: navigator.userAgent.slice(0, 200) }));
      },
      recordWatch: async function (sessionId, segments, position) {
        return chk(await sb.rpc('record_watch', { p_session: sessionId, p_segments: segments, p_position: position }));
      },
      // 창을 닫는 순간에도 마지막 기록이 전송되도록 keepalive 요청 사용
      recordWatchKeepalive: function (sessionId, segments, position) {
        if (!token) return;
        try {
          fetch(url + '/rest/v1/rpc/record_watch', {
            method: 'POST', keepalive: true,
            headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + token },
            body: JSON.stringify({ p_session: sessionId, p_segments: segments, p_position: position })
          });
        } catch (e) { /* 무시 */ }
      },

      admin: {
        listProfiles: function () { return all(function () { return sb.from('profiles').select('id,email,name,is_admin,created_at').order('created_at', { ascending: false }); }); },
        listEnrollments: function () { return all(function () { return sb.from('enrollments').select('*').order('created_at', { ascending: false }); }); },
        listInvites: function () { return all(function () { return sb.from('enrollment_invites').select('*').order('created_at', { ascending: false }); }); },
        grant: async function (email, courseId, days, until, memo) {
          return chk(await sb.rpc('admin_grant', { p_email: email, p_course: courseId, p_days: days || null, p_until: until || null, p_memo: memo || null }));
        },
        updateEnrollment: async function (id, patch) { return chk(await sb.from('enrollments').update(patch).eq('id', id).select().single()); },
        deleteInvite: async function (id) { chk(await sb.from('enrollment_invites').delete().eq('id', id)); return true; },
        listProgress: function (f) {
          f = f || {};
          return all(function () {
            var q = sb.from('lesson_progress').select('*').order('user_id').order('lesson_id');
            if (f.userId) q = q.eq('user_id', f.userId);
            if (f.lessonIds) q = q.in('lesson_id', f.lessonIds.length ? f.lessonIds : ['00000000-0000-0000-0000-000000000000']);
            return q;
          });
        },
        updateProgress: async function (userId, lessonId, patch) {
          var row = Object.assign({ user_id: userId, lesson_id: lessonId }, patch);
          return chk(await sb.from('lesson_progress').upsert(row, { onConflict: 'user_id,lesson_id' }).select().single());
        },
        listSessions: async function (userId) {
          return chk(await sb.from('watch_sessions').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(50));
        },
        saveCourse: async function (c) {
          var row = { title: c.title, description: c.description, max_views: c.max_views, access_days: c.access_days, sort: c.sort, is_published: c.is_published };
          if (c.id) return chk(await sb.from('courses').update(row).eq('id', c.id).select().single());
          return chk(await sb.from('courses').insert(row).select().single());
        },
        deleteCourse: async function (id) { chk(await sb.from('courses').delete().eq('id', id)); return true; },
        listMedia: async function () { return chk(await sb.from('lesson_media').select('*')); },
        saveLesson: async function (l, media) {
          var row = { course_id: l.course_id, title: l.title, section: l.section || null, duration_sec: l.duration_sec, sort: l.sort };
          var saved = l.id
            ? chk(await sb.from('lessons').update(row).eq('id', l.id).select().single())
            : chk(await sb.from('lessons').insert(row).select().single());
          chk(await sb.from('lesson_media').upsert({ lesson_id: saved.id, vimeo_id: media.vimeo_id, vimeo_hash: media.vimeo_hash || null }, { onConflict: 'lesson_id' }));
          return saved;
        },
        deleteLesson: async function (id) { chk(await sb.from('lessons').delete().eq('id', id)); return true; }
      }
    };
    return B;
  }

  window.LRMakeSupabaseBackend = makeSupabaseBackend;
})();
