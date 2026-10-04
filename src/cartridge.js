import { EASE, MOTION, finishAll } from "./motion.js";

/** Visual handoff only; the media engine remains the sole playback owner. */
export function initCartridge(motionAllowed) {
  const bay = document.querySelector(".now-playing");
  const card = bay.querySelector(".cartridge-content");
  let animations = [],
    ghost,
    generation = 0;
  function settle() {
    generation++;
    animations.forEach((a) => a.cancel());
    animations = [];
    ghost?.remove();
    ghost = null;
    bay.classList.remove("cartridge-loading");
  }
  function swap(commit) {
    settle();
    if (!motionAllowed() || document.body.classList.contains("boot-visible")) {
      commit();
      return;
    }
    const ticket = generation;
    ghost = card.cloneNode(true);
    ghost.classList.add("cartridge-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    bay.append(ghost);
    commit();
    bay.classList.add("cartridge-loading");
    animations = [
      ghost.animate(
        [
          { transform: "translateX(0)", opacity: 1 },
          { transform: "translateX(-108%)", opacity: 0 },
        ],
        { duration: MOTION.close, easing: EASE.close, fill: "both" },
      ),
      document.querySelector("#waveform").animate(
        [
          { clipPath: "inset(0 100% 0 0)", opacity: 0.3 },
          { clipPath: "inset(0 0 0 0)", opacity: 1 },
        ],
        {
          duration: MOTION.reveal,
          delay: 165,
          easing: EASE.glide,
          fill: "both",
        },
      ),
      card.animate(
        [
          { transform: "translateX(108%)", opacity: 0 },
          { transform: "translateX(8px)", opacity: 1, offset: 0.72 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        {
          duration: MOTION.reveal,
          delay: 165,
          easing: EASE.glide,
          fill: "both",
        },
      ),
    ];
    finishAll(animations).then(() => {
      if (ticket === generation) settle();
    });
  }
  document.addEventListener("motionchange", () => {
    if (!motionAllowed()) settle();
  });
  window.addEventListener("resize", settle);
  return { swap, settle };
}
