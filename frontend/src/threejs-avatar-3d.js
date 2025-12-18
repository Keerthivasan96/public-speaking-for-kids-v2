// ============================================
// threejs-avatar-3d.js - FIXED VERSION
// Room + Avatar Integration with proper positioning
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
let lookTarget = { x: 0, y: 0 };

// Lip sync
let currentMouthOpenness = 0;
let targetMouthOpenness = 0;

// Store base rotations for arms
let baseRotations = {
  leftUpperArm: { x: 0.2, y: 0, z: 1.0 },
  rightUpperArm: { x: 0.2, y: 0, z: -1.0 },
  leftLowerArm: { x: 0, y: -0.2, z: 0 },
  rightLowerArm: { x: 0, y: 0.2, z: 0 },
  head: { x: 0, y: 0, z: 0 },
  spine: { x: 0, y: 0, z: 0 }
};

// Room objects
let currentRoom = null;
let defaultGround = null;
let defaultSky = null;

// ============================================
// SETTINGS - OPTIMIZED FOR ROOM + AVATAR
// ============================================
const CONFIG = {
  // Avatar
  avatarScale: 0.9,
  avatarPositionY: 0, // Will be adjusted based on room
  
  // Camera - REPLIKA-STYLE VIEW
  cameraDistance: 2.5,      // Closer for intimate feel
  cameraHeight: 1.4,        // Eye-level view
  cameraFOV: 35,           // Slightly wider
  cameraLookAtY: 1.3,      // Look at upper chest/face
  cameraAngleX: 0.05,      // Slight downward tilt
  
  // Room-specific camera (when room is loaded)
  roomCameraDistance: 3.0,
  roomCameraHeight: 1.5,
  roomCameraLookAtY: 1.2,
  
  // Ground
  groundSize: 30,
  
  // Sky colors
  skyTopColor: 0x87CEEB,
  skyBottomColor: 0xE6B3CC,
  
  // Breathing - SUBTLE
  breathingSpeed: 0.5,
  breathingAmount: 0.005,
  
  // HEAD looking around
  lookAroundInterval: 5000,
  lookAroundDuration: 2500,
  lookAmountX: 0.1,
  lookAmountY: 0.05,
  
  // Arm micro-movement
  armSwayAmount: 0.008,
  armSwaySpeed: 0.3,
  
  // Gesture
  gestureInterval: 10000,
  gestureDuration: 1500,
  
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
  
  // Initial camera position
  updateCameraPosition();

  setupLights();

  window.addEventListener("resize", onResize, { passive: true });

  animate();

  console.log("[3D] ✅ Scene initialized");
  return true;
}

// ============================================
// UPDATE CAMERA POSITION
// ============================================
function updateCameraPosition() {
  const hasRoomLoaded = currentRoom !== null;
  
  // Use different camera settings for room vs default
  const distance = hasRoomLoaded ? CONFIG.roomCameraDistance : CONFIG.cameraDistance;
  const height = hasRoomLoaded ? CONFIG.roomCameraHeight : CONFIG.cameraHeight;
  const lookAtY = hasRoomLoaded ? CONFIG.roomCameraLookAtY : CONFIG.cameraLookAtY;
  
  camera.position.set(0, height, distance);
  camera.lookAt(0, lookAtY, 0);
  
  // Add slight downward angle for more natural view
  camera.rotation.x = -CONFIG.cameraAngleX;
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

  defaultSky = new THREE.Mesh(skyGeo, skyMat);
  defaultSky.name = "defaultSky";
  scene.add(defaultSky);
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

  defaultGround = new THREE.Mesh(groundGeo, groundMat);
  defaultGround.rotation.x = -Math.PI / 2;
  defaultGround.position.y = 0;
  defaultGround.receiveShadow = true;
  defaultGround.name = "defaultGround";
  scene.add(defaultGround);
}

// ============================================
// SETUP LIGHTING
// ============================================
function setupLights() {
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
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

  const fillLight = new THREE.DirectionalLight(0xffeedd, 0.6);
  fillLight.position.set(-2, 3, -1);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xaaccff, 0.5);
  backLight.position.set(0, 2, -3);
  scene.add(backLight);

  const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.7);
  scene.add(hemiLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
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

        // PROPER POSITIONING: Avatar stands on ground (y=0)
        vrm.scene.position.set(
          -center.x * scale,
          -box.min.y * scale + CONFIG.avatarPositionY, // Feet at ground level
          -center.z * scale
        );

        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            // Fix material rendering
            if (obj.material) {
              obj.material.side = THREE.FrontSide;
              obj.material.depthWrite = true;
              obj.material.depthTest = true;
            }
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
        lookTarget = { x: 0, y: 0 };

        setRelaxedPose(vrm);

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded! Position:", vrm.scene.position);
        console.log("[3D] Avatar bbox:", box);
        
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
        const roomBox = new THREE.Box3().setFromObject(room);
        const roomSize = roomBox.getSize(new THREE.Vector3());
        const roomCenter = roomBox.getCenter(new THREE.Vector3());
        
        console.log("[3D] Room size:", roomSize);
        console.log("[3D] Room center:", roomCenter);
        console.log("[3D] Room min/max:", roomBox.min, roomBox.max);
        
        // PROPER ROOM POSITIONING
        // Center the room horizontally and align floor to y=0
        room.position.set(
          -roomCenter.x,
          -roomBox.min.y, // Floor at y=0
          -roomCenter.z
        );
        
        // Optional: Scale room if needed
        // Uncomment if room is too big/small
        // const targetRoomSize = 10; // Adjust as needed
        // const roomScale = targetRoomSize / Math.max(roomSize.x, roomSize.z);
        // room.scale.setScalar(roomScale);
        
        // Enable shadows and fix materials
        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            
            // Fix material rendering
            if (obj.material) {
              obj.material.side = THREE.FrontSide;
              obj.material.depthWrite = true;
              obj.material.depthTest = true;
              
              // Enhance lighting response
              if (obj.material.metalness !== undefined) {
                obj.material.metalness = Math.min(obj.material.metalness, 0.5);
              }
              if (obj.material.roughness !== undefined) {
                obj.material.roughness = Math.max(obj.material.roughness, 0.4);
              }
            }
          }
        });

        // Hide default ground and sky
        if (defaultGround) defaultGround.visible = false;
        if (defaultSky) defaultSky.visible = false;

        scene.add(room);
        currentRoom = room;
        
        // Update camera for room view
        updateCameraPosition();
        
        // Reposition avatar if already loaded
        if (currentVRM) {
          positionAvatarInRoom();
        }

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Room loaded! Position:", room.position);
        resolve(room);
      },
      (progress) => {
        const percent = (progress.loaded / progress.total * 100).toFixed(0);
        console.log(`[3D] Room loading: ${percent}%`);
      },
      (error) => {
        console.error("[3D] Room load failed:", error);
        if (loadingEl) loadingEl.classList.remove("active");
        reject(error);
      }
    );
  });
}

// ============================================
// POSITION AVATAR IN ROOM
// ============================================
function positionAvatarInRoom() {
  if (!currentVRM || !currentRoom) return;
  
  // Avatar should stand on floor (y=0) slightly forward from center
  const avatarZ = 0.5; // Adjust this to move avatar forward/back in room
  
  currentVRM.scene.position.z = avatarZ;
  
  console.log("[3D] Avatar repositioned for room:", currentVRM.scene.position);
}

// ============================================
// REMOVE ROOM
// ============================================
export function removeRoom() {
  if (currentRoom) {
    scene.remove(currentRoom);
    currentRoom = null;
  }
  
  // Show default ground and sky
  if (defaultGround) defaultGround.visible = true;
  if (defaultSky) defaultSky.visible = true;
  
  // Reset camera to default position
  updateCameraPosition();
  
  console.log("[3D] Room removed");
}

// ============================================
// CHECK IF ROOM IS LOADED
// ============================================
export function hasRoom() {
  return currentRoom !== null;
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
// IDLE ANIMATION
// ============================================
function updateIdleAnimation(delta) {
  if (!currentVRM || !avatarReady) return;

  idleTime += delta;

  updateBreathing();
  updateHeadMovement(delta);
  updateArmMovement();
  updateGestures(delta);
}

// ============================================
// BREATHING
// ============================================
function updateBreathing() {
  const breathOffset = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2) * CONFIG.breathingAmount;
  
  const chest = currentVRM.humanoid?.getNormalizedBoneNode("chest");
  const upperChest = currentVRM.humanoid?.getNormalizedBoneNode("upperChest");
  
  if (upperChest) {
    upperChest.rotation.x = breathOffset * 1.2;
  }
  if (chest) {
    chest.rotation.x = breathOffset * 0.8;
  }
  
  const leftShoulder = currentVRM.humanoid?.getNormalizedBoneNode("leftShoulder");
  const rightShoulder = currentVRM.humanoid?.getNormalizedBoneNode("rightShoulder");
  
  if (leftShoulder) {
    leftShoulder.position.y = breathOffset * 0.3;
  }
  if (rightShoulder) {
    rightShoulder.position.y = breathOffset * 0.3;
  }
}

// ============================================
// HEAD MOVEMENT
// ============================================
function updateHeadMovement(delta) {
  const head = currentVRM.humanoid?.getNormalizedBoneNode("head");
  const neck = currentVRM.humanoid?.getNormalizedBoneNode("neck");
  
  if (!head) return;

  lookTimer += delta * 1000;

  if (lookTimer > CONFIG.lookAroundInterval + Math.random() * 2000) {
    lookTarget.x = (Math.random() - 0.5) * 2 * CONFIG.lookAmountX;
    lookTarget.y = (Math.random() - 0.5) * 2 * CONFIG.lookAmountY;
    lookTimer = 0;
  }

  if (lookTimer > CONFIG.lookAroundDuration && lookTimer < CONFIG.lookAroundInterval) {
    lookTarget.x *= 0.97;
    lookTarget.y *= 0.97;
  }

  const currentY = head.rotation.y || 0;
  const currentX = head.rotation.x || 0;
  
  head.rotation.y += (lookTarget.x - currentY) * 0.04;
  head.rotation.x += (lookTarget.y - currentX) * 0.04;

  if (neck) {
    neck.rotation.y = head.rotation.y * 0.3;
    neck.rotation.x = head.rotation.x * 0.2;
  }
}

// ============================================
// ARM MOVEMENT
// ============================================
function updateArmMovement() {
  const leftUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("rightUpperArm");
  const leftLowerArm = currentVRM.humanoid?.getNormalizedBoneNode("leftLowerArm");
  const rightLowerArm = currentVRM.humanoid?.getNormalizedBoneNode("rightLowerArm");

  const armSway = Math.sin(idleTime * CONFIG.armSwaySpeed) * CONFIG.armSwayAmount;
  
  if (leftUpperArm) {
    leftUpperArm.rotation.z = baseRotations.leftUpperArm.z + armSway;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = baseRotations.rightUpperArm.z - armSway;
  }

  if (leftLowerArm) {
    leftLowerArm.rotation.y = baseRotations.leftLowerArm.y + armSway * 0.5;
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.y = baseRotations.rightLowerArm.y + armSway * 0.5;
  }
}

// ============================================
// GESTURES
// ============================================
let isGesturing = false;
let gestureProgress = 0;

function updateGestures(delta) {
  gestureTimer += delta * 1000;

  if (!isGesturing && gestureTimer > CONFIG.gestureInterval + Math.random() * 5000) {
    isGesturing = true;
    gestureProgress = 0;
    gestureTimer = 0;
  }

  if (isGesturing) {
    gestureProgress += delta * 1000;
    
    const progress = gestureProgress / CONFIG.gestureDuration;
    const eased = Math.sin(progress * Math.PI);
    
    const rightUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("rightUpperArm");
    const rightLowerArm = currentVRM.humanoid?.getNormalizedBoneNode("rightLowerArm");
    
    if (rightUpperArm) {
      rightUpperArm.rotation.z = baseRotations.rightUpperArm.z + eased * 0.12;
      rightUpperArm.rotation.x = baseRotations.rightUpperArm.x - eased * 0.08;
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.y = baseRotations.rightLowerArm.y - eased * 0.15;
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

  const interval = CONFIG.blinkInterval + Math.random() * 2000;

  if (blinkTimer >= interval) {
    const expr = currentVRM.expressionManager;
    
    expr.setValue("blink", 1.0);
    
    setTimeout(() => {
      if (currentVRM?.expressionManager) {
        currentVRM.expressionManager.setValue("blink", 0.0);
        
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
  
  if (expr.expressionMap["aa"]) {
    expr.setValue("aa", currentMouthOpenness * 0.8);
  }
  if (expr.expressionMap["oh"]) {
    expr.setValue("oh", currentMouthOpenness * 0.3 * Math.abs(Math.sin(idleTime * 10)));
  }
  if (expr.expressionMap["ih"]) {
    expr.setValue("ih", currentMouthOpenness * 0.2 * Math.abs(Math.cos(idleTime * 12)));
  }

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
  if (defaultSky && defaultSky.material.uniforms) {
    defaultSky.material.uniforms.topColor.value.setHex(topColor);
    defaultSky.material.uniforms.bottomColor.value.setHex(bottomColor);
  }
}

// ============================================
// DEBUG HELPERS
// ============================================
export function adjustAvatarPosition(x, y, z) {
  if (currentVRM) {
    currentVRM.scene.position.set(x, y, z);
    console.log("[3D] Avatar position adjusted:", currentVRM.scene.position);
  }
}

export function adjustCameraPosition(distance, height, lookAtY) {
  if (camera) {
    camera.position.set(0, height, distance);
    camera.lookAt(0, lookAtY, 0);
    console.log("[3D] Camera adjusted:", camera.position);
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

export function getCamera() {
  return camera;
}
