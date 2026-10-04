import { EASE, MOTION, finishAll } from "./motion.js";
import { t } from "./i18n.js";

/** Enlarge the existing transport, keeping its media, waveform and seek state intact. */
export function initListening({
  motionAllowed,
  syncDockLabel,
  engine,
  settleCartridge,
}) {
  const dock = document.querySelector(".transport");
  const shell = document.querySelector(".shell");
  const toggle = document.querySelector("#listen-toggle");
  const caption = document.querySelector("#listen-caption");
  let active = false,
    wasCollapsed = false,
    animations = [],
    generation = 0;
  function label() {
    toggle.setAttribute("aria-pressed", String(active));
    toggle.setAttribute(
      "aria-label",
      active
        ? t("退出聆听模式", "Exit listening mode")
        : t("专注聆听", "Focused listening"),
    );
    toggle.title = toggle.getAttribute("aria-label");
    toggle.querySelector("span:last-child").textContent = active
      ? t("返回档案", "BACK TO ARCHIVE")
      : t("聆听模式", "LISTEN");
    caption.textContent = t(
      "聆听室 / 声音档案",
      "LISTENING ROOM / SONIC ARCHIVE",
    );
  }
  function settle() {
    generation++;
    animations.forEach((a) => a.cancel());
    animations = [];
    document.body.classList.remove("listening-transition");
  }
  async function setActive(next, animate = true) {
    if (active === next) return;
    const from = dock.getBoundingClientRect();
    const shellOpacity = getComputedStyle(shell).opacity;
    settle();
    settleCartridge();
    const ticket = generation;
    if (next) wasCollapsed = dock.classList.contains("collapsed");
    active = next;
    if (active && !engine.media.video.paused) engine.pause("video");
    document.body.classList.toggle("listening-mode", active);
    dock.classList.toggle("collapsed", active ? false : wasCollapsed);
    document.body.classList.toggle("dock-collapsed", !active && wasCollapsed);
    shell.inert = active;
    syncDockLabel();
    label();
    const to = dock.getBoundingClientRect();
    toggle.focus({ preventScroll: true });
    if (animate && motionAllowed()) {
      document.body.classList.add("listening-transition");
      const duration = active ? MOTION.expand : MOTION.reveal;
      animations = [
        // Animate the enclosure geometry without scaling the typography or waveform.
        dock.animate(
          [
            {
              left: `${from.left}px`,
              top: `${from.top}px`,
              width: `${from.width}px`,
              height: `${from.height}px`,
              bottom: "auto",
              right: "auto",
              margin: "0",
            },
            {
              left: `${to.left}px`,
              top: `${to.top}px`,
              width: `${to.width}px`,
              height: `${to.height}px`,
              bottom: "auto",
              right: "auto",
              margin: "0",
            },
          ],
          { duration, easing: EASE.machine, fill: "both" },
        ),
        shell.animate(
          [{ opacity: shellOpacity }, { opacity: active ? 0 : 1 }],
          {
            duration: active ? MOTION.close : MOTION.reveal,
            delay: active ? 0 : 100,
            easing: EASE.glide,
            fill: "both",
          },
        ),
        ...[
          ...dock.querySelectorAll(".cartridge-content,.wave-deck,.output"),
        ].map((el, i) =>
          el.animate(
            [
              { opacity: 0.2, transform: "translateY(12px)" },
              { opacity: 1, transform: "none" },
            ],
            {
              duration: MOTION.reveal,
              delay: active ? 120 + i * MOTION.stagger : 0,
              easing: EASE.glide,
              fill: "both",
            },
          ),
        ),
      ];
      await finishAll(animations);
      if (ticket !== generation) return;
      settle();
    }
    document.dispatchEvent(
      new CustomEvent("listeningchange", { detail: active }),
    );
  }
  toggle.addEventListener("click", () => setActive(!active));
  document.addEventListener("keydown", (event) => {
    if (!active || document.querySelector("#system-dialog").open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setActive(false);
    }
    if (event.key === "Tab") {
      const controls = [...dock.querySelectorAll("button,input")].filter(
        (el) => !el.disabled && el.getClientRects().length,
      );
      const index = controls.indexOf(document.activeElement);
      if (
        index < 0 ||
        (event.shiftKey ? index === 0 : index === controls.length - 1)
      ) {
        event.preventDefault();
        controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      }
    }
  });
  document.addEventListener("languagechange", label);
  document.addEventListener("motionchange", () => {
    if (!motionAllowed()) settle();
  });
  document.addEventListener("settingsreset", () => setActive(false, false));
  window.addEventListener("resize", settle);
  label();
  return {
    exit: () => setActive(false),
    get active() {
      return active;
    },
  };
}
