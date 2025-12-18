// ============================================
// threejs-avatar-3d.js - ENHANCED VERSION
// Better idle animations + room support ready
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
let gestureTimer = 0;
let lookTimer = 0;

// Lip sync
let currentMouthOpenness = 0;
let targetMouthOpenness = 0;

// Store base rotations
let baseRotations = {
  leftUpperArm: { x: 0.2, y: 0, z: 1.0 },
  rightUpperArm: { x: 0.2, y: 0, z: -1.0 },
  leftLowerArm: { x: 0, y: -0.2, z: 0 },
  rightLowerArm: { x: 0, y: 0.2, z: 0 },
  head: { x: 0, y: 0, z: 0 },
  spine: { x: 0, y: 0, z: 0 }
};

// Room objects (for future 3D room)
let roomObjects = [];

// ============================================
// SETTINGS
// ============================================
const CONFIG = {
  // Avatar
  avatarScale: 0.9,
  
  // Camera
  cameraDistance: 3.2,
  cameraHeight: 1.0,
  cameraFOV: 32,
  cameraLookAtY: 0.85,
  
  // Ground
  groundSize: 30,
  
  // Sky colors
  skyTopColor: 0x87CEEB,
  skyBottomColor: 0xE6B3CC,
  
  // Idle animation - MORE NATURAL
  breathingSpeed: 0.6,
  breathingAmount: 0.008,
  swaySpeed: 0.25,
  swayAmount: 0.006,
  
  // Looking around
  lookAroundInterval: 4000,  // ms
  lookAroundDuration: 2000,  // ms
  lookAroundAmount: 0.15,
  
  // Gesture (occasional arm movement)
  gestureInterval: 8000,    // ms
  gestureDuration: 1500,    // ms
  
  // Weight shift
  weightShiftSpeed: 0.15,
  weightShiftAmount: 0.02,
  
  // Blinking
  blinkInterval: 3000,
  blinkDuration: 120,
  doubleBinkChance: 0.3,
  
  // Lip sync
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
  sky.name = "sky";
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
  ground.name = "ground";
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

        const targetHeight = 1.6;
        const scale = targetHeight / size.y;
        vrm.scene.scale.setScalar(scale);

        vrm.scene.position.set(
          -center.x * scale,
          -box.min.y * scale,
          -center.z * scale
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

        // Reset timers
        idleTime = 0;
        blinkTimer = 0;
        gestureTimer = 0;
        lookTimer = 0;

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
        console.error("[3D] Failed:", error);
        if (loadingEl) loadingEl.classList.remove("active");
        reject(error);
      }
    );
  });
}

// ============================================
// LOAD ROOM MODEL (FOR FUTURE USE)
// ============================================
export async function loadRoomModel(glbPath) {
  console.log("[3D] Loading room:", glbPath);

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      glbPath,
      (gltf) => {
        const room = gltf.scene;
        
        // Enable shadows on all meshes
        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        // Remove default ground and sky
        const oldGround = scene.getObjectByName("ground");
        const oldSky = scene.getObjectByName("sky");
        if (oldGround) scene.remove(oldGround);
        if (oldSky) scene.remove(oldSky);

        scene.add(room);
        roomObjects.push(room);

        console.log("[3D] ✅ Room loaded!");
        resolve(room);
      },
      undefined,
      (error) => {
        console.error("[3D] Room load failed:", error);
        reject(error);
      }
    );
  });
}

// ============================================
// ADD FURNITURE/PROP
// ============================================
export async function addProp(glbPath, position = {x: 0, y: 0, z: 0}, scale = 1) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      glbPath,
      (gltf) => {
        const prop = gltf.scene;
        
        prop.position.set(position.x, position.y, position.z);
        prop.scale.setScalar(scale);
        
        prop.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        scene.add(prop);
        roomObjects.push(prop);

        console.log("[3D] ✅ Prop added:", glbPath);
        resolve(prop);
      },
      undefined,
      reject
    );
  });
}

// ============================================
// SET RELAXED POSE
// ============================================
function setRelaxedPose(vrm) {
  if (!vrm?.humanoid) return;

  try {
    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
    
    if (leftUpperArm) {
      leftUpperArm.rotation.set(
        baseRotations.leftUpperArm.x,
        baseRotations.leftUpperArm.y,
        baseRotations.leftUpperArm.z
      );
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.set(
        baseRotations.rightUpperArm.x,
        baseRotations.rightUpperArm.y,
        baseRotations.rightUpperArm.z
      );
    }

    const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
    const rightLowerArm = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
    
    if (leftLowerArm) {
      leftLowerArm.rotation.set(
        baseRotations.leftLowerArm.x,
        baseRotations.leftLowerArm.y,
        baseRotations.leftLowerArm.z
      );
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.set(
        baseRotations.rightLowerArm.x,
        baseRotations.rightLowerArm.y,
        baseRotations.rightLowerArm.z
      );
    }

    const leftHand = vrm.humanoid.getNormalizedBoneNode("leftHand");
    const rightHand = vrm.humanoid.getNormalizedBoneNode("rightHand");
    
    if (leftHand) leftHand.rotation.set(0, 0, 0.1);
    if (rightHand) rightHand.rotation.set(0, 0, -0.1);

    console.log("[3D] ✅ Relaxed pose set");
  } catch (e) {
    console.warn("[3D] Pose error:", e);
  }
}

// ============================================
// IDLE ANIMATION - ENHANCED
// ============================================
function updateIdleAnimation(delta) {
  if (!currentVRM || !avatarReady) return;

  idleTime += delta;
  const timeMs = idleTime * 1000;

  // === BREATHING ===
  const breathOffset = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2) * CONFIG.breathingAmount;
  
  const chest = currentVRM.humanoid?.getNormalizedBoneNode("chest");
  const spine = currentVRM.humanoid?.getNormalizedBoneNode("spine");
  const upperChest = currentVRM.humanoid?.getNormalizedBoneNode("upperChest");
  
  if (upperChest) {
    upperChest.rotation.x = breathOffset * 1.5;
  }
  if (chest) {
    chest.rotation.x = breathOffset;
  }
  if (spine) {
    spine.rotation.x = breathOffset * 0.5;
  }

  // === WEIGHT SHIFT (Hip sway) ===
  const weightShift = Math.sin(idleTime * CONFIG.weightShiftSpeed * Math.PI * 2);
  const hips = currentVRM.humanoid?.getNormalizedBoneNode("hips");
  
  if (hips) {
    hips.rotation.z = weightShift * CONFIG.weightShiftAmount;
    hips.position.x = weightShift * 0.01;
  }

  // === SUBTLE BODY SWAY ===
  const swayX = Math.sin(idleTime * CONFIG.swaySpeed) * CONFIG.swayAmount;
  const swayZ = Math.cos(idleTime * CONFIG.swaySpeed * 0.7) * CONFIG.swayAmount * 0.5;
  
  if (spine) {
    spine.rotation.z = swayX;
  }

  // === HEAD MOVEMENT ===
  updateHeadMovement(delta, timeMs);

  // === ARM MOVEMENT ===
  updateArmMovement(delta, timeMs);

  // === OCCASIONAL GESTURES ===
  updateGestures(delta, timeMs);
}

// ============================================
// HEAD MOVEMENT (Looking around)
// ============================================
function updateHeadMovement(delta, timeMs) {
  const head = currentVRM.humanoid?.getNormalizedBoneNode("head");
  const neck = currentVRM.humanoid?.getNormalizedBoneNode("neck");
  
  if (!head) return;

  // Base subtle movement
  let targetY = Math.sin(idleTime * 0.3) * 0.02;
  let targetX = Math.sin(idleTime * 0.2) * 0.015;

  // Occasional look around
  lookTimer += delta * 1000;
  
  if (lookTimer > CONFIG.lookAroundInterval + Math.random() * 2000) {
    // Random look direction
    const lookDirection = (Math.random() - 0.5) * 2;
    targetY = lookDirection * CONFIG.lookAroundAmount;
    targetX = (Math.random() - 0.5) * CONFIG.lookAroundAmount * 0.5;
    
    if (lookTimer > CONFIG.lookAroundInterval + CONFIG.lookAroundDuration) {
      lookTimer = 0;
    }
  }

  // Smooth interpolation
  head.rotation.y += (targetY - head.rotation.y) * 0.05;
  head.rotation.x += (targetX - head.rotation.x) * 0.05;

  // Neck follows slightly
  if (neck) {
    neck.rotation.y = head.rotation.y * 0.3;
    neck.rotation.x = head.rotation.x * 0.2;
  }
}

// ============================================
// ARM MOVEMENT (Subtle)
// ============================================
function updateArmMovement(delta, timeMs) {
  const leftUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("rightUpperArm");
  const leftLowerArm = currentVRM.humanoid?.getNormalizedBoneNode("leftLowerArm");
  const rightLowerArm = currentVRM.humanoid?.getNormalizedBoneNode("rightLowerArm");

  // Subtle arm sway with breathing
  const armSway = Math.sin(idleTime * 0.4) * 0.015;
  
  if (leftUpperArm) {
    leftUpperArm.rotation.z = baseRotations.leftUpperArm.z + armSway;
    leftUpperArm.rotation.x = baseRotations.leftUpperArm.x + Math.sin(idleTime * 0.3) * 0.01;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = baseRotations.rightUpperArm.z - armSway;
    rightUpperArm.rotation.x = baseRotations.rightUpperArm.x + Math.sin(idleTime * 0.3 + 0.5) * 0.01;
  }

  // Lower arms slight movement
  if (leftLowerArm) {
    leftLowerArm.rotation.y = baseRotations.leftLowerArm.y + Math.sin(idleTime * 0.5) * 0.02;
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.y = baseRotations.rightLowerArm.y + Math.sin(idleTime * 0.5 + 0.3) * 0.02;
  }
}

// ============================================
// OCCASIONAL GESTURES
// ============================================
let isGesturing = false;
let gestureProgress = 0;

function updateGestures(delta, timeMs) {
  gestureTimer += delta * 1000;

  // Start gesture occasionally
  if (!isGesturing && gestureTimer > CONFIG.gestureInterval + Math.random() * 4000) {
    isGesturing = true;
    gestureProgress = 0;
    gestureTimer = 0;
  }

  if (isGesturing) {
    gestureProgress += delta * 1000;
    
    const progress = gestureProgress / CONFIG.gestureDuration;
    const eased = Math.sin(progress * Math.PI); // Smooth in-out
    
    // Simple hand raise gesture
    const rightUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("rightUpperArm");
    const rightLowerArm = currentVRM.humanoid?.getNormalizedBoneNode("rightLowerArm");
    
    if (rightUpperArm) {
      rightUpperArm.rotation.z = baseRotations.rightUpperArm.z + eased * 0.15;
      rightUpperArm.rotation.x = baseRotations.rightUpperArm.x - eased * 0.1;
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.y = baseRotations.rightLowerArm.y - eased * 0.2;
    }

    if (gestureProgress >= CONFIG.gestureDuration) {
      isGesturing = false;
    }
  }
}

// ============================================
// BLINKING - ENHANCED
// ============================================
function updateBlinking(delta) {
  if (!currentVRM?.expressionManager) return;

  blinkTimer += delta * 1000;

  const interval = CONFIG.blinkInterval + Math.random() * 2000;

  if (blinkTimer >= interval) {
    const expr = currentVRM.expressionManager;
    
    // Single blink
    expr.setValue("blink", 1.0);
    
    setTimeout(() => {
      if (currentVRM?.expressionManager) {
        currentVRM.expressionManager.setValue("blink", 0.0);
        
        // Chance of double blink
        if (Math.random() < CONFIG.doubleBinkChance) {
          setTimeout(() => {
            if (currentVRM?.expressionManager) {
              currentVRM.expressionManager.setValue("blink", 1.0);
              setTimeout(() => {
                if (currentVRM?.expressionManager) {
                  currentVRM.expressionManager.setValue("blink", 0.0);
                }
              }, CONFIG.blinkDuration);
            }
          }, 150);
        }
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
  
  // Mouth shapes
  if (expr.expressionMap["aa"]) {
    expr.setValue("aa", currentMouthOpenness * 0.8);
  }
  if (expr.expressionMap["oh"]) {
    expr.setValue("oh", currentMouthOpenness * 0.3 * Math.abs(Math.sin(idleTime * 10)));
  }
  if (expr.expressionMap["ih"]) {
    expr.setValue("ih", currentMouthOpenness * 0.2 * Math.abs(Math.cos(idleTime * 12)));
  }

  // Slight eyebrow movement when talking
  if (expr.expressionMap["happy"]) {
    expr.setValue("happy", currentMouthOpenness * 0.1);
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
  
  if (currentVRM?.expressionManager) {
    const expr = currentVRM.expressionManager;
    ["aa", "oh", "ih", "ou", "ee", "a"].forEach(name => {
      if (expr.expressionMap[name]) expr.setValue(name, 0);
    });
    if (expr.expressionMap["happy"]) expr.setValue("happy", 0);
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
        if (currentVRM?.expressionManager) {
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
// CHANGE SKY COLORS
// ============================================
export function setSkyColors(topColor, bottomColor) {
  const sky = scene.getObjectByName("sky");
  if (sky && sky.material.uniforms) {
    sky.material.uniforms.topColor.value.setHex(topColor);
    sky.material.uniforms.bottomColor.value.setHex(bottomColor);
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

  roomObjects.forEach(obj => {
    scene.remove(obj);
  });
  roomObjects = [];

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

export function getScene() {
  return scene;
}