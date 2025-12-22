// ============================================
// threejs-avatar-3d.js - REPLIKA ULTIMATE
// Vanakkam greeting, fixed wave, ultra lively
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

// Talking gesture state
let talkingGestureTimer = 0;
let currentTalkingGesture = -1;

// Special animation states
let isWaving = false;
let waveProgress = 0;
let isVanakkam = false;  // Renamed from isNamaste
let vanakkamProgress = 0;
let isNodding = false;
let nodProgress = 0;

// Store base rotations
let baseRotations = {
  leftUpperArm: { x: 0.2, y: 0, z: 1.0 },
  rightUpperArm: { x: 0.2, y: 0, z: -1.0 },
  leftLowerArm: { x: 0, y: -0.2, z: 0 },
  rightLowerArm: { x: 0, y: 0.2, z: 0 },
  leftHand: { x: 0, y: 0, z: 0.1 },
  rightHand: { x: 0, y: 0, z: -0.1 },
};

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  // ===== AVATAR =====
  avatarHeight: 1.45,
  
  // ===== CAMERA =====
  cameraX: 0,
  cameraY: 1.4,
  cameraZ: 2.5,
  lookAtX: 0,
  lookAtY: 0.9,
  lookAtZ: 0,
  cameraFOV: 50,
  
  // ===== AVATAR POSITION =====
  avatarX: 0,
  avatarY: 0,
  avatarZ: 0.5,
  
  // ===== ROOM =====
  roomScale: 1.1,
  roomX: 0,
  roomY: -0.2,
  roomZ: -2,
  
  // ===== COLORS =====
  skyTopColor: 0x9B8AC4,
  skyMidColor: 0xC4B8D8,
  skyBottomColor: 0xE8E0F0,
  floorCenterColor: 0xE2DEE9,
  floorEdgeColor: 0xC5BCD4,
  
  // ===== BREATHING =====
  breathingSpeed: 0.5,
  breathingAmount: 0.004,
  shoulderBreathAmount: 0.002,
  
  // ===== HEAD/LOOK =====
  lookAtViewerChance: 0.75,
  lookAwayInterval: 4000,
  lookAwayDuration: 1500,
  lookAmountX: 0.12,
  lookAmountY: 0.08,
  lookSmoothing: 0.06,
  headTiltAmount: 0.06,
  
  // ===== ARM SWAY =====
  armSwayAmount: 0.01,
  armSwaySpeed: 0.35,
  
  // ===== IDLE GESTURES =====
  gestureInterval: 9000,
  gestureDuration: 1600,
  gestureAmount: 0.16,
  
  // ===== TALKING GESTURES =====
  talkingGestureInterval: 1800,
  talkingGestureAmount: 0.24,
  talkingGestureDuration: 950,
  
  // ===== WAVE =====
  waveDuration: 2200,
  waveAmount: 0.55,
  waveSpeed: 15,
  
  // ===== VANAKKAM (Namaste) =====
  vanakkamDuration: 3000,
  vanakkamBowAmount: 0.25,
  
  // ===== NOD =====
  nodDuration: 600,
  nodAmount: 0.12,
  
  // ===== BLINK =====
  blinkInterval: 2800,
  blinkVariation: 2200,
  blinkDuration: 110,
  doubleBinkChance: 0.3,
  
  // ===== LIP SYNC =====
  lipSyncSmooth: 0.16,
  lipSyncIntensity: 0.85,
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
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  
  createFallbackEnvironment();
  
  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  
  camera.position.set(CONFIG.cameraX, CONFIG.cameraY, CONFIG.cameraZ);
  camera.lookAt(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ);
  
  setupLights();

  window.addEventListener("resize", onResize, { passive: true });

  animate();

  console.log("[3D] ✅ Scene initialized");
  return true;
}

// ============================================
// CREATE FALLBACK ENVIRONMENT
// ============================================
function createFallbackEnvironment() {
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
          color = mix(midColor, topColor, smoothstep(0.0, 0.8, h));
        } else {
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
  fallbackSky.visible = true;
  scene.add(fallbackSky);

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
        float dist = distance(vUv, avatarPos);
        float gradient = smoothstep(0.0, 0.5, dist);
        vec3 color = mix(centerColor, edgeColor, gradient);
        float vignette = smoothstep(0.7, 1.0, dist) * 0.15;
        color = mix(color, edgeColor * 0.9, vignette);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  
  fallbackGround = new THREE.Mesh(groundGeo, groundMat);
  fallbackGround.rotation.x = -Math.PI / 2;
  fallbackGround.position.y = -0.01;
  fallbackGround.receiveShadow = true;
  fallbackGround.name = "fallbackGround";
  fallbackGround.visible = true;
  scene.add(fallbackGround);
  
  console.log("[3D] ✅ Environment created");
}

// ============================================
// SETUP LIGHTING
// ============================================
function setupLights() {
  const lightsToRemove = [];
  scene.traverse((obj) => {
    if (obj.isLight) lightsToRemove.push(obj);
  });
  lightsToRemove.forEach(l => scene.remove(l));

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

  const fillLight = new THREE.DirectionalLight(0xFFE4EC, 0.4);
  fillLight.position.set(-4, 3, 2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xE4E4FF, 0.3);
  rimLight.position.set(0, 4, -4);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xC9B8E8, 0xE8D4E8, 0.5);
  scene.add(hemi);
  
  console.log("[3D] ✅ Lighting setup");
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
          console.error("[3D] No VRM data");
          if (loadingEl) loadingEl.classList.remove("active");
          reject(new Error("No VRM data"));
          return;
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        vrm.scene.rotation.y = Math.PI;

        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const scale = CONFIG.avatarHeight / size.y;
        vrm.scene.scale.setScalar(scale);

        vrm.scene.position.set(
          CONFIG.avatarX - center.x * scale,
          CONFIG.avatarY - box.min.y * scale,
          CONFIG.avatarZ - center.z * scale
        );

        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        scene.add(vrm.scene);
        
        currentVRM = vrm;
        avatarReady = true;

        // Reset all timers
        idleTime = 0;
        blinkTimer = 0;
        gestureTimer = 0;
        lookTimer = 0;
        talkingGestureTimer = 0;
        lookTarget = { x: 0, y: 0 };
        currentLook = { x: 0, y: 0 };
        isGesturing = false;
        isWaving = false;
        isVanakkam = false;
        isNodding = false;
        currentTalkingGesture = -1;

        setRelaxedPose(vrm);

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded");
        
        // ✨ VANAKKAM GREETING ON LOAD
        setTimeout(() => {
          if (avatarReady) triggerVanakkam();
        }, 350);
        
        resolve(vrm);
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total * 100).toFixed(0);
          console.log(`[3D] Loading: ${percent}%`);
        }
      },
      (error) => {
        console.error("[3D] Load failed:", error);
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

        const box = new THREE.Box3().setFromObject(room);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        console.log("[3D] Room size:", size.x.toFixed(2), "x", size.y.toFixed(2), "x", size.z.toFixed(2));

        room.scale.setScalar(CONFIG.roomScale);

        box.setFromObject(room);
        const scaledCenter = box.getCenter(new THREE.Vector3());

        room.position.set(
          CONFIG.roomX - scaledCenter.x,
          CONFIG.roomY - box.min.y,
          CONFIG.roomZ - scaledCenter.z
        );

        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj.material) {
              obj.material.side = THREE.DoubleSide;
            }
          }
        });

        scene.add(room);
        currentRoom = room;
        hasRoomLoaded = true;

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Room loaded");
        resolve(room);
      },
      undefined,
      (error) => {
        console.error("[3D] Room failed:", error);
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
  
  console.log("[3D] ✅ Using fallback");
}

// ============================================
// CAMERA CONTROLS
// ============================================
export function setCameraPosition(x, y, z) {
  if (camera) {
    camera.position.set(x, y, z);
    camera.lookAt(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ);
  }
}

export function setCameraLookAt(x, y, z) {
  if (camera) camera.lookAt(x, y, z);
}

export function setCameraFOV(fov) {
  if (camera) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ============================================
// POSITION CONTROLS
// ============================================
export function setAvatarPosition(x, y, z) {
  if (currentVRM) {
    const box = new THREE.Box3().setFromObject(currentVRM.scene);
    currentVRM.scene.position.set(x, y - box.min.y, z);
  }
}

export function setRoomPosition(x, y, z) {
  if (currentRoom) {
    const box = new THREE.Box3().setFromObject(currentRoom);
    currentRoom.position.set(x, y - box.min.y, z);
  }
}

export function setRoomScale(scale) {
  if (currentRoom) {
    currentRoom.scale.setScalar(scale);
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
    const get = (name) => vrm.humanoid.getNormalizedBoneNode(name);
    
    const lUA = get("leftUpperArm");
    const rUA = get("rightUpperArm");
    const lLA = get("leftLowerArm");
    const rLA = get("rightLowerArm");

    if (lUA) lUA.rotation.set(baseRotations.leftUpperArm.x, baseRotations.leftUpperArm.y, baseRotations.leftUpperArm.z);
    if (rUA) rUA.rotation.set(baseRotations.rightUpperArm.x, baseRotations.rightUpperArm.y, baseRotations.rightUpperArm.z);
    if (lLA) lLA.rotation.set(baseRotations.leftLowerArm.x, baseRotations.leftLowerArm.y, baseRotations.leftLowerArm.z);
    if (rLA) rLA.rotation.set(baseRotations.rightLowerArm.x, baseRotations.rightLowerArm.y, baseRotations.rightLowerArm.z);

    console.log("[3D] ✅ Relaxed pose");
  } catch (e) {
    console.warn("[3D] Pose error:", e);
  }
}

// ============================================
// 🙏 VANAKKAM GREETING (Enhanced Namaste)
// ============================================
export function triggerVanakkam() {
  if (!avatarReady || isVanakkam || isWaving) return;
  isVanakkam = true;
  vanakkamProgress = 0;
  console.log("[3D] 🙏 Vanakkam!");
}

function updateVanakkamAnimation(delta) {
  if (!isVanakkam || !currentVRM?.humanoid) return;
  
  vanakkamProgress += delta * 1000;
  const duration = CONFIG.vanakkamDuration;
  const progress = Math.min(vanakkamProgress / duration, 1);
  
  // Enhanced phases: raise(0-0.25), hold+bow(0.25-0.65), nod(0.65-0.75), return(0.75-1.0)
  let handAmount, bowAmount, nodAmount = 0;
  
  if (progress < 0.25) {
    // Raise hands smoothly to chest
    handAmount = easeOutCubic(progress / 0.25);
    bowAmount = 0;
  } else if (progress < 0.65) {
    // Hold hands, deep bow
    handAmount = 1;
    const bowProg = (progress - 0.25) / 0.4;
    bowAmount = Math.sin(bowProg * Math.PI) * CONFIG.vanakkamBowAmount;
  } else if (progress < 0.75) {
    // Quick double nod while hands together
    handAmount = 1;
    bowAmount = CONFIG.vanakkamBowAmount * 0.3;  // Slight bow maintained
    const nodProg = (progress - 0.65) / 0.1;
    nodAmount = Math.sin(nodProg * Math.PI * 4) * 0.08;  // 2 quick nods
  } else {
    // Return smoothly to normal
    handAmount = 1 - easeInCubic((progress - 0.75) / 0.25);
    bowAmount = 0;
    nodAmount = 0;
  }
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  
  const lUA = get("leftUpperArm");
  const rUA = get("rightUpperArm");
  const lLA = get("leftLowerArm");
  const rLA = get("rightLowerArm");
  const lH = get("leftHand");
  const rH = get("rightHand");
  const spine = get("spine");
  const chest = get("chest");
  const head = get("head");
  const hips = get("hips");
  
  // Arms forward and together (palms meeting)
  if (lUA) {
    lUA.rotation.x = baseRotations.leftUpperArm.x - handAmount * 0.7;  // Forward
    lUA.rotation.z = baseRotations.leftUpperArm.z - handAmount * 0.6;  // Inward to center
    lUA.rotation.y = handAmount * 0.15;  // Slight twist inward
  }
  if (rUA) {
    rUA.rotation.x = baseRotations.rightUpperArm.x - handAmount * 0.7;
    rUA.rotation.z = baseRotations.rightUpperArm.z + handAmount * 0.6;
    rUA.rotation.y = -handAmount * 0.15;
  }
  
  // Forearms bring hands to chest center
  if (lLA) {
    lLA.rotation.y = baseRotations.leftLowerArm.y - handAmount * 1.5;  // Bend elbow
    lLA.rotation.z = handAmount * 0.25;  // Angle inward
    lLA.rotation.x = -handAmount * 0.1;
  }
  if (rLA) {
    rLA.rotation.y = baseRotations.rightLowerArm.y + handAmount * 1.5;
    rLA.rotation.z = -handAmount * 0.25;
    rLA.rotation.x = -handAmount * 0.1;
  }
  
  // Hands press together (prayer position)
  if (lH) {
    lH.rotation.z = -handAmount * 0.4;  // Rotate to flat palm
    lH.rotation.y = handAmount * 0.2;   // Slight twist
  }
  if (rH) {
    rH.rotation.z = handAmount * 0.4;
    rH.rotation.y = -handAmount * 0.2;
  }
  
  // Deep respectful bow
  if (spine) spine.rotation.x = bowAmount * 0.6;
  if (chest) chest.rotation.x = bowAmount * 0.4;
  if (head) head.rotation.x = bowAmount * 0.5 + nodAmount;  // Bow + nod
  if (hips) hips.rotation.x = bowAmount * 0.15;  // Slight hip tilt for natural bow
  
  // End animation
  if (progress >= 1) {
    isVanakkam = false;
    // Reset all to base
    if (lUA) lUA.rotation.set(baseRotations.leftUpperArm.x, baseRotations.leftUpperArm.y, baseRotations.leftUpperArm.z);
    if (rUA) rUA.rotation.set(baseRotations.rightUpperArm.x, baseRotations.rightUpperArm.y, baseRotations.rightUpperArm.z);
    if (lLA) lLA.rotation.set(baseRotations.leftLowerArm.x, baseRotations.leftLowerArm.y, baseRotations.leftLowerArm.z);
    if (rLA) rLA.rotation.set(baseRotations.rightLowerArm.x, baseRotations.rightLowerArm.y, baseRotations.rightLowerArm.z);
    if (lH) lH.rotation.set(0, 0, baseRotations.leftHand.z);
    if (rH) rH.rotation.set(0, 0, baseRotations.rightHand.z);
    if (spine) spine.rotation.x = 0;
    if (chest) chest.rotation.x = 0;
    if (hips) hips.rotation.x = 0;
    
    console.log("[3D] ✅ Vanakkam complete!");
  }
}

// ============================================
// 👋 WAVE - FIXED TOWARD USER
// ============================================
export function triggerWave() {
  if (!avatarReady || isWaving || isVanakkam) return;
  isWaving = true;
  waveProgress = 0;
  console.log("[3D] 👋 Waving!");
}

function updateWaveAnimation(delta) {
  if (!isWaving || !currentVRM?.humanoid) return;
  
  waveProgress += delta * 1000;
  const duration = CONFIG.waveDuration;
  const progress = Math.min(waveProgress / duration, 1);
  
  // Phases: raise(0-0.2), wave(0.2-0.85), lower(0.85-1.0)
  let raiseAmount;
  if (progress < 0.2) {
    raiseAmount = easeOutCubic(progress / 0.2);
  } else if (progress < 0.85) {
    raiseAmount = 1;
  } else {
    raiseAmount = 1 - easeInCubic((progress - 0.85) / 0.15);
  }
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  
  const rUA = get("rightUpperArm");
  const rLA = get("rightLowerArm");
  const rH = get("rightHand");
  
  // ✅ FIXED: Arm moves TOWARD user (positive X = forward)
  if (rUA) {
    rUA.rotation.x = baseRotations.rightUpperArm.x - raiseAmount * 1.0;  // Forward toward camera
    rUA.rotation.z = baseRotations.rightUpperArm.z + raiseAmount * 0.7;  // Up and out
    rUA.rotation.y = raiseAmount * 0.25;  // Twist slightly toward viewer
  }
  
  if (rLA) {
    rLA.rotation.y = baseRotations.rightLowerArm.y - raiseAmount * 0.9;  // Bend elbow
    rLA.rotation.x = -raiseAmount * 0.4;  // Forearm forward toward camera
  }
  
  // ✅ FIXED: Hand waves side-to-side FACING viewer
  if (rH && progress > 0.15 && progress < 0.9) {
    const waveTime = waveProgress * 0.001 * CONFIG.waveSpeed;
    rH.rotation.y = Math.sin(waveTime) * CONFIG.waveAmount;  // Side-to-side
    rH.rotation.x = -0.25;  // Palm faces viewer
    rH.rotation.z = Math.cos(waveTime * 0.5) * 0.1;  // Slight wrist rotation
  }
  
  // End
  if (progress >= 1) {
    isWaving = false;
    if (rUA) rUA.rotation.set(baseRotations.rightUpperArm.x, baseRotations.rightUpperArm.y, baseRotations.rightUpperArm.z);
    if (rLA) rLA.rotation.set(baseRotations.rightLowerArm.x, baseRotations.rightLowerArm.y, baseRotations.rightLowerArm.z);
    if (rH) rH.rotation.set(0, 0, baseRotations.rightHand.z);
  }
}

// ============================================
// 😊 NOD
// ============================================
export function triggerNod() {
  if (!avatarReady || isNodding) return;
  isNodding = true;
  nodProgress = 0;
  console.log("[3D] 😊 Nodding!");
}

function updateNodAnimation(delta) {
  if (!isNodding || !currentVRM?.humanoid) return;
  
  nodProgress += delta * 1000;
  const progress = Math.min(nodProgress / CONFIG.nodDuration, 1);
  
  const nodAmount = Math.sin(progress * Math.PI * 2) * CONFIG.nodAmount;
  
  const head = currentVRM.humanoid.getNormalizedBoneNode("head");
  if (head) {
    head.rotation.x = currentLook.y + nodAmount;
  }
  
  if (progress >= 1) {
    isNodding = false;
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
  
  // Skip arm animations during special animations
  if (!isWaving && !isVanakkam) {
    if (isTalking) {
      updateTalkingGestures(delta);
    } else {
      updateArmMovement();
      updateGestures(delta);
    }
  }
}

// ============================================
// BREATHING
// ============================================
function updateBreathing() {
  if (!currentVRM?.humanoid) return;

  const breathCycle = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2);
  const breathOffset = breathCycle * CONFIG.breathingAmount;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  
  const chest = get("chest");
  const upperChest = get("upperChest");
  const spine = get("spine");
  
  // Only apply if not in Vanakkam
  if (!isVanakkam) {
    if (upperChest) upperChest.rotation.x = breathOffset * 1.5;
    if (chest) chest.rotation.x = breathOffset;
    if (spine) spine.rotation.x = breathOffset * 0.3;
  }
  
  const leftShoulder = get("leftShoulder");
  const rightShoulder = get("rightShoulder");
  
  if (leftShoulder) leftShoulder.position.y = breathCycle * CONFIG.shoulderBreathAmount;
  if (rightShoulder) rightShoulder.position.y = breathCycle * CONFIG.shoulderBreathAmount;
}

// ============================================
// HEAD MOVEMENT
// ============================================
function updateHeadMovement(delta) {
  if (!currentVRM?.humanoid || isVanakkam) return;

  const head = currentVRM.humanoid.getNormalizedBoneNode("head");
  const neck = currentVRM.humanoid.getNormalizedBoneNode("neck");
  
  if (!head) return;

  lookTimer += delta * 1000;

  if (lookTimer > CONFIG.lookAwayInterval + Math.random() * 2000) {
    if (Math.random() < CONFIG.lookAtViewerChance) {
      lookTarget.x = (Math.random() - 0.5) * 0.04;
      lookTarget.y = (Math.random() - 0.5) * 0.03;
    } else {
      lookTarget.x = (Math.random() - 0.5) * 2 * CONFIG.lookAmountX;
      lookTarget.y = (Math.random() - 0.5) * 2 * CONFIG.lookAmountY;
    }
    lookTimer = 0;
  }

  if (lookTimer > CONFIG.lookAwayDuration && Math.abs(lookTarget.x) > 0.05) {
    lookTarget.x *= 0.95;
    lookTarget.y *= 0.95;
  }

  currentLook.x += (lookTarget.x - currentLook.x) * CONFIG.lookSmoothing;
  currentLook.y += (lookTarget.y - currentLook.y) * CONFIG.lookSmoothing;

  if (!isNodding) {
    head.rotation.y = currentLook.x;
    head.rotation.x = currentLook.y;
    head.rotation.z = Math.sin(idleTime * 0.3) * CONFIG.headTiltAmount;
  }

  if (neck) {
    neck.rotation.y = currentLook.x * 0.3;
    neck.rotation.x = currentLook.y * 0.25;
  }
}

// ============================================
// ARM MOVEMENT
// ============================================
function updateArmMovement() {
  if (!currentVRM?.humanoid || isGesturing) return;

  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  const lUA = get("leftUpperArm");
  const rUA = get("rightUpperArm");

  const armSway = Math.sin(idleTime * CONFIG.armSwaySpeed) * CONFIG.armSwayAmount;
  
  if (lUA) lUA.rotation.z = baseRotations.leftUpperArm.z + armSway;
  if (rUA) rUA.rotation.z = baseRotations.rightUpperArm.z - armSway;
}

// ============================================
// IDLE GESTURES
// ============================================
function updateGestures(delta) {
  if (!currentVRM?.humanoid) return;

  gestureTimer += delta * 1000;

  if (!isGesturing && gestureTimer > CONFIG.gestureInterval + Math.random() * 5000) {
    isGesturing = true;
    gestureProgress = 0;
    gestureTimer = 0;
    gestureType = Math.floor(Math.random() * 5);  // 5 types now
  }

  if (isGesturing) {
    gestureProgress += delta * 1000;
    const progress = gestureProgress / CONFIG.gestureDuration;
    const eased = Math.sin(progress * Math.PI);
    
    const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
    const rUA = get("rightUpperArm");
    const rLA = get("rightLowerArm");
    const lUA = get("leftUpperArm");
    const lLA = get("leftLowerArm");
    
    const amt = CONFIG.gestureAmount * eased;
    
    switch (gestureType) {
      case 0: // Right arm lift
        if (rUA) {
          rUA.rotation.z = baseRotations.rightUpperArm.z + amt;
          rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.3;
        }
        break;
      case 1: // Left arm lift
        if (lUA) {
          lUA.rotation.z = baseRotations.leftUpperArm.z - amt;
          lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.3;
        }
        break;
      case 2: // Both arms
        if (rUA) rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.7;
        if (lUA) lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.7;
        break;
      case 3: // Thinking (hand toward chin)
        if (rUA) {
          rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.5;
          rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.3;
        }
        if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.8;
        break;
      case 4: // Stretch (both arms up slightly)
        if (rUA) {
          rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.2;
          rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.4;
        }
        if (lUA) {
          lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.2;
          lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.4;
        }
        break;
    }

    if (gestureProgress >= CONFIG.gestureDuration) {
      isGesturing = false;
    }
  }
}

// ============================================
// TALKING GESTURES (Enhanced - 8 types now!)
// ============================================
function updateTalkingGestures(delta) {
  if (!currentVRM?.humanoid || !isTalking) return;
  
  talkingGestureTimer += delta * 1000;
  
  if (currentTalkingGesture === -1 || talkingGestureTimer > CONFIG.talkingGestureInterval) {
    currentTalkingGesture = Math.floor(Math.random() * 8);  // 8 types!
    talkingGestureTimer = 0;
    gestureProgress = 0;
  }
  
  gestureProgress += delta * 1000;
  const duration = CONFIG.talkingGestureDuration;
  
  let intensity;
  if (gestureProgress < duration * 0.2) {
    intensity = easeOutCubic(gestureProgress / (duration * 0.2));
  } else if (gestureProgress < duration * 0.6) {
    intensity = 1;
  } else if (gestureProgress < duration) {
    intensity = 1 - easeInCubic((gestureProgress - duration * 0.6) / (duration * 0.4));
  } else {
    intensity = 0;
  }
  
  applyTalkingGesture(intensity);
}

function applyTalkingGesture(intensity) {
  if (!currentVRM?.humanoid) return;
  
  const get = (name) => currentVRM.humanoid.getNormalizedBoneNode(name);
  
  const rUA = get("rightUpperArm");
  const rLA = get("rightLowerArm");
  const rH = get("rightHand");
  const lUA = get("leftUpperArm");
  const lLA = get("leftLowerArm");
  const lH = get("leftHand");
  
  const amt = CONFIG.talkingGestureAmount * intensity;
  const v = Math.sin(idleTime * 4.5) * 0.035;  // Dynamic variation
  
  switch (currentTalkingGesture) {
    case 0: // Right emphasis - forward toward viewer
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.6;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.7;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.5;
      if (rH) rH.rotation.x = -amt * 0.25 + v;
      break;
      
    case 1: // Left emphasis
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.6;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.7;
      }
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.5;
      if (lH) lH.rotation.x = -amt * 0.25 + v;
      break;
      
    case 2: // Both hands open - welcoming
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.4;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.6;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.4;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.6;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.3;
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.3;
      break;
      
    case 3: // Point forward (emphatic)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.8;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.3;
      }
      if (rLA) {
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.6;
        rLA.rotation.x = -amt * 0.25;
      }
      break;
      
    case 4: // Hands together (thoughtful explaining)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.45;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.35;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.45;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.35;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.65;
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.65;
      break;
      
    case 5: // Reach toward viewer (engaging)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.7;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.25;
      }
      if (rLA) {
        rLA.rotation.x = -amt * 0.3;
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.45;
      }
      if (rH) rH.rotation.x = -amt * 0.35;
      break;
      
    case 6: // Shrug (both shoulders)
      const lS = get("leftShoulder");
      const rS = get("rightShoulder");
      if (lS) lS.position.y = amt * 0.018;
      if (rS) rS.position.y = amt * 0.018;
      if (rUA) rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.18;
      if (lUA) lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.18;
      break;
      
    case 7: // Counting/listing (alternating hands)
      const altTime = Math.sin(idleTime * 6);
      if (altTime > 0) {
        if (rUA) {
          rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.5;
          rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.4;
        }
      } else {
        if (lUA) {
          lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.5;
          lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.4;
        }
      }
      break;
  }
}

// Easing functions
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }

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
            }, 140);
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
  
  if (expr.expressionMap["aa"]) expr.setValue("aa", currentMouthOpenness * intensity);
  if (expr.expressionMap["oh"]) expr.setValue("oh", currentMouthOpenness * 0.32 * Math.abs(Math.sin(idleTime * 10.5)));
  if (expr.expressionMap["ih"]) expr.setValue("ih", currentMouthOpenness * 0.22 * Math.abs(Math.cos(idleTime * 12.5)));
}

// ============================================
// TALKING CONTROL
// ============================================
export function avatarStartTalking() {
  isTalking = true;
  currentTalkingGesture = -1;
  talkingGestureTimer = 0;
  console.log("[3D] 🗣️ Talking");
  animateTalking();
}

export function avatarStopTalking() {
  isTalking = false;
  targetMouthOpenness = 0;
  currentTalkingGesture = -1;
  
  if (currentVRM?.expressionManager) {
    const expr = currentVRM.expressionManager;
    ["aa", "oh", "ih", "ou", "ee", "a"].forEach(name => {
      if (expr.expressionMap[name]) expr.setValue(name, 0);
    });
  }
  
  console.log("[3D] 🤐 Stopped");
}

function animateTalking() {
  if (!isTalking) {
    targetMouthOpenness = 0;
    return;
  }

  const time = Date.now() * 0.001;
  const variation = 
    Math.sin(time * 8.2) * 0.21 + 
    Math.sin(time * 13.7) * 0.16 +
    Math.sin(time * 21.3) * 0.11 +
    Math.random() * 0.12;
  
  targetMouthOpenness = Math.max(0.12, Math.min(0.88, 0.38 + variation));
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
    updateWaveAnimation(delta);
    updateVanakkamAnimation(delta);  // Vanakkam!
    updateNodAnimation(delta);
    
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
// COLOR CUSTOMIZATION
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

export function setColorTheme(theme) {
  const themes = {
    lavender: { skyTop: 0x9B8AC4, skyMid: 0xC4B8D8, skyBottom: 0xE8E0F0, floorCenter: 0xE8E4EC, floorEdge: 0xD0C8D8 },
    sunset: { skyTop: 0x4A3F6B, skyMid: 0xC97B84, skyBottom: 0xF2D7D9, floorCenter: 0xF5E6E8, floorEdge: 0xE8D0D4 },
    ocean: { skyTop: 0x1E3A5F, skyMid: 0x6B9AC4, skyBottom: 0xD4E6F1, floorCenter: 0xE8F4F8, floorEdge: 0xC8DCE8 },
    mint: { skyTop: 0x4A7C6F, skyMid: 0x8FBCB0, skyBottom: 0xD8EDE8, floorCenter: 0xE8F2EF, floorEdge: 0xC8DCD8 },
    warm: { skyTop: 0x8B7355, skyMid: 0xC4A882, skyBottom: 0xF0E6D8, floorCenter: 0xF5EDE0, floorEdge: 0xE0D4C4 },
    pink: { skyTop: 0xB76E99, skyMid: 0xDBA8C4, skyBottom: 0xF8E8F0, floorCenter: 0xFAF0F5, floorEdge: 0xECD8E4 }
  };
  
  const t = themes[theme];
  if (t) {
    setSkyColors(t.skyTop, t.skyMid, t.skyBottom);
    setFloorColors(t.floorCenter, t.floorEdge);
    console.log(`[3D] ✅ Theme: ${theme}`);
  }
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

  if (currentRoom) {
    scene.remove(currentRoom);
    currentRoom = null;
  }

  if (renderer) {
    renderer.dispose();
    if (renderer.domElement) renderer.domElement.remove();
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

// ============================================
// 🎉 COMPLETION LOG
// ============================================
console.log("[3D] ✅ Vanakkam + Fixed Wave + Ultra Lively Complete!");
