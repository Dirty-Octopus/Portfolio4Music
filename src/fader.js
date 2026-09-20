import { clamp } from "./player.js";
import { Scrubber } from "./scrubber.js";
import { t } from "./i18n.js";

export function initFader(engine) {
  const control = document.querySelector("#neuraa-slider");
  const travel = control.querySelector(".fader-travel");
  const scrubber = new Scrubber(engine);
  engine.scrubber = scrubber;
  let position = 0.5,
    pointer = null,
    lastTime = 0,
    idle = 0;
  const visible = () =>
    !document.hidden && document.querySelector(".shell").dataset.view === "fun";
  function paint() {
    control.style.setProperty("--target", `${position * 100}%`);
    control.setAttribute("aria-valuenow", String(Math.round(position * 100)));
  }
  function move(next, now = performance.now()) {
    next = clamp(next, 0, 1);
    const velocity =
      (next - position) / Math.max(0.008, (now - lastTime) / 1000);
    position = next;
    lastTime = now;
    scrubber.move(position, velocity);
    clearTimeout(idle);
    idle = setTimeout(() => scrubber.release(), 85);
    paint();
  }
  function point(event) {
    const rect = travel.getBoundingClientRect();
    move((event.clientX - rect.left) / rect.width);
  }
  async function prepare(report = false) {
    try {
      await engine.unlock();
      await scrubber.prepare();
    } catch {
      if (report)
        engine.onError(
          t(
            "滑块音频加载失败，请重试。",
            "Fader audio could not load. Please try again.",
          ),
        );
    }
  }
  control.addEventListener("pointerdown", (event) => {
    if (
      pointer !== null ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    prepare(true);
    pointer = event.pointerId;
    lastTime = performance.now() - 30;
    control.setPointerCapture(pointer);
    control.focus({ preventScroll: true });
    control.classList.add("dragging");
    point(event);
  });
  control.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointer) point(event);
  });
  function release() {
    const captured = pointer;
    pointer = null;
    if (captured !== null && control.hasPointerCapture(captured))
      control.releasePointerCapture(captured);
    control.classList.remove("dragging");
    clearTimeout(idle);
    scrubber.release();
  }
  control.addEventListener("pointerup", release);
  control.addEventListener("pointercancel", release);
  control.addEventListener("lostpointercapture", () => {
    if (pointer !== null) release();
  });
  control.addEventListener("keydown", (event) => {
    const destinations = {
      ArrowRight: position + 0.05,
      ArrowLeft: position - 0.05,
      ArrowUp: position + 0.05,
      ArrowDown: position - 0.05,
      PageUp: position + 0.2,
      PageDown: position - 0.2,
      Home: 0,
      End: 1,
    };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    prepare(true);
    lastTime = performance.now() - 120;
    move(destinations[event.key]);
  });
  function visibilityChanged() {
    if (visible()) prepare();
    else {
      release();
      scrubber.stop();
    }
  }
  document.addEventListener("modulechange", visibilityChanged);
  document.addEventListener("visibilitychange", visibilityChanged);
  paint();
}
