// ============================================
// threejs-avatar-3d.js - FIXED VERSION
// LOCATION: frontend/src/threejs-avatar-3d.js
// ACTION: REPLACE YOUR EXISTING FILE
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

// Store base arm rotations for idle animation
let baseArmRotations = {
  leftUpperArm: { x: 0, y: 0, z: 1.1 },
  rightUpperArm: { x: 0, y: 0, z: -1.1 }
};

// ============================================
// SETTINGS - ADJUSTED FOR BETTER VIEW
// ============================================
const CONFIG = {
  // Avatar - ADJUSTED
  avatarScale: 0.9,
  avatarYOffset: 0,
  
  // Camera - LOWERED & PULLED BACK
  cameraDistance: 3.5,
  cameraHeight: 0.9,
  cameraFOV: 30,
  cameraLookAtY: 0.8,
  
  // Ground
  groundSize: 30,
  
  // Sky colors
  skyTopColor: 0x87CEEB,
  skyBottomColor: 0xE6B3CC,
  
  // Idle animation
  breathingSpeed: 0.8,
  breathingAmount: 0.005,
  swaySpeed: 0.3,
  swayAmount: 0.008,
  
  // Blinking
  blinkInterval: 3500,
  blinkDuration: 150,
  
  // Lip sync
  lipSyncSmooth: 0.12,
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

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  container.querySelectorAll("canvas").forEach(c => c.remove());

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

  scene = new THREE.Scene();
  
  createSky();
  createGround();
  
  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
  camera.lookAt(0, CONFIG.cameraLookAtY, 0);

  setupLights();

  window.addEventListener("resize", onResize, { passive: true });

  animate();

  console.log("[3D] ✅ Scene initialized");
  return true;
}

// ============================================
// CREATE SKY
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
// CREATE GROUND
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

  const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
  fillLight.position.set(-2, 3, -1);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xaaccff, 0.4);
  backLight.position.set(0, 2, -3);
  scene.add(backLight);

  const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.6);
  scene.add(hemiLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);
}

// ============================================
// LOAD VRM AVATAR
// ============================================
export async function loadVRMAvatar(vrmPath) {
  console.log("[3D] Loading VRM:", vrmPath);

  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.classList.add("active");

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

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        // Face camera
        vrm.scene.rotation.y = Math.PI;

        // Calculate bounding box
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log("[3D] Avatar size:", size);

        // Scale to fit (target height ~1.6m)
        const targetHeight = 1.6;
        const scale = targetHeight / size.y;
        vrm.scene.scale.setScalar(scale);

        // Position: center X/Z, feet on ground
        vrm.scene.position.set(
          -center.x * scale,
          -box.min.y * scale,
          -center.z * scale
        );

        // Enable shadows
        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        scene.add(vrm.scene);
        currentVRM = vrm;
        avatarReady = true;

        idleTime = 0;
        blinkTimer = 0;

        // Set relaxed pose (arms down)
        setRelaxedPose(vrm);

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded!");
        
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
// SET RELAXED POSE (Arms Down)
// ============================================
function setRelaxedPose(vrm) {
  if (!vrm?.humanoid) return;

  try {
    // Upper arms - rotate down from T-pose
    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
    
    if (leftUpperArm) {
      leftUpperArm.rotation.set(0.2, 0, 1.1);
      baseArmRotations.leftUpperArm = { x: 0.2, y: 0, z: 1.1 };
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.set(0.2, 0, -1.1);
      baseArmRotations.rightUpperArm = { x: 0.2, y: 0, z: -1.1 };
    }

    // Lower arms - slight bend
    const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
    const rightLowerArm = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
    
    if (leftLowerArm) {
      leftLowerArm.rotation.set(0, -0.3, 0);
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.set(0, 0.3, 0);
    }

    // Hands - natural angle
    const leftHand = vrm.humanoid.getNormalizedBoneNode("leftHand");
    const rightHand = vrm.humanoid.getNormalizedBoneNode("rightHand");
    
    if (leftHand) {
      leftHand.rotation.set(0, 0, 0.15);
    }
    if (rightHand) {
      rightHand.rotation.set(0, 0, -0.15);
    }

    console.log("[3D] ✅ Relaxed pose set");
  } catch (e) {
    console.warn("[3D] Could not set pose:", e);
  }
}

// ============================================
// IDLE ANIMATION
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

  // Body sway
  const swayX = Math.sin(idleTime * CONFIG.swaySpeed) * CONFIG.swayAmount;
  const swayZ = Math.cos(idleTime * CONFIG.swaySpeed * 0.7) * CONFIG.swayAmount * 0.5;
  
  const hips = currentVRM.humanoid?.getNormalizedBoneNode("hips");
  if (hips) {
    hips.rotation.z = swayX;
    hips.rotation.x = swayZ;
  }

  // Head movement
  const head = currentVRM.humanoid?.getNormalizedBoneNode("head");
  if (head) {
    head.rotation.y = Math.sin(idleTime * 0.5) * 0.03;
    head.rotation.x = Math.sin(idleTime * 0.3) * 0.02;
  }

  // Subtle arm movement
  const leftUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("rightUpperArm");
  
  if (leftUpperArm) {
    leftUpperArm.rotation.z = baseArmRotations.leftUpperArm.z + Math.sin(idleTime * 0.4) * 0.02;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = baseArmRotations.rightUpperArm.z + Math.sin(idleTime * 0.4 + 0.5) * 0.02;
  }
}

// ============================================
// BLINKING
// ============================================
function updateBlinking(delta) {
  if (!currentVRM?.expressionManager) return;

  blinkTimer += delta * 1000;

  const interval = CONFIG.blinkInterval + Math.random() * 1500;

  if (blinkTimer >= interval) {
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

  currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * CONFIG.lipSyncSmooth;

  const expr = currentVRM.expressionManager;
  
  // Primary mouth shape
  if (expr.expressionMap["aa"]) {
    expr.setValue("aa", currentMouthOpenness);
  } else if (expr.expressionMap["a"]) {
    expr.setValue("a", currentMouthOpenness);
  }
  
  // Secondary shapes for variation
  if (expr.expressionMap["oh"]) {
    expr.setValue("oh", currentMouthOpenness * 0.3);
  }
  if (expr.expressionMap["ih"]) {
    expr.setValue("ih", currentMouthOpenness * 0.2 * Math.abs(Math.sin(idleTime * 15)));
  }
}

// ============================================
// TALKING CONTROL
// ============================================
export function avatarStartTalking() {
  isTalking = true;
  console.log("[3D] 🗣️ Start talking");
  animateTalking();
}

export function avatarStopTalking() {
  isTalking = false;
  targetMouthOpenness = 0;
  
  // Reset expressions
  if (currentVRM?.expressionManager) {
    const expr = currentVRM.expressionManager;
    ["aa", "a", "oh", "ih", "ou", "ee"].forEach(name => {
      if (expr.expressionMap[name]) expr.setValue(name, 0);
    });
  }
  
  console.log("[3D] 🤐 Stop talking");
}

function animateTalking() {
  if (!isTalking) {
    targetMouthOpenness = 0;
    return;
  }

  const time = Date.now() * 0.001;
  const variation = 
    Math.sin(time * 8) * 0.25 + 
    Math.sin(time * 12) * 0.15 +
    Math.sin(time * 20) * 0.1 +
    Math.random() * 0.15;
  
  targetMouthOpenness = Math.max(0.1, Math.min(0.9, 0.4 + variation));

  requestAnimationFrame(animateTalking);
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
  rafId = requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (currentVRM && avatarReady) {
    updateIdleAnimation(delta);
    updateBlinking(delta);
    
    if (isTalking) {
      updateLipSync(delta);
    }

    currentVRM.update(delta);
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// ============================================
// RESIZE
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
// EXPORTS
// ============================================
export function isAvatarReady() {
  return avatarReady;
}

export function getVRM() {
  return currentVRM;
}