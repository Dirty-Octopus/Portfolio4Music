/** State-led interface choreography. Content changes underneath a single shutter;
 * audio/video elements remain mounted so module changes preserve transport state. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const labels = {
  overview: "OVERVIEW",
  audio: "AUDIO ARCHIVE",
  video: "VISUAL THEATER",
  about: "ARTIST PROFILE",
};
let transitionTimer,
  finishTimer,
  transitionId = 0,
  pendingView = null,
  options = {};
export const motionAllowed = () =>
  !document.body.classList.contains("motion-off") &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;
export function changeView(view) {
  if (!(view in labels)) return;
  const shell = $(".shell"),
    workspace = $(".workspace");
  if (shell.dataset.view === view && !pendingView) return;
  const id = ++transitionId;
  clearTimeout(transitionTimer);
  clearTimeout(finishTimer);
  if (shell.dataset.view === view) {
    pendingView = null;
    workspace.classList.remove("changing");
    return;
  }
  pendingView = view;
  options.onView?.(view);
  // A single active shutter is reused, including after rapid repeated navigation.
  workspace.classList.remove("changing");
  void workspace.offsetWidth;
  if (motionAllowed()) workspace.classList.add("changing");
  const commit = () => {
    if (id !== transitionId) return;
    shell.dataset.view = view;
    pendingView = null;
    $$(".nav").forEach((el) => {
      const active = el.dataset.nav === view;
      el.classList.toggle("active", active);
      el.setAttribute("aria-current", active ? "page" : "false");
    });
    $("#module-path").textContent = labels[view];
    $("#workspace-label").textContent = `ARCHIVE / ${labels[view]}`;
    $("#interaction-hint").textContent = {
      overview: "SELECT A MODULE. ENTER A DIFFERENT FREQUENCY.",
      audio: "SELECT A FILE / DRAG THE WAVEFORM TO SEEK.",
      video: "VISUAL THEATER / ORIGINAL COLOR & SOUND.",
      about: "INDEPENDENT COMPOSITION / SOUND DESIGN.",
    }[view];
    $("#theater-toggle").setAttribute(
      "aria-label",
      view === "video" ? "返回作品总览" : "展开影像剧场",
    );
    logAction(`MODULE / ${labels[view]}`);
    const rect = workspace.getBoundingClientRect();
    if (rect.top > innerHeight - 140)
      workspace.scrollIntoView({
        block: "start",
        behavior: motionAllowed() ? "smooth" : "instant",
      });
    document.dispatchEvent(new CustomEvent("modulechange", { detail: view }));
  };
  if (motionAllowed()) transitionTimer = setTimeout(commit, 270);
  else commit();
  finishTimer = setTimeout(
    () => {
      if (id === transitionId) workspace.classList.remove("changing");
    },
    motionAllowed() ? 650 : 0,
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
  setTimeout(() => hero.classList.remove("processing"), 580);
  logAction(`DISPLAY / ${value.toUpperCase()}`);
}
function inspectTrack(track) {
  if (!track) return;
  $("#inspector-title").textContent = track.title;
  $("#inspector-format").textContent =
    `${track.format} / ${(Number(track.sampleRate) / 1000).toFixed(1)} kHz`;
  $("#inspector-length").textContent = `${track.duration.toFixed(2)} SEC`;
  $("#inspector-filename").textContent = track.filename;
  $("#inspector-category").textContent = track.category.toUpperCase();
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
      motionAllowed() ? 220 : 0,
    );
  };
  $("#system-open").addEventListener("click", () => {
    dialog.showModal();
    $("#system-open").setAttribute("aria-expanded", "true");
    $("#system-sfx").setAttribute(
      "aria-checked",
      String(config.engine.sfxEnabled),
    );
    $("#system-sfx").textContent = config.engine.sfxEnabled ? "ON" : "OFF";
    updateState();
    logAction("SYSTEM CONTROL / OPEN");
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
  $("#motion-toggle").setAttribute("aria-checked", String(motionAllowed()));
  $("#motion-toggle").textContent = motionAllowed() ? "ON" : "REDUCED";
  $("#motion-toggle").addEventListener("click", () => {
    const enable = document.body.classList.contains("motion-off");
    document.body.classList.toggle("motion-off", !enable);
    $("#motion-toggle").setAttribute("aria-checked", String(motionAllowed()));
    $("#motion-toggle").textContent = motionAllowed() ? "ON" : "REDUCED";
    logAction(`MOTION / ${motionAllowed() ? "ENABLED" : "REDUCED"}`);
  });
  $("#system-sfx").addEventListener("click", () => {
    $("#sfx-toggle").click();
    $("#system-sfx").setAttribute(
      "aria-checked",
      String(config.engine.sfxEnabled),
    );
    $("#system-sfx").textContent = config.engine.sfxEnabled ? "ON" : "OFF";
    logAction(`SFX / ${config.engine.sfxEnabled ? "ON" : "OFF"}`);
  });
  $("#theater-toggle").addEventListener("click", () =>
    changeView($(".shell").dataset.view === "video" ? "overview" : "video"),
  );
  $("#inspect-toggle").addEventListener("click", () => {
    const opening = $("#file-details").hidden;
    $("#file-details").hidden = !opening;
    $("#inspect-toggle").setAttribute("aria-expanded", String(opening));
    $("#inspect-toggle").innerHTML =
      `${opening ? "收起文件信息" : "展开文件信息"} <span>${opening ? "−" : "+"}</span>`;
  });
  document.addEventListener("trackchange", (event) => {
    inspectTrack(event.detail);
    const transport = $(".transport");
    transport.classList.remove("changing-track");
    void transport.offsetWidth;
    if (motionAllowed()) transport.classList.add("changing-track");
    setTimeout(() => transport.classList.remove("changing-track"), 420);
    logAction(`FILE / ${event.detail.title}`);
  });
  function updateState() {
    const playing = config.engine.active;
    const activeElement = config.engine.media[playing];
    $("#system-playback-state").textContent =
      activeElement && !activeElement.paused
        ? `${playing.toUpperCase()} / PLAYING`
        : "IDLE / 待机";
  }
  ["audio", "video"].forEach((kind) =>
    ["play", "pause", "ended"].forEach((type) =>
      config.engine.media[kind].addEventListener(type, updateState),
    ),
  );
  inspectTrack(config.getTrack());
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
