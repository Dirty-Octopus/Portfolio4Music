import "./metal-logo.css";
import outline from "./metal-logo-geometry.json";

// One transparent renderer and one physical object survive the entire portal handoff.
export async function initMetalLogos({
  engine,
  motionAllowed = () => true,
} = {}) {
  const hosts = [...document.querySelectorAll(".identity-mark, .boot-symbol")];
  const portalHost = document.querySelector(".boot-symbol");
  const headerHost = document.querySelector(".identity-mark");
  const boot = document.querySelector("#boot");
  let renderer, geometry, environment, scene, camera, mesh;
  let frame = 0,
    last = 0,
    destroyed = false,
    lost = false;
  let stage = "portal",
    flight = null;
  let angle = -0.22,
    speed = 0.13,
    gust = 0;
  let renderedWidth = 0,
    renderedHeight = 0;
  const disposers = [];
  const layer = document.createElement("div");
  layer.className = "chrome-emblem";
  layer.setAttribute("aria-hidden", "true");
  document.querySelector(".crt-surface").append(layer);

  function hostRect(host) {
    // The glyphs are refracted by the same parent filter as their host.
    const { left, top, width, height } = host.getBoundingClientRect();
    return { left, top, width, height };
  }
  function currentRect() {
    if (!flight) return hostRect(stage === "portal" ? portalHost : headerHost);
    const target = hostRect(headerHost);
    const p = flight.progress;
    const rect = {};
    for (const key of ["left", "top", "width", "height"])
      rect[key] = flight.from[key] + (target[key] - flight.from[key]) * p;
    rect.top -= Math.sin(p * Math.PI) * Math.min(48, innerHeight * 0.05);
    return rect;
  }
  function visible(rect) {
    return (
      !destroyed &&
      !lost &&
      !document.hidden &&
      !document.body.classList.contains("listening-mode") &&
      !document.fullscreenElement &&
      !document.querySelector("#system-dialog")?.open &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top + rect.height > 0 &&
      rect.top < innerHeight
    );
  }
  function paint(now) {
    frame = 0;
    const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
    last = now;
    const rect = currentRect();
    const show = visible(rect);
    layer.hidden = !show;
    if (!show || !renderer || lost) return;
    const moving = motionAllowed();
    if (moving) {
      gust *= Math.exp(-dt * 1.18);
      speed += (0.13 + gust - speed) * -Math.expm1(-dt * 7.5);
      angle += speed * dt;
    } else {
      angle = -0.22;
      gust = 0;
      speed = 0.13;
    }
    mesh.rotation.set(-0.09 + Math.sin(angle * 0.5) * 0.035, angle, 0);
    layer.style.zIndex = stage === "header" ? "2" : "101";
    layer.style.transform = `translate3d(${rect.left}px,${rect.top}px,0)`;
    layer.style.width = `${rect.width}px`;
    layer.style.height = `${rect.height}px`;
    const width = Math.max(1, Math.round(rect.width)),
      height = Math.max(1, Math.round(rect.height));
    if (width !== renderedWidth || height !== renderedHeight) {
      renderedWidth = width;
      renderedHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const modelHeight =
        ((outline.bounds[3] - outline.bounds[1]) * 3.1) /
        (outline.bounds[2] - outline.bounds[0]);
      camera.position.z =
        ((Math.max(modelHeight, 3.1 / camera.aspect) * 0.5) /
          Math.tan(Math.PI / 12)) *
        1.1;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
    if (moving || flight) frame = requestAnimationFrame(paint);
  }
  function wake() {
    if (!frame && !destroyed) {
      last = performance.now();
      frame = requestAnimationFrame(paint);
    }
  }
  function syncFallback(ready) {
    hosts.forEach((host) => host.classList.toggle("metal-ready", ready));
    layer.hidden = !ready;
  }
  for (const host of hosts) {
    host.classList.add("metal-logo");
    host.dataset.sfx = "logo";
    host.querySelector("img").src =
      `${import.meta.env.BASE_URL}art/dirty-octopus-metal.svg`;
    const onClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      gust = Math.min(gust + 8, 12);
      wake();
      engine
        .unlock()
        .then(() => engine.sfx("suprise", { lane: "logo" }))
        .catch(() => {});
    };
    host.addEventListener("click", onClick);
    disposers.push(() => host.removeEventListener("click", onClick));
  }
  try {
    const THREE = await import("three");
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    layer.append(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    const [x1, y1, x2, y2] = outline.bounds,
      scale = 3.1 / (x2 - x1);
    function path(ring, Type) {
      const shape = new Type();
      ring.forEach(([x, y], i) =>
        shape[i ? "lineTo" : "moveTo"](
          (x - (x1 + x2) / 2) * scale,
          ((y1 + y2) / 2 - y) * scale,
        ),
      );
      shape.closePath();
      return shape;
    }
    const shapes = outline.polygons.map(([outer, ...holes]) => {
      const shape = path(outer, THREE.Shape);
      shape.holes = holes.map((ring) => path(ring, THREE.Path));
      return shape;
    });
    geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: 0.13,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.017,
      bevelSize: 0.014,
      bevelSegments: 3,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.065);
    // A silver studio with white softboxes and narrow black flags keeps the
    // lettering readable while the reflected bands travel across each bevel.
    // PMREM filters the lighting correctly at the material's real surface roughness.
    const studio = document.createElement("canvas");
    studio.width = 1024;
    studio.height = 512;
    const ctx = studio.getContext("2d");
    ctx.fillStyle = "#626a76";
    ctx.fillRect(0, 0, 1024, 512);
    for (const [x, y, w, h, color] of [
      [56, 32, 110, 320, "#ffffff"],
      [174, 0, 35, 418, "#11151c"],
      [228, 112, 20, 272, "#dce7f0"],
      [426, 0, 180, 96, "#ffffff"],
      [480, 96, 45, 322, "#11151c"],
      [652, 128, 104, 246, "#f4f8ff"],
      [830, 30, 30, 385, "#ffffff"],
      [890, 0, 36, 418, "#11151c"],
      [0, 418, 1024, 65, "#83909f"],
      [0, 486, 1024, 26, "#20262d"],
    ]) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
    const texture = new THREE.CanvasTexture(studio);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromEquirectangular(texture);
    texture.dispose();
    pmrem.dispose();
    const face = new THREE.MeshPhysicalMaterial({
      color: 0xe2e5e9,
      metalness: 1,
      roughness: 0.085,
      envMap: environment.texture,
      envMapIntensity: 1.4,
      clearcoat: 1,
      clearcoatRoughness: 0.045,
    });
    const edge = new THREE.MeshStandardMaterial({
      color: 0xa9b5c1,
      metalness: 1,
      roughness: 0.14,
      envMap: environment.texture,
      envMapIntensity: 1.25,
    });
    mesh = new THREE.Mesh(geometry, [face, edge]);
    scene.add(mesh);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-3, 4, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xdde8ff, 1.7);
    rim.position.set(3, -1, -2);
    scene.add(rim);
    const lostContext = (event) => {
      event.preventDefault();
      lost = true;
      syncFallback(false);
    };
    const restoredContext = () => {
      lost = false;
      syncFallback(true);
      wake();
    };
    renderer.domElement.addEventListener("webglcontextlost", lostContext);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      restoredContext,
    );
    disposers.push(() => {
      renderer.domElement.removeEventListener("webglcontextlost", lostContext);
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        restoredContext,
      );
      face.dispose();
      edge.dispose();
    });
    syncFallback(true);
  } catch {
    renderer?.dispose();
    renderer = null;
    syncFallback(false);
  }
  const observer = new ResizeObserver(wake);
  hosts.forEach((host) => observer.observe(host));
  const changes = new MutationObserver(wake);
  changes.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  const dialog = document.querySelector("#system-dialog");
  if (dialog)
    changes.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  for (const event of ["visibilitychange", "motionchange", "fullscreenchange"])
    document.addEventListener(event, wake);
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", wake);
  wake();
  return {
    beginTransfer() {
      flight = { from: hostRect(portalHost), progress: 0 };
      stage = "flight";
      wake();
    },
    transfer(progress) {
      if (flight) {
        flight.progress = progress;
        wake();
      }
    },
    finishTransfer() {
      flight = null;
      stage = "header";
      wake();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      changes.disconnect();
      for (const event of [
        "visibilitychange",
        "motionchange",
        "fullscreenchange",
      ])
        document.removeEventListener(event, wake);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      disposers.forEach((dispose) => dispose());
      renderer?.dispose();
      geometry?.dispose();
      environment?.dispose();
      layer.remove();
    },
  };
}
