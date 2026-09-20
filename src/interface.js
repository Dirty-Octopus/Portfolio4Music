/** State-led interface choreography. Content changes underneath a single shutter;
 * audio/video elements remain mounted so module changes preserve transport state. */
import { t, trackTitle } from "./i18n.js";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const labels = {
  overview: ["总览", "OVERVIEW"],
  audio: ["声音作品", "AUDIO ARCHIVE"],
  video: ["影像剧场", "VISUAL THEATER"],
  about: ["关于创作", "ARTIST PROFILE"],
};
let transitionTimer,
  finishTimer,
  transitionId = 0,
  pendingView = null,
  commitPending = null,
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
  $(".module-shutter span").textContent = t(
    "正在重构界面",
    "RECONFIGURING VIEW",
  );
  $("#theater-toggle").setAttribute(
    "aria-label",
    view === "video"
      ? t("返回作品总览", "Return to overview")
      : t("展开影像剧场", "Expand visual theater"),
  );
}
function settleTransition() {
  clearTimeout(transitionTimer);
  clearTimeout(finishTimer);
  if (pendingView) commitPending?.();
  $(".workspace").classList.remove("changing");
  $(".shell").classList.remove("switching");
  $(".workspace").setAttribute("aria-busy", "false");
}
export function changeView(view) {
  if (!(view in labels)) return;
  const shell = $(".shell"),
    workspace = $(".workspace");
  if (shell.dataset.view === view && !pendingView) return;
  const id = ++transitionId;
  clearTimeout(transitionTimer);
  clearTimeout(finishTimer);
  workspace
    .getAnimations({ subtree: true })
    .forEach((animation) => animation.cancel());
  if (shell.dataset.view === view) {
    pendingView = null;
    workspace.classList.remove("changing");
    shell.classList.remove("switching");
    workspace.setAttribute("aria-busy", "false");
    options.onView?.(view);
    return;
  }
  pendingView = view;
  options.onView?.(view);
  // A single active shutter is reused, including after rapid repeated navigation.
  workspace.classList.remove("changing");
  shell.classList.remove("switching");
  void workspace.offsetWidth;
  if (motionAllowed()) {
    workspace.classList.add("changing");
    shell.classList.add("switching");
    workspace.setAttribute("aria-busy", "true");
  }
  const commit = () => {
    if (id !== transitionId) return;
    shell.dataset.view = view;
    pendingView = null;
    $$(".nav").forEach((el) => {
      const active = el.dataset.nav === view;
      el.classList.toggle("active", active);
      el.setAttribute("aria-current", active ? "page" : "false");
    });
    updateViewLabels();
    logAction(`${t("版块", "MODULE")} / ${t(...labels[view])}`);
    if (motionAllowed()) {
      $$(".catalog,.audio-library,.video-panel,.info-panel,.inspector")
        .filter((panel) => panel.getBoundingClientRect().width > 0)
        .forEach((panel, index) =>
          panel.animate(
            [
              {
                clipPath:
                  "polygon(0 0, 8% 0, 8% 30%, 18% 48%, 18% 100%, 0 100%, 0 70%, 0 30%)",
                opacity: 0.35,
                transform: `translate(${index % 2 ? 24 : -18}px, 16px)`,
              },
              {
                clipPath:
                  "polygon(0 0, 74% 0, 74% 24%, 92% 42%, 92% 100%, 12% 100%, 12% 70%, 0 58%)",
                opacity: 0.75,
                transform: "translate(5px, -3px)",
                offset: 0.48,
              },
              {
                clipPath:
                  "polygon(0 0, 94% 0, 94% 20%, 100% 28%, 100% 100%, 0 100%, 0 70%, 0 30%)",
                opacity: 1,
                transform: "translate(-2px, 1px)",
                offset: 0.76,
              },
              {
                clipPath:
                  "polygon(0 0, 100% 0, 100% 30%, 100% 50%, 100% 100%, 0 100%, 0 70%, 0 30%)",
                opacity: 1,
                transform: "translate(0, 0)",
              },
            ],
            {
              duration: 1250,
              delay: index * 95,
              easing: "cubic-bezier(.22,.7,.12,1)",
              fill: "backwards",
            },
          ),
        );
    }
    const rect = workspace.getBoundingClientRect();
    if (rect.top > innerHeight - 140)
      workspace.scrollIntoView({
        block: "start",
        behavior: motionAllowed() ? "smooth" : "instant",
      });
    document.dispatchEvent(new CustomEvent("modulechange", { detail: view }));
  };
  commitPending = commit;
  if (motionAllowed()) transitionTimer = setTimeout(commit, 900);
  else commit();
  finishTimer = setTimeout(
    () => {
      if (id === transitionId) settleTransition();
    },
    motionAllowed() ? 1900 : 0,
  );
}
export function logAction(message) {
  if ($("#last-action")) $("#last-action").textContent = message;
}
function processArtwork(value) {
  if (!["mono", "duotone", "halftone"].includes(value)) return;
  document.body.dataset.treatment = value;
  $$("button[data-treatment]").forEach((el) => {
    const active = el.dataset.treatment === value;
    el.setAttribute("aria-pressed", String(active));
    el.classList.toggle("active", active);
  });
  const hero = $(".hero");
  hero.classList.remove("processing");
  void hero.offsetWidth;
  if (motionAllowed()) hero.classList.add("processing");
  setTimeout(() => hero.classList.remove("processing"), 1600);
  logAction(`${t("显示", "DISPLAY")} / ${value.toUpperCase()}`);
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
  const dialog = $("#system-dialog");
  const close = () => {
    if (!dialog.open || dialog.classList.contains("closing")) return;
    dialog.classList.add("closing");
    setTimeout(
      () => {
        dialog.close();
        dialog.classList.remove("closing");
        $("#system-open").setAttribute("aria-expanded", "false");
        $("#system-open").focus({ preventScroll: true });
      },
      motionAllowed() ? 550 : 0,
    );
  };
  $("#system-open").addEventListener("click", () => {
    dialog.showModal();
    $("#system-open").setAttribute("aria-expanded", "true");
    $("#system-sfx").setAttribute(
      "aria-checked",
      String(config.engine.sfxEnabled),
    );
    $("#system-sfx").textContent = config.engine.sfxEnabled
      ? t("开", "ON")
      : t("关", "OFF");
    updateState();
    logAction(t("系统控制 / 开启", "SYSTEM CONTROL / OPEN"));
  });
  $("#system-close").addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      close();
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
