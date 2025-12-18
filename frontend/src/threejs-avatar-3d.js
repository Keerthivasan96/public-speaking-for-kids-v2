// ============================================
// threejs-avatar-3d.js - REPLIKA-STYLE CAMERA
// Camera frames the ROOM, avatar is placed inside
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

// Scene objects
let currentRoom = null;
let fallbackGround = null;
let fallbackSky = null;
let hasRoomLoaded = false;

// Animation timers
let idleTime = 0;
let blinkTimer = 0;
let gestureTimer = 0;
let lookTimer = 0;
let lookTarget = { x: 0, y: 0 };
let currentLook = { x: 0, y: 0 };

// Lip sync
let currentMouthOpenness = 0;
let targetMouthOpenness = 0;

// Gesture state
let isGesturing = false;
let gestureProgress = 0;
let gestureType = 0;

// Store base rotations for arms
let baseRotations = {
  leftUpperArm: { x: 0.2, y: 0, z: 1.0 },
  rightUpperArm: { x: 0.2, y: 0, z: -1.0 },
  leftLowerArm: { x: 0, y: -0.2, z: 0 },
  rightLowerArm: { x: 0, y: 0.2, z: 0 },
  leftHand: { x: 0, y: 0, z: 0.1 },
  rightHand: { x: 0, y: 0, z: -0.1 },
};

// ============================================
// CONFIGURATION - REPLIKA STYLE
// ============================================
const CONFIG = {
  // ===== AVATAR =====
  avatarHeight: 1.45,           // Slightly smaller avatar
  
  // ===== CAMERA (FIXED TO ROOM, NOT AVATAR) =====
  cameraX: 0,
  cameraY: 1.4,
  cameraZ: 2.5,                 // Your setting
  
  lookAtX: 0,
  lookAtY: 0.9,
  lookAtZ: 0,
  
  cameraFOV: 50,
  
  // ===== AVATAR POSITION IN ROOM =====
  avatarX: 0,
  avatarY: 0,
  avatarZ: 0.5,
  
  // ===== ROOM =====
  roomScale: 0.5,
  roomX: 0,
  roomY: 0,
  roomZ: -2,
  
  // ===== ELEGANT COLOR THEME =====
  // Soft lavender/purple gradient sky
  skyTopColor: 0x9B8AC4,        // Deeper lavender at top
  skyMidColor: 0xC4B8D8,        // Mid lavender
  skyBottomColor: 0xE8E0F0,     // Light lavender/white at horizon
  
  // Floor - soft warm gray that complements purple
  floorCenterColor: 0xE2DEE9,   // Light warm gray (center, under avatar)
  floorEdgeColor: 0xC5BCD4,     // Slightly darker lavender-gray at edges
  
  // ===== ANIMATIONS =====
  breathingSpeed: 0.5,
  breathingAmount: 0.004,
  lookAroundInterval: 5000,
  lookAroundDuration: 2500,
  lookAmountX: 0.1,
  lookAmountY: 0.05,
  lookSmoothing: 0.04,
  armSwayAmount: 0.008,
  armSwaySpeed: 0.3,
  gestureInterval: 12000,
  gestureDuration: 1800,
  gestureAmount: 0.12,
  blinkInterval: 3000,
  blinkVariation: 2000,
  blinkDuration: 120,
  doubleBinkChance: 0.25,
  lipSyncSmooth: 0.15,
  lipSyncIntensity: 0.8,
  shoulderBreathAmount: 0.002,
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

  // Cleanup previous
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  container.querySelectorAll("canvas").forEach(c => c.remove());

  // Create renderer
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,  // Transparent background
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0); // Transparent
  
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  
  container.appendChild(renderer.domElement);

  // Create scene
  scene = new THREE.Scene();
  // No background - will be transparent or CSS handles it
  
  // Create fallback environment
  createFallbackEnvironment();
  
  // Create camera - FIXED POSITION (not following avatar)
  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  
  // Position camera
  camera.position.set(CONFIG.cameraX, CONFIG.cameraY, CONFIG.cameraZ);
  camera.lookAt(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ);
  
  // Setup lights
  setupLights();

  // Event listeners
  window.addEventListener("resize", onResize, { passive: true });

  // Start animation loop
  animate();

  console.log("[3D] ✅ Scene initialized (Replika-style camera)");
  return true;
}

// ============================================
// CREATE FALLBACK ENVIRONMENT
// ============================================
function createFallbackEnvironment() {
  // Beautiful gradient sky (3-color gradient for elegance)
  const skyGeo = new THREE.SphereGeometry(50, 64, 64);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(CONFIG.skyTopColor) },
      midColor: { value: new THREE.Color(CONFIG.skyMidColor) },
      bottomColor: { value: new THREE.Color(CONFIG.skyBottomColor) },
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
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 color;
        if (h > 0.0) {
          // Upper half: mid to top
          color = mix(midColor, topColor, smoothstep(0.0, 0.8, h));
        } else {
          // Lower half: bottom to mid (horizon area)
          color = mix(bottomColor, midColor, smoothstep(-0.3, 0.0, h));
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  
  fallbackSky = new THREE.Mesh(skyGeo, skyMat);
  fallbackSky.name = "fallbackSky";
  fallbackSky.visible = true;  // VISIBLE BY DEFAULT
  scene.add(fallbackSky);

  // Elegant floor with radial gradient (lighter in center, darker at edges)
  const groundGeo = new THREE.PlaneGeometry(60, 60, 1, 1);
  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      centerColor: { value: new THREE.Color(CONFIG.floorCenterColor) },
      edgeColor: { value: new THREE.Color(CONFIG.floorEdgeColor) },
      avatarPos: { value: new THREE.Vector2(0.5, 0.5) },
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
      uniform vec2 avatarPos;
      varying vec2 vUv;
      void main() {
        // Radial gradient from avatar position
        float dist = distance(vUv, avatarPos);
        // Smooth falloff
        float gradient = smoothstep(0.0, 0.5, dist);
        vec3 color = mix(centerColor, edgeColor, gradient);
        
        // Add subtle vignette at far edges
        float vignette = smoothstep(0.7, 1.0, dist) * 0.15;
        color = mix(color, edgeColor * 0.9, vignette);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  
  fallbackGround = new THREE.Mesh(groundGeo, groundMat);
  fallbackGround.rotation.x = -Math.PI / 2;
  fallbackGround.position.y = -0.01;  // Slightly below 0 to avoid z-fighting
  fallbackGround.receiveShadow = true;
  fallbackGround.name = "fallbackGround";
  fallbackGround.visible = true;  // VISIBLE BY DEFAULT
  scene.add(fallbackGround);
  
  console.log("[3D] ✅ Elegant environment created");
}

// ============================================
// SETUP LIGHTING (Replika-style soft ambient)
// ============================================
function setupLights() {
  // Clear existing lights
  const lightsToRemove = [];
  scene.traverse((obj) => {
    if (obj.isLight) lightsToRemove.push(obj);
  });
  lightsToRemove.forEach(l => scene.remove(l));

  // Main directional light (soft key light)
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.9);
  mainLight.position.set(3, 6, 4);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 25;
  mainLight.shadow.camera.left = -8;
  mainLight.shadow.camera.right = 8;
  mainLight.shadow.camera.top = 8;
  mainLight.shadow.camera.bottom = -8;
  mainLight.shadow.bias = -0.0001;
  scene.add(mainLight);

  // Fill light (soft pink tone like Replika)
  const fillLight = new THREE.DirectionalLight(0xFFE4EC, 0.4);
  fillLight.position.set(-4, 3, 2);
  scene.add(fillLight);

  // Rim/back light (soft blue)
  const rimLight = new THREE.DirectionalLight(0xE4E4FF, 0.3);
  rimLight.position.set(0, 4, -4);
  scene.add(rimLight);

  // Strong ambient for soft look
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  // Hemisphere light (purple/pink tones like Replika)
  const hemi = new THREE.HemisphereLight(0xC9B8E8, 0xE8D4E8, 0.5);
  scene.add(hemi);
  
  console.log("[3D] ✅ Replika-style lighting setup");
}

// ============================================
// LOAD VRM AVATAR
// ============================================
export async function loadVRMAvatar(vrmPath) {
  console.log("[3D] Loading VRM:", vrmPath);

  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.classList.add("active");

  // Remove existing VRM
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

        // Optimize
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        // Rotate to face camera
        vrm.scene.rotation.y = Math.PI;

        // Calculate bounds and scale
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const scale = CONFIG.avatarHeight / size.y;
        vrm.scene.scale.setScalar(scale);

        // Position avatar at configured spot
        vrm.scene.position.set(
          CONFIG.avatarX - center.x * scale,
          CONFIG.avatarY - box.min.y * scale,  // Feet on ground
          CONFIG.avatarZ - center.z * scale
        );

        // Enable shadows
        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        // Add directly to scene
        scene.add(vrm.scene);
        
        currentVRM = vrm;
        avatarReady = true;

        // Reset animation timers
        idleTime = 0;
        blinkTimer = 0;
        gestureTimer = 0;
        lookTimer = 0;
        lookTarget = { x: 0, y: 0 };
        currentLook = { x: 0, y: 0 };
        isGesturing = false;

        // Set relaxed pose
        setRelaxedPose(vrm);

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded at position:", vrm.scene.position);
        resolve(vrm);
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total * 100).toFixed(0);
          console.log(`[3D] VRM loading: ${percent}%`);
        }
      },
      (error) => {
        console.error("[3D] VRM load failed:", error);
        if (loadingEl) loadingEl.classList.remove("active");
        reject(error);
      }
    );
  });
}

// ============================================
// LOAD ROOM MODEL
// ============================================
export async function loadRoomModel(glbPath) {
  console.log("[3D] Loading room:", glbPath);

  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.classList.add("active");

  // Remove existing room
  if (currentRoom) {
    scene.remove(currentRoom);
    currentRoom = null;
  }

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      glbPath,
      (gltf) => {
        const room = gltf.scene;

        // Calculate room bounds
        const box = new THREE.Box3().setFromObject(room);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        console.log("[3D] Room original size:", size.x.toFixed(2), "x", size.y.toFixed(2), "x", size.z.toFixed(2));

        // Scale room
        room.scale.setScalar(CONFIG.roomScale);

        // Recalculate after scaling
        box.setFromObject(room);
        const scaledCenter = box.getCenter(new THREE.Vector3());

        // Position room: floor at y=0, centered, pushed back
        room.position.set(
          CONFIG.roomX - scaledCenter.x,
          CONFIG.roomY - box.min.y,
          CONFIG.roomZ - scaledCenter.z
        );

        // Enable shadows and fix materials
        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj.material) {
              obj.material.side = THREE.DoubleSide;
            }
          }
        });

        // Add to scene
        scene.add(room);
        currentRoom = room;
        hasRoomLoaded = true;

        // Keep sky visible for nice background colors
        // Only hide ground if room has its own floor
        // if (fallbackSky) fallbackSky.visible = false;
        // if (fallbackGround) fallbackGround.visible = false;

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Room loaded at position:", room.position);
        resolve(room);
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total * 100).toFixed(0);
          console.log(`[3D] Room loading: ${percent}%`);
        }
      },
      (error) => {
        console.error("[3D] Room load failed:", error);
        if (loadingEl) loadingEl.classList.remove("active");
        useFallbackEnvironment();
        reject(error);
      }
    );
  });
}

// ============================================
// USE FALLBACK ENVIRONMENT
// ============================================
export function useFallbackEnvironment() {
  if (currentRoom) {
    scene.remove(currentRoom);
    currentRoom = null;
  }
  
  hasRoomLoaded = false;
  
  if (fallbackSky) fallbackSky.visible = true;
  if (fallbackGround) fallbackGround.visible = true;
  
  console.log("[3D] ✅ Using fallback environment");
}

// ============================================
// ADJUST CAMERA (for fine-tuning)
// ============================================
export function setCameraPosition(x, y, z) {
  if (camera) {
    camera.position.set(x, y, z);
    camera.lookAt(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ);
  }
}

export function setCameraLookAt(x, y, z) {
  if (camera) {
    camera.lookAt(x, y, z);
  }
}

export function setCameraFOV(fov) {
  if (camera) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ============================================
// ADJUST AVATAR POSITION (for fine-tuning)
// ============================================
export function setAvatarPosition(x, y, z) {
  if (currentVRM) {
    const box = new THREE.Box3().setFromObject(currentVRM.scene);
    currentVRM.scene.position.set(x, y - box.min.y, z);
  }
}

// ============================================
// ADJUST ROOM (for fine-tuning)
// ============================================
export function setRoomPosition(x, y, z) {
  if (currentRoom) {
    const box = new THREE.Box3().setFromObject(currentRoom);
    currentRoom.position.set(x, y - box.min.y, z);
  }
}

export function setRoomScale(scale) {
  if (currentRoom) {
    currentRoom.scale.setScalar(scale);
    // Re-ground after scaling
    const box = new THREE.Box3().setFromObject(currentRoom);
    currentRoom.position.y = -box.min.y;
  }
}

// ============================================
// SET RELAXED POSE
// ============================================
function setRelaxedPose(vrm) {
  if (!vrm?.humanoid) return;

  try {
    const bones = {
      leftUpperArm: vrm.humanoid.getNormalizedBoneNode("leftUpperArm"),
      rightUpperArm: vrm.humanoid.getNormalizedBoneNode("rightUpperArm"),
      leftLowerArm: vrm.humanoid.getNormalizedBoneNode("leftLowerArm"),
      rightLowerArm: vrm.humanoid.getNormalizedBoneNode("rightLowerArm"),
      leftHand: vrm.humanoid.getNormalizedBoneNode("leftHand"),
      rightHand: vrm.humanoid.getNormalizedBoneNode("rightHand"),
    };

    if (bones.leftUpperArm) {
      bones.leftUpperArm.rotation.set(
        baseRotations.leftUpperArm.x,
        baseRotations.leftUpperArm.y,
        baseRotations.leftUpperArm.z
      );
    }
    if (bones.rightUpperArm) {
      bones.rightUpperArm.rotation.set(
        baseRotations.rightUpperArm.x,
        baseRotations.rightUpperArm.y,
        baseRotations.rightUpperArm.z
      );
    }
    if (bones.leftLowerArm) {
      bones.leftLowerArm.rotation.set(
        baseRotations.leftLowerArm.x,
        baseRotations.leftLowerArm.y,
        baseRotations.leftLowerArm.z
      );
    }
    if (bones.rightLowerArm) {
      bones.rightLowerArm.rotation.set(
        baseRotations.rightLowerArm.x,
        baseRotations.rightLowerArm.y,
        baseRotations.rightLowerArm.z
      );
    }

    console.log("[3D] ✅ Relaxed pose applied");
  } catch (e) {
    console.warn("[3D] Pose setup error:", e);
  }
}

// ============================================
// IDLE ANIMATIONS
// ============================================
function updateIdleAnimation(delta) {
  if (!currentVRM || !avatarReady) return;
  idleTime += delta;
  
  updateBreathing();
  updateHeadMovement(delta);
  updateArmMovement();
  updateGestures(delta);
}

function updateBreathing() {
  if (!currentVRM?.humanoid) return;

  const breathCycle = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2);
  const breathOffset = breathCycle * CONFIG.breathingAmount;
  
  const chest = currentVRM.humanoid.getNormalizedBoneNode("chest");
  const upperChest = currentVRM.humanoid.getNormalizedBoneNode("upperChest");
  const spine = currentVRM.humanoid.getNormalizedBoneNode("spine");
  
  if (upperChest) upperChest.rotation.x = breathOffset * 1.5;
  if (chest) chest.rotation.x = breathOffset;
  if (spine) spine.rotation.x = breathOffset * 0.3;
  
  const leftShoulder = currentVRM.humanoid.getNormalizedBoneNode("leftShoulder");
  const rightShoulder = currentVRM.humanoid.getNormalizedBoneNode("rightShoulder");
  
  if (leftShoulder) leftShoulder.position.y = breathCycle * CONFIG.shoulderBreathAmount;
  if (rightShoulder) rightShoulder.position.y = breathCycle * CONFIG.shoulderBreathAmount;
}

function updateHeadMovement(delta) {
  if (!currentVRM?.humanoid) return;

  const head = currentVRM.humanoid.getNormalizedBoneNode("head");
  const neck = currentVRM.humanoid.getNormalizedBoneNode("neck");
  
  if (!head) return;

  lookTimer += delta * 1000;

  if (lookTimer > CONFIG.lookAroundInterval + Math.random() * CONFIG.lookAroundDuration) {
    lookTarget.x = (Math.random() - 0.5) * 2 * CONFIG.lookAmountX;
    lookTarget.y = (Math.random() - 0.5) * 2 * CONFIG.lookAmountY;
    lookTimer = 0;
  }

  if (lookTimer > CONFIG.lookAroundDuration && lookTimer < CONFIG.lookAroundInterval) {
    lookTarget.x *= 0.98;
    lookTarget.y *= 0.98;
  }

  currentLook.x += (lookTarget.x - currentLook.x) * CONFIG.lookSmoothing;
  currentLook.y += (lookTarget.y - currentLook.y) * CONFIG.lookSmoothing;

  head.rotation.y = currentLook.x;
  head.rotation.x = currentLook.y;

  if (neck) {
    neck.rotation.y = currentLook.x * 0.3;
    neck.rotation.x = currentLook.y * 0.25;
  }
}

function updateArmMovement() {
  if (!currentVRM?.humanoid || isGesturing) return;

  const leftUpperArm = currentVRM.humanoid.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = currentVRM.humanoid.getNormalizedBoneNode("rightUpperArm");

  const armSway = Math.sin(idleTime * CONFIG.armSwaySpeed) * CONFIG.armSwayAmount;
  
  if (leftUpperArm) {
    leftUpperArm.rotation.z = baseRotations.leftUpperArm.z + armSway;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = baseRotations.rightUpperArm.z - armSway;
  }
}

function updateGestures(delta) {
  if (!currentVRM?.humanoid) return;

  gestureTimer += delta * 1000;

  if (!isGesturing && gestureTimer > CONFIG.gestureInterval + Math.random() * 5000) {
    isGesturing = true;
    gestureProgress = 0;
    gestureTimer = 0;
    gestureType = Math.floor(Math.random() * 3);
  }

  if (isGesturing) {
    gestureProgress += delta * 1000;
    const progress = gestureProgress / CONFIG.gestureDuration;
    const eased = Math.sin(progress * Math.PI);
    
    const rightUpperArm = currentVRM.humanoid.getNormalizedBoneNode("rightUpperArm");
    const rightLowerArm = currentVRM.humanoid.getNormalizedBoneNode("rightLowerArm");
    const leftUpperArm = currentVRM.humanoid.getNormalizedBoneNode("leftUpperArm");
    
    switch (gestureType) {
      case 0:
        if (rightUpperArm) {
          rightUpperArm.rotation.z = baseRotations.rightUpperArm.z + eased * CONFIG.gestureAmount;
        }
        if (rightLowerArm) {
          rightLowerArm.rotation.y = baseRotations.rightLowerArm.y - eased * CONFIG.gestureAmount;
        }
        break;
      case 1:
        if (leftUpperArm) {
          leftUpperArm.rotation.z = baseRotations.leftUpperArm.z - eased * CONFIG.gestureAmount;
        }
        break;
      case 2:
        if (rightUpperArm) {
          rightUpperArm.rotation.z = baseRotations.rightUpperArm.z + eased * CONFIG.gestureAmount * 0.7;
        }
        if (leftUpperArm) {
          leftUpperArm.rotation.z = baseRotations.leftUpperArm.z - eased * CONFIG.gestureAmount * 0.7;
        }
        break;
    }

    if (gestureProgress >= CONFIG.gestureDuration) {
      isGesturing = false;
    }
  }
}

// ============================================
// BLINKING
// ============================================
function updateBlinking(delta) {
  if (!currentVRM?.expressionManager) return;

  blinkTimer += delta * 1000;

  const interval = CONFIG.blinkInterval + Math.random() * CONFIG.blinkVariation;

  if (blinkTimer >= interval) {
    const expr = currentVRM.expressionManager;
    
    if (expr.expressionMap["blink"]) {
      expr.setValue("blink", 1.0);
      
      setTimeout(() => {
        if (currentVRM?.expressionManager?.expressionMap["blink"]) {
          currentVRM.expressionManager.setValue("blink", 0.0);
          
          if (Math.random() < CONFIG.doubleBinkChance) {
            setTimeout(() => {
              if (currentVRM?.expressionManager?.expressionMap["blink"]) {
                currentVRM.expressionManager.setValue("blink", 1.0);
                setTimeout(() => {
                  if (currentVRM?.expressionManager?.expressionMap["blink"]) {
                    currentVRM.expressionManager.setValue("blink", 0.0);
                  }
                }, CONFIG.blinkDuration);
              }
            }, 150);
          }
        }
      }, CONFIG.blinkDuration);
    }
    
    blinkTimer = 0;
  }
}

// ============================================
// LIP SYNC
// ============================================
function updateLipSync() {
  if (!currentVRM?.expressionManager) return;

  currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * CONFIG.lipSyncSmooth;

  const expr = currentVRM.expressionManager;
  const intensity = CONFIG.lipSyncIntensity;
  
  if (expr.expressionMap["aa"]) {
    expr.setValue("aa", currentMouthOpenness * intensity);
  }
  if (expr.expressionMap["oh"]) {
    expr.setValue("oh", currentMouthOpenness * 0.3 * Math.abs(Math.sin(idleTime * 10)));
  }
  if (expr.expressionMap["ih"]) {
    expr.setValue("ih", currentMouthOpenness * 0.2 * Math.abs(Math.cos(idleTime * 12)));
  }
}

// ============================================
// TALKING CONTROL
// ============================================
export function avatarStartTalking() {
  isTalking = true;
  console.log("[3D] 🗣️ Avatar started talking");
  animateTalking();
}

export function avatarStopTalking() {
  isTalking = false;
  targetMouthOpenness = 0;
  
  if (currentVRM?.expressionManager) {
    const expr = currentVRM.expressionManager;
    ["aa", "oh", "ih", "ou", "ee", "a"].forEach(name => {
      if (expr.expressionMap[name]) expr.setValue(name, 0);
    });
  }
  
  console.log("[3D] 🤐 Avatar stopped talking");
}

function animateTalking() {
  if (!isTalking) {
    targetMouthOpenness = 0;
    return;
  }

  const time = Date.now() * 0.001;
  const variation = 
    Math.sin(time * 8) * 0.2 + 
    Math.sin(time * 13) * 0.15 +
    Math.sin(time * 21) * 0.1 +
    Math.random() * 0.1;
  
  targetMouthOpenness = Math.max(0.1, Math.min(0.85, 0.35 + variation));
  requestAnimationFrame(animateTalking);
}

// ============================================
// SET EXPRESSION
// ============================================
export function setExpression(name, value = 1.0, duration = 0) {
  if (!currentVRM?.expressionManager) return;
  
  const expr = currentVRM.expressionManager;
  if (expr.expressionMap[name]) {
    expr.setValue(name, value);
    
    if (duration > 0) {
      setTimeout(() => {
        if (currentVRM?.expressionManager?.expressionMap[name]) {
          currentVRM.expressionManager.setValue(name, 0);
        }
      }, duration);
    }
  }
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
      updateLipSync();
    }

    currentVRM.update(delta);
  }

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
// CHANGE COLORS (for easy customization)
// ============================================
export function setSkyColors(topColor, midColor, bottomColor) {
  if (fallbackSky && fallbackSky.material.uniforms) {
    if (topColor) fallbackSky.material.uniforms.topColor.value.setHex(topColor);
    if (midColor) fallbackSky.material.uniforms.midColor.value.setHex(midColor);
    if (bottomColor) fallbackSky.material.uniforms.bottomColor.value.setHex(bottomColor);
  }
}

export function setFloorColors(centerColor, edgeColor) {
  if (fallbackGround && fallbackGround.material.uniforms) {
    if (centerColor) fallbackGround.material.uniforms.centerColor.value.setHex(centerColor);
    if (edgeColor) fallbackGround.material.uniforms.edgeColor.value.setHex(edgeColor);
  }
}

// Preset color themes
export function setColorTheme(theme) {
  const themes = {
    lavender: {
      skyTop: 0x9B8AC4,
      skyMid: 0xC4B8D8,
      skyBottom: 0xE8E0F0,
      floorCenter: 0xE8E4EC,
      floorEdge: 0xD0C8D8
    },
    sunset: {
      skyTop: 0x4A3F6B,
      skyMid: 0xC97B84,
      skyBottom: 0xF2D7D9,
      floorCenter: 0xF5E6E8,
      floorEdge: 0xE8D0D4
    },
    ocean: {
      skyTop: 0x1E3A5F,
      skyMid: 0x6B9AC4,
      skyBottom: 0xD4E6F1,
      floorCenter: 0xE8F4F8,
      floorEdge: 0xC8DCE8
    },
    mint: {
      skyTop: 0x4A7C6F,
      skyMid: 0x8FBCB0,
      skyBottom: 0xD8EDE8,
      floorCenter: 0xE8F2EF,
      floorEdge: 0xC8DCD8
    },
    warm: {
      skyTop: 0x8B7355,
      skyMid: 0xC4A882,
      skyBottom: 0xF0E6D8,
      floorCenter: 0xF5EDE0,
      floorEdge: 0xE0D4C4
    },
    pink: {
      skyTop: 0xB76E99,
      skyMid: 0xDBA8C4,
      skyBottom: 0xF8E8F0,
      floorCenter: 0xFAF0F5,
      floorEdge: 0xECD8E4
    }
  };
  
  const t = themes[theme];
  if (t) {
    setSkyColors(t.skyTop, t.skyMid, t.skyBottom);
    setFloorColors(t.floorCenter, t.floorEdge);
    console.log(`[3D] ✅ Theme set: ${theme}`);
  }
}

// ============================================
// CLEANUP
// ============================================
export function dispose3D() {
  console.log("[3D] Disposing scene...");

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (currentVRM) {
    scene.remove(currentVRM.scene);
    VRMUtils.deepDispose(currentVRM.scene);
    currentVRM = null;
  }

  if (currentRoom) {
    scene.remove(currentRoom);
    currentRoom = null;
  }

  if (renderer) {
    renderer.dispose();
    if (renderer.domElement) {
      renderer.domElement.remove();
    }
    renderer = null;
  }

  window.removeEventListener("resize", onResize);
  avatarReady = false;
  hasRoomLoaded = false;
  
  console.log("[3D] ✅ Disposed");
}

// ============================================
// UTILITY EXPORTS
// ============================================
export function isAvatarReady() { return avatarReady; }
export function getVRM() { return currentVRM; }
export function getScene() { return scene; }
export function hasRoom() { return hasRoomLoaded; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getConfig() { return CONFIG; }