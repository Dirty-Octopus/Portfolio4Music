/** A single content-playback owner. UI SFX are non-stacking; intro cues retain their tails.
 * Gain envelopes remove transport discontinuities without altering source files.
 * Commands are serialized, superseded requests cannot start stale media.
 */
export const FADE_SECONDS = 0.035;
export const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || 0));
export function formatTime(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export class PlaybackEngine {
  constructor({
    audio,
    video,
    onChange = () => {},
    onError = () => {},
    contextFactory,
    wait,
  }) {
    this.media = { audio, video };
    this.onChange = onChange;
    this.onError = onError;
    this.contextFactory =
      contextFactory ||
      (() => new (window.AudioContext || window.webkitAudioContext)());
    this.wait =
      wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.volume = 0.65;
    this.muted = false;
    this.repeat = false;
    this.sfxEnabled = true;
    this.bgmEnabled = true;
    this.bgmSerial = 0;
    this.active = null;
    this.gains = {};
    this.requestId = 0;
    this.queue = Promise.resolve();
    this.buffers = {};
    this.sfxVoice = null;
    this.cueVoice = null;
    this.accentVoice = null;
    this.sfxDecodes = {};
    this.playedCues = new Set();
    this.endedCallback = null;
    for (const [kind, element] of Object.entries(this.media)) {
      element.addEventListener("play", () => {
        // Enforce exclusivity even if an OS media control initiates playback.
        for (const [otherKind, other] of Object.entries(this.media)) {
          if (otherKind !== kind && !other.paused) {
            this.ramp(otherKind, 0);
            other.pause();
          }
        }
        this.active = kind;
        this.updateBgmLevel();
        this.onChange();
      });
      element.addEventListener("pause", () => {
        this.updateBgmLevel();
        this.onChange();
      });
      element.addEventListener("ended", () => {
        if (this.active === kind) this.active = null;
        this.updateBgmLevel();
        this.onChange();
        if (kind === "audio" && this.repeat) this.seek("audio", 0, true);
      });
      element.addEventListener("error", () => {
        if (element.error)
          this.onError("媒体加载失败，请检查网络后重新点击播放。");
      });
      element.addEventListener("waiting", () => this.onChange());
      element.addEventListener("playing", () => this.onChange());
    }
  }
  unlock() {
    if (!this.context) {
      this.context = this.contextFactory();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.master.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      for (const [kind, element] of Object.entries(this.media)) {
        const source = this.context.createMediaElementSource(element);
        const gain = this.context.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.master);
        this.gains[kind] = gain;
      }
    }
    // Invoke synchronously from the gesture; never defer the resume call.
    return this.context.state !== "running"
      ? this.context.resume()
      : Promise.resolve();
  }
  ramp(kind, value, seconds = FADE_SECONDS) {
    const param = this.gains[kind]?.gain;
    if (!param) return;
    const now = this.context.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
    }
    param.linearRampToValueAtTime(value, now + seconds);
  }
  command(action) {
    const id = ++this.requestId;
    const current = () => id === this.requestId;
    const unlocked = this.unlock();
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        await unlocked;
        if (!current()) return;
        await action(current);
      })
      .catch((error) => {
        if (current() && error.name !== "AbortError") {
          for (const element of Object.values(this.media)) element.pause();
          this.active = null;
          this.onError("无法播放，请再次点击播放按钮。");
        }
      })
      .finally(() => this.onChange());
    return this.queue;
  }
  async quiet(kinds = ["audio", "video"]) {
    const playing = kinds.filter((kind) => !this.media[kind].paused);
    for (const kind of kinds) this.ramp(kind, 0);
    if (playing.length) await this.wait(45);
    for (const kind of kinds) this.media[kind].pause();
  }
  play(kind, source, selected) {
    return this.command(async (current) => {
      await this.quiet();
      if (!current()) return;
      const element = this.media[kind];
      if (source && element.getAttribute("src") !== source) {
        element.src = source;
        element.load();
      }
      if (selected) selected();
      if (element.ended) element.currentTime = 0;
      this.active = kind;
      this.onChange();
      await element.play();
      if (!current()) {
        this.ramp(kind, 0);
        element.pause();
        return;
      }
      this.ramp(kind, 1);
    });
  }
  pause(kind) {
    return this.command(async () => {
      await this.quiet([kind]);
      if (this.active === kind) this.active = null;
    });
  }
  toggle(kind) {
    return this.media[kind].paused ? this.play(kind) : this.pause(kind);
  }
  seek(kind, seconds, resumeOverride) {
    return this.command(async (current) => {
      const element = this.media[kind];
      const resume = resumeOverride ?? !element.paused;
      await this.quiet([kind]);
      if (!current()) return;
      if (!Number.isFinite(element.duration) || element.duration <= 0) return;
      const target = clamp(seconds, 0, Math.max(0, element.duration - 0.015));
      if (Math.abs(element.currentTime - target) > 0.001) {
        await new Promise((resolve) => {
          const finish = () => {
            clearTimeout(timeout);
            element.removeEventListener("seeked", finish);
            resolve();
          };
          const timeout = setTimeout(finish, 2500);
          element.addEventListener("seeked", finish, { once: true });
          element.currentTime = target;
          if (!element.seeking) finish();
        });
      }
      if (!current()) return;
      if (resume) {
        await this.quiet([kind === "audio" ? "video" : "audio"]);
        if (!current()) return;
        this.active = kind;
        await element.play();
        if (!current()) {
          element.pause();
          return;
        }
        this.ramp(kind, 1);
      } else if (this.active === kind) this.active = null;
    });
  }
  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.context.currentTime,
        0.018,
      );
    this.onChange();
  }
  setMuted(muted) {
    this.muted = muted;
    this.setVolume(this.volume);
  }
  async preloadSfx(paths) {
    // Fetch early; decoding waits for the initialized AudioContext.
    this.rawSfx ??= {};
    await Promise.all(
      Object.entries(paths).map(async ([key, path]) => {
        try {
          const response = await fetch(path);
          if (!response.ok) throw new Error("SFX unavailable");
          this.rawSfx[key] = await response.arrayBuffer();
        } catch {
          this.rawSfx[key] = null;
        }
      }),
    );
  }
  async sfx(name) {
    if (!this.sfxEnabled || !this.context) return;
    const cue = name === "bootupcrt" || name === "flicker";
    if (cue && this.playedCues.has(name)) return;
    const lane = cue ? "cue" : name === "round" ? "accent" : "sfx";
    const serialKey = `${lane}Serial`;
    const voiceKey = `${lane}Voice`;
    const serial = (this[serialKey] = (this[serialKey] || 0) + 1);
    try {
      if (!this.buffers[name]) await this.decodeSfx(name);
      if (!this.buffers[name] || serial !== this[serialKey] || !this.sfxEnabled)
        return;
      // Intro and repeatable round accents retain their tails through rapid detents.
      this.stopVoice(voiceKey);
      const source = this.context.createBufferSource();
      source.buffer = this.buffers[name];
      const gain = this.context.createGain();
      const now = this.context.currentTime;
      const duration = source.buffer.duration;
      const level =
        {
          notification: 0.28,
          bootupcrt: 0.32,
          flicker: 0.16,
          clack: 0.16,
          rotaryclack: 0.16,
          round: 0.24,
        }[name] ?? 0.19;
      const attack = Math.min(0.003, duration * 0.1);
      const release = Math.min(0.015, duration * 0.25);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + attack);
      gain.gain.setValueAtTime(level, now + duration - release);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      source.connect(gain);
      gain.connect(this.master);
      source.start();
      if (cue) this.playedCues.add(name);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (this[voiceKey]?.source === source) this[voiceKey] = null;
      };
      this[voiceKey] = { source, gain };
    } catch {
      delete this.sfxDecodes[name];
      /* A missing interface effect must never block media playback. */
    }
  }
  async decodeSfx(name) {
    if (this.buffers[name]) return this.buffers[name];
    if (!this.context || !this.rawSfx?.[name]) return null;
    try {
      this.sfxDecodes[name] ??= this.context.decodeAudioData(
        this.rawSfx[name].slice(0),
      );
      return (this.buffers[name] = await this.sfxDecodes[name]);
    } catch {
      delete this.sfxDecodes[name];
      return null;
    }
  }
  updateSliderSound(position, target, speed, quietDistance, fadeDistance) {
    const distance = Math.abs(target - position);
    if (!this.sfxEnabled || !this.context || distance <= quietDistance) {
      this.stopSliderSound();
      return;
    }
    const direction = Math.sign(target - position);
    const name = direction > 0 ? "neuraasliderto" : "neuraasliderfrom";
    const buffer = this.buffers[name];
    if (!buffer) {
      this.decodeSfx(name);
      return;
    }
    const now = this.context.currentTime;
    const offset =
      clamp(direction > 0 ? position : 1 - position, 0, 1) * buffer.duration;
    const rate = speed * buffer.duration;
    const proximity = clamp(
      (distance - quietDistance) / (fadeDistance - quietDistance),
      0,
      1,
    );
    const level = 0.24 * proximity * proximity * (3 - 2 * proximity);
    let voice = this.sliderVoice;
    const expected = voice
      ? voice.offset + (now - voice.startedAt) * voice.rate
      : 0;
    // Audio runs continuously at the follower's speed. Seek only on reversal or drift.
    if (!voice || voice.name !== name || Math.abs(expected - offset) > 0.06) {
      this.stopSliderSound();
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      gain.gain.setValueAtTime(0, now);
      source.connect(gain);
      gain.connect(this.master);
      voice = { name, source, gain, offset, startedAt: now, rate };
      this.sliderVoice = voice;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (this.sliderVoice === voice) this.sliderVoice = null;
      };
      source.start(now, Math.min(offset, buffer.duration - 0.0001));
    }
    const param = voice.gain.gain;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
    }
    param.linearRampToValueAtTime(level, now + 0.03);
  }
  stopSliderSound() {
    const voice = this.sliderVoice;
    if (!voice) return;
    this.sliderVoice = null;
    const now = this.context.currentTime;
    const param = voice.gain.gain;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
    }
    param.linearRampToValueAtTime(0, now + 0.045);
    voice.source.stop(now + 0.05);
  }
  async setBgmEnabled(enabled) {
    this.bgmEnabled = enabled;
    const serial = ++this.bgmSerial;
    if (!enabled) {
      const voice = this.bgmVoice;
      this.bgmVoice = null;
      if (voice) {
        const now = this.context.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.08);
        voice.source.stop(now + 0.5);
      }
      this.onChange();
      return;
    }
    try {
      await this.unlock();
      if (!this.buffers.pad && this.rawSfx?.pad) {
        this.padDecode ??= this.context.decodeAudioData(
          this.rawSfx.pad.slice(0),
        );
        this.buffers.pad = await this.padDecode;
      }
      if (serial !== this.bgmSerial || !this.bgmEnabled || this.bgmVoice)
        return;
      if (!this.buffers.pad) throw new Error("Background audio unavailable");
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = this.buffers.pad;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.master);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      this.bgmVoice = { source, gain };
      source.start();
      this.updateBgmLevel();
    } catch {
      this.padDecode = null;
      if (serial === this.bgmSerial) {
        this.bgmEnabled = false;
        this.onError("背景音乐加载失败，请重试。");
      }
    }
    this.onChange();
  }
  updateBgmLevel() {
    if (!this.bgmVoice) return;
    const playing = Object.values(this.media).some(
      (element) => !element.paused && !element.ended,
    );
    // The ambience remains continuous, but makes room for the selected work.
    this.bgmVoice.gain.gain.setTargetAtTime(
      playing ? 0.012 : 0.22,
      this.context.currentTime,
      playing ? 0.12 : 0.8,
    );
  }
  stopSfx() {
    this.sfxSerial = (this.sfxSerial || 0) + 1;
    this.cueSerial = (this.cueSerial || 0) + 1;
    this.accentSerial = (this.accentSerial || 0) + 1;
    this.stopVoice("sfxVoice");
    this.stopVoice("cueVoice");
    this.stopVoice("accentVoice");
    this.stopSliderSound();
  }
  stopVoice(voiceKey) {
    if (!this[voiceKey]) return;
    const { source, gain } = this[voiceKey];
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.005);
    try {
      source.stop(now + 0.006);
    } catch {
      /* Already ended. */
    }
    this[voiceKey] = null;
  }
}
