// frontend/src/threejs-avatar.js
// REPLIKA-STYLE AVATAR - STILL & NATURAL
// Minimal movement | Jaw/lip sync only | No shaking

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let scene, camera, renderer, avatar;
let avatarReady = false;
let isTalking = false;
const clock = new THREE.Clock();
let cached = { mouth: null, head: null };
let container = null;
let mountEl = null;
let rafId = null;

// Base rotation storage (to prevent cumulative drift)
let baseRotation = { x: 0, y: 0, z: 0 };
let basePosition = { x: 0, y: 0, z: 0 };

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

  // LIGHTING - Soft and natural (like Replika)
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
          cached = { mouth: null, head: null };
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

        // Store base position and rotation
        basePosition.x = avatar.position.x;
        basePosition.y = avatar.position.y;
        basePosition.z = avatar.position.z;
        
        baseRotation.x = avatar.rotation.x;
        baseRotation.y = avatar.rotation.y;
        baseRotation.z = avatar.rotation.z;

        // Camera positioning
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = sphere.radius || Math.max(size.x, size.y, size.z) * 0.5 || 1;
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const distance = Math.abs(radius / Math.sin(fov / 2)) * 1.25;
        camera.position.set(0, 0, distance + 0.25);
        camera.lookAt(0, 0, 0);

        // Find jaw/mouth bone for lip sync
        avatar.traverse((node) => {
          const nodeName = (node.name || "").toLowerCase();
          
          // Look for jaw/mouth bones
          if (node.isBone) {
            if (nodeName.includes("jaw") || 
                nodeName.includes("chin") || 
                nodeName.includes("mouth") ||
                nodeName.includes("lower")) {
              cached.mouth = node;
              cached.mouth._baseRotX = node.rotation.x || 0;
              console.log("Found mouth bone:", node.name);
            }
            
            // Store head bone for minimal movement
            if (nodeName.includes("head") && !cached.head) {
              cached.head = node;
              cached.head._baseRotX = node.rotation.x || 0;
              cached.head._baseRotY = node.rotation.y || 0;
              cached.head._baseRotZ = node.rotation.z || 0;
              console.log("Found head bone:", node.name);
            }
          }
        });

        avatar.visible = true;
        avatarReady = true;
        console.log("✨ Avatar Loaded - Replika Style", {
          scale: avatar.scale.toArray(),
          hasJaw: !!cached.mouth,
          hasHead: !!cached.head
        });
      } catch (err) {
        console.error("Error in GLTF load callback:", err);
      }
    },
    undefined,
    (err) => {
      console.error("Failed to load avatar.glb", err);
    }
  );
}

function animate() {
  rafId = requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (avatarReady && avatar) {
    if (isTalking) {
      // TALKING STATE - Only jaw/lip movement
      
      // Jaw movement (if bone exists)
      if (cached.mouth && cached.mouth.isBone) {
        // Natural jaw motion - opens and closes smoothly
        const jawOpen = Math.abs(Math.sin(t * 8)) * 0.3; // 8 Hz for natural speech
        cached.mouth.rotation.x = cached.mouth._baseRotX + jawOpen;
      }
      
      // Very subtle head movement (optional - can be removed)
      if (cached.head && cached.head.isBone) {
        const headTilt = Math.sin(t * 1.5) * 0.015; // Very minimal
        cached.head.rotation.x = cached.head._baseRotX + headTilt;
      }
      
      // Fallback: scale-based "mouth" animation if no jaw bone
      if (!cached.mouth) {
        const scaleVariation = Math.abs(Math.sin(t * 8)) * 0.05;
        avatar.scale.y = avatar.scale.x + scaleVariation;
      }
      
    } else {
      // IDLE STATE - Completely still (like Replika)
      
      // Reset avatar to base position (no drift)
      avatar.position.x = basePosition.x;
      avatar.position.y = basePosition.y;
      avatar.position.z = basePosition.z;
      
      avatar.rotation.x = baseRotation.x;
      avatar.rotation.y = baseRotation.y;
      avatar.rotation.z = baseRotation.z;
      
      // Reset jaw to base
      if (cached.mouth && cached.mouth.isBone) {
        cached.mouth.rotation.x += (cached.mouth._baseRotX - cached.mouth.rotation.x) * 0.1;
      }
      
      // Reset head to base
      if (cached.head && cached.head.isBone) {
        cached.head.rotation.x += (cached.head._baseRotX - cached.head.rotation.x) * 0.1;
        cached.head.rotation.y += (cached.head._baseRotY - cached.head.rotation.y) * 0.1;
        cached.head.rotation.z += (cached.head._baseRotZ - cached.head.rotation.z) * 0.1;
      }
      
      // Reset scale
      if (avatar.scale.y !== avatar.scale.x) {
        avatar.scale.y += (avatar.scale.x - avatar.scale.y) * 0.1;
      }
    }
  }

  if (renderer && scene && camera) renderer.render(scene, camera);
}

// External API
export function avatarStartTalking() {
  isTalking = true;
  try { 
    document.dispatchEvent(new CustomEvent("avatarTalkStart")); 
  } catch (e) {}
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

/* ============================
   ADVANCED: Viseme-based Lip Sync
   ============================ */

// Phoneme to viseme mapping (for advanced lip sync)
const VISEME_MAP = {
  // Silence
  'sil': 0,
  // Vowels
  'AA': 0.8, 'AE': 0.7, 'AH': 0.6, 'AO': 0.8, 'AW': 0.7,
  'AY': 0.6, 'EH': 0.5, 'ER': 0.4, 'EY': 0.5, 'IH': 0.3,
  'IY': 0.3, 'OW': 0.7, 'OY': 0.7, 'UH': 0.5, 'UW': 0.6,
  // Consonants
  'M': 0.0, 'P': 0.0, 'B': 0.1, 'F': 0.2, 'V': 0.2,
  'TH': 0.3, 'DH': 0.3, 'S': 0.2, 'Z': 0.2, 'SH': 0.3,
  'CH': 0.3, 'JH': 0.3, 'T': 0.2, 'D': 0.2, 'N': 0.2,
  'L': 0.3, 'R': 0.4, 'K': 0.4, 'G': 0.4, 'NG': 0.3,
  'W': 0.5, 'Y': 0.4, 'HH': 0.3
};

// Simple phoneme detection (basic - for real visemes use Web Speech API or external library)
export function animateVisemes(text) {
  if (!cached.mouth || !cached.mouth.isBone) return;
  
  // This is a simplified version - for production, use a phoneme library
  // or the Web Speech API's word boundary events
  const words = text.toLowerCase().split(' ');
  let delay = 0;
  
  words.forEach(word => {
    const duration = word.length * 80; // Rough estimate
    
    setTimeout(() => {
      if (isTalking && cached.mouth) {
        // Estimate mouth opening based on vowels
        const vowelCount = (word.match(/[aeiou]/g) || []).length;
        const openAmount = Math.min(vowelCount * 0.15, 0.4);
        cached.mouth.rotation.x = cached.mouth._baseRotX + openAmount;
      }
    }, delay);
    
    delay += duration;
  });
}

// Note: For real viseme-based lip sync, you would:
// 1. Use a phoneme analysis library (like meyda.js or ml5.js)
// 2. Or integrate with services like Azure Speech or AWS Polly
// 3. Map phonemes to blend shapes if your model has them
// 4. Or use the simplified jaw rotation as shown above