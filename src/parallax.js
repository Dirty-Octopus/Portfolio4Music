export function initParallax(motionAllowed) {
  const hero = document.querySelector(".hero");
  const current = { x: 0, y: 0, scroll: 0 };
  const target = { ...current };
  let frame = 0,
    previous = 0;
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

  function draw(now) {
    frame = 0;
    const dt = Math.min(64, now - (previous || now - 16));
    previous = now;
    let moving = false;
    for (const key of Object.keys(current)) {
      current[key] += (target[key] - current[key]) * (1 - Math.exp(-dt / 130));
      if (Math.abs(target[key] - current[key]) < 0.001)
        current[key] = target[key];
      else moving = true;
      hero.style.setProperty(`--parallax-${key}`, String(current[key]));
    }
    if (moving) frame = requestAnimationFrame(draw);
    else previous = 0;
  }
  function update() {
    const bounds = hero.getBoundingClientRect();
    if (!motionAllowed() || !bounds.height) {
      cancelAnimationFrame(frame);
      frame = previous = 0;
      for (const key of Object.keys(current)) {
        current[key] = target[key] = 0;
        hero.style.setProperty(`--parallax-${key}`, "0");
      }
      return;
    }
    target.scroll = Math.min(scrollY, bounds.height * 2) * 0.08;
    if (!frame) frame = requestAnimationFrame(draw);
  }
  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const bounds = hero.getBoundingClientRect();
    target.x = clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, 1);
    target.y = clamp(((event.clientY - bounds.top) / bounds.height) * 2 - 1, 1);
    update();
  });
  hero.addEventListener("pointerleave", () => {
    target.x = target.y = 0;
    update();
  });
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  document.addEventListener("motionchange", update);
  document.addEventListener("modulechange", update);
  document.addEventListener("modulesettled", update);
  update();
}
