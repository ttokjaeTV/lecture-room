/* =========================================================
   시청 기록기 — Vimeo 플레이어 이벤트를 받아 '실제로 재생된 구간'을
   모았다가 10초마다 서버로 보낸다.
   - 빨리감기/되감기는 구간을 끊어서 처리 (건너뛴 부분은 본 것으로 안 침)
   - 서버 응답이 '횟수 소진/다른 창에서 시작/기간 만료'면 즉시 정지
   - 기록 저장이 3번 연속 실패하면 재생을 멈춤 (기록 없이 시청 방지)
   ========================================================= */
(function () {
  'use strict';
  var C = window.LRCore;

  /**
   * @param player  Vimeo.Player 인스턴스
   * @param opt {
   *   sessionId, duration, playedSec, limitSec(null=무제한),
   *   send(segments, position) → Promise<result>,
   *   sendKeepalive(segments, position),
   *   onResult(result), onStop(reason), onFailing(isFailing), onTime(seconds)
   * }
   */
  function WatchTracker(player, opt) {
    this.p = player;
    this.o = opt;
    this.playing = false;
    this.segStart = null;
    this.lastT = null;
    this.queue = [];
    this.busy = false;
    this.fails = 0;
    this.stopped = false;
    this.serverPlayed = opt.playedSec || 0;
    this._bind();
    var self = this;
    this.timer = setInterval(function () { self.flush(); }, C.RULES.BEAT_SEC * 1000);
    this._onHide = function () { self.flushKeepalive(); };
    this._onVis = function () { if (document.visibilityState === 'hidden') self.flush(); };
    window.addEventListener('pagehide', this._onHide);
    document.addEventListener('visibilitychange', this._onVis);
  }

  WatchTracker.prototype._bind = function () {
    var self = this, p = this.p;
    p.on('play', function (e) {
      if (self.stopped) { p.pause(); return; }
      self.playing = true;
      var t = e && typeof e.seconds === 'number' ? e.seconds : self.lastT || 0;
      self.segStart = t; self.lastT = t;
    });
    p.on('timeupdate', function (e) {
      if (!e || typeof e.seconds !== 'number') return;
      var t = e.seconds;
      if (self.o.onTime) self.o.onTime(t);
      if (!self.playing || self.stopped) return;
      if (self.segStart === null) { self.segStart = t; self.lastT = t; return; }
      // 뒤로 가거나 3.5초 넘게 건너뛰면 구간을 끊는다
      if (t < self.lastT - 0.3 || t - self.lastT > 3.5) {
        self._close(self.lastT);
        self.segStart = t;
      }
      self.lastT = t;
      self._checkLimit();
    });
    p.on('seeked', function (e) {
      if (!self.playing || self.stopped || !e) return;
      self._close(self.lastT);
      self.segStart = e.seconds; self.lastT = e.seconds;
    });
    p.on('pause', function (e) {
      if (e && typeof e.seconds === 'number' && self.lastT !== null && e.seconds >= self.lastT && e.seconds - self.lastT < 1.5) self.lastT = e.seconds;
      self._close(self.lastT);
      self.playing = false;
      self.flush();
    });
    p.on('ended', function () {
      self._close(self.o.duration && self.lastT !== null && self.o.duration - self.lastT < 1.5 ? self.o.duration : self.lastT);
      self.playing = false;
      self.flush();
    });
  };

  WatchTracker.prototype._close = function (endT) {
    if (this.segStart !== null && endT !== null && endT > this.segStart + 0.05) {
      this.queue.push([C.r1(this.segStart), C.r1(endT)]);
    }
    this.segStart = null;
  };

  WatchTracker.prototype._pending = function () {
    var s = this.queue.reduce(function (a, q) { return a + (q[1] - q[0]); }, 0);
    if (this.segStart !== null && this.lastT !== null) s += Math.max(0, this.lastT - this.segStart);
    return s;
  };

  // 서버 응답을 기다리지 않고 화면에서 먼저 멈춤 (최대 10초 초과 시청 방지)
  WatchTracker.prototype._checkLimit = function () {
    if (this.o.limitSec == null) return;
    if (this.serverPlayed + this._pending() >= this.o.limitSec) {
      try { this.p.pause(); } catch (e) {}
    }
  };

  // 진행 중인 구간을 잘라 큐에 넣고 꺼낸다
  WatchTracker.prototype._take = function () {
    if (this.playing && this.segStart !== null && this.lastT !== null && this.lastT > this.segStart + 0.05) {
      this.queue.push([C.r1(this.segStart), C.r1(this.lastT)]);
      this.segStart = this.lastT;
    }
    var q = this.queue; this.queue = [];
    return q;
  };

  WatchTracker.prototype.flush = function () {
    var self = this;
    if (this.stopped || this.busy) return Promise.resolve();
    var segs = this._take();
    if (!segs.length) return Promise.resolve();
    this.busy = true;
    var pos = this.lastT;
    return Promise.resolve(this.o.send(segs, pos)).then(function (r) {
      self.busy = false;
      if (self.fails) { self.fails = 0; if (self.o.onFailing) self.o.onFailing(false); }
      if (r && typeof r.played_sec !== 'undefined') self.serverPlayed = Number(r.played_sec);
      if (self.o.onResult) self.o.onResult(r);
      if (r && r.ok === false) self.stop(r.reason || 'error');
    }, function () {
      self.busy = false;
      self.queue = segs.concat(self.queue);   // 실패한 구간은 다음에 다시 보냄
      self.fails++;
      if (self.fails >= 3) {
        try { self.p.pause(); } catch (e) {}
        if (self.o.onFailing) self.o.onFailing(true);
      }
    });
  };

  WatchTracker.prototype.flushKeepalive = function () {
    if (this.stopped) return;
    this._close(this.lastT);
    if (this.playing) this.segStart = this.lastT;
    var segs = this.queue; this.queue = [];
    if (segs.length && this.o.sendKeepalive) this.o.sendKeepalive(segs, this.lastT);
  };

  WatchTracker.prototype.stop = function (reason) {
    if (this.stopped) return;
    this.stopped = true;
    this.playing = false;
    clearInterval(this.timer);
    try { this.p.pause(); } catch (e) {}
    if (this.o.onStop) this.o.onStop(reason);
  };

  // 화면을 떠날 때: 남은 기록을 보내고 정리
  WatchTracker.prototype.destroy = function () {
    clearInterval(this.timer);
    window.removeEventListener('pagehide', this._onHide);
    document.removeEventListener('visibilitychange', this._onVis);
    if (!this.stopped) {
      this._close(this.lastT);
      var segs = this.queue; this.queue = [];
      if (segs.length) {
        try { Promise.resolve(this.o.send(segs, this.lastT)).catch(function () {}); } catch (e) {}
      }
    }
    this.stopped = true;
  };

  window.LRWatchTracker = WatchTracker;
})();
