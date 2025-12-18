// ============================================
// threejs-avatar-3d.js
// LOCATION: frontend/src/threejs-avatar-3d.js
// ACTION: CREATE NEW FILE
// ============================================

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

// ============================================
// GLOBAL VARIABLES
// ============================================
let scene, camera, renderer;
let currentVRM = null;
let avatarReady = false;
let isTalking = false;
let clock = new THREE.Clock();
let container = null;
let rafId = null;

// Animation timers
let idleTime = 0;
let blinkTimer = 0;

// Lip sync
let currentMouthOpenness = 0;
let targetMouthOpenness = 0;

// ============================================
// SETTINGS - CHANGE THESE TO CUSTOMIZE
// ============================================
const CONFIG = {
  // Avatar
  avatarScale: 1.0,
  avatarYOffset: -0.85,
  
  // Camera
  cameraDistance: 2.5,
  cameraHeight: 1.2,
  cameraFOV: 35,
  
  // Ground
  groundSize: 20,
  
  // Sky colors (Replika-style pink/blue)
  skyTopColor: 0x87CEEB,
  skyBottomColor: 0xE6B3CC,
  
  // Idle animation
  breathingSpeed: 0.8,
  breathingAmount: 0.003,
  swaySpeed: 0.3,
  swayAmount: 0.01,
  
  // Blinking
  blinkInterval: 3000,
  blinkDuration: 150,
  
  // Lip sync smoothness
  lipSyncSmooth: 0.15,
};

// ============================================
// INITIALIZE 3D SCENE
// ============================================
export function init3DScene(containerId = "canvas-container") {
  container = document.getElementById(containerId);
  if (!container) {
    console.error("[3D] Container not found:", containerId);
    return false;
  }

  // Cleanup old stuff
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  container.querySelectorAll("canvas").forEach(c => c.remove());

  // Create renderer
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: false 
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  container.appendChild(renderer.domElement);

  // Create scene
  scene = new THREE.Scene();
  
  // Add sky
  createSky();
  
  // Add ground
  createGround();
  
  // Setup camera
  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
  camera.lookAt(0, 1.0, 0);

  // Add lights
  setupLights();

  // Handle resize
  window.addEventListener("resize", onResize, { passive: true });

  // Start animation loop
  animate();

  console.log("[3D] ✅ Scene initialized");
  return true;
}

// ============================================
// CREATE SKY (Gradient Background)
// ============================================
function createSky() {
  const skyGeo = new THREE.SphereGeometry(50, 32, 32);
  
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(CONFIG.skyTopColor) },
      bottomColor: { value: new THREE.Color(CONFIG.skyBottomColor) },
      offset: { value: 10 },
      exponent: { value: 0.6 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide
  });

  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
}

// ============================================
// CREATE GROUND (Gradient Floor)
// ============================================
function createGround() {
  const groundGeo = new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize);
  
  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      centerColor: { value: new THREE.Color(0x9B8B7A) },
      edgeColor: { value: new THREE.Color(0x6B5B4A) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 centerColor;
      uniform vec3 edgeColor;
      varying vec2 vUv;
      void main() {
        float dist = distance(vUv, vec2(0.5, 0.5));
        vec3 color = mix(centerColor, edgeColor, smoothstep(0.0, 0.7, dist));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
}

// ============================================
// SETUP LIGHTING
// ============================================
function setupLights() {
  // Main light (sun)
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
  mainLight.position.set(3, 5, 3);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 20;
  mainLight.shadow.camera.left = -5;
  mainLight.shadow.camera.right = 5;
  mainLight.shadow.camera.top = 5;
  mainLight.shadow.camera.bottom = -5;
  scene.add(mainLight);

  // Fill light
  const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
  fillLight.position.set(-2, 3, -1);
  scene.add(fillLight);

  // Back light
  const backLight = new THREE.DirectionalLight(0xaaccff, 0.4);
  backLight.position.set(0, 2, -3);
  scene.add(backLight);

  // Hemisphere light
  const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.6);
  scene.add(hemiLight);

  // Ambient
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);
}

// ============================================
// LOAD VRM AVATAR
// ============================================
export async function loadVRMAvatar(vrmPath) {
  console.log("[3D] Loading VRM:", vrmPath);

  // Show loading
  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.classList.add("active");

  // Remove old avatar
  if (currentVRM) {
    scene.remove(currentVRM.scene);
    VRMUtils.deepDispose(currentVRM.scene);
    currentVRM = null;
    avatarReady = false;
  }

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      vrmPath,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        
        if (!vrm) {
          console.error("[3D] No VRM data in file");
          if (loadingEl) loadingEl.classList.remove("active");
          reject(new Error("No VRM data"));
          return;
        }

        // Cleanup
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        // Face camera (VRM faces +Z by default)
        vrm.scene.rotation.y = Math.PI;

        // Scale and position
        vrm.scene.scale.setScalar(CONFIG.avatarScale);
        vrm.scene.position.set(0, CONFIG.avatarYOffset, 0);

        // Enable shadows
        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        // Add to scene
        scene.add(vrm.scene);
        currentVRM = vrm;
        avatarReady = true;

        // Reset timers
        idleTime = 0;
        blinkTimer = 0;

        // Hide loading
        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded!");
        
        // Log available expressions
        if (vrm.expressionManager) {
          console.log("[3D] Expressions:", Object.keys(vrm.expressionManager.expressionMap));
        }

        resolve(vrm);
      },
      (progress) => {
        const percent = (progress.loaded / progress.total * 100).toFixed(0);
        console.log(`[3D] Loading: ${percent}%`);
      },
      (error) => {
        console.error("[3D] Failed to load:", error);
        if (loadingEl) loadingEl.classList.remove("active");
        reject(error);
      }
    );
  });
}

// ============================================
// IDLE ANIMATION (Breathing, Sway)
// ============================================
function updateIdleAnimation(delta) {
  if (!currentVRM || !avatarReady) return;

  idleTime += delta;

  // Breathing
  const breathOffset = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2) * CONFIG.breathingAmount;
  
  const chest = currentVRM.humanoid?.getNormalizedBoneNode("chest");
  const spine = currentVRM.humanoid?.getNormalizedBoneNode("spine");
  
  if (chest) {
    chest.rotation.x = breathOffset * 2;
  } else if (spine) {
    spine.rotation.x = breathOffset;
  }

  // Subtle sway
  const swayX = Math.sin(idleTime * CONFIG.swaySpeed) * CONFIG.swayAmount;
  
  if (currentVRM.scene) {
    currentVRM.scene.rotation.z = swayX * 0.5;
  }

  // Head micro-movement
  const head = currentVRM.humanoid?.getNormalizedBoneNode("head");
  if (head) {
    head.rotation.y = Math.sin(idleTime * 0.5) * 0.02;
    head.rotation.x = Math.sin(idleTime * 0.3) * 0.01;
  }
}

// ============================================
// BLINKING
// ============================================
function updateBlinking(delta) {
  if (!currentVRM?.expressionManager) return;

  blinkTimer += delta * 1000;

  const interval = CONFIG.blinkInterval + Math.random() * 1000;

  if (blinkTimer >= interval) {
    // Blink
    const expr = currentVRM.expressionManager;
    expr.setValue("blink", 1.0);
    
    setTimeout(() => {
      if (currentVRM?.expressionManager) {
        currentVRM.expressionManager.setValue("blink", 0.0);
      }
    }, CONFIG.blinkDuration);
    
    blinkTimer = 0;
  }
}

// ============================================
// LIP SYNC
// ============================================
function updateLipSync(delta) {
  if (!currentVRM?.expressionManager) return;

  // Smooth interpolation
  currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * CONFIG.lipSyncSmooth;

  const expr = currentVRM.expressionManager;
  
  // Try different mouth expressions
  if (expr.expressionMap["aa"]) {
    expr.setValue("aa", currentMouthOpenness);
  } else if (expr.expressionMap["a"]) {
    expr.setValue("a", currentMouthOpenness);
  } else if (expr.expressionMap["oh"]) {
    expr.setValue("oh", currentMouthOpenness);
  }
}

// ============================================
// TALKING CONTROL (called from app.js)
// ============================================
export function avatarStartTalking() {
  isTalking = true;
  console.log("[3D] 🗣️ Start talking");
  animateTalking();
}

export function avatarStopTalking() {
  isTalking = false;
  targetMouthOpenness = 0;
  console.log("[3D] 🤐 Stop talking");
}

function animateTalking() {
  if (!isTalking) {
    targetMouthOpenness = 0;
    return;
  }

  // Simulate mouth movement
  const variation = Math.sin(Date.now() * 0.015) * 0.3 + 
                    Math.sin(Date.now() * 0.025) * 0.2 +
                    Math.random() * 0.2;
  
  targetMouthOpenness = Math.max(0, Math.min(1, 0.3 + variation));

  requestAnimationFrame(animateTalking);
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
  rafId = requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Update VRM
  if (currentVRM && avatarReady) {
    updateIdleAnimation(delta);
    updateBlinking(delta);
    
    if (isTalking) {
      updateLipSync(delta);
    }

    currentVRM.update(delta);
  }

  // Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// ============================================
// RESIZE HANDLER
// ============================================
function onResize() {
  if (!container || !camera || !renderer) return;

  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// ============================================
// CLEANUP
// ============================================
export function dispose3D() {
  console.log("[3D] Disposing...");

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (currentVRM) {
    scene.remove(currentVRM.scene);
    VRMUtils.deepDispose(currentVRM.scene);
    currentVRM = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }

  window.removeEventListener("resize", onResize);
  avatarReady = false;
}

// ============================================
// UTILITY EXPORTS
// ============================================
export function isAvatarReady() {
  return avatarReady;
}

export function getVRM() {
  return currentVRM;
}