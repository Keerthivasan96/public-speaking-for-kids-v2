// ============================================
// threejs-avatar-3d.js - DEMO READY
// Super lively Replika-style animations
// All gestures face TOWARD the user
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

// Body sway
let swayTime = 0;

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
let talkingGestureProgress = 0;

// Special animations
let isWaving = false;
let waveProgress = 0;
let isNodding = false;
let nodProgress = 0;
let isHeadTilting = false;
let headTiltProgress = 0;
let headTiltDirection = 1;

// Emotion state
let currentEmotion = "neutral";
let emotionIntensity = 0;

// Base rotations (arms naturally at sides, slightly forward)
const baseRotations = {
  leftUpperArm: { x: 0.15, y: 0, z: 0.8 },
  rightUpperArm: { x: 0.15, y: 0, z: 0.8 },
  leftLowerArm: { x: 0, y: -0.1, z: 0 },
  rightLowerArm: { x: 0, y: 0.1, z: 0 },
  leftHand: { x: 0, y: 0, z: 0 },
  rightHand: { x: 0, y: 0, z: 0 },
};

// ============================================
// CONFIGURATION - LIVELY SETTINGS
// ============================================
const CONFIG = {
  // Avatar
  avatarHeight: 1.45,
  
  // Camera
  cameraX: 0,
  cameraY: 1.4,
  cameraZ: 2.5,
  lookAtX: 0,
  lookAtY: 0.9,
  lookAtZ: 0,
  cameraFOV: 50,
  
  // Avatar position
  avatarX: 0,
  avatarY: 0,
  avatarZ: 0.5,
  
  // Room
  roomScale: 1.1,
  roomX: 0,
  roomY: -0.2,
  roomZ: -2,
  
  // Colors
  skyTopColor: 0x9B8AC4,
  skyMidColor: 0xC4B8D8,
  skyBottomColor: 0xE8E0F0,
  floorCenterColor: 0xE2DEE9,
  floorEdgeColor: 0xC5BCD4,
  
  // Breathing - subtle but visible
  breathingSpeed: 0.6,
  breathingAmount: 0.006,
  shoulderBreathAmount: 0.003,
  
  // Body sway - makes it feel alive
  bodySwaySpeed: 0.25,
  bodySwayAmount: 0.008,
  hipSwayAmount: 0.003,
  
  // Head - very active, engaged with user
  lookAtViewerChance: 0.85,      // 85% look at user
  lookAwayInterval: 3000,
  lookAwayDuration: 800,
  lookAmountX: 0.15,
  lookAmountY: 0.1,
  lookSmoothing: 0.08,           // Faster response
  headTiltAmount: 0.06,
  headTiltSpeed: 0.4,
  
  // Random head tilts (curious/interested)
  headTiltInterval: 6000,
  headTiltDuration: 1500,
  headTiltMax: 0.12,
  
  // Arm sway (idle)
  armSwayAmount: 0.012,
  armSwaySpeed: 0.35,
  
  // Idle gestures - more frequent
  gestureInterval: 6000,
  gestureDuration: 1500,
  gestureAmount: 0.18,
  
  // Talking gestures - very expressive
  talkingGestureInterval: 1500,
  talkingGestureAmount: 0.28,
  talkingGestureDuration: 800,
  
  // Wave
  waveDuration: 1800,
  waveAmount: 0.6,
  waveSpeed: 16,
  
  // Nod
  nodDuration: 500,
  nodAmount: 0.12,
  nodCount: 2,
  
  // Blink - natural frequency
  blinkInterval: 2500,
  blinkVariation: 1500,
  blinkDuration: 100,
  doubleBinkChance: 0.3,
  
  // Lip sync
  lipSyncSmooth: 0.18,
  lipSyncIntensity: 0.85,
  
  // Expressions while talking
  talkingSmileAmount: 0.15,
};

// ============================================
// EASING FUNCTIONS
// ============================================
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutBack(t) { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function easeOutElastic(t) { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; }

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

  console.log("[3D] ✅ Scene ready!");
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
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  
  fallbackGround = new THREE.Mesh(groundGeo, groundMat);
  fallbackGround.rotation.x = -Math.PI / 2;
  fallbackGround.position.y = -0.01;
  fallbackGround.receiveShadow = true;
  fallbackGround.visible = true;
  scene.add(fallbackGround);
}

// ============================================
// SETUP LIGHTING
// ============================================
function setupLights() {
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.9);
  mainLight.position.set(3, 6, 4);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  scene.add(mainLight);

  scene.add(new THREE.DirectionalLight(0xFFE4EC, 0.4).translateX(-4).translateY(3).translateZ(2));
  scene.add(new THREE.DirectionalLight(0xE4E4FF, 0.3).translateY(4).translateZ(-4));
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  scene.add(new THREE.HemisphereLight(0xC9B8E8, 0xE8D4E8, 0.5));
}

// ============================================
// LOAD VRM AVATAR
// ============================================
export async function loadVRMAvatar(vrmPath) {
  console.log("[3D] Loading:", vrmPath);

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

        // Reset everything
        resetAnimationState();
        setRelaxedPose(vrm);

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Avatar ready!");
        
        // Friendly wave on load!
        setTimeout(() => {
          if (avatarReady) {
            triggerWave();
            // Also do a happy expression
            setExpression("happy", 0.5, 2000);
          }
        }, 300);
        
        resolve(vrm);
      },
      undefined,
      (error) => {
        if (loadingEl) loadingEl.classList.remove("active");
        reject(error);
      }
    );
  });
}

function resetAnimationState() {
  idleTime = 0;
  swayTime = 0;
  blinkTimer = 0;
  gestureTimer = 0;
  lookTimer = 0;
  talkingGestureTimer = 0;
  lookTarget = { x: 0, y: 0 };
  currentLook = { x: 0, y: 0 };
  isGesturing = false;
  isWaving = false;
  isNodding = false;
  isHeadTilting = false;
  currentTalkingGesture = -1;
  currentEmotion = "neutral";
  emotionIntensity = 0;
}

// ============================================
// LOAD ROOM MODEL
// ============================================
export async function loadRoomModel(glbPath) {
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
        room.scale.setScalar(CONFIG.roomScale);
        
        const box = new THREE.Box3().setFromObject(room);
        const center = box.getCenter(new THREE.Vector3());
        
        room.position.set(
          CONFIG.roomX - center.x,
          CONFIG.roomY - box.min.y,
          CONFIG.roomZ - center.z
        );

        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj.material) obj.material.side = THREE.DoubleSide;
          }
        });

        scene.add(room);
        currentRoom = room;
        hasRoomLoaded = true;
        console.log("[3D] ✅ Room loaded");
        resolve(room);
      },
      undefined,
      (error) => {
        useFallbackEnvironment();
        reject(error);
      }
    );
  });
}

export function useFallbackEnvironment() {
  if (currentRoom) { scene.remove(currentRoom); currentRoom = null; }
  hasRoomLoaded = false;
  if (fallbackSky) fallbackSky.visible = true;
  if (fallbackGround) fallbackGround.visible = true;
}

// ============================================
// CAMERA & POSITION CONTROLS
// ============================================
export function setCameraPosition(x, y, z) {
  if (camera) { camera.position.set(x, y, z); camera.lookAt(CONFIG.lookAtX, CONFIG.lookAtY, CONFIG.lookAtZ); }
}
export function setCameraLookAt(x, y, z) { if (camera) camera.lookAt(x, y, z); }
export function setCameraFOV(fov) { if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); } }
export function setAvatarPosition(x, y, z) {
  if (currentVRM) { const box = new THREE.Box3().setFromObject(currentVRM.scene); currentVRM.scene.position.set(x, y - box.min.y, z); }
}
export function setRoomPosition(x, y, z) {
  if (currentRoom) { const box = new THREE.Box3().setFromObject(currentRoom); currentRoom.position.set(x, y - box.min.y, z); }
}
export function setRoomScale(s) {
  if (currentRoom) { currentRoom.scale.setScalar(s); const box = new THREE.Box3().setFromObject(currentRoom); currentRoom.position.y = -box.min.y; }
}

// ============================================
// SET RELAXED POSE
// ============================================
function setRelaxedPose(vrm) {
  if (!vrm?.humanoid) return;
  const get = (n) => vrm.humanoid.getNormalizedBoneNode(n);
  
  const lUA = get("leftUpperArm"), rUA = get("rightUpperArm");
  const lLA = get("leftLowerArm"), rLA = get("rightLowerArm");
  
  if (lUA) lUA.rotation.set(baseRotations.leftUpperArm.x, baseRotations.leftUpperArm.y, baseRotations.leftUpperArm.z);
  if (rUA) rUA.rotation.set(baseRotations.rightUpperArm.x, baseRotations.rightUpperArm.y, baseRotations.rightUpperArm.z);
  if (lLA) lLA.rotation.set(baseRotations.leftLowerArm.x, baseRotations.leftLowerArm.y, baseRotations.leftLowerArm.z);
  if (rLA) rLA.rotation.set(baseRotations.rightLowerArm.x, baseRotations.rightLowerArm.y, baseRotations.rightLowerArm.z);
}

// ============================================
// TRIGGER WAVE - Friendly wave TOWARD user
// ============================================
export function triggerWave() {
  if (!avatarReady || isWaving) return;
  isWaving = true;
  waveProgress = 0;
  console.log("[3D] 👋 Hi!");
}

function updateWaveAnimation(delta) {
  if (!isWaving || !currentVRM?.humanoid) return;

  waveProgress += delta * 1000;
  const duration = CONFIG.waveDuration;
  const progress = Math.min(waveProgress / duration, 1);

  // Smooth raise → wave → lower
  let raise;
  if (progress < 0.2) {
    raise = easeOutBack(progress / 0.2);
  } else if (progress < 0.75) {
    raise = 1;
  } else {
    raise = 1 - easeInCubic((progress - 0.75) / 0.25);
  }

  const get = (n) => currentVRM.humanoid.getNormalizedBoneNode(n);
  const rUA = get("rightUpperArm");
  const rLA = get("rightLowerArm");
  const rH  = get("rightHand");

  // ===============================
  // Upper arm — FORCE toward camera
  // ===============================
  if (rUA) {
  rUA.rotation.x = baseRotations.rightUpperArm.x - raise * 1.1; // lift forward
  rUA.rotation.y = 0;                                           // IMPORTANT: neutral
  rUA.rotation.z = baseRotations.rightUpperArm.z - raise * 0.6; // NEGATIVE = toward camera
}

  // ===============================
  // Lower arm — support forward pose
  // ===============================
  if (rLA) {
    rLA.rotation.x = -raise * 0.35;
    rLA.rotation.y = baseRotations.rightLowerArm.y - raise * 0.5;
    rLA.rotation.z = 0;
  }

  // ===============================
  // Hand — palm toward viewer + wave
  // ===============================
  if (rH && progress > 0.15 && progress < 0.8) {
    const waveT = waveProgress * 0.001 * CONFIG.waveSpeed;
    rH.rotation.x = -0.6; // palm toward camera
    rH.rotation.y = 0;
    rH.rotation.z = Math.sin(waveT) * CONFIG.waveAmount;
  }

  // ===============================
  // Reset pose at end
  // ===============================
  if (progress >= 1) {
    isWaving = false;

    if (rUA) rUA.rotation.set(
      baseRotations.rightUpperArm.x,
      baseRotations.rightUpperArm.y,
      baseRotations.rightUpperArm.z
    );

    if (rLA) rLA.rotation.set(
      baseRotations.rightLowerArm.x,
      baseRotations.rightLowerArm.y,
      baseRotations.rightLowerArm.z
    );

    if (rH) rH.rotation.set(0, 0, 0);
  }
}


// ============================================
// TRIGGER NOD - Acknowledgment
// ============================================
export function triggerNod() {
  if (!avatarReady || isNodding) return;
  isNodding = true;
  nodProgress = 0;
}

function updateNodAnimation(delta) {
  if (!isNodding || !currentVRM?.humanoid) return;
  
  nodProgress += delta * 1000;
  const duration = CONFIG.nodDuration * CONFIG.nodCount;
  const progress = nodProgress / duration;
  
  // Multiple nods
  const nodCycle = Math.sin(progress * Math.PI * CONFIG.nodCount * 2);
  const envelope = Math.sin(progress * Math.PI);  // Fade in/out
  const nod = nodCycle * envelope * CONFIG.nodAmount;
  
  const head = currentVRM.humanoid.getNormalizedBoneNode("head");
  if (head && !isHeadTilting) {
    head.rotation.x = currentLook.y + nod;
  }
  
  if (progress >= 1) isNodding = false;
}

// ============================================
// HEAD TILT - Curious/interested
// ============================================
function triggerHeadTilt() {
  if (isHeadTilting || isNodding) return;
  isHeadTilting = true;
  headTiltProgress = 0;
  headTiltDirection = Math.random() > 0.5 ? 1 : -1;
}

function updateHeadTilt(delta) {
  if (!isHeadTilting || !currentVRM?.humanoid) return;
  
  headTiltProgress += delta * 1000;
  const duration = CONFIG.headTiltDuration;
  const progress = headTiltProgress / duration;
  
  const tilt = Math.sin(progress * Math.PI) * CONFIG.headTiltMax * headTiltDirection;
  
  const head = currentVRM.humanoid.getNormalizedBoneNode("head");
  if (head) {
    head.rotation.z = tilt;
  }
  
  if (progress >= 1) isHeadTilting = false;
}

// ============================================
// IDLE ANIMATION - Main update
// ============================================
function updateIdleAnimation(delta) {
  if (!currentVRM || !avatarReady) return;
  
  idleTime += delta;
  swayTime += delta;
  
  updateBreathing();
  updateBodySway();
  updateHeadMovement(delta);
  updateRandomHeadTilt(delta);
  
  if (!isWaving) {
    if (isTalking) {
      updateTalkingGestures(delta);
    } else {
      updateArmSway();
      updateIdleGestures(delta);
    }
  }
}

// ============================================
// BREATHING - Visible chest movement
// ============================================
function updateBreathing() {
  if (!currentVRM?.humanoid) return;
  
  const get = (n) => currentVRM.humanoid.getNormalizedBoneNode(n);
  
  const breathCycle = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2);
  const breath = breathCycle * CONFIG.breathingAmount;
  
  const chest = get("chest");
  const upperChest = get("upperChest");
  const spine = get("spine");
  
  if (upperChest) upperChest.rotation.x = breath * 1.8;
  if (chest) chest.rotation.x = breath * 1.2;
  if (spine) spine.rotation.x = breath * 0.4;
  
  // Shoulders rise with breath
  const lS = get("leftShoulder"), rS = get("rightShoulder");
  if (lS) lS.position.y = breathCycle * CONFIG.shoulderBreathAmount;
  if (rS) rS.position.y = breathCycle * CONFIG.shoulderBreathAmount;
}

// ============================================
// BODY SWAY - Subtle weight shift
// ============================================
function updateBodySway() {
  if (!currentVRM?.humanoid) return;
  
  const get = (n) => currentVRM.humanoid.getNormalizedBoneNode(n);
  
  const sway = Math.sin(swayTime * CONFIG.bodySwaySpeed * Math.PI * 2);
  const sway2 = Math.sin(swayTime * CONFIG.bodySwaySpeed * 0.7 * Math.PI * 2);
  
  const hips = get("hips");
  const spine = get("spine");
  
  if (hips) {
    hips.rotation.y = sway * CONFIG.hipSwayAmount;
    hips.position.x = sway * 0.003;
  }
  
  if (spine) {
    spine.rotation.z = sway2 * CONFIG.bodySwayAmount;
  }
}

// ============================================
// HEAD MOVEMENT - Active eye contact
// ============================================
function updateHeadMovement(delta) {
  if (!currentVRM?.humanoid) return;
  
  const get = (n) => currentVRM.humanoid.getNormalizedBoneNode(n);
  const head = get("head");
  const neck = get("neck");
  
  if (!head) return;

  lookTimer += delta * 1000;

  // Decide where to look
  if (lookTimer > CONFIG.lookAwayInterval + Math.random() * 1000) {
    if (Math.random() < CONFIG.lookAtViewerChance) {
      // Look at viewer with micro-variations
      lookTarget.x = (Math.random() - 0.5) * 0.06;
      lookTarget.y = (Math.random() - 0.5) * 0.04;
    } else {
      // Brief glance away
      lookTarget.x = (Math.random() - 0.5) * 2 * CONFIG.lookAmountX;
      lookTarget.y = (Math.random() - 0.5) * 2 * CONFIG.lookAmountY;
    }
    lookTimer = 0;
  }

  // Return to viewer after looking away
  if (lookTimer > CONFIG.lookAwayDuration && (Math.abs(lookTarget.x) > 0.08 || Math.abs(lookTarget.y) > 0.06)) {
    lookTarget.x *= 0.92;
    lookTarget.y *= 0.92;
  }

  // Smooth interpolation
  currentLook.x += (lookTarget.x - currentLook.x) * CONFIG.lookSmoothing;
  currentLook.y += (lookTarget.y - currentLook.y) * CONFIG.lookSmoothing;

  // Apply to head (unless doing special animation)
  if (!isNodding) {
    head.rotation.y = currentLook.x;
    head.rotation.x = currentLook.y;
    
    // Subtle continuous tilt
    if (!isHeadTilting) {
      head.rotation.z = Math.sin(idleTime * CONFIG.headTiltSpeed) * CONFIG.headTiltAmount;
    }
  }

  // Neck follows
  if (neck) {
    neck.rotation.y = currentLook.x * 0.35;
    neck.rotation.x = currentLook.y * 0.3;
  }
}

// ============================================
// RANDOM HEAD TILT
// ============================================
function updateRandomHeadTilt(delta) {
  // Random curious tilts
  if (!isHeadTilting && !isNodding && Math.random() < delta * 0.15) {
    triggerHeadTilt();
  }
  updateHeadTilt(delta);
}

// ============================================
// ARM SWAY - Natural idle movement
// ============================================
function updateArmSway() {
  if (!currentVRM?.humanoid || isGesturing) return;
  
  const get = (n) => currentVRM.humanoid.getNormalizedBoneNode(n);
  const lUA = get("leftUpperArm"), rUA = get("rightUpperArm");
  
  const sway = Math.sin(idleTime * CONFIG.armSwaySpeed) * CONFIG.armSwayAmount;
  const sway2 = Math.sin(idleTime * CONFIG.armSwaySpeed * 1.3 + 1) * CONFIG.armSwayAmount * 0.7;
  
  if (lUA) {
    lUA.rotation.z = baseRotations.leftUpperArm.z + sway;
    lUA.rotation.x = baseRotations.leftUpperArm.x + sway2 * 0.3;
  }
  if (rUA) {
    rUA.rotation.z = baseRotations.rightUpperArm.z - sway;
    rUA.rotation.x = baseRotations.rightUpperArm.x - sway2 * 0.3;
  }
}

// ============================================
// IDLE GESTURES - Varied movements
// ============================================
function updateIdleGestures(delta) {
  if (!currentVRM?.humanoid) return;

  gestureTimer += delta * 1000;

  if (!isGesturing && gestureTimer > CONFIG.gestureInterval + Math.random() * 3000) {
    isGesturing = true;
    gestureProgress = 0;
    gestureTimer = 0;
    gestureType = Math.floor(Math.random() * 6);
  }

  if (isGesturing) {
    gestureProgress += delta * 1000;
    const progress = gestureProgress / CONFIG.gestureDuration;
    const ease = Math.sin(progress * Math.PI);  // Smooth in-out
    
    applyIdleGesture(ease);

    if (gestureProgress >= CONFIG.gestureDuration) {
      isGesturing = false;
    }
  }
}

function applyIdleGesture(intensity) {
  const get = (n) => currentVRM.humanoid.getNormalizedBoneNode(n);
  const amt = CONFIG.gestureAmount * intensity;
  
  const rUA = get("rightUpperArm"), rLA = get("rightLowerArm");
  const lUA = get("leftUpperArm"), lLA = get("leftLowerArm");
  const rH = get("rightHand");
  
  switch (gestureType) {
    case 0: // Right hand forward (toward user)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.4;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.5;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.4;
      break;
      
    case 1: // Left hand forward
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.4;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.5;
      }
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.4;
      break;
      
    case 2: // Both arms slight open
      if (rUA) rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.4;
      if (lUA) lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.4;
      break;
      
    case 3: // Touch chin (thinking)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.6;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.3;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.9;
      break;
      
    case 4: // Cross arms slightly
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.3;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.2;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.3;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.2;
      }
      break;
      
    case 5: // Hand on hip
      if (rUA) {
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.3;
      }
      if (rLA) {
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.6;
        rLA.rotation.z = amt * 0.2;
      }
      break;
  }
}

// ============================================
// TALKING GESTURES - Very expressive!
// ============================================
function updateTalkingGestures(delta) {
  if (!currentVRM?.humanoid || !isTalking) return;
  
  talkingGestureTimer += delta * 1000;
  
  if (currentTalkingGesture === -1 || talkingGestureTimer > CONFIG.talkingGestureInterval) {
    currentTalkingGesture = Math.floor(Math.random() * 10);  // 10 different gestures!
    talkingGestureTimer = 0;
    talkingGestureProgress = 0;
  }
  
  talkingGestureProgress += delta * 1000;
  const duration = CONFIG.talkingGestureDuration;
  
  let intensity;
  if (talkingGestureProgress < duration * 0.15) {
    intensity = easeOutCubic(talkingGestureProgress / (duration * 0.15));
  } else if (talkingGestureProgress < duration * 0.5) {
    intensity = 1;
  } else if (talkingGestureProgress < duration) {
    intensity = 1 - easeInCubic((talkingGestureProgress - duration * 0.5) / (duration * 0.5));
  } else {
    intensity = 0;
  }
  
  applyTalkingGesture(intensity);
}

function applyTalkingGesture(intensity) {
  const get = (n) => currentVRM.humanoid.getNormalizedBoneNode(n);
  const amt = CONFIG.talkingGestureAmount * intensity;
  const v = Math.sin(idleTime * 5) * 0.04;  // Micro-movement
  
  const rUA = get("rightUpperArm"), rLA = get("rightLowerArm"), rH = get("rightHand");
  const lUA = get("leftUpperArm"), lLA = get("leftLowerArm"), lH = get("leftHand");
  const lS = get("leftShoulder"), rS = get("rightShoulder");
  
  switch (currentTalkingGesture) {
    case 0: // Right hand forward - explaining (TOWARD USER)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.6;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.5;
        rUA.rotation.y = -amt * 0.15;
      }
      if (rLA) {
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.5;
        rLA.rotation.x = -amt * 0.15;
      }
      if (rH) rH.rotation.x = -amt * 0.25 + v;
      break;
      
    case 1: // Left hand forward
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.6;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.5;
        lUA.rotation.y = amt * 0.15;
      }
      if (lLA) {
        lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.5;
        lLA.rotation.x = -amt * 0.15;
      }
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
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.35;
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.35;
      break;
      
    case 3: // Point forward (toward viewer!)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.8;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.25;
        rUA.rotation.y = -amt * 0.2;
      }
      if (rLA) {
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.5;
        rLA.rotation.x = -amt * 0.25;
      }
      break;
      
    case 4: // Hands together - thoughtful
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.5;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.3;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.5;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.3;
      }
      if (rLA) rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.7;
      if (lLA) lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.7;
      break;
      
    case 5: // Reach toward viewer
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.7;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.2;
        rUA.rotation.y = -amt * 0.2;
      }
      if (rLA) {
        rLA.rotation.x = -amt * 0.3;
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.45;
      }
      if (rH) rH.rotation.x = -amt * 0.35;
      break;
      
    case 6: // Shrug
      if (lS) lS.position.y = amt * 0.02;
      if (rS) rS.position.y = amt * 0.02;
      if (rUA) rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.2;
      if (lUA) lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.2;
      break;
      
    case 7: // Counting/listing (finger up)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.55;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.4;
      }
      if (rLA) {
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.55;
      }
      if (rH) {
        rH.rotation.x = -amt * 0.15;
        rH.rotation.z = v * 2;
      }
      break;
      
    case 8: // Emphatic both hands forward
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.55;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.35;
      }
      if (lUA) {
        lUA.rotation.x = baseRotations.leftUpperArm.x - amt * 0.55;
        lUA.rotation.z = baseRotations.leftUpperArm.z - amt * 0.35;
      }
      if (rLA) {
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.4;
        rLA.rotation.x = -amt * 0.15;
      }
      if (lLA) {
        lLA.rotation.y = baseRotations.leftLowerArm.y + amt * 0.4;
        lLA.rotation.x = -amt * 0.15;
      }
      break;
      
    case 9: // Heartfelt (hand to chest)
      if (rUA) {
        rUA.rotation.x = baseRotations.rightUpperArm.x - amt * 0.4;
        rUA.rotation.z = baseRotations.rightUpperArm.z + amt * 0.45;
      }
      if (rLA) {
        rLA.rotation.y = baseRotations.rightLowerArm.y - amt * 0.85;
      }
      break;
  }
}

// ============================================
// BLINKING - Natural
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
          
          // Double blink sometimes
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
            }, 120);
          }
        }
      }, CONFIG.blinkDuration);
    }
    
    blinkTimer = 0;
  }
}

// ============================================
// LIP SYNC - Smooth mouth movement
// ============================================
function updateLipSync() {
  if (!currentVRM?.expressionManager) return;

  currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * CONFIG.lipSyncSmooth;

  const expr = currentVRM.expressionManager;
  const intensity = CONFIG.lipSyncIntensity;
  
  if (expr.expressionMap["aa"]) expr.setValue("aa", currentMouthOpenness * intensity);
  if (expr.expressionMap["oh"]) expr.setValue("oh", currentMouthOpenness * 0.35 * Math.abs(Math.sin(idleTime * 11)));
  if (expr.expressionMap["ih"]) expr.setValue("ih", currentMouthOpenness * 0.25 * Math.abs(Math.cos(idleTime * 13)));
  
  // Subtle smile while talking
  if (expr.expressionMap["happy"]) {
    expr.setValue("happy", CONFIG.talkingSmileAmount * currentMouthOpenness);
  }
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
    ["aa", "oh", "ih", "ou", "ee", "happy"].forEach(name => {
      if (expr.expressionMap[name]) expr.setValue(name, 0);
    });
  }
  
  // Nod at end of speaking
  setTimeout(() => triggerNod(), 200);
  
  console.log("[3D] 🤐 Done");
}

function animateTalking() {
  if (!isTalking) { targetMouthOpenness = 0; return; }

  const time = Date.now() * 0.001;
  const variation = 
    Math.sin(time * 9) * 0.22 + 
    Math.sin(time * 14) * 0.16 +
    Math.sin(time * 23) * 0.1 +
    Math.random() * 0.12;
  
  targetMouthOpenness = Math.max(0.1, Math.min(0.9, 0.38 + variation));
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
// MAIN ANIMATION LOOP
// ============================================
function animate() {
  rafId = requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (currentVRM && avatarReady) {
    updateIdleAnimation(delta);
    updateBlinking(delta);
    updateWaveAnimation(delta);
    updateNodAnimation(delta);
    
    if (isTalking) updateLipSync();

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
// COLOR THEMES
// ============================================
export function setSkyColors(top, mid, bottom) {
  if (fallbackSky?.material?.uniforms) {
    if (top) fallbackSky.material.uniforms.topColor.value.setHex(top);
    if (mid) fallbackSky.material.uniforms.midColor.value.setHex(mid);
    if (bottom) fallbackSky.material.uniforms.bottomColor.value.setHex(bottom);
  }
}

export function setFloorColors(center, edge) {
  if (fallbackGround?.material?.uniforms) {
    if (center) fallbackGround.material.uniforms.centerColor.value.setHex(center);
    if (edge) fallbackGround.material.uniforms.edgeColor.value.setHex(edge);
  }
}

export function setColorTheme(theme) {
  const themes = {
    lavender: { skyTop: 0x9B8AC4, skyMid: 0xC4B8D8, skyBottom: 0xE8E0F0, floorCenter: 0xE8E4EC, floorEdge: 0xD0C8D8 },
    sunset: { skyTop: 0x4A3F6B, skyMid: 0xC97B84, skyBottom: 0xF2D7D9, floorCenter: 0xF5E6E8, floorEdge: 0xE8D0D4 },
    ocean: { skyTop: 0x1E3A5F, skyMid: 0x6B9AC4, skyBottom: 0xD4E6F1, floorCenter: 0xE8F4F8, floorEdge: 0xC8DCE8 },
    mint: { skyTop: 0x4A7C6F, skyMid: 0x8FBCB0, skyBottom: 0xD8EDE8, floorCenter: 0xE8F2EF, floorEdge: 0xC8DCD8 },
    pink: { skyTop: 0xB76E99, skyMid: 0xDBA8C4, skyBottom: 0xF8E8F0, floorCenter: 0xFAF0F5, floorEdge: 0xECD8E4 }
  };
  const t = themes[theme];
  if (t) { setSkyColors(t.skyTop, t.skyMid, t.skyBottom); setFloorColors(t.floorCenter, t.floorEdge); }
}

// ============================================
// CLEANUP
// ============================================
export function dispose3D() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (currentVRM) { scene.remove(currentVRM.scene); VRMUtils.deepDispose(currentVRM.scene); currentVRM = null; }
  if (currentRoom) { scene.remove(currentRoom); currentRoom = null; }
  if (renderer) { renderer.dispose(); if (renderer.domElement) renderer.domElement.remove(); renderer = null; }
  window.removeEventListener("resize", onResize);
  avatarReady = hasRoomLoaded = false;
}

// ============================================
// EXPORTS
// ============================================
export function isAvatarReady() { return avatarReady; }
export function getVRM() { return currentVRM; }
export function getScene() { return scene; }
export function hasRoom() { return hasRoomLoaded; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getConfig() { return CONFIG; }