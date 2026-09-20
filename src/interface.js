/** A shared cover/reveal timeline includes the banner, notice and content. */
import { t, trackTitle } from "./i18n.js";
import { scrambleText } from "./text-transition.js";
import { initSettings } from "./settings.js";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const labels = {
  overview: ["个人简介", "ARTIST PROFILE"],
  audio: ["声音作品", "AUDIO ARCHIVE"],
  video: ["影像剧场", "VISUAL THEATER"],
  fun: ["有趣的东西", "PLAYGROUND"],
};
let transition = null,
  heightMotion = null,
  pendingView = null,
  generation = 0,
  options = {};
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
export const motionAllowed = () =>
  !document.body.classList.contains("motion-off") && !motionPreference.matches;
function updateViewLabels() {
  const view = $(".shell").dataset.view;
  $("#module-path").textContent = t(...labels[view]);
  $("#workspace-label").textContent =
    `${t("档案", "ARCHIVE")} / ${t(...labels[view])}`;
  $("#interaction-hint").textContent = t(
    "原创作品 / 独立声音",
    "ORIGINAL WORKS / INDEPENDENT SOUND",
  );
  $("#theater-toggle").setAttribute(
    "aria-label",
    view === "video"
      ? t("返回作品总览", "Return to overview")
      : t("展开影像剧场", "Expand visual theater"),
  );
}
function commitView(view) {
  $(".shell").dataset.view = view;
  $$(".nav").forEach((element) => {
    const active = element.dataset.nav === view;
    element.classList.toggle("active", active);
    element.setAttribute("aria-current", active ? "page" : "false");
  });
  options.onView?.(view);
  updateViewLabels();
  logAction(`${t("版块", "MODULE")} / ${t(...labels[view])}`);
  document.dispatchEvent(new CustomEvent("modulechange", { detail: view }));
}
function settleTransition() {
  generation += 1;
  if (pendingView && pendingView !== $(".shell").dataset.view)
    commitView(pendingView);
  pendingView = null;
  if (transition) {
    transition.forEach((animation) => animation.cancel());
    transition = null;
  }
  heightMotion?.cancel();
  heightMotion = null;
  $(".module-surface").style.height = "";
  $(".shell").classList.remove("reconfiguring");
  $(".workspace").inert = false;
  $(".workspace").setAttribute("aria-busy", "false");
  $$(".nav.pending").forEach((el) => el.classList.remove("pending"));
  document.dispatchEvent(
    new CustomEvent("modulesettled", { detail: $(".shell").dataset.view }),
  );
}
export function changeView(view) {
  if (!(view in labels)) return;
  const shell = $(".shell"),
    workspace = $(".workspace");
  if (view === pendingView || (!transition && shell.dataset.view === view))
    return;
  pendingView = view;
  $$(".nav").forEach((el) =>
    el.classList.toggle("pending", el.dataset.nav === view),
  );
  if (!motionAllowed()) {
    options.engine.sfx("scanner");
    settleTransition();
    return;
  }
  if (transition) return;
  shell.classList.add("reconfiguring");
  workspace.inert = true;
  workspace.setAttribute("aria-busy", "true");
  sweep();
}

async function sweep() {
  options.engine.sfx("scanner");
  const ticket = ++generation;
  const surface = $(".module-surface");
  const layers = $$(".module-wipe i");
  const move = (from, to, duration, closing) =>
    layers.map((layer, index) =>
      layer.animate(
        [
          { transform: `translateX(${from}%) skewX(-12deg)` },
          { transform: `translateX(${to}%) skewX(-12deg)` },
        ],
        {
          duration,
          delay: (closing ? index : 2 - index) * 65,
          easing: closing
            ? "cubic-bezier(.55,.04,.4,1)"
            : "cubic-bezier(.18,.7,.18,1)",
          fill: "both",
        },
      ),
    );
  transition = move(115, 0, 460, true);
  await Promise.all(
    transition.map((animation) => animation.finished.catch(() => {})),
  );
  if (ticket !== generation) return;
  const from = surface.offsetHeight;
  if (pendingView) commitView(pendingView);
  pendingView = null;
  const to = surface.offsetHeight;
  surface.style.height = `${to}px`;
  heightMotion = surface.animate(
    [{ height: `${from}px` }, { height: `${to}px` }],
    {
      duration: 680,
      easing: "cubic-bezier(.22,.7,.12,1)",
      fill: "both",
    },
  );
  transition.forEach((animation) => animation.cancel());
  transition = move(0, -115, 640, false);
  scrambleText(surface);
  await Promise.all(
    [...transition, heightMotion].map((animation) =>
      animation.finished.catch(() => {}),
    ),
  );
  if (ticket !== generation) return;
  transition.forEach((animation) => animation.cancel());
  transition = null;
  heightMotion.cancel();
  heightMotion = null;
  surface.style.height = "";
  const next = pendingView;
  pendingView = null;
  if (next && next !== $(".shell").dataset.view) changeView(next);
  else settleTransition();
}
export function logAction(message) {
  if ($("#last-action")) $("#last-action").textContent = message;
}
function processArtwork(value) {
  if (!["mono", "duotone", "halftone"].includes(value)) return;
  document.body.dataset.treatment = value;
  try {
    localStorage.setItem("portfolio-theme", value);
  } catch {
    /* Storage may be unavailable. */
  }
  $$("button[data-treatment]").forEach((el) => {
    const active = el.dataset.treatment === value;
    el.setAttribute("aria-pressed", String(active));
    el.classList.toggle("active", active);
  });
  logAction(`${t("主题", "THEME")} / ${value.toUpperCase()}`);
}
function inspectTrack(track) {
  if (!track) return;
  $("#inspector-title").textContent = trackTitle(track);
  $("#inspector-format").textContent =
    `${track.format} / ${(Number(track.sampleRate) / 1000).toFixed(1)} kHz`;
  $("#inspector-length").textContent =
    `${track.duration.toFixed(2)} ${t("秒", "SEC")}`;
  $("#inspector-filename").textContent = track.filename;
  $("#inspector-category").textContent = options.categoryLabel(track.category);
  $("#inspector-rate").textContent = `${track.sampleRate} Hz`;
}
export function initInterface(config) {
  options = config;
  try {
    processArtwork(localStorage.getItem("portfolio-theme") || "duotone");
  } catch {
    processArtwork("duotone");
  }
  initSettings({
    motionAllowed,
    onOpen: () => {
      $("#system-sfx").setAttribute(
        "aria-checked",
        String(config.engine.sfxEnabled),
      );
      $("#system-sfx").textContent = config.engine.sfxEnabled
        ? t("开", "ON")
        : t("关", "OFF");
      updateState();
      logAction(t("系统控制 / 开启", "SYSTEM CONTROL / OPEN"));
    },
  });
  $$("button[data-treatment]").forEach((button) =>
    button.addEventListener("click", () =>
      processArtwork(button.dataset.treatment),
    ),
  );
  function updateMotion() {
    $("#motion-toggle").setAttribute("aria-checked", String(motionAllowed()));
    $("#motion-toggle").textContent = motionAllowed()
      ? t("开", "ON")
      : t("精简", "REDUCED");
    if (!motionAllowed()) {
      document.getAnimations().forEach((animation) => animation.cancel());
      settleTransition();
    }
  }
  updateMotion();
  motionPreference.addEventListener("change", updateMotion);
  $("#motion-toggle").addEventListener("click", () => {
    const enable = document.body.classList.contains("motion-off");
    document.body.classList.toggle("motion-off", !enable);
    updateMotion();
    logAction(
      `${t("动画", "MOTION")} / ${motionAllowed() ? t("开启", "ENABLED") : t("精简", "REDUCED")}`,
    );
  });
  $("#system-sfx").addEventListener("click", () => {
    $("#sfx-toggle").click();
    $("#system-sfx").setAttribute(
      "aria-checked",
      String(config.engine.sfxEnabled),
    );
    $("#system-sfx").textContent = config.engine.sfxEnabled
      ? t("开", "ON")
      : t("关", "OFF");
    logAction(
      `SFX / ${config.engine.sfxEnabled ? t("开", "ON") : t("关", "OFF")}`,
    );
  });
  $("#system-bgm").addEventListener("click", () => $("#bgm-toggle").click());
  $("#softness").addEventListener("input", (event) => {
    document.documentElement.style.setProperty(
      "--screen-softness",
      `${event.target.value}px`,
    );
    $("#softness-value").textContent = Number(event.target.value).toFixed(2);
  });
  $("#theater-toggle").addEventListener("click", () =>
    changeView($(".shell").dataset.view === "video" ? "overview" : "video"),
  );
  $("#inspect-toggle").addEventListener("click", () => {
    const opening = $("#file-details").hidden;
    $("#file-details").hidden = !opening;
    $("#inspect-toggle").setAttribute("aria-expanded", String(opening));
    $("#inspect-toggle").innerHTML =
      `${opening ? t("收起文件信息", "Hide file details") : t("展开文件信息", "View file details")} <span>${opening ? "−" : "+"}</span>`;
  });
  document.addEventListener("trackchange", (event) => {
    inspectTrack(event.detail);
    const transport = $(".transport");
    transport.classList.remove("changing-track");
    void transport.offsetWidth;
    if (motionAllowed()) transport.classList.add("changing-track");
    setTimeout(() => transport.classList.remove("changing-track"), 1100);
    logAction(`${t("文件", "FILE")} / ${trackTitle(event.detail)}`);
  });
  function updateState() {
    const playing = config.engine.active;
    const activeElement = config.engine.media[playing];
    $("#system-playback-state").textContent =
      activeElement && !activeElement.paused
        ? `${playing === "audio" ? t("音频", "AUDIO") : t("视频", "VIDEO")} / ${t("播放中", "PLAYING")}`
        : t("待机", "IDLE");
  }
  ["audio", "video"].forEach((kind) =>
    ["play", "pause", "ended"].forEach((type) =>
      config.engine.media[kind].addEventListener(type, updateState),
    ),
  );
  inspectTrack(config.getTrack());
  document.addEventListener("languagechange", () => {
    updateViewLabels();
    inspectTrack(config.getTrack());
    updateState();
    updateMotion();
    const opening = !$("#file-details").hidden;
    $("#inspect-toggle").innerHTML =
      `${opening ? t("收起文件信息", "Hide file details") : t("展开文件信息", "View file details")} <span>${opening ? "−" : "+"}</span>`;
    logAction(t("声音档案 / 已连接", "SONIC ARCHIVE / CONNECTED"));
  });
  // A light artwork parallax uses direct transforms and returns to rest on exit.
  const hero = $(".hero"),
    art = $(".hero-art");
  let animationFrame = 0;
  hero.addEventListener("pointermove", (event) => {
    if (
      !motionAllowed() ||
      event.pointerType !== "mouse" ||
      hero.classList.contains("processing")
    )
      return;
    cancelAnimationFrame(animationFrame);
    const r = hero.getBoundingClientRect(),
      x = (event.clientX - r.left) / r.width - 0.5,
      y = (event.clientY - r.top) / r.height - 0.5;
    animationFrame = requestAnimationFrame(() => {
      art.style.transform = `scale(1.06) translate(${x * -9}px,${y * -5}px)`;
    });
  });
  hero.addEventListener("pointerleave", () => {
    cancelAnimationFrame(animationFrame);
    art.style.transform = "";
  });
}
