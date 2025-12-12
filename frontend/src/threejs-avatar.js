// frontend/src/threejs-avatar.js
// COMPLETELY STILL AVATAR - REPLIKA STYLE
// Zero movement | No jaw animation | Perfectly idle

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let scene, camera, renderer, avatar;
let avatarReady = false;
let isTalking = false; // Keep for future use, but not used now
const clock = new THREE.Clock();
let container = null;
let mountEl = null;
let rafId = null;

// Base position storage (never changes)
let basePosition = { x: 0, y: 0, z: 0 };
let baseRotation = { x: 0, y: 0, z: 0 };
let baseScale = { x: 1, y: 1, z: 1 };

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

  const wrapper = document.getElementById("avatar-scroll-safe");
  mountEl = wrapper || container;

  // Touch handling
  container.style.touchAction = container.style.touchAction || "pan-y pinch-zoom";
  container.style.position = container.style.position || "relative";
  container.style.userSelect = "none";

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  if (mountEl) {
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  } else {
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  renderer.setClearColor(0x000000, 0);

  // Canvas styling
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  canvas.style.top = canvas.style.left = "0";
  canvas.style.width = canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.touchAction = "pan-y pinch-zoom";
  canvas.style.display = "block";

  // Remove old canvases
  Array.from(container.querySelectorAll("canvas")).forEach((c) => c.remove());
  if (wrapper) Array.from(wrapper.querySelectorAll("canvas")).forEach((c) => c.remove());

  if (mountEl) {
    mountEl.appendChild(canvas);
  } else {
    container.appendChild(canvas);
  }

  // Reflow nudge
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
    (mountEl ? mountEl.clientWidth : container.clientWidth) / 
    (mountEl ? mountEl.clientHeight : container.clientHeight), 
    0.1, 
    100
  );

  // LIGHTING - Soft and natural
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-2, 1, 2);
  scene.add(fillLight);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  scene.add(hemi);

  scene.add(new THREE.AmbientLight(0x404040, 0.3));

  window.addEventListener("resize", onResize, { passive: true });

  loadModel();

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

function loadModel() {
  const loader = new GLTFLoader();
  loader.load(
    "/assets/avatar2.glb",
    (gltf) => {
      try {
        if (avatar) {
          disposeAvatar(avatar);
          avatar = null;
          avatarReady = false;
        }

        avatar = gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
        if (!avatar) {
          console.warn("GLTF loaded but no scene found.");
          return;
        }

        avatar.visible = false;
        scene.add(avatar);

        // Compute bounding box and center
        const box = new THREE.Box3().setFromObject(avatar);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        // Scale to fit viewport
        const targetSize = 2.1;
        const scaleFactor = targetSize / maxDim;
        avatar.scale.setScalar(scaleFactor);

        // Center the avatar
        avatar.position.set(
          -center.x * scaleFactor,
          -center.y * scaleFactor - 0.07,
          -center.z * scaleFactor
        );

        // Store FIXED base values (NEVER change these)
        basePosition.x = avatar.position.x;
        basePosition.y = avatar.position.y;
        basePosition.z = avatar.position.z;
        
        baseRotation.x = avatar.rotation.x;
        baseRotation.y = avatar.rotation.y;
        baseRotation.z = avatar.rotation.z;

        baseScale.x = avatar.scale.x;
        baseScale.y = avatar.scale.y;
        baseScale.z = avatar.scale.z;

        // Camera positioning
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = sphere.radius || Math.max(size.x, size.y, size.z) * 0.5 || 1;
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const distance = Math.abs(radius / Math.sin(fov / 2)) * 1.25;
        camera.position.set(0, 0, distance + 0.25);
        camera.lookAt(0, 0, 0);

        avatar.visible = true;
        avatarReady = true;
        console.log("✨ Avatar Loaded - Completely Still", {
          position: avatar.position.toArray(),
          rotation: avatar.rotation.toArray(),
          scale: avatar.scale.toArray()
        });
      } catch (err) {
        console.error("Error in GLTF load callback:", err);
      }
    },
    undefined,
    (err) => {
      console.error("Failed to load avatar2.glb", err);
    }
  );
}

function animate() {
  rafId = requestAnimationFrame(animate);

  // CRITICAL: Avatar NEVER moves - always locked to base values
  if (avatarReady && avatar) {
    // Force avatar to stay EXACTLY at base position/rotation/scale
    // No animations, no breathing, no movement of any kind
    
    avatar.position.x = basePosition.x;
    avatar.position.y = basePosition.y;
    avatar.position.z = basePosition.z;
    
    avatar.rotation.x = baseRotation.x;
    avatar.rotation.y = baseRotation.y;
    avatar.rotation.z = baseRotation.z;
    
    avatar.scale.x = baseScale.x;
    avatar.scale.y = baseScale.y;
    avatar.scale.z = baseScale.z;

    // NO jaw movement
    // NO head movement
    // NO body movement
    // COMPLETELY STATIC - like a photo
  }

  if (renderer && scene && camera) renderer.render(scene, camera);
}

// External API - kept for compatibility but doesn't affect avatar
export function avatarStartTalking() {
  isTalking = true;
  try { 
    document.dispatchEvent(new CustomEvent("avatarTalkStart")); 
  } catch (e) {}
  // Avatar stays completely still even when "talking"
}

export function avatarStopTalking() {
  isTalking = false;
  try { 
    document.dispatchEvent(new CustomEvent("avatarTalkStop")); 
  } catch (e) {}
}

// Cleanup API
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
      try { 
        renderer.forceContextLoss && renderer.forceContextLoss(); 
      } catch (e) {}
      try { 
        renderer.domElement && renderer.domElement.remove(); 
      } catch (e) {}
      renderer = null;
    }
    window.__spideyInitialized = false;
  } catch (e) {
    console.warn("disposeAllAndStop error:", e);
  }
}