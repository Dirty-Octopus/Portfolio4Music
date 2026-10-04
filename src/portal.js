import { runAssembly } from "./portal-assembly.js";
const ease = "cubic-bezier(.22,.7,.18,1)";
const symbols = ".:+*#%/01[]";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const animate = (element, frames, options) => {
  if (!element) return Promise.resolve();
  return element
    .animate(frames, { fill: "forwards", easing: ease, ...options })
    .finished.catch(() => {});
};

export function initPortal({ engine, motionAllowed, getLogo = () => null }) {
  const boot = document.querySelector("#boot");
  const entry = boot.querySelector(".language-entry");
  const buttons = [...entry.querySelectorAll("button")];
  const hourglass = boot.querySelector(".portal-hourglass");
  const canvas = boot.querySelector(".entry-ascii");
  const ctx = canvas.getContext("2d");
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

  function assembleAscii() {
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ink =
      getComputedStyle(boot).getPropertyValue("--accent").trim() || "#fff100";
    const particles = [];
    const columns = Math.floor(width / 10);
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < columns; col++) {
        if (col === Math.floor(columns / 2)) continue;
        const seed = (col * 23 + row * 17) % 41;
        const waist = Math.abs(row - 2.5) / 2.5;
        particles.push({
          x: width / 2 + (col / columns - 0.5) * (12 + waist * 38),
          y: height / 2 + (row - 2.5) * 8,
          tx: ((col + 0.5) * width) / columns,
          ty: height / 2 + (row - 2.5) * 9,
          seed,
        });
      }
    const start = performance.now();
    return new Promise((resolve) => {
      function draw(now) {
        const elapsed = now - start;
        const p = Math.min(1, Math.max(0, (elapsed - 180) / 880));
        const travel = 1 - (1 - p) ** 3;
        ctx.clearRect(0, 0, width, height);
        ctx.font = "9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = ink;
        for (const dot of particles) {
          const fade =
            Math.min(1, elapsed / 140) *
            Math.max(0, 1 - Math.max(0, elapsed - 840 - dot.seed * 4) / 420);
          ctx.globalAlpha = fade * (0.4 + dot.seed / 68);
          const jitter =
            Math.sin(elapsed * 0.007 + dot.seed) * (1 - travel) * 7;
          ctx.fillText(
            symbols[(dot.seed + Math.floor(elapsed / 58)) % symbols.length],
            dot.x + (dot.tx - dot.x) * travel,
            dot.y + (dot.ty - dot.y) * travel + jitter,
          );
        }
        ctx.globalAlpha = 1;
        if (elapsed < 1440) requestAnimationFrame(draw);
        else {
          ctx.clearRect(0, 0, width, height);
          resolve();
        }
      }
      requestAnimationFrame(draw);
    });
  }

  async function reveal() {
    if (ready || assembling) return;
    assembling = true;
    // Give a cached load a readable, brief first pose as well.
    await wait(Math.max(0, 600 - (performance.now() - created)));
    boot.classList.add("assets-ready");
    if (motionAllowed()) {
      playReadySound();
      entry.classList.add("is-ready");
      const ascii = assembleAscii();
      await Promise.all([
        ascii,
        animate(
          hourglass,
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(.65)" },
          ],
          { duration: 330 },
        ),
        ...buttons.map((button, i) =>
          animate(
            button,
            [
              {
                opacity: 0,
                transform: `translateX(${i ? -46 : 46}px) scaleX(.7)`,
                clipPath: "inset(0 49%)",
              },
              { opacity: 0.85, offset: 0.55, clipPath: "inset(0 12%)" },
              {
                opacity: 1,
                transform: "translateX(0) scaleX(1)",
                clipPath: "inset(0 0%)",
              },
            ],
            { duration: 860, delay: 540 + i * 70 },
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
    hourglass.hidden = true;
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
