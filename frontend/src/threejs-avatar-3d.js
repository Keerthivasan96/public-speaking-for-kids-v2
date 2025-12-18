// ============================================
// threejs-avatar-3d.js - REPLIKA-STYLE ARCHITECTURE
// Room is default, avatar anchored properly
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

// ANCHOR SYSTEM (Replika-style)
let avatarAnchor = null;  // Avatar attaches to this
let roomAnchor = null;    // Room attaches to this

// Room and environment
let currentRoom = null;
let fallbackGround = null;
let fallbackSky = null;
let useRoom = true;  // Room is DEFAULT ON

// Animation timers
let idleTime = 0;
let blinkTimer = 0;
let gestureTimer = 0;
let lookTimer = 0;
let lookTarget = { x: 0, y: 0 };

// Lip sync
let currentMouthOpenness = 0;
let targetMouthOpenness = 0;

// Base pose
let baseRotations = {
  leftUpperArm: { x: 0.2, y: 0, z: 1.0 },
  rightUpperArm: { x: 0.2, y: 0, z: -1.0 },
  leftLowerArm: { x: 0, y: -0.2, z: 0 },
  rightLowerArm: { x: 0, y: 0.2, z: 0 },
};

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  // Avatar
  avatarHeight: 1.55,
  
  // Camera settings for ROOM mode (cinematic, chest-up like Replika)
  room: {
    cameraDistance: 2.0,
    cameraHeight: 1.35,
    cameraLookAtY: 1.15,
    cameraFOV: 35,
    avatarZ: -0.3,  // Avatar position relative to room center
  },
  
  // Camera settings for NO ROOM mode (full body view)
  noRoom: {
    cameraDistance: 3.2,
    cameraHeight: 1.0,
    cameraLookAtY: 0.85,
    cameraFOV: 32,
    avatarZ: 0,
  },
  
  // Animation
  breathingSpeed: 0.5,
  breathingAmount: 0.005,
  lookAroundInterval: 5000,
  lookAroundDuration: 2500,
  lookAmountX: 0.1,
  lookAmountY: 0.05,
  armSwayAmount: 0.008,
  armSwaySpeed: 0.3,
  gestureInterval: 10000,
  gestureDuration: 1500,
  blinkInterval: 3000,
  blinkDuration: 120,
  doubleBinkChance: 0.3,
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

  // Cleanup
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  container.querySelectorAll("canvas").forEach(c => c.remove());

  // Renderer
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

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  
  // Create anchor system
  createAnchors();
  
  // Create fallback environment (only shown when no room)
  createFallbackEnvironment();
  
  // Camera
  camera = new THREE.PerspectiveCamera(
    CONFIG.noRoom.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  
  // Lights
  setupLights();
  
  // Initial camera position
  updateCamera();

  // Events
  window.addEventListener("resize", onResize, { passive: true });

  // Start animation
  animate();

  console.log("[3D] ✅ Scene initialized");
  return true;
}

// ============================================
// CREATE ANCHOR SYSTEM
// ============================================
function createAnchors() {
  // Room anchor - room attaches here
  roomAnchor = new THREE.Object3D();
  roomAnchor.name = "roomAnchor";
  scene.add(roomAnchor);
  
  // Avatar anchor - avatar attaches here, INDEPENDENT of room
  avatarAnchor = new THREE.Object3D();
  avatarAnchor.name = "avatarAnchor";
  avatarAnchor.position.set(0, 0, 0);
  scene.add(avatarAnchor);
  
  console.log("[3D] ✅ Anchor system created");
}

// ============================================
// CREATE FALLBACK ENVIRONMENT (when no room)
// ============================================
function createFallbackEnvironment() {
  // Sky sphere
  const skyGeo = new THREE.SphereGeometry(50, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x87CEEB) },
      bottomColor: { value: new THREE.Color(0xE6B3CC) },
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
  fallbackSky = new THREE.Mesh(skyGeo, skyMat);
  fallbackSky.name = "fallbackSky";
  fallbackSky.visible = false;  // Hidden by default (room is default)
  scene.add(fallbackSky);

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(30, 30);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x8B7355,
    roughness: 0.9,
  });
  fallbackGround = new THREE.Mesh(groundGeo, groundMat);
  fallbackGround.rotation.x = -Math.PI / 2;
  fallbackGround.position.y = 0;
  fallbackGround.receiveShadow = true;
  fallbackGround.name = "fallbackGround";
  fallbackGround.visible = false;  // Hidden by default
  scene.add(fallbackGround);
}

// ============================================
// SETUP LIGHTS
// ============================================
function setupLights() {
  // Main directional light
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
  mainLight.position.set(2, 4, 3);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 15;
  mainLight.shadow.camera.left = -5;
  mainLight.shadow.camera.right = 5;
  mainLight.shadow.camera.top = 5;
  mainLight.shadow.camera.bottom = -5;
  scene.add(mainLight);

  // Fill light (softer, from side)
  const fillLight = new THREE.DirectionalLight(0xffeedd, 0.4);
  fillLight.position.set(-2, 2, 1);
  scene.add(fillLight);

  // Rim/back light
  const rimLight = new THREE.DirectionalLight(0xaaccff, 0.3);
  rimLight.position.set(0, 2, -2);
  scene.add(rimLight);

  // Ambient
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  // Hemisphere light for natural feel
  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.4);
  scene.add(hemi);
}

// ============================================
// UPDATE CAMERA - Based on room state
// ============================================
function updateCamera() {
  if (!camera || !avatarAnchor) return;
  
  const cfg = useRoom ? CONFIG.room : CONFIG.noRoom;
  
  camera.fov = cfg.cameraFOV;
  camera.updateProjectionMatrix();
  
  // Camera position relative to avatar anchor
  camera.position.set(
    avatarAnchor.position.x,
    cfg.cameraHeight,
    avatarAnchor.position.z + cfg.cameraDistance
  );
  
  // Look at avatar chest area
  camera.lookAt(
    avatarAnchor.position.x,
    cfg.cameraLookAtY,
    avatarAnchor.position.z
  );
}

// ============================================
// LOAD VRM AVATAR
// ============================================
export async function loadVRMAvatar(vrmPath) {
  console.log("[3D] Loading VRM:", vrmPath);

  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.classList.add("active");

  // Remove existing VRM from anchor
  if (currentVRM) {
    avatarAnchor.remove(currentVRM.scene);
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

        // Rotate to face camera
        vrm.scene.rotation.y = Math.PI;

        // Scale to target height
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const scale = CONFIG.avatarHeight / size.y;
        vrm.scene.scale.setScalar(scale);

        // Position: center horizontally, feet on ground (y=0)
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

        // ATTACH TO ANCHOR (not scene directly!)
        avatarAnchor.add(vrm.scene);
        
        currentVRM = vrm;
        avatarReady = true;

        // Reset timers
        idleTime = 0;
        blinkTimer = 0;
        gestureTimer = 0;
        lookTimer = 0;
        lookTarget = { x: 0, y: 0 };

        // Set pose
        setRelaxedPose(vrm);
        
        // Position avatar anchor based on room state
        positionAvatarAnchor();
        
        // Update camera
        updateCamera();

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded and anchored!");
        resolve(vrm);
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total * 100).toFixed(0);
          console.log(`[3D] VRM: ${percent}%`);
        }
      },
      (error) => {
        console.error("[3D] VRM failed:", error);
        if (loadingEl) loadingEl.classList.remove("active");
        reject(error);
      }
    );
  });
}

// ============================================
// POSITION AVATAR ANCHOR
// ============================================
function positionAvatarAnchor() {
  if (!avatarAnchor) return;
  
  const cfg = useRoom ? CONFIG.room : CONFIG.noRoom;
  
  // Avatar anchor position
  avatarAnchor.position.set(0, 0, cfg.avatarZ);
  
  console.log("[3D] Avatar anchor at:", avatarAnchor.position);
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
    roomAnchor.remove(currentRoom);
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
        
        console.log("[3D] Room original size:", roomSize);
        
        // Scale room to reasonable size (~8 meters wide)
        const targetWidth = 8;
        const roomScale = targetWidth / Math.max(roomSize.x, roomSize.z);
        room.scale.setScalar(roomScale);
        
        // Recalculate after scaling
        roomBox.setFromObject(room);
        
        // Position room: floor at y=0, centered on x/z
        const scaledCenter = roomBox.getCenter(new THREE.Vector3());
        room.position.set(
          -scaledCenter.x,
          -roomBox.min.y,
          -scaledCenter.z
        );
        
        // Enable shadows and double-sided materials
        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj.material) {
              obj.material.side = THREE.DoubleSide;
            }
          }
        });

        // Add to room anchor
        roomAnchor.add(room);
        currentRoom = room;
        
        // Enable room mode
        useRoom = true;
        
        // Hide fallback environment
        if (fallbackGround) fallbackGround.visible = false;
        if (fallbackSky) fallbackSky.visible = false;
        
        // Reposition avatar and camera
        positionAvatarAnchor();
        updateCamera();

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Room loaded! Scale:", roomScale.toFixed(2));
        resolve(room);
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total * 100).toFixed(0);
          console.log(`[3D] Room: ${percent}%`);
        }
      },
      (error) => {
        console.error("[3D] Room failed:", error);
        if (loadingEl) loadingEl.classList.remove("active");
        
        // Fallback to no-room mode
        enableFallbackEnvironment();
        reject(error);
      }
    );
  });
}

// ============================================
// REMOVE ROOM (show fallback)
// ============================================
export function removeRoom() {
  if (currentRoom) {
    roomAnchor.remove(currentRoom);
    currentRoom = null;
  }
  
  enableFallbackEnvironment();
  console.log("[3D] Room removed");
}

// ============================================
// ENABLE FALLBACK ENVIRONMENT
// ============================================
function enableFallbackEnvironment() {
  useRoom = false;
  
  if (fallbackGround) fallbackGround.visible = true;
  if (fallbackSky) fallbackSky.visible = true;
  
  positionAvatarAnchor();
  updateCamera();
}

// ============================================
// HAS ROOM
// ============================================
export function hasRoom() {
  return currentRoom !== null;
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

    console.log("[3D] ✅ Relaxed pose set");
  } catch (e) {
    console.warn("[3D] Pose error:", e);
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
  const breathOffset = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2) * CONFIG.breathingAmount;
  
  const chest = currentVRM.humanoid?.getNormalizedBoneNode("chest");
  const upperChest = currentVRM.humanoid?.getNormalizedBoneNode("upperChest");
  
  if (upperChest) upperChest.rotation.x = breathOffset * 1.2;
  if (chest) chest.rotation.x = breathOffset * 0.8;
}

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

  head.rotation.y += (lookTarget.x - (head.rotation.y || 0)) * 0.04;
  head.rotation.x += (lookTarget.y - (head.rotation.x || 0)) * 0.04;

  if (neck) {
    neck.rotation.y = head.rotation.y * 0.3;
    neck.rotation.x = head.rotation.x * 0.2;
  }
}

function updateArmMovement() {
  const leftUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = currentVRM.humanoid?.getNormalizedBoneNode("rightUpperArm");

  const armSway = Math.sin(idleTime * CONFIG.armSwaySpeed) * CONFIG.armSwayAmount;
  
  if (leftUpperArm) {
    leftUpperArm.rotation.z = baseRotations.leftUpperArm.z + armSway;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = baseRotations.rightUpperArm.z - armSway;
  }
}

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
function updateLipSync() {
  if (!currentVRM?.expressionManager) return;

  currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * CONFIG.lipSyncSmooth;

  const expr = currentVRM.expressionManager;
  
  if (expr.expressionMap["aa"]) expr.setValue("aa", currentMouthOpenness * 0.8);
  if (expr.expressionMap["oh"]) expr.setValue("oh", currentMouthOpenness * 0.3 * Math.abs(Math.sin(idleTime * 10)));
  if (expr.expressionMap["ih"]) expr.setValue("ih", currentMouthOpenness * 0.2 * Math.abs(Math.cos(idleTime * 12)));
}

// ============================================
// TALKING CONTROL
// ============================================
export function avatarStartTalking() {
  isTalking = true;
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
// ANIMATION LOOP
// ============================================
function animate() {
  rafId = requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (currentVRM && avatarReady) {
    updateIdleAnimation(delta);
    updateBlinking(delta);
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
// CLEANUP
// ============================================
export function dispose3D() {
  if (rafId) cancelAnimationFrame(rafId);
  
  if (currentVRM) {
    avatarAnchor?.remove(currentVRM.scene);
    VRMUtils.deepDispose(currentVRM.scene);
    currentVRM = null;
  }
  
  if (currentRoom) {
    roomAnchor?.remove(currentRoom);
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
export function isAvatarReady() { return avatarReady; }
export function getVRM() { return currentVRM; }
export function getScene() { return scene; }
export function isRoomMode() { return useRoom; }

// For toggling room on/off from UI
export function setRoomMode(enabled) {
  useRoom = enabled;
  
  if (enabled && currentRoom) {
    if (fallbackGround) fallbackGround.visible = false;
    if (fallbackSky) fallbackSky.visible = false;
  } else {
    if (fallbackGround) fallbackGround.visible = true;
    if (fallbackSky) fallbackSky.visible = true;
  }
  
  positionAvatarAnchor();
  updateCamera();
}