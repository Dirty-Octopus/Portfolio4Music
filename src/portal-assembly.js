import { crtViewportWidth, lensDisplayPoint } from "./crt.js";

export const ASSEMBLY_DURATION = 2500;
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const phase = (time, start, end) => clamp01((time - start) / (end - start));
const smooth = (p) => p * p * (3 - 2 * p);
const glide = "cubic-bezier(.16,.82,.2,1)";
const machine = "cubic-bezier(.7,0,.2,1)";

// All motion samples one clock. No independent completion callbacks or DOM swaps.
export function runAssembly({
  boot,
  site,
  logo,
  onFinish,
  duration = ASSEMBLY_DURATION,
}) {
  const animations = [];
  let frame = 0,
    finished = false;
  const face = boot.querySelector(".boot-face");
  const field = boot.querySelector(".portal-field");
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("assembly-frame");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
  document.body.append(svg);
  const curved = document.documentElement.classList.contains("crt-mode");
  const point = (x, y) => {
    const p = curved
      ? lensDisplayPoint(x, y, crtViewportWidth(), innerHeight)
      : { x, y };
    return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  };
  const paths = [];
  const createLine = (d, start, end, major = false) => {
    const el = document.createElementNS(svgNS, "path");
    el.setAttribute("d", d);
    el.setAttribute("pathLength", "1");
    el.setAttribute("class", major ? "assembly-trace major" : "assembly-trace");
    el.style.strokeDasharray = "1";
    el.style.strokeDashoffset = "1";
    svg.append(el);
    paths.push({ el, start, end });
    return el;
  };
  const shell = site.querySelector(".shell").getBoundingClientRect();
  const header = site.querySelector(".masthead").getBoundingClientRect();
  const bottom = Math.min(innerHeight - 42, shell.bottom);
  const seed = boot.querySelector(".boot-progress").getBoundingClientRect();
  // The existing load rail becomes the first structural line, not a scene-covering wipe.
  const loadRail = createLine(
    `M ${point(shell.left, header.top)} L ${point(shell.right, header.top)}`,
    220,
    700,
    true,
  );
  createLine(
    `M ${point(shell.left, header.top)} L ${point(shell.left, bottom - 12)} L ${point(shell.left + 12, bottom)} L ${point(shell.right, bottom)}`,
    410,
    1120,
  );
  createLine(
    `M ${point(shell.right, header.top)} L ${point(shell.right, bottom)}`,
    630,
    1180,
  );
  const structural = [
    ...site.querySelectorAll(".masthead,.hero,.module-path,.workspace"),
  ];
  structural.forEach((element, i) => {
    const box = element.getBoundingClientRect();
    if (!box.height || box.top > innerHeight) return;
    createLine(
      `M ${point(box.left, box.bottom)} L ${point(box.right, box.bottom)}`,
      650 + i * 105,
      1100 + i * 105,
      i === 0,
    );
  });
  const label = document.createElementNS(svgNS, "text");
  label.setAttribute("x", String(Math.max(18, shell.left + 10)));
  label.setAttribute("y", String(Math.max(18, header.top - 12)));
  label.setAttribute("class", "assembly-label");
  label.textContent = "STRUCTURE / INITIALIZING";
  svg.append(label);

  function cue(element, frames, start, span, easing = glide) {
    if (!element) return;
    const animation = element.animate(frames, {
      duration: span,
      delay: start,
      fill: "both",
      easing,
    });
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  }
  // Anticipation: controls lock and retract while the object keeps its momentum.
  [...boot.querySelector(".boot-center").children]
    .filter((el) => !el.matches(".boot-symbol,.boot-progress"))
    .forEach((element, i) => {
      cue(
        element,
        [
          {
            opacity: 1,
            transform: "translateX(0)",
            clipPath: "inset(0 0 0 0)",
          },
          { opacity: 1, transform: "translateX(5px)", offset: 0.2 },
          {
            opacity: 0,
            transform: `translateX(${-28 - i * 3}px)`,
            clipPath: "inset(0 100% 0 0)",
          },
        ],
        45 + i * 24,
        410,
        "cubic-bezier(.6,0,.8,.4)",
      );
    });
  cue(
    boot.querySelector(".boot-symbol"),
    [{ opacity: 1 }, { opacity: 0 }],
    220,
    350,
  );
  cue(
    boot.querySelector(".boot-rule"),
    [{ opacity: 1 }, { opacity: 0 }],
    180,
    250,
  );
  cue(
    boot.querySelector(".boot-foot"),
    [{ opacity: 1 }, { opacity: 0 }],
    80,
    220,
  );
  cue(
    boot.querySelector(".boot-grid"),
    [{ opacity: 0.04 }, { opacity: 0 }],
    330,
    400,
  );
  cue(
    face,
    [
      { backgroundColor: getComputedStyle(face).backgroundColor },
      { backgroundColor: "transparent" },
    ],
    570,
    420,
  );
  // The blue plane narrows into a rail without squashing its contour geometry.
  if (field) {
    const start = getComputedStyle(field).clipPath;
    const railX = Math.max(8, shell.left - 8);
    cue(
      field,
      [
        { clipPath: start },
        {
          clipPath: `polygon(${railX}px ${header.top}px, ${railX + 3}px ${header.top}px, ${railX + 3}px ${bottom}px, ${railX}px ${bottom}px)`,
        },
      ],
      140,
      890,
      machine,
    );
    cue(
      field.querySelector("canvas"),
      [{ opacity: 1 }, { opacity: 0 }],
      400,
      500,
    );
    cue(field, [{ opacity: 1 }, { opacity: 0 }], 1710, 320);
  }
  const progress = boot.querySelector(".boot-progress");
  const railTarget = curved
    ? lensDisplayPoint(shell.left, header.top, crtViewportWidth(), innerHeight)
    : { x: shell.left, y: header.top };
  cue(
    progress,
    [
      { transform: "translate(0,0) scaleX(1)", opacity: 1 },
      {
        transform: `translate(${railTarget.x - seed.left}px,${railTarget.y - seed.top}px) scaleX(${header.width / seed.width})`,
        opacity: 1,
      },
    ],
    150,
    720,
    machine,
  );
  cue(progress, [{ opacity: 1 }, { opacity: 0 }], 810, 220);
  progress.style.transformOrigin = "left center";

  cue(
    site.querySelector(".masthead"),
    [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }],
    740,
    440,
    machine,
  );
  cue(
    site.querySelector(".brand-home"),
    [
      { transform: "translateX(-28px)", opacity: 0 },
      { transform: "translateX(0)", opacity: 1 },
    ],
    1040,
    530,
  );
  site.querySelectorAll(".nav").forEach((element, i) =>
    cue(
      element,
      [
        { transform: "translateX(-30px)", opacity: 0 },
        { transform: "translateX(2px)", opacity: 1, offset: 0.8 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      1030 + i * 62,
      460,
    ),
  );
  cue(
    site.querySelector(".header-tools"),
    [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }],
    1290,
    360,
  );
  cue(
    site.querySelector(".hero"),
    [{ clipPath: "inset(49.8% 0 49.8% 0)" }, { clipPath: "inset(0% 0 0% 0)" }],
    1070,
    680,
    machine,
  );
  cue(
    site.querySelector(".hero-copy"),
    [
      { transform: "translateX(-42px)", opacity: 0 },
      { transform: "translateX(0)", opacity: 1 },
    ],
    1400,
    580,
  );
  cue(
    site.querySelector(".chassis-bridge"),
    [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
    1510,
    460,
  );
  site
    .querySelectorAll(".chassis-rail")
    .forEach((element, i) =>
      cue(element, [{ opacity: 0 }, { opacity: 1 }], 770 + i * 100, 420),
    );
  site
    .querySelectorAll(".module-path,.section-bar")
    .forEach((element, i) =>
      cue(
        element,
        [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }],
        1420 + i * 90,
        430,
      ),
    );
  cue(
    site.querySelector(".board-notice"),
    [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }],
    1530,
    400,
  );
  cue(
    site.querySelector(".workspace"),
    [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }],
    1560,
    680,
    machine,
  );
  cue(
    site.querySelector(".profile-identity"),
    [
      { transform: "translateX(-26px)", opacity: 0 },
      { transform: "translateX(0)", opacity: 1 },
    ],
    1770,
    470,
  );
  cue(
    site.querySelector(".biography-copy"),
    [
      { transform: "translateY(16px)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    1870,
    480,
  );
  cue(
    site.querySelector("footer"),
    [
      { opacity: 0, transform: "translateY(9px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    2110,
    380,
  );
  cue(
    site.querySelector(".transport"),
    [
      { opacity: 0, transform: "translateY(16px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    2080,
    420,
  );
  cue(
    site.querySelector(".outer-label"),
    [{ opacity: 0 }, { opacity: 1 }],
    2010,
    310,
  );
  logo?.beginTransfer();

  function render(time) {
    animations.forEach((animation) => {
      animation.currentTime = time;
    });
    const flight = smooth(phase(time, 230, 1330));
    logo?.transfer(flight);
    for (const path of paths) {
      path.el.style.strokeDashoffset = String(
        1 - smooth(phase(time, path.start, path.end)),
      );
      path.el.style.opacity = String(1 - phase(time, 1810, 2370));
    }
    loadRail.style.opacity = String(
      phase(time, 460, 800) * (1 - phase(time, 1650, 2080)),
    );
    label.textContent =
      time < 1100
        ? "STRUCTURE / INITIALIZING"
        : time < 1870
          ? "MODULES / ASSEMBLING"
          : "ARCHIVE / ONLINE";
    label.style.opacity = String(
      phase(time, 260, 460) * (1 - phase(time, 1990, 2440)),
    );
  }
  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    render(duration);
    // Commit the visible state before releasing the animation effects in this frame.
    onFinish();
    logo?.finishTransfer();
    animations.forEach((animation) => animation.cancel());
    svg.remove();
    window.removeEventListener("resize", finish);
    document.removeEventListener("motionchange", finish);
  }
  const start = performance.now();
  const freeze = import.meta.env?.DEV
    ? new URLSearchParams(location.search).get("entry-frame")
    : null;
  if (freeze !== null) {
    render(Math.min(duration, Math.max(0, Number(freeze))));
    return { finish };
  }
  function tick(now) {
    const elapsed = Math.min(duration, now - start);
    render(elapsed);
    if (elapsed >= duration) finish();
    else frame = requestAnimationFrame(tick);
  }
  render(0);
  window.addEventListener("resize", finish);
  document.addEventListener("motionchange", finish);
  frame = requestAnimationFrame(tick);
  return { finish };
}
