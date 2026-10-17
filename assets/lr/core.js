/* =========================================================
   강의실 핵심 계산 로직 (브라우저 · Node 공용)
   - 실제로 본 구간 병합, 누적 재생시간, 시청 횟수 계산
   - supabase/schema.sql 의 record_watch / open_lecture 와
     같은 규칙을 씁니다. 한쪽을 바꾸면 다른 쪽도 바꿔야 합니다.
   ========================================================= */
(function (root) {
  'use strict';

  var RULES = {
    GAP_SEC: 0.5,         // 0.5초 이내 틈은 이어서 본 것으로 처리
    MAX_RATE: 2,          // 허용 최대 배속 (Vimeo 최대 2배속)
    SLACK_SEC: 3,         // 네트워크 지연 여유
    COMPLETE_RATIO: 0.9,  // 중복 없이 90% 이상 보면 '완료'
    BEAT_SEC: 10,         // 시청 기록 전송 주기
    MAX_SEGMENTS: 50      // 한 번에 받는 구간 수 상한
  };

  function r1(x) { return Math.round(x * 10) / 10; }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  /** 기존 구간 목록에 [from, to] 를 더해 겹치는 부분을 합친 새 목록을 돌려준다 */
  function mergeRanges(ranges, from, to) {
    var all = (ranges || []).map(function (r) { return [r[0], r[1]]; });
    if (num(from) !== null && num(to) !== null && to > from) all.push([from, to]);
    all = all.filter(function (r) { return r[1] > r[0]; });
    all.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [], cur = null;
    all.forEach(function (r) {
      if (!cur) { cur = [r[0], r[1]]; return; }
      if (r[0] <= cur[1] + RULES.GAP_SEC) { cur[1] = Math.max(cur[1], r[1]); }
      else { out.push([r1(cur[0]), r1(cur[1])]); cur = [r[0], r[1]]; }
    });
    if (cur) out.push([r1(cur[0]), r1(cur[1])]);
    return out;
  }

  function rangesTotal(ranges) {
    return r1((ranges || []).reduce(function (s, r) { return s + (r[1] - r[0]); }, 0));
  }

  /**
   * 시청 기록 한 번(하트비트)을 반영한다.
   * @param p        { watched_ranges, unique_sec, played_sec, bonus_views, last_position }
   * @param duration 영상 길이(초)
   * @param segments [[from, to], ...] 이번에 실제 재생된 구간들
   * @param elapsedSec 지난 기록 이후 흐른 실제 시간(초)
   */
  function applySegments(p, duration, segments, elapsedSec, position) {
    var allowed = Math.max(0, elapsedSec) * RULES.MAX_RATE + RULES.SLACK_SEC;
    var total = 0;
    var ranges = (p.watched_ranges || []).slice();
    (segments || []).slice(0, RULES.MAX_SEGMENTS).forEach(function (seg) {
      if (total >= allowed) return;
      if (!Array.isArray(seg) || num(seg[0]) === null || num(seg[1]) === null) return;
      var a = Math.max(0, Math.min(seg[0], duration));
      var b = Math.max(0, Math.min(seg[1], duration));
      if (b <= a) return;
      var len = r1(Math.min(b - a, allowed - total));
      if (len <= 0) return;
      b = a + len;
      ranges = mergeRanges(ranges, a, b);
      total += len;
    });
    var pos = num(position) !== null ? Math.max(0, Math.min(position, duration)) : (p.last_position || 0);
    return {
      counted: r1(total),
      progress: {
        watched_ranges: ranges,
        unique_sec: rangesTotal(ranges),
        played_sec: (p.played_sec || 0) + total,
        bonus_views: p.bonus_views || 0,
        last_position: pos
      }
    };
  }

  /** 사용한 횟수 = 누적 재생시간 ÷ 영상 길이 */
  function viewsUsed(playedSec, duration) {
    if (!duration) return 0;
    return Math.round(((playedSec || 0) / duration) * 100) / 100;
  }

  /** 최대 횟수(관리자 추가분 포함). null = 무제한 */
  function viewLimit(course, progress) {
    if (!course || course.max_views == null) return null;
    return Number(course.max_views) + Number((progress && progress.bonus_views) || 0);
  }

  /** 남은 시청 가능 시간(초). null = 무제한 */
  function remainingSec(course, progress, duration) {
    var lim = viewLimit(course, progress);
    if (lim == null) return null;
    return Math.max(0, lim * duration - ((progress && progress.played_sec) || 0));
  }

  function isComplete(progress, duration) {
    return !!progress && duration > 0 && (progress.unique_sec || 0) >= duration * RULES.COMPLETE_RATIO;
  }

  /** 영상을 bins 칸으로 나눠 각 칸을 얼마나 봤는지(0~1) */
  function coverage(ranges, duration, bins) {
    var out = [];
    var w = duration / bins;
    for (var i = 0; i < bins; i++) {
      var s = i * w, e = s + w, seen = 0;
      (ranges || []).forEach(function (r) {
        var a = Math.max(s, r[0]), b = Math.min(e, r[1]);
        if (b > a) seen += b - a;
      });
      out.push(w > 0 ? Math.min(1, seen / w) : 0);
    }
    return out;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (h ? String(m).padStart(2, '0') : String(m));
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function fmtMinutes(sec) {
    var m = Math.round((sec || 0) / 60);
    if (m >= 60) return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
    return m + '분';
  }

  /** Vimeo 주소에서 영상 ID와 비공개 해시를 뽑는다 */
  function parseVimeo(input) {
    var s = String(input || '').trim();
    if (/^\d+$/.test(s)) return { id: s, hash: null };
    var m = s.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]{6,}))?/i);
    if (!m) return null;
    var hash = m[2] || null;
    var h = s.match(/[?&]h=([0-9a-f]{6,})/i);
    if (h) hash = h[1];
    return { id: m[1], hash: hash };
  }

  var api = {
    RULES: RULES, mergeRanges: mergeRanges, rangesTotal: rangesTotal,
    applySegments: applySegments, viewsUsed: viewsUsed, viewLimit: viewLimit,
    remainingSec: remainingSec, isComplete: isComplete, coverage: coverage,
    fmtTime: fmtTime, fmtMinutes: fmtMinutes, parseVimeo: parseVimeo, r1: r1
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LRCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
