// frontend/src/threejs-avatar.js
// SPIDEY TEACHER — FINAL PRODUCTION VERSION (patched)
// Zero scroll blocking | Zero jumping | Perfect eye centering | Real jaw sync | Heroic look

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let scene, camera, renderer, avatar;
let avatarReady = false;
let isTalking = false;
const clock = new THREE.Clock();
let cached = { mouth: null };
let container = null;
let mountEl = null;   // element we append canvas into (avatar-scroll-safe or canvas-container)
let rafId = null;

// Prevent double init
if (!window.__spideyInitialized) {
  window.__spideyInitialized = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAvatar, { once: true });
  } else {
    initAvatar();
  }
} else {
  console.info("threejs-avatar: already initialized, skipping re-init.");
}

function initAvatar() {
  container = document.getElementById("canvas-container");
  if (!container) {
    console.warn("threejs-avatar: #canvas-container not found");
    return;
  }

  // allow wrapper to exist: prefer avatar-scroll-safe if present
  const wrapper = document.getElementById("avatar-scroll-safe");
  mountEl = wrapper || container;

  // CRITICAL FIXES — these lines reduce scroll-stuck risk and improve touch behavior
  container.style.touchAction = container.style.touchAction || "pan-y pinch-zoom";
  container.style.position = container.style.position || "relative";
  container.style.userSelect = "none";

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  // set initial size based on mountEl
  if (mountEl) {
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  } else {
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  renderer.setClearColor(0x000000, 0);

  // Canvas styling — overlay but completely transparent to input
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  canvas.style.top = canvas.style.left = "0";
  canvas.style.width = canvas.style.height = "100%";
  canvas.style.pointerEvents = "none"; // mouse/touch passes through by default
  canvas.style.touchAction = "pan-y pinch-zoom";
  canvas.style.display = "block";

  // Remove any old canvases in both container and wrapper to avoid duplicates (HMR / reload safety)
  Array.from(container.querySelectorAll("canvas")).forEach((c) => c.remove());
  if (wrapper) Array.from(wrapper.querySelectorAll("canvas")).forEach((c) => c.remove());

  // Append canvas into wrapper when available (wrapper handles gestures), else container
  if (mountEl) {
    mountEl.appendChild(canvas);
  } else {
    container.appendChild(canvas);
  }

  // tiny reflow nudge so browser recalculates scroll boundaries immediately after mount
  // (fixes the "top stuck until resize" behavior)
  setTimeout(() => {
    try {
      window.scrollBy(0, 1);
      window.scrollBy(0, -1);
    } catch (e) { /* ignore */ }
  }, 40);

  // Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, (mountEl ? mountEl.clientWidth : container.clientWidth) / (mountEl ? mountEl.clientHeight : container.clientHeight), 0.1, 100);

  // Lighting — heroic style (strong key + rim + ambient)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);

  const hemi = new THREE.HemisphereLight(0xff3366, 0x441144, 0.6);
  scene.add(hemi);

  const rimLight = new THREE.DirectionalLight(0xff3344, 0.9);
  rimLight.position.set(-2, 1, -3);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0x222222, 0.25));

  window.addEventListener("resize", onResize, { passive: true });

  loadModel();

  // start RAF only once
  if (!rafId) animate();
}

function onResize() {
  if (!camera || !renderer || !container) return;
  const el = mountEl || container;
  camera.aspect = el.clientWidth / el.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(el.clientWidth, el.clientHeight);
}

function disposeAvatar(old) {
  if (!old) return;
  try {
    old.traverse((node) => {
      if (node.isMesh) {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m) => {
            // dispose textures if any
            for (const key in m) {
              const value = m[key];
              if (value && value.isTexture) value.dispose();
            }
            if (m.dispose) m.dispose();
          });
        }
      }
    });
    scene.remove(old);
  } catch (e) {
    console.warn("disposeAvatar error:", e);
  }
}

function loadModel() {
  const loader = new GLTFLoader();
  loader.load(
    "/assets/avatar.glb",
    (gltf) => {
      try {
        // dispose old avatar properly
        if (avatar) {
          disposeAvatar(avatar);
          avatar = null;
          avatarReady = false;
          cached = { mouth: null };
        }

        avatar = gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
        if (!avatar) {
          console.warn("GLTF loaded but no scene found.");
          return;
        }

        // add but hide until we compute transforms
        avatar.visible = false;
        scene.add(avatar);

        // compute bounding box, size and center
        const box = new THREE.Box3().setFromObject(avatar);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        // target scale so the model fits nicely in viewport
        const targetSize = 2.1;
        const scaleFactor = targetSize / maxDim;
        avatar.scale.setScalar(scaleFactor);

        // Explicit, stable centering: set world-position so the model center maps to origin (then offset)
        avatar.position.set(
          -center.x * scaleFactor,
          -center.y * scaleFactor - 0.07, // slight eye-level offset
          -center.z * scaleFactor
        );

        // store base Y for non-cumulative animations
        avatar.userData._baseY = avatar.position.y;

        // Camera fit using bounding sphere (robust)
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = sphere.radius || Math.max(size.x, size.y, size.z) * 0.5 || 1;
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const distance = Math.abs(radius / Math.sin(fov / 2)) * 1.25;
        camera.position.set(0, 0, distance + 0.25);
        camera.lookAt(0, 0, 0);

        // find jaw bone if present
        avatar.traverse((node) => {
          if (node.isBone && /jaw|lower/i.test(node.name)) {
            cached.mouth = node;
            cached.mouth._baseRotX = node.rotation.x || 0;
          }
        });

        avatar.visible = true;
        avatarReady = true;
        console.log("🕷️ Spidey Teacher Loaded — Perfection Level: 100 🔥", {
          scale: avatar.scale.toArray(),
          baseY: avatar.userData._baseY,
          cameraZ: camera.position.z
        });
      } catch (err) {
        console.error("Error in GLTF load callback:", err);
      }
    },
    (xhr) => {
      // optional progress handling
      // console.log(`avatar load ${(xhr.loaded/xhr.total*100).toFixed(1)}%`);
    },
    (err) => {
      console.error("Failed to load avatar.glb", err);
    }
  );
}

function animate() {
  rafId = requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (avatarReady && avatar) {
    // base value for vertical offset
    const baseY = (avatar.userData && typeof avatar.userData._baseY === "number") ? avatar.userData._baseY : avatar.position.y || 0;

    // Ultra-subtle idle breathing amplitude
    const breathe = Math.sin(t * 1.2) * 0.004;

    if (isTalking) {
      // NON-CUMULATIVE vertical movement relative to base
      avatar.position.y = baseY + Math.sin(t * 3.0) * 0.007;
      avatar.rotation.x = Math.sin(t * 2.0) * 0.028;
      avatar.rotation.z = Math.sin(t * 1.3) * 0.014;

      // Real jaw sync if bone exists
      if (cached.mouth && cached.mouth.isBone) {
        cached.mouth.rotation.x = cached.mouth._baseRotX + Math.abs(Math.sin(t * 10)) * 0.52;
      } else {
        // fallback (non-destructive): transiently modify scale.y relative to base scale
        const baseScaleX = avatar.scale.x || 1;
        avatar.scale.y = baseScaleX + Math.abs(Math.sin(t * 10)) * 0.13;
      }
    } else {
      // Idle state (non-cumulative)
      avatar.position.y = baseY + breathe;
      avatar.rotation.x *= 0.93;
      avatar.rotation.z *= 0.93;

      // restore scale.y towards base.x if modified
      avatar.scale.y += (avatar.scale.x - avatar.scale.y) * 0.12;

      // gently restore jaw bone if used
      if (cached.mouth && cached.mouth.isBone && typeof cached.mouth._baseRotX === "number") {
        cached.mouth.rotation.x += (cached.mouth._baseRotX - cached.mouth.rotation.x) * 0.08;
      }
    }
  }

  if (renderer && scene && camera) renderer.render(scene, camera);
}

// External API
export function avatarStartTalking() {
  isTalking = true;
  try { document.dispatchEvent(new CustomEvent("avatarTalkStart")); } catch (e) {}
}

export function avatarStopTalking() {
  isTalking = false;
  try { document.dispatchEvent(new CustomEvent("avatarTalkStop")); } catch (e) {}
}

// Optional cleanup API (useful in dev/hmr)
export function disposeAllAndStop() {
  try {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (avatar) {
      disposeAvatar(avatar);
      avatar = null;
      avatarReady = false;
    }
    if (renderer) {
      try { renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) {}
      try { renderer.domElement && renderer.domElement.remove(); } catch (e) {}
      renderer = null;
    }
    window.__spideyInitialized = false;
  } catch (e) {
    console.warn("disposeAllAndStop error:", e);
  }
}
