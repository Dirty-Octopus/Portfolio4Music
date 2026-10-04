import { runAssembly } from "./portal-assembly.js";
import { EASE } from "./motion.js";
const ease = EASE.glide;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const animate = (element, frames, options) => {
  if (!element) return Promise.resolve();
  return element
    .animate(frames, { fill: "both", easing: ease, ...options })
    .finished.catch(() => {});
};

export function initPortal({ engine, motionAllowed, getLogo = () => null }) {
  const boot = document.querySelector("#boot");
  const entry = boot.querySelector(".language-entry");
  const buttons = [...entry.querySelectorAll("button")];
  const loader = boot.querySelector(".portal-loader");
  const created = performance.now();
  let ready = false,
    assembling = false,
    flickerPending = false;
  // Restored scroll must never move the next visit's portal or underlying header.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo({ top: 0, behavior: "instant" });
  const chromium =
    navigator.userAgentData?.brands?.some(({ brand }) =>
      /Chromium|Google Chrome|Microsoft Edge/.test(brand),
    ) || /(?:Chrome|Chromium|Edg|OPR)\//.test(navigator.userAgent);
  boot.querySelector(".browser-notice").hidden = Boolean(chromium);

  function playReadySound() {
    if (engine.context?.state === "running") {
      engine.sfx("flicker");
      flickerPending = false;
    } else flickerPending = true;
  }
  const unlock = () => {
    // AudioContext must resume in a real user gesture on a fresh browser visit.
    engine
      .unlock()
      .then(() => {
        if (flickerPending) playReadySound();
      })
      .catch(() => {});
  };
  boot.addEventListener("pointerdown", unlock);
  boot.addEventListener("keydown", unlock);

  async function reveal() {
    if (ready || assembling) return;
    assembling = true;
    // Give a cached load a readable, brief first pose as well.
    await wait(Math.max(0, 800 - (performance.now() - created)));
    boot.classList.add("assets-ready");
    if (motionAllowed()) {
      playReadySound();
      entry.classList.add("is-ready");
      await Promise.all([
        animate(
          loader,
          [
            {
              opacity: 1,
              transform: "translateX(0)",
              clipPath: "inset(0 0 0 0)",
            },
            {
              opacity: 0,
              transform: "translateX(18px)",
              clipPath: "inset(0 0 0 100%)",
            },
          ],
          { duration: 280, easing: EASE.close },
        ),
        ...buttons.map((button, i) =>
          animate(
            button,
            [
              { transform: "translateX(-18px)", clipPath: "inset(0 100% 0 0)" },
              { transform: "translateX(0)", clipPath: "inset(0 0 0 0)" },
            ],
            { duration: 660, delay: 180 + i * 100, easing: EASE.machine },
          ),
        ),
      ]);
      // Remove animation ownership so hover states can take over normally.
      buttons.forEach((button) =>
        button.getAnimations().forEach((animation) => animation.cancel()),
      );
    } else {
      entry.classList.add("is-ready");
      playReadySound();
    }
    loader.hidden = true;
    entry.inert = false;
    buttons.forEach((button) => {
      button.disabled = false;
    });
    ready = true;
    assembling = false;
    boot.dataset.phase = "ready";
  }

  async function enter() {
    boot.dataset.phase = "opening";
    buttons.forEach((button) => {
      button.disabled = true;
    });
    entry.inert = true;
    window.scrollTo({ top: 0, behavior: "instant" });
    const site = document.querySelector("#site");
    site.style.top = "0px";
    document.body.classList.add("portal-opening");
    const finish = () => {
      boot.hidden = true;
      document.body.classList.remove("boot-visible", "portal-opening");
      site.inert = false;
      boot.removeEventListener("pointerdown", unlock);
      boot.removeEventListener("keydown", unlock);
      document.dispatchEvent(new Event("portalentered"));
    };
    if (motionAllowed()) {
      await new Promise((resolve) =>
        runAssembly({
          boot,
          site,
          logo: getLogo(),
          onFinish: () => {
            finish();
            resolve();
          },
        }),
      );
    } else {
      getLogo()?.finishTransfer();
      finish();
    }
  }
  return {
    reveal,
    enter,
    get ready() {
      return ready;
    },
  };
}
