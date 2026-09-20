import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./style.css";
import "./forum.css";
import "./choreography.css";
import "./experience.css";
import { initTactileExperience } from "./tactile.js";
import { t, trackTitle, setLanguage } from "./i18n.js";
import {
  initInterface,
  changeView,
  logAction,
  motionAllowed,
} from "./interface.js";
import manifest from "./media.json";
import { PlaybackEngine, formatTime, clamp } from "./player.js";
import playIcon from "@phosphor-icons/core/assets/fill/play-fill.svg?raw";
import pauseIcon from "@phosphor-icons/core/assets/fill/pause-fill.svg?raw";
import prevIcon from "@phosphor-icons/core/assets/fill/skip-back-fill.svg?raw";
import nextIcon from "@phosphor-icons/core/assets/fill/skip-forward-fill.svg?raw";
import volumeIcon from "@phosphor-icons/core/assets/regular/speaker-high.svg?raw";
import muteIcon from "@phosphor-icons/core/assets/regular/speaker-slash.svg?raw";
import searchIcon from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import repeatIcon from "@phosphor-icons/core/assets/regular/repeat.svg?raw";
import fullIcon from "@phosphor-icons/core/assets/regular/corners-out.svg?raw";
import arrowIcon from "@phosphor-icons/core/assets/regular/arrow-up-right.svg?raw";
import slidersIcon from "@phosphor-icons/core/assets/regular/sliders-horizontal.svg?raw";
import expandIcon from "@phosphor-icons/core/assets/regular/arrows-out-simple.svg?raw";
import musicIcon from "@phosphor-icons/core/assets/regular/music-notes.svg?raw";
const icons = {
  "music-notes": musicIcon,
  "sliders-horizontal": slidersIcon,
  "arrows-out-simple": expandIcon,
  play: playIcon,
  pause: pauseIcon,
  "skip-back": prevIcon,
  "skip-forward": nextIcon,
  "speaker-high": volumeIcon,
  "speaker-slash": muteIcon,
  "magnifying-glass": searchIcon,
  repeat: repeatIcon,
  "corners-out": fullIcon,
  "arrow-up-right": arrowIcon,
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const base = import.meta.env.BASE_URL;
const asset = (path) => `${base}${path}`;
const escapeHTML = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icons[el.dataset.icon] || "";
    el.setAttribute("aria-hidden", "true");
  });
}
hydrateIcons();
const audio = $("#audio"),
  video = $("#video");
const categories = [
  ["all", "全部作品", "ALL AUDIO"],
  ["cinematic", "影视 / 管弦", "CINEMATIC"],
  ["game", "游戏 / 交互", "GAME & INTERACTIVE"],
  ["world", "世界 / 民族", "WORLD MUSIC"],
  ["contemporary", "流行 / 实验", "CONTEMPORARY"],
  ["sfx", "界面音效", "INTERFACE SFX"],
];
let current =
  manifest.tracks.find((t) => t.title === "管弦乐创作") || manifest.tracks[0];
let category = "all",
  query = "",
  filtered = [],
  entered = false;
let toastTimer,
  savedVolume = 0.65;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("page-hidden", document.hidden);
});
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4200);
}
const engine = new PlaybackEngine({
  audio,
  video,
  onChange: updatePlayback,
  onError: (message) => {
    const messages = {
      "媒体加载失败，请检查网络后重新点击播放。":
        "Media could not load. Check your connection and try again.",
      "无法播放，请再次点击播放按钮。":
        "Playback could not start. Please try again.",
      "背景音乐加载失败，请重试。":
        "Background music could not load. Please try again.",
    };
    toast(t(message, messages[message] || message));
    $("#system-status").textContent = t(
      "播放错误 / 请重试",
      "PLAYBACK ERROR / RETRY",
    );
  },
});
const cueReady = engine.preloadSfx({
  bootupcrt: asset("media/bootupcrt.wav"),
  flicker: asset("media/flicker.wav"),
});
const sfxReady = engine.preloadSfx(
  Object.fromEntries(
    Object.entries({
      ...manifest.sfx,
      pad: "media/pad.wav",
    }).map(([key, path]) => [key, asset(path)]),
  ),
);
engine.preloadSfx({
  preselect: asset("media/preselect.wav"),
  clack: asset("media/clack.wav"),
  round: asset("media/round.wav"),
});
video.src = asset(manifest.videos[0].src);
video.poster = asset(manifest.videos[0].poster);
audio.src = asset(current.src);
$("#video-duration").textContent = formatTime(manifest.videos[0].duration);
$("#year").textContent = new Date().getFullYear();
function renderFilters() {
  $("#filters").innerHTML = categories
    .map(
      ([key, label, en]) =>
        `<button class="filter ${key === category ? "active" : ""}" data-category="${key}" aria-pressed="${key === category}"><span>${t(label, en)}<small>${t(en, "DIRTY OCTOPUS")}</small></span><small>${String(manifest.tracks.filter((t) => (key === "all" ? t.category !== "sfx" : t.category === key)).length).padStart(2, "0")}</small></button>`,
    )
    .join("");
}
renderFilters();
function labelFor(key) {
  const entry = categories.find((c) => c[0] === key);
  return entry ? t(entry[1], entry[2]) : key.toUpperCase();
}
function renderTracks() {
  filtered = manifest.tracks.filter(
    (t) =>
      (category === "all" ? t.category !== "sfx" : t.category === category) &&
      `${t.title} ${trackTitle(t)} ${t.filename}`.toLowerCase().includes(query),
  );
  const cat = categories.find((c) => c[0] === category);
  $("#category-title").textContent = t(cat[1], cat[2]);
  $("#result-count").textContent =
    `${String(filtered.length).padStart(2, "0")} ${t("个文件", "FILES")}`;
  $("#library-summary").textContent =
    `${filtered.length} ${t("个作品", "TRACKS")} / ${formatTime(filtered.reduce((s, t) => s + t.duration, 0))} ${t("总时长", "TOTAL")}`;
  $("#track-list").innerHTML = filtered.length
    ? filtered
        .map(
          (track, index) =>
            `<button class="track reveal${track.id === current.id ? " selected" : ""}" style="--i:${Math.min(index, 7)}" data-track="${track.id}" aria-label="${t("播放", "Play")} ${escapeHTML(trackTitle(track))}" aria-pressed="${track.id === current.id}"><span class="track-index">${String(index + 1).padStart(2, "0")}</span><span class="track-text"><span class="track-name">${escapeHTML(trackTitle(track))}</span><span class="track-category">DIRTY OCTOPUS / ${labelFor(track.category)}</span></span><span class="track-format">${track.format}</span><span class="track-length">${formatTime(track.duration)}</span></button>`,
        )
        .join("")
    : `<p class="empty">${t("没有找到匹配的作品。<br>试试其他关键词。", "No matching compositions.<br>Try another search.")}</p>`;
  $("#track-list").scrollTop = 0;
  updatePlayback();
}
function setCurrent(track) {
  current = track;
  $("#current-title").textContent = trackTitle(track);
  $("#current-title").title = track.filename;
  $("#current-detail").textContent =
    `${labelFor(track.category)} / ${track.format} / ${(Number(track.sampleRate) / 1000).toFixed(1)} kHz`;
  $("#audio-duration").textContent = formatTime(track.duration);
  $("#audio-seek").value = 0;
  updatePlayback();
  drawWaveform();
  document.dispatchEvent(new CustomEvent("trackchange", { detail: track }));
}
function playTrack(track) {
  return engine.play("audio", asset(track.src), () => setCurrent(track));
}
function updatePlayback() {
  const audioPlaying = !audio.paused && !audio.ended;
  const videoPlaying = !video.paused && !video.ended;
  $("#audio-play").innerHTML =
    `${audioPlaying ? pauseIcon : playIcon}<span>${audioPlaying ? t("暂停", "PAUSE") : t("播放", "PLAY")}</span>`;
  $("#audio-play").setAttribute(
    "aria-label",
    audioPlaying ? t("暂停音乐", "Pause audio") : t("播放音乐", "Play audio"),
  );
  $("#video-play").innerHTML = videoPlaying ? pauseIcon : playIcon;
  $("#video-play").setAttribute(
    "aria-label",
    videoPlaying ? t("暂停视频", "Pause video") : t("播放视频", "Play video"),
  );
  $("#video-stage").classList.toggle("is-playing", videoPlaying);
  if (videoPlaying) $("#video-stage").classList.add("has-started");
  $("#video-overlay").setAttribute("aria-label", t("播放视频", "Play video"));
  $("#video-overlay").setAttribute("aria-hidden", String(videoPlaying));
  $("#video-overlay").tabIndex = videoPlaying ? -1 : 0;
  $("#disc").classList.toggle("spinning", audioPlaying);
  $("#play-state").textContent = audioPlaying
    ? t("正在播放", "NOW PLAYING")
    : audio.currentTime > 0
      ? t("已暂停", "PAUSED")
      : t("待播放", "READY");
  $("#system-status").innerHTML =
    `${audioPlaying ? t("音乐播放中", "AUDIO PLAYING") : videoPlaying ? t("影像播放中", "VIDEO PLAYING") : t("档案在线", "ARCHIVE ONLINE")} <i class="online"></i>`;
  $$(".track").forEach((el, index) => {
    const selected = el.dataset.track === current.id;
    el.classList.toggle("selected", selected);
    el.classList.toggle("playing", selected && audioPlaying);
    el.setAttribute("aria-pressed", String(selected));
    el.setAttribute(
      "aria-label",
      `${selected && audioPlaying ? t("暂停", "Pause") : t("播放", "Play")} ${trackTitle(manifest.tracks.find((t) => t.id === el.dataset.track))}`,
    );
    el.querySelector(".track-index").innerHTML =
      selected && audioPlaying
        ? '<span class="playing-bars" aria-hidden="true"><i></i><i></i><i></i></span>'
        : selected
          ? playIcon
          : String(index + 1).padStart(2, "0");
  });
  $("#volume-value").textContent = engine.muted
    ? t("静音", "MUTE")
    : `${Math.round(engine.volume * 100)}%`;
  $("#mute").innerHTML =
    engine.muted || engine.volume === 0 ? muteIcon : volumeIcon;
  $("#mute").setAttribute("aria-pressed", String(engine.muted));
  $("#mute").setAttribute(
    "aria-label",
    engine.muted ? t("取消静音", "Unmute") : t("静音", "Mute"),
  );
  syncSoundControls();
  $$("button[aria-label]").forEach((button) => {
    button.title = button.getAttribute("aria-label");
  });
}

async function enterExperience(language) {
  if (entered) return;
  entered = true;
  setLanguage(language);
  $$("[data-enter]").forEach((button) => {
    button.disabled = true;
  });
  try {
    await engine.unlock();
  } catch {
    toast(
      t(
        "声音尚未开启，进入后点击播放即可。",
        "Audio is not ready. Press play after entering.",
      ),
    );
  }
  await Promise.race([
    cueReady,
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
  engine.sfx("bootupcrt");
  $("#boot").classList.add("booting");
  $(".boot-progress").hidden = false;
  $("#boot-status").textContent = t(
    "01 / 正在建立声音连接…",
    "01 / ESTABLISHING AUDIO LINK…",
  );
  sfxReady.then(async () => {
    await engine.setBgmEnabled(engine.bgmEnabled);
  });
  if (!reduced.matches) {
    setTimeout(() => {
      $("#boot-status").textContent = t(
        "02 / 正在展开声音档案…",
        "02 / UNFOLDING THE ARCHIVE…",
      );
    }, 1100);
    setTimeout(() => {
      $("#boot-status").textContent = t(
        "03 / 正在组装界面…",
        "03 / ASSEMBLING INTERFACE…",
      );
    }, 2350);
  }
  setTimeout(
    () => {
      $("#boot-status").textContent = t(
        "连接完成。欢迎来到声音档案。",
        "CONNECTED. WELCOME TO THE ARCHIVE.",
      );
      $("#site").classList.add("site-enter");
      if (motionAllowed()) engine.sfx("flicker");
      $("#boot").classList.add("leaving");
      setTimeout(
        () => {
          $("#boot").hidden = true;
          $("#boot").style.display = "none";
          document.body.classList.remove("boot-visible");
          $("#site").inert = false;
          $("#audio-play").focus({ preventScroll: true });
          setTimeout(
            () => $("#site").classList.remove("site-enter"),
            reduced.matches ? 0 : 3100,
          );
        },
        reduced.matches ? 0 : 850,
      );
    },
    reduced.matches ? 150 : 3200,
  );
}
$$("[data-enter]").forEach((button) =>
  button.addEventListener("click", () => enterExperience(button.dataset.enter)),
);
// Keep the intro focus in its dialog; every primary control also supports keyboard input.
document.addEventListener("keydown", (event) => {
  if (!entered || !$("#boot").hidden) {
    if (event.key === "Tab") {
      event.preventDefault();
      const buttons = $$("[data-enter]").filter((button) => !button.disabled);
      const index = buttons.indexOf(document.activeElement);
      buttons[
        (index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length
      ]?.focus();
    }
    return;
  }
  if ($("#system-dialog").open) return;
  const input = event.target.closest("input,textarea,button,a,select");
  if (event.key === " " && !input) {
    event.preventDefault();
    engine.toggle(engine.active === "video" ? "video" : "audio");
  }
  if (event.key === "/" && !input) {
    event.preventDefault();
    if ($(".shell").dataset.view !== "audio" || $(".workspace").inert) {
      const focusSearch = (event) => {
        document.removeEventListener("modulesettled", focusSearch);
        if (event.detail === "audio") $("#search").focus();
      };
      document.addEventListener("modulesettled", focusSearch);
      changeView("audio");
    } else $("#search").focus();
  }
  if (event.key === "Escape" && event.target === $("#search")) {
    $("#search").value = "";
    query = "";
    renderTracks();
    $("#search").blur();
  }
});
document.addEventListener(
  "click",
  (event) => {
    if (
      !entered ||
      !$("#boot").hidden ||
      !event.target.closest("button,a,input[type=range]")
    )
      return;
    if (event.target.closest("#sfx-toggle,#system-sfx")) return;
    engine.sfx("clickeffect");
  },
  true,
);
$("#sfx-toggle").addEventListener("click", () => {
  engine.sfxEnabled = !engine.sfxEnabled;
  if (!engine.sfxEnabled) {
    engine.stopSfx();
  } else engine.sfx("clickeffect");
  syncSoundControls();
});
function syncSoundControls() {
  $("#sfx-toggle").setAttribute("aria-pressed", String(engine.sfxEnabled));
  $("#sfx-toggle").setAttribute(
    "aria-label",
    engine.sfxEnabled
      ? t("关闭界面音效", "Disable interface sounds")
      : t("开启界面音效", "Enable interface sounds"),
  );
  $("#sfx-toggle b").textContent = engine.sfxEnabled
    ? t("开", "ON")
    : t("关", "OFF");
  $("#bgm-toggle").setAttribute("aria-pressed", String(engine.bgmEnabled));
  $("#bgm-toggle").setAttribute(
    "aria-label",
    engine.bgmEnabled
      ? t("关闭背景音乐", "Disable background music")
      : t("开启背景音乐", "Enable background music"),
  );
  $("#bgm-toggle b").textContent = engine.bgmEnabled
    ? t("开", "ON")
    : t("关", "OFF");
  for (const id of ["sfx-toggle", "bgm-toggle"]) {
    $(`#${id}`).title = $(`#${id}`).getAttribute("aria-label");
  }
  for (const [id, enabled] of [
    ["system-sfx", engine.sfxEnabled],
    ["system-bgm", engine.bgmEnabled],
  ]) {
    $(`#${id}`).setAttribute("aria-checked", String(enabled));
    $(`#${id}`).textContent = enabled ? t("开", "ON") : t("关", "OFF");
  }
}
$("#bgm-toggle").addEventListener("click", async () => {
  const enabled = !engine.bgmEnabled;
  engine.bgmEnabled = enabled;
  syncSoundControls();
  await sfxReady;
  await engine.setBgmEnabled(engine.bgmEnabled);
});
let lastPreselect = { control: null, time: 0 };
function preselect(event) {
  const control = event.target.closest("button,a,input[type=range]");
  if (!control || control.disabled || !$("#boot").hidden || !entered) return;
  if (
    event.type === "pointerover" &&
    (event.pointerType !== "mouse" || control.contains(event.relatedTarget))
  )
    return;
  const now = performance.now();
  if (control === lastPreselect.control && now - lastPreselect.time < 30)
    return;
  lastPreselect = { control, time: now };
  engine.sfx("preselect");
}
document.addEventListener("pointerover", preselect);
document.addEventListener("focusin", preselect);
$("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  category = button.dataset.category;
  if ($(".shell").dataset.view !== "audio") changeView("audio");
  logAction(`${t("分类", "FILTER")} / ${labelFor(category)}`);
  $$(".filter").forEach((el) => {
    el.classList.toggle("active", el === button);
    el.setAttribute("aria-pressed", String(el === button));
  });
  renderTracks();
});
$("#search").addEventListener("input", (event) => {
  query = event.target.value.trim().toLowerCase();
  renderTracks();
});
$("#track-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-track]");
  if (!button) return;
  const track = manifest.tracks.find((t) => t.id === button.dataset.track);
  if (current.id === track.id) engine.toggle("audio");
  else playTrack(track);
});
$("#audio-play").addEventListener("click", () => engine.toggle("audio"));
$("#video-play").addEventListener("click", () => engine.toggle("video"));
$("#video-overlay").addEventListener("click", () => engine.play("video"));
video.addEventListener("click", () => {
  if (!video.paused) {
    engine.sfx("clickeffect");
    engine.pause("video");
  }
});
function adjacent(direction) {
  const list = filtered.length
    ? filtered
    : manifest.tracks.filter((t) => t.category !== "sfx");
  const index = list.findIndex((t) => t.id === current.id);
  const next =
    index < 0
      ? direction > 0
        ? 0
        : list.length - 1
      : (index + direction + list.length) % list.length;
  playTrack(list[next]);
}
$("#previous").addEventListener("click", () => adjacent(-1));
$("#next").addEventListener("click", () => adjacent(1));
$("#loop").addEventListener("click", () => {
  engine.repeat = !engine.repeat;
  $("#loop").setAttribute("aria-pressed", String(engine.repeat));
  toast(
    engine.repeat
      ? t("已开启单曲循环", "Track repeat enabled")
      : t("已关闭单曲循环", "Track repeat disabled"),
  );
});
$("#volume").addEventListener("input", (event) => {
  engine.setMuted(false);
  engine.setVolume(event.target.value);
  savedVolume = engine.volume;
});
$("#mute").addEventListener("click", () => {
  engine.setMuted(!engine.muted);
  if (!engine.muted && !engine.volume) {
    engine.setVolume(savedVolume || 0.65);
    $("#volume").value = engine.volume;
  }
});
const dragging = { audio: false, video: false };
function bindSeek(kind) {
  const element = engine.media[kind],
    slider = $(`#${kind}-seek`);
  let resume = false,
    committed = false;
  const preview = () => {
    $(`#${kind}-time`).textContent = formatTime(
      (Number(slider.value) / 100) * (element.duration || 0),
    );
    slider.setAttribute(
      "aria-valuetext",
      `${$(`#${kind}-time`).textContent} / ${formatTime(element.duration)}`,
    );
    if (kind === "audio") drawWaveform(Number(slider.value) / 100);
  };
  slider.addEventListener("pointerdown", () => {
    dragging[kind] = true;
    committed = false;
    resume = !element.paused;
    engine.pause(kind);
  });
  slider.addEventListener("input", () => {
    if (!dragging[kind]) resume = !element.paused;
    dragging[kind] = true;
    preview();
  });
  const commit = () => {
    if (committed || !dragging[kind]) return;
    committed = true;
    const target = (Number(slider.value) / 100) * (element.duration || 0);
    engine.seek(kind, target, resume).finally(() => {
      dragging[kind] = false;
      committed = false;
    });
  };
  slider.addEventListener("change", commit);
  slider.addEventListener("pointerup", commit);
  slider.addEventListener("pointercancel", commit);
  slider.addEventListener("blur", commit);
  element.addEventListener("loadedmetadata", () => {
    $(`#${kind}-duration`).textContent = formatTime(element.duration);
  });
}
bindSeek("audio");
bindSeek("video");
$("#fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($("#video-section").requestFullscreen)
      await $("#video-section").requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else
      toast(
        t(
          "此浏览器不支持视频全屏。",
          "Fullscreen is not available in this browser.",
        ),
      );
  } catch {
    toast(
      t(
        "全屏未能开启，请重试。",
        "Fullscreen could not start. Please try again.",
      ),
    );
  }
});
function focusSection(name) {
  changeView(name);
}
$$("[data-nav]").forEach((button) =>
  button.addEventListener("click", () => focusSection(button.dataset.nav)),
);
$("#explore").addEventListener("click", () => {
  focusSection("audio");
  engine.play("audio");
});
$("#back-top").addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: reduced.matches ? "instant" : "smooth" }),
);
$(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  changeView("overview");
  window.scrollTo({ top: 0, behavior: reduced.matches ? "instant" : "smooth" });
});
const wave = $("#waveform");
const waveContext = wave.getContext("2d");
let waveWidth = 0,
  waveHeight = 0;
function sizeWave() {
  const rect = wave.getBoundingClientRect(),
    dpr = Math.min(window.devicePixelRatio || 1, 2);
  waveWidth = rect.width;
  waveHeight = rect.height;
  wave.width = Math.round(rect.width * dpr);
  wave.height = Math.round(rect.height * dpr);
  waveContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWaveform();
}
function drawWaveform(position) {
  if (!waveContext || !current || !waveWidth) return;
  const fraction =
    position ?? (audio.duration ? audio.currentTime / audio.duration : 0);
  waveContext.clearRect(0, 0, waveWidth, waveHeight);
  const count = Math.min(current.peaks.length, Math.floor(waveWidth / 3));
  const gap = waveWidth / count;
  for (let i = 0; i < count; i++) {
    const value = current.peaks[Math.floor((i / count) * current.peaks.length)];
    const height = Math.max(2, value * (waveHeight - 5));
    waveContext.fillStyle = i / count <= fraction ? "#b7e4f9" : "#65879e";
    waveContext.fillRect(
      i * gap,
      (waveHeight - height) / 2,
      Math.max(1, gap - 1),
      height,
    );
  }
  waveContext.fillStyle = "#e5f4fa";
  waveContext.fillRect(
    clamp(fraction * waveWidth, 0, waveWidth - 1),
    0,
    1,
    waveHeight,
  );
}
setCurrent(current);
renderTracks();
new ResizeObserver(sizeWave).observe(wave);
const spectrum = $("#spectrum"),
  spectrumContext = spectrum.getContext("2d");
const bins = new Uint8Array(128);
let lastFrame = 0;
function frame(time) {
  requestAnimationFrame(frame);
  if (document.hidden || time - lastFrame < (!motionAllowed() ? 160 : 32))
    return;
  lastFrame = time;
  for (const kind of ["audio", "video"]) {
    const element = engine.media[kind];
    if (dragging[kind]) continue;
    const percent = element.duration
      ? (element.currentTime / element.duration) * 100
      : 0;
    $(`#${kind}-seek`).value = percent;
    $(`#${kind}-time`).textContent = formatTime(element.currentTime);
    $(`#${kind}-seek`).setAttribute(
      "aria-valuetext",
      `${formatTime(element.currentTime)} / ${formatTime(element.duration)}`,
    );
  }
  if (!dragging.audio) drawWaveform();
  if (engine.analyser) engine.analyser.getByteFrequencyData(bins);
  spectrumContext.clearRect(0, 0, spectrum.width, spectrum.height);
  for (let i = 0; i < 28; i++) {
    const value = engine.analyser ? bins[Math.floor(i * 2.8)] / 255 : 0;
    const height = Math.max(2, value * 36);
    spectrumContext.fillStyle = "#7caac2";
    for (let j = 0; j < height; j += 4)
      spectrumContext.fillRect(i * 6.4, 36 - j, 4, 2);
  }
  // A short tail ramp avoids abrupt ends in sketches that end mid-waveform.
  if (engine.active && engine.context) {
    const element = engine.media[engine.active];
    const remaining = element.duration - element.currentTime;
    if (!element.paused && remaining > 0 && remaining < 0.055)
      engine.ramp(engine.active, 0, Math.max(0.005, remaining - 0.003));
  }
}
requestAnimationFrame(frame);
// Audio routing stays centralized for media keys as well as on-screen controls.
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () =>
    engine.play(engine.active || "audio"),
  );
  navigator.mediaSession.setActionHandler("pause", () =>
    engine.pause(engine.active || "audio"),
  );
  navigator.mediaSession.setActionHandler("previoustrack", () => adjacent(-1));
  navigator.mediaSession.setActionHandler("nexttrack", () => adjacent(1));
  navigator.mediaSession.setActionHandler("seekto", (event) =>
    engine.seek(engine.active || "audio", event.seekTime),
  );
}

initInterface({
  engine,
  categoryLabel: labelFor,
  getTrack: () => current,
  onView: (view) => {
    if (view !== "video" && !video.paused) engine.pause("video");
  },
});
initTactileExperience({ engine, motionAllowed });

document.addEventListener("languagechange", () => {
  renderFilters();
  renderTracks();
  $("#current-title").textContent = trackTitle(current);
  $("#current-detail").textContent =
    `${labelFor(current.category)} / ${current.format} / ${(Number(current.sampleRate) / 1000).toFixed(1)} kHz`;
  hydrateIcons();
});
$$("[data-language]").forEach((button) =>
  button.addEventListener("click", () => setLanguage(button.dataset.language)),
);
setLanguage("zh");
