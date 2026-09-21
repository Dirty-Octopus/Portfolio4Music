// A viewport-sized surface avoids root SVG filter bugs in both WebKit and Chromium.
export function initViewportSurface() {
  const root = document.documentElement;
  const surface = document.createElement("div");
  surface.className = "crt-surface";
  const children = [...document.body.children].filter(
    (node) => node.tagName !== "SCRIPT",
  );
  surface.append(...children);
  document.body.append(surface);
  root.classList.add("viewport-surface");
  const site = document.querySelector("#site");
  function measure() {
    const style = getComputedStyle(document.body);
    surface.style.padding = style.padding;
    document.body.style.height = `${site.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)}px`;
  }
  function scroll() {
    site.style.top = `${-scrollY}px`;
  }
  let pending = 0;
  function schedule() {
    if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0;
        measure();
      });
  }
  new ResizeObserver(schedule).observe(site);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", scroll, { passive: true });
  site.addEventListener("focusin", (event) => {
    if (!event.target.matches(":focus-visible")) return;
    const bounds = event.target.getBoundingClientRect();
    const margin = 32;
    if (bounds.top < margin || bounds.bottom > innerHeight - margin) {
      window.scrollBy({
        top:
          bounds.top < margin
            ? bounds.top - margin
            : bounds.bottom - innerHeight + margin,
        behavior: "instant",
      });
      scroll();
    }
  });
  measure();
  scroll();
}
