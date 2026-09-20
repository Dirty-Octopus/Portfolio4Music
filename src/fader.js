import { clamp } from "./player.js";

// Both source sounds span one full traverse at their original playback rate.
const speed = 1 / (8 / 3);

export function initFader(engine) {
  const control = document.querySelector("#neuraa-slider");
  const travel = control.querySelector(".fader-travel");
  let target = 0.5,
    position = 0.5,
    pointer = null,
    frame = 0,
    previousTime = null;
  const visible = () =>
    !document.hidden && document.querySelector(".shell").dataset.view === "fun";
  const time = () => engine.context?.currentTime ?? performance.now() / 1000;
  function paint() {
    control.style.setProperty("--target", `${target * 100}%`);
    control.style.setProperty("--follower", `${position * 100}%`);
    control.style.setProperty(
      "--span-start",
      `${Math.min(target, position) * 100}%`,
    );
    control.style.setProperty(
      "--span-width",
      `${Math.abs(target - position) * 100}%`,
    );
    control.setAttribute("aria-valuenow", String(Math.round(target * 100)));
    control.classList.toggle("following", Math.abs(target - position) > 0.001);
  }
  function render() {
    frame = 0;
    if (!visible()) {
      stop();
      return;
    }
    const now = time();
    const dt = previousTime === null ? 0 : Math.max(0, now - previousTime);
    previousTime = now;
    const gap = target - position;
    position += Math.sign(gap) * Math.min(Math.abs(gap), speed * dt);
    const width = Math.max(1, travel.getBoundingClientRect().width);
    // Leave a silent margin before the two 40px handles overlap.
    const quietDistance = Math.min(0.25, 58 / width);
    engine.updateSliderSound(
      position,
      target,
      speed,
      quietDistance,
      quietDistance + 72 / width,
    );
    paint();
    if (position !== target) frame = requestAnimationFrame(render);
    else previousTime = null;
  }
  function setTarget(value) {
    target = clamp(value, 0, 1);
    paint();
    if (!frame) {
      previousTime = time();
      frame = requestAnimationFrame(render);
    }
  }
  function point(event) {
    const rect = travel.getBoundingClientRect();
    setTarget((event.clientX - rect.left) / rect.width);
  }
  function prepare() {
    engine.decodeSfx("neuraasliderto");
    engine.decodeSfx("neuraasliderfrom");
  }
  control.addEventListener("pointerdown", (event) => {
    if (
      pointer !== null ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    engine.unlock();
    prepare();
    pointer = event.pointerId;
    control.setPointerCapture(pointer);
    control.focus({ preventScroll: true });
    control.classList.add("dragging");
    point(event);
  });
  control.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointer) point(event);
  });
  function release() {
    if (pointer !== null && control.hasPointerCapture(pointer))
      control.releasePointerCapture(pointer);
    pointer = null;
    control.classList.remove("dragging");
  }
  control.addEventListener("pointerup", release);
  control.addEventListener("pointercancel", release);
  control.addEventListener("lostpointercapture", release);
  control.addEventListener("keydown", (event) => {
    const destinations = {
      ArrowRight: target + 0.05,
      ArrowLeft: target - 0.05,
      ArrowUp: target + 0.05,
      ArrowDown: target - 0.05,
      PageUp: target + 0.2,
      PageDown: target - 0.2,
      Home: 0,
      End: 1,
    };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    engine.unlock();
    prepare();
    setTarget(destinations[event.key]);
  });
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
    release();
    engine.stopSliderSound();
  }
  function visibilityChanged() {
    if (!visible()) stop();
    else {
      prepare();
      if (position !== target) setTarget(target);
    }
  }
  document.addEventListener("modulechange", visibilityChanged);
  document.addEventListener("visibilitychange", visibilityChanged);
  paint();
}
