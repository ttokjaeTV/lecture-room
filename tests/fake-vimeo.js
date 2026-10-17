// 테스트용 가짜 Vimeo 플레이어 (player.js 와 같은 API 일부를 흉내)
// 실제 시간에 맞춰 재생 위치가 흐르고 play/pause/timeupdate/seeked/ended 이벤트를 보낸다.
(function () {
  function P(el, opts) {
    this.opts = opts; this.h = {}; this.t = 0; this.rate = 1; this.playing = false;
    var vid = opts.id || (String(opts.url).match(/vimeo\.com\/(\d+)/) || [])[1];
    this.dur = (window.__FAKE_DUR && window.__FAKE_DUR[vid]) || 62;
    var f = document.createElement('iframe');
    f.setAttribute('srcdoc', '<body style="margin:0;background:#2b221b;color:#e9dccb;font:600 16px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">▶ Vimeo 영상 (테스트용 가짜 플레이어) ' + (opts.id || opts.url) + '</body>');
    el.appendChild(f);
    window.__player = this;
  }
  P.prototype.on = function (ev, cb) { (this.h[ev] = this.h[ev] || []).push(cb); };
  P.prototype._emit = function (ev, data) { (this.h[ev] || []).forEach(function (cb) { cb(data); }); };
  P.prototype.ready = function () { return Promise.resolve(); };
  P.prototype.getDuration = function () { return Promise.resolve(this.dur); };
  P.prototype.getCurrentTime = function () { return Promise.resolve(this.t); };
  P.prototype.setPlaybackRate = function (r) { this.rate = r; return Promise.resolve(r); };
  P.prototype.setCurrentTime = function (t) {
    this.t = Math.max(0, Math.min(t, this.dur));
    var self = this;
    setTimeout(function () { self._emit('timeupdate', { seconds: self.t, duration: self.dur }); self._emit('seeked', { seconds: self.t }); }, 30);
    return Promise.resolve(this.t);
  };
  P.prototype.play = function () {
    if (this.playing) return Promise.resolve();
    var self = this; this.playing = true; this.last = performance.now();
    this._emit('play', { seconds: this.t });
    this.iv = setInterval(function () {
      var now = performance.now(); self.t += (now - self.last) / 1000 * self.rate; self.last = now;
      if (self.t >= self.dur) { self.t = self.dur; self._emit('timeupdate', { seconds: self.t }); clearInterval(self.iv); self.playing = false; self._emit('ended', { seconds: self.t }); return; }
      self._emit('timeupdate', { seconds: self.t, duration: self.dur });
    }, 250);
    return Promise.resolve();
  };
  P.prototype.pause = function () {
    if (!this.playing) return Promise.resolve();
    clearInterval(this.iv); this.playing = false; this._emit('pause', { seconds: this.t });
    return Promise.resolve();
  };
  P.prototype.destroy = function () { clearInterval(this.iv); this.playing = false; return Promise.resolve(); };
  window.Vimeo = { Player: P };
})();
