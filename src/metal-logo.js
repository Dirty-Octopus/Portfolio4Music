import "./metal-logo.css";
import outline from "./metal-logo-geometry.json";

// The mesh is an extrusion of the supplied artwork, not a replacement font.
// Both locations share its geometry, reflection map and physical materials.
export async function initMetalLogos({
  engine,
  motionAllowed = () => true,
} = {}) {
  const hosts = [...document.querySelectorAll(".identity-mark, .boot-symbol")];
  if (!hosts.length) return { destroy() {} };
  const disposers = [];
  let destroyed = false;
  const instances = [];
  let frame = 0;
  let last = 0;
  let THREE;

  for (const host of hosts) {
    host.classList.add("metal-logo");
    host.dataset.sfx = "logo";
    const image = host.querySelector("img");
    if (image)
      image.src = `${import.meta.env.BASE_URL}art/dirty-octopus-metal.svg`;
    if (host.tagName !== "BUTTON") {
      host.setAttribute("role", "button");
      host.tabIndex = 0;
    }
    host.setAttribute(
      "aria-label",
      "Dirty Octopus — spin the metal logo / 旋转金属标志",
    );
  }

  const active = (instance) => {
    if (destroyed || document.hidden || !instance.intersecting || instance.lost)
      return false;
    if (
      instance.host.closest("#site") &&
      document.body.classList.contains("boot-visible")
    )
      return false;
    const boot = instance.host.closest("#boot");
    return (
      !boot?.hidden && getComputedStyle(instance.host).visibility !== "hidden"
    );
  };
  const wake = () => {
    if (frame || destroyed) return;
    last = performance.now();
    frame = requestAnimationFrame(draw);
  };
  const draw = (now) => {
    frame = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const moving = motionAllowed();
    let continueMoving = false;
    for (const instance of instances) {
      if (!active(instance)) continue;
      if (moving) {
        // A gust adds angular momentum. Drag removes it continuously; neither
        // orientation nor velocity is reset when a second click arrives.
        instance.gust *= Math.exp(-dt * 1.18);
        const target = 0.15 + instance.gust;
        instance.speed += (target - instance.speed) * -Math.expm1(-dt * 7.5);
        instance.angle += instance.speed * dt;
        instance.mesh.rotation.y = instance.angle;
        instance.mesh.rotation.x =
          -0.075 + Math.sin(instance.angle * 0.5) * 0.05;
        continueMoving = true;
      } else {
        instance.mesh.rotation.set(-0.075, -0.17, 0);
        instance.gust = 0;
        instance.speed = 0.15;
      }
      instance.renderer.render(instance.scene, instance.camera);
    }
    if (continueMoving) frame = requestAnimationFrame(draw);
  };

  try {
    THREE = await import("three");
  } catch {
    // The clean vector mark remains interactive if WebGL cannot be loaded.
  }

  let geometry, faceMaterial, edgeMaterial, environment;
  if (THREE) {
    const [minX, minY, maxX, maxY] = outline.bounds;
    const scale = 3.1 / (maxX - minX);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const trace = (ring, Path) => {
      const path = new Path();
      ring.forEach(([x, y], index) => {
        const px = (x - centerX) * scale;
        const py = (centerY - y) * scale;
        if (!index) path.moveTo(px, py);
        else path.lineTo(px, py);
      });
      path.closePath();
      return path;
    };
    const shapes = outline.polygons.map(([outer, ...holes]) => {
      const shape = trace(outer, THREE.Shape);
      shape.holes = holes.map((ring) => trace(ring, THREE.Path));
      return shape;
    });
    geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: 0.105,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.009,
      bevelSegments: 2,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.0525);
    geometry.computeBoundingSphere();

    // A small photographic-lighting equivalent: softboxes reflected in chrome.
    // These six monochrome cards are lighting, never painted onto the artwork.
    const cards = Array.from({ length: 6 }, (_, index) => {
      const card = document.createElement("canvas");
      card.width = card.height = 128;
      const ctx = card.getContext("2d");
      ctx.fillStyle = [
        "#62768a",
        "#728396",
        "#f4f7fa",
        "#273441",
        "#c4d2df",
        "#788b9d",
      ][index];
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "#f2f8fc";
      ctx.fillRect(index % 2 ? 88 : 15, 0, index < 2 ? 21 : 11, 128);
      ctx.fillStyle = "#b6c8db";
      ctx.fillRect(0, index % 2 ? 90 : 23, 128, 13);
      ctx.fillStyle = "#080e16";
      ctx.fillRect(0, 73, 128, 13);
      return card;
    });
    environment = new THREE.CubeTexture(cards);
    environment.colorSpace = THREE.SRGBColorSpace;
    environment.needsUpdate = true;
    faceMaterial = new THREE.MeshStandardMaterial({
      color: 0xeaf2fa,
      metalness: 0.86,
      roughness: 0.19,
      envMap: environment,
      envMapIntensity: 1.9,
    });
    edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x7f95a9,
      metalness: 0.92,
      roughness: 0.26,
      envMap: environment,
      envMapIntensity: 1.3,
    });
  }

  for (const host of hosts) {
    let instance;
    const gust = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (instance) {
        instance.gust = Math.min(instance.gust + 8, 12);
        wake();
      }
      engine
        ?.unlock?.()
        .then(() => engine.sfx("suprise"))
        .catch(() => {});
    };
    const key = (event) => {
      if (
        host.tagName !== "BUTTON" &&
        (event.key === "Enter" || event.key === " ")
      ) {
        gust(event);
      }
    };
    host.addEventListener("click", gust);
    host.addEventListener("keydown", key);
    disposers.push(() => {
      host.removeEventListener("click", gust);
      host.removeEventListener("keydown", key);
    });
    if (!THREE) continue;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x020304, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      const canvas = renderer.domElement;
      canvas.className = "metal-logo-canvas";
      canvas.setAttribute("aria-hidden", "true");
      host.append(canvas);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
      const mesh = new THREE.Mesh(geometry, [faceMaterial, edgeMaterial]);
      mesh.rotation.set(-0.075, -0.17, 0);
      scene.add(mesh);
      scene.add(new THREE.AmbientLight(0xb5c9dc, 2.2));
      const keyLight = new THREE.DirectionalLight(0xf5faff, 5);
      keyLight.position.set(-2, 3, 4);
      scene.add(keyLight);
      const faceFill = new THREE.DirectionalLight(0xdfefff, 2);
      faceFill.position.set(2, 0, 5);
      scene.add(faceFill);
      const rim = new THREE.DirectionalLight(0x729dcc, 3);
      rim.position.set(2, -1, -3);
      scene.add(rim);
      instance = {
        host,
        renderer,
        scene,
        camera,
        mesh,
        intersecting: true,
        lost: false,
        angle: -0.17,
        speed: 0.15,
        gust: 0,
      };
      instances.push(instance);
      const resize = () => {
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        const modelHeight =
          ((outline.bounds[3] - outline.bounds[1]) * 3.1) /
          (outline.bounds[2] - outline.bounds[0]);
        camera.position.z =
          ((Math.max(modelHeight, 3.1 / camera.aspect) * 0.5) /
            Math.tan(Math.PI / 12)) *
          1.16;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        host.classList.add("metal-ready");
        wake();
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      const onLost = (event) => {
        event.preventDefault();
        instance.lost = true;
        host.classList.remove("metal-ready");
      };
      const onRestored = () => {
        instance.lost = false;
        resize();
      };
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      resize();
      disposers.push(() => {
        resizeObserver.disconnect();
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        renderer.dispose();
        canvas.remove();
      });
    } catch {
      renderer?.dispose();
      host.querySelector("canvas")?.remove();
      host.classList.remove("metal-ready");
    }
  }

  const intersections = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const instance = instances.find((item) => item.host === entry.target);
      if (instance) instance.intersecting = entry.isIntersecting;
    }
    wake();
  });
  instances.forEach((instance) => intersections.observe(instance.host));
  const mutations = new MutationObserver(wake);
  mutations.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  const boot = document.querySelector("#boot");
  if (boot)
    mutations.observe(boot, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });
  document.addEventListener("visibilitychange", wake);
  document.addEventListener("motionchange", wake);
  wake();
  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      intersections.disconnect();
      mutations.disconnect();
      document.removeEventListener("visibilitychange", wake);
      document.removeEventListener("motionchange", wake);
      disposers.forEach((dispose) => dispose());
      geometry?.dispose();
      faceMaterial?.dispose();
      edgeMaterial?.dispose();
      environment?.dispose();
    },
  };
}
