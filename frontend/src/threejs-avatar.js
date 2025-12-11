// frontend/src/threejs-avatar.js
// SPIDEY TEACHER — PRODUCTION (patched + multi-avatar + idle hand wiggle)
// - Load /assets/avatar1.glb by default (change CONFIG.filename to avatar2.glb etc.)
// - Smaller default targetSize to avoid "mask zoomed in"
// - Detect jaw bone (existing) + detect hand bones (Left/Right) for subtle idle animation
// - Non-cumulative transforms (stable, robust)

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let scene, camera, renderer, avatar;
let avatarReady = false;
let isTalking = false;
const clock = new THREE.Clock();
let cached = {
  mouth: null,
  leftHand: null,
  rightHand: null
};
let container = null;
let mountEl = null;   // element we append canvas into (avatar-scroll-safe or canvas-container)
let rafId = null;

// ---------- CONFIG ----------
// Change filename to avatar2.glb, avatar3.glb etc to test other models.
// You can also tweak targetSize / hand amplitude here for quick experiments.
const CONFIG = {
  filename: "/assets/avatar5.glb",
  // smaller targetSize => model appears smaller / zoomed out in viewport
  targetSize: 1.45,        // tuned to match Replika-like framing (was 2.1)
  cameraDistanceBias: 0.45, // extra distance to move camera back after fit
  handBoneNames: [
    "LeftHand", "RightHand",
    "leftHand", "rightHand",
    "hand_l", "hand_r",
    "Hand_L", "Hand_R",
    "wrist_l", "wrist_r",
    "Wrist_L", "Wrist_R",
    "upperarm_l", "upperarm_r", "shoulder_l", "shoulder_r"
  ],
  handIdleAmplitude: 0.04,  // radians (very subtle)
  handIdleFreq: 1.1,        // oscillation speed
  breatheAmp: 0.004,        // idle breathing amplitude (small)
  jawMultiplier: 0.52,      // keep as before
  jawFreq: 10               // keep as before
};

// Prevent double init (HMR / page reloads)
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

  // prefer a wrapper that handles gestures / scrolling
  const wrapper = document.getElementById("avatar-scroll-safe");
  mountEl = wrapper || container;

  // reduce scroll-stuck / touch issues
  container.style.touchAction = container.style.touchAction || "pan-y pinch-zoom";
  container.style.position = container.style.position || "relative";
  container.style.userSelect = "none";

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  if (mountEl) {
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  } else {
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  renderer.setClearColor(0x000000, 0);

  // Canvas overlay styling — does not intercept pointer events
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  canvas.style.top = canvas.style.left = "0";
  canvas.style.width = canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.touchAction = "pan-y pinch-zoom";
  canvas.style.display = "block";

  // remove old canvases (HMR safety)
  Array.from(container.querySelectorAll("canvas")).forEach((c) => c.remove());
  if (wrapper) Array.from(wrapper.querySelectorAll("canvas")).forEach((c) => c.remove());

  if (mountEl) {
    mountEl.appendChild(canvas);
  } else {
    container.appendChild(canvas);
  }

  // small scroll nudge to fix layout edge cases
  setTimeout(() => {
    try {
      window.scrollBy(0, 1);
      window.scrollBy(0, -1);
    } catch (e) { /* ignore */ }
  }, 40);

  // Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    28,
    (mountEl ? mountEl.clientWidth : container.clientWidth) / (mountEl ? mountEl.clientHeight : container.clientHeight),
    0.1,
    100
  );

  // Lighting
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

  loadModel(CONFIG.filename);

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

// loadModel now accepts a filename parameter
function loadModel(filename) {
  const loader = new GLTFLoader();
  const path = filename || CONFIG.filename;

  loader.load(
    path,
    (gltf) => {
      try {
        // Dispose old avatar if present
        if (avatar) {
          disposeAvatar(avatar);
          avatar = null;
          avatarReady = false;
          cached = { mouth: null, leftHand: null, rightHand: null };
        }

        avatar = gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
        if (!avatar) {
          console.warn("GLTF loaded but no scene found.");
          return;
        }

        // add but hide until transforms are computed
        avatar.visible = false;
        scene.add(avatar);

        // compute bounding box, size and center
        const box = new THREE.Box3().setFromObject(avatar);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        // scale using CONFIG.targetSize
        const scaleFactor = CONFIG.targetSize / maxDim;
        avatar.scale.setScalar(scaleFactor);

        // stable centering and slight vertical offset for eye-level
        avatar.position.set(
          -center.x * scaleFactor,
          -center.y * scaleFactor - 0.07,
          -center.z * scaleFactor
        );

        // store base Y for non-cumulative animations
        avatar.userData._baseY = avatar.position.y;

        // Camera fit using bounding sphere
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = sphere.radius || Math.max(size.x, size.y, size.z) * 0.5 || 1;
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const distance = Math.abs(radius / Math.sin(fov / 2)) * 1.25;
        // add configurable bias to move camera slightly back (zoom out)
        camera.position.set(0, 0, distance + (CONFIG.cameraDistanceBias || 0.25));
        camera.lookAt(0, 0, 0);

        // search for jaw bone and hand bones, capture base rotations (non-cumulative)
        avatar.traverse((node) => {
          if (node.isBone) {
            // jaw detection (existing)
            if (/jaw|lower/i.test(node.name) && !cached.mouth) {
              cached.mouth = node;
              cached.mouth._baseRotX = node.rotation.x || 0;
            }

            // hand detection: find left and right from common names
            if (!cached.leftHand && CONFIG.handBoneNames.some(n => new RegExp(n, "i").test(node.name))) {
              // crude way to separate left/right: look for "l" or "left" in name
              const lower = node.name.toLowerCase();
              if (/(left|_l|\.l| l\b| l$)/i.test(lower)) {
                cached.leftHand = node;
                cached.leftHand._baseRot = node.rotation.clone ? node.rotation.clone() : { x: node.rotation.x || 0, y: node.rotation.y || 0, z: node.rotation.z || 0 };
              } else if (/(right|_r|\.r| r\b| r$)/i.test(lower)) {
                cached.rightHand = node;
                cached.rightHand._baseRot = node.rotation.clone ? node.rotation.clone() : { x: node.rotation.x || 0, y: node.rotation.y || 0, z: node.rotation.z || 0 };
              } else {
                // if name isn't explicit, try to assign first matches heuristically
                if (!cached.leftHand) {
                  cached.leftHand = node;
                  cached.leftHand._baseRot = node.rotation.clone ? node.rotation.clone() : { x: node.rotation.x || 0, y: node.rotation.y || 0, z: node.rotation.z || 0 };
                } else if (!cached.rightHand) {
                  cached.rightHand = node;
                  cached.rightHand._baseRot = node.rotation.clone ? node.rotation.clone() : { x: node.rotation.x || 0, y: node.rotation.y || 0, z: node.rotation.z || 0 };
                }
              }
            }
          }
        });

        // normalize stored base rotation shapes if needed
        if (cached.leftHand && !cached.leftHand._baseRot) {
          cached.leftHand._baseRot = { x: cached.leftHand.rotation.x || 0, y: cached.leftHand.rotation.y || 0, z: cached.leftHand.rotation.z || 0 };
        }
        if (cached.rightHand && !cached.rightHand._baseRot) {
          cached.rightHand._baseRot = { x: cached.rightHand.rotation.x || 0, y: cached.rightHand.rotation.y || 0, z: cached.rightHand.rotation.z || 0 };
        }
        if (cached.mouth && typeof cached.mouth._baseRotX === "undefined") {
          cached.mouth._baseRotX = cached.mouth.rotation.x || 0;
        }

        avatar.visible = true;
        avatarReady = true;
        console.log("🕷️ Spidey Teacher Loaded — Perfection Level: 100 🔥", {
          filename: path,
          scale: avatar.scale.toArray(),
          baseY: avatar.userData._baseY,
          cameraZ: camera.position.z,
          hasMouth: !!cached.mouth,
          hasLeftHand: !!cached.leftHand,
          hasRightHand: !!cached.rightHand
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
      console.error("Failed to load avatar:", path, err);
    }
  );
}

function animate() {
  rafId = requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (avatarReady && avatar) {
    // base Y
    const baseY = (avatar.userData && typeof avatar.userData._baseY === "number") ? avatar.userData._baseY : avatar.position.y || 0;

    // breathing
    const breathe = Math.sin(t * 1.2) * (CONFIG.breatheAmp || 0.004);

    if (isTalking) {
      // talking motion (non-cumulative)
      avatar.position.y = baseY + Math.sin(t * 3.0) * 0.007;
      avatar.rotation.x = Math.sin(t * 2.0) * 0.028;
      avatar.rotation.z = Math.sin(t * 1.3) * 0.014;

      // jaw sync (prefer real bone)
      if (cached.mouth && cached.mouth.isBone) {
        cached.mouth.rotation.x = (cached.mouth._baseRotX || 0) + Math.abs(Math.sin(t * (CONFIG.jawFreq || 10))) * (CONFIG.jawMultiplier || 0.52);
      } else {
        // fallback jaw effect using scale.y (non-destructive)
        const baseScaleX = avatar.scale.x || 1;
        avatar.scale.y = baseScaleX + Math.abs(Math.sin(t * (CONFIG.jawFreq || 10))) * 0.13;
      }
    } else {
      // idle - breathing + subtle hand wiggle (non-cumulative)
      avatar.position.y = baseY + breathe;

      // gentle damping for rotations to avoid accumulation
      avatar.rotation.x *= 0.93;
      avatar.rotation.z *= 0.93;

      // restore scale.y toward base
      avatar.scale.y += (avatar.scale.x - avatar.scale.y) * 0.12;

      // restore jaw if used
      if (cached.mouth && cached.mouth.isBone && typeof cached.mouth._baseRotX === "number") {
        cached.mouth.rotation.x += (cached.mouth._baseRotX - cached.mouth.rotation.x) * 0.08;
      }

      // subtle hand idle motion using base rotation + small sine term
      try {
        const amp = CONFIG.handIdleAmplitude || 0.04;
        const freq = CONFIG.handIdleFreq || 1.1;
        const s = Math.sin(t * freq);

        if (cached.leftHand) {
          const base = cached.leftHand._baseRot;
          if (base) {
            // non-cumulative — set absolute rotation = base + offset
            cached.leftHand.rotation.x = (base.x || 0) + s * amp * 0.35; // small forward/back tilt
            cached.leftHand.rotation.z = (base.z || 0) + Math.sin(t * (freq * 0.7)) * amp * 0.15; // slight twist
          }
        }

        if (cached.rightHand) {
          const base = cached.rightHand._baseRot;
          if (base) {
            cached.rightHand.rotation.x = (base.x || 0) + Math.sin(t * (freq * 0.95)) * amp * 0.32;
            cached.rightHand.rotation.z = (base.z || 0) + Math.sin(t * (freq * 0.6)) * amp * 0.12;
          }
        }
      } catch (e) {
        // ignore transient animation errors
      }
    }
  }

  if (renderer && scene && camera) renderer.render(scene, camera);
}

// External API (keeps existing interface)
export function avatarStartTalking() {
  isTalking = true;
  try { document.dispatchEvent(new CustomEvent("avatarTalkStart")); } catch (e) {}
}

export function avatarStopTalking() {
  isTalking = false;
  try { document.dispatchEvent(new CustomEvent("avatarTalkStop")); } catch (e) {}
}

// Expose a programmatic loader so you can switch models at runtime:
// call loadModel('/assets/avatar2.glb') to swap; old avatar is disposed automatically.
export function loadAvatarFile(path) {
  if (!path) return;
  loadModel(path);
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
