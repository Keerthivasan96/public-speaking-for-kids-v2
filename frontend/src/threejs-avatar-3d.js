// ============================================
// threejs-avatar-3d.js - COMPLETE VERSION
// Room as default environment, avatar properly positioned
// Full animations, lip sync, blinking, gestures
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

// Anchor system (Replika-style)
let avatarAnchor = null;
let roomAnchor = null;

// Environment
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
// CONFIGURATION
// ============================================
const CONFIG = {
  // Avatar settings
  avatarHeight: 1.55,
  
  // Camera - positioned to see avatar with room as background
  cameraDistance: 2.8,
  cameraHeight: 1.15,
  cameraLookAtY: 1.0,
  cameraFOV: 35,
  
  // Avatar position - in FRONT of room furniture
  avatarX: 0,
  avatarY: 0,
  avatarZ: 2.0,
  
  // Room settings
  roomScale: 0.35,
  roomZ: -3,
  
  // Fallback sky colors
  skyTopColor: 0x87CEEB,
  skyBottomColor: 0xE6B3CC,
  groundColor: 0x8B7355,
  groundSize: 30,
  
  // Breathing animation - subtle chest movement
  breathingSpeed: 0.5,
  breathingAmount: 0.005,
  
  // Head movement - occasional looking around
  lookAroundInterval: 5000,
  lookAroundDuration: 2500,
  lookAmountX: 0.12,
  lookAmountY: 0.06,
  lookSmoothing: 0.04,
  
  // Arm micro-movement - very subtle sway
  armSwayAmount: 0.01,
  armSwaySpeed: 0.3,
  
  // Occasional gestures
  gestureInterval: 12000,
  gestureDuration: 1800,
  gestureAmount: 0.15,
  
  // Blinking
  blinkInterval: 3000,
  blinkVariation: 2000,
  blinkDuration: 120,
  doubleBinkChance: 0.25,
  
  // Lip sync
  lipSyncSmooth: 0.15,
  lipSyncIntensity: 0.8,
  
  // Shoulder breathing
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
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Style canvas
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  
  container.appendChild(renderer.domElement);

  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  // Create anchor system
  createAnchors();
  
  // Create fallback environment
  createFallbackEnvironment();
  
  // Create camera
  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  
  // Setup lights
  setupLights();
  
  // Position camera
  updateCamera();

  // Event listeners
  window.addEventListener("resize", onResize, { passive: true });

  // Start animation loop
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
  
  // Avatar anchor - avatar attaches here
  avatarAnchor = new THREE.Object3D();
  avatarAnchor.name = "avatarAnchor";
  avatarAnchor.position.set(CONFIG.avatarX, CONFIG.avatarY, CONFIG.avatarZ);
  scene.add(avatarAnchor);
  
  console.log("[3D] ✅ Anchor system created");
}

// ============================================
// CREATE FALLBACK ENVIRONMENT
// ============================================
function createFallbackEnvironment() {
  // Gradient sky sphere
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
    side: THREE.BackSide,
    depthWrite: false
  });
  
  fallbackSky = new THREE.Mesh(skyGeo, skyMat);
  fallbackSky.name = "fallbackSky";
  fallbackSky.visible = false;
  scene.add(fallbackSky);

  // Ground plane with gradient
  const groundGeo = new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize, 1, 1);
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
  
  fallbackGround = new THREE.Mesh(groundGeo, groundMat);
  fallbackGround.rotation.x = -Math.PI / 2;
  fallbackGround.position.y = 0;
  fallbackGround.receiveShadow = true;
  fallbackGround.name = "fallbackGround";
  fallbackGround.visible = false;
  scene.add(fallbackGround);
  
  console.log("[3D] ✅ Fallback environment created");
}

// ============================================
// SETUP LIGHTING
// ============================================
function setupLights() {
  // Clear existing lights
  const lightsToRemove = [];
  scene.traverse((obj) => {
    if (obj.isLight) lightsToRemove.push(obj);
  });
  lightsToRemove.forEach(l => scene.remove(l));

  // Main directional light (key light)
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
  mainLight.position.set(3, 5, 4);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 20;
  mainLight.shadow.camera.left = -5;
  mainLight.shadow.camera.right = 5;
  mainLight.shadow.camera.top = 5;
  mainLight.shadow.camera.bottom = -5;
  mainLight.shadow.bias = -0.0001;
  scene.add(mainLight);

  // Fill light (softer, from side)
  const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
  fillLight.position.set(-3, 3, 2);
  scene.add(fillLight);

  // Rim/back light (for depth)
  const rimLight = new THREE.DirectionalLight(0xaaccff, 0.4);
  rimLight.position.set(0, 3, -3);
  scene.add(rimLight);

  // Ambient light (base illumination)
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  // Hemisphere light (sky/ground color blend)
  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.5);
  scene.add(hemi);
  
  console.log("[3D] ✅ Lighting setup complete");
}

// ============================================
// UPDATE CAMERA
// ============================================
function updateCamera() {
  if (!camera || !avatarAnchor) return;

  camera.position.set(
    avatarAnchor.position.x,
    CONFIG.cameraHeight,
    avatarAnchor.position.z + CONFIG.cameraDistance
  );

  camera.lookAt(
    avatarAnchor.position.x,
    CONFIG.cameraLookAtY,
    avatarAnchor.position.z
  );
  
  camera.updateProjectionMatrix();
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

        // Position: center horizontally, feet on ground
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
            if (obj.material) {
              obj.material.needsUpdate = true;
            }
          }
        });

        // Attach to anchor
        avatarAnchor.add(vrm.scene);
        
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
        
        // Update camera
        updateCamera();

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded successfully!");
        
        // Log available expressions
        if (vrm.expressionManager) {
          const expressions = Object.keys(vrm.expressionManager.expressionMap);
          console.log("[3D] Available expressions:", expressions);
        }

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
        const box = new THREE.Box3().setFromObject(room);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        console.log("[3D] Room original size:", size.x.toFixed(2), "x", size.y.toFixed(2), "x", size.z.toFixed(2));

        // Scale room
        room.scale.setScalar(CONFIG.roomScale);

        // Recalculate after scaling
        box.setFromObject(room);
        const scaledCenter = box.getCenter(new THREE.Vector3());

        // Position: floor at y=0, pushed back on Z axis
        room.position.set(
          -scaledCenter.x,
          -box.min.y,
          CONFIG.roomZ - scaledCenter.z
        );

        // Enable shadows and fix materials
        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj.material) {
              obj.material.side = THREE.DoubleSide;
              obj.material.needsUpdate = true;
            }
          }
        });

        // Add to room anchor
        roomAnchor.add(room);
        currentRoom = room;
        hasRoomLoaded = true;

        // Hide fallback environment
        if (fallbackSky) fallbackSky.visible = false;
        if (fallbackGround) fallbackGround.visible = false;

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Room loaded! Scale:", CONFIG.roomScale);
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
        
        // Use fallback environment
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
  // Remove room if exists
  if (currentRoom) {
    roomAnchor.remove(currentRoom);
    currentRoom = null;
  }
  
  hasRoomLoaded = false;
  
  // Show fallback sky and ground
  if (fallbackSky) fallbackSky.visible = true;
  if (fallbackGround) fallbackGround.visible = true;
  
  console.log("[3D] ✅ Using fallback environment (sky + ground)");
}

// ============================================
// SET RELAXED POSE
// ============================================
function setRelaxedPose(vrm) {
  if (!vrm?.humanoid) return;

  try {
    // Upper arms - down at sides
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

    // Lower arms - slight bend
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

    // Hands - natural position
    const leftHand = vrm.humanoid.getNormalizedBoneNode("leftHand");
    const rightHand = vrm.humanoid.getNormalizedBoneNode("rightHand");
    
    if (leftHand) {
      leftHand.rotation.set(
        baseRotations.leftHand.x,
        baseRotations.leftHand.y,
        baseRotations.leftHand.z
      );
    }
    if (rightHand) {
      rightHand.rotation.set(
        baseRotations.rightHand.x,
        baseRotations.rightHand.y,
        baseRotations.rightHand.z
      );
    }

    console.log("[3D] ✅ Relaxed pose applied");
  } catch (e) {
    console.warn("[3D] Pose setup error:", e);
  }
}

// ============================================
// IDLE ANIMATION - Main update function
// ============================================
function updateIdleAnimation(delta) {
  if (!currentVRM || !avatarReady) return;

  idleTime += delta;

  // Update all animation components
  updateBreathing();
  updateHeadMovement(delta);
  updateArmMovement();
  updateGestures(delta);
}

// ============================================
// BREATHING ANIMATION
// ============================================
function updateBreathing() {
  if (!currentVRM?.humanoid) return;

  const breathCycle = Math.sin(idleTime * CONFIG.breathingSpeed * Math.PI * 2);
  const breathOffset = breathCycle * CONFIG.breathingAmount;
  
  // Chest expansion
  const chest = currentVRM.humanoid.getNormalizedBoneNode("chest");
  const upperChest = currentVRM.humanoid.getNormalizedBoneNode("upperChest");
  const spine = currentVRM.humanoid.getNormalizedBoneNode("spine");
  
  if (upperChest) {
    upperChest.rotation.x = breathOffset * 1.5;
  }
  if (chest) {
    chest.rotation.x = breathOffset;
  }
  if (spine) {
    spine.rotation.x = breathOffset * 0.3;
  }
  
  // Subtle shoulder rise with breath
  const leftShoulder = currentVRM.humanoid.getNormalizedBoneNode("leftShoulder");
  const rightShoulder = currentVRM.humanoid.getNormalizedBoneNode("rightShoulder");
  
  if (leftShoulder) {
    leftShoulder.position.y = breathCycle * CONFIG.shoulderBreathAmount;
  }
  if (rightShoulder) {
    rightShoulder.position.y = breathCycle * CONFIG.shoulderBreathAmount;
  }
}

// ============================================
// HEAD MOVEMENT - Looking around naturally
// ============================================
function updateHeadMovement(delta) {
  if (!currentVRM?.humanoid) return;

  const head = currentVRM.humanoid.getNormalizedBoneNode("head");
  const neck = currentVRM.humanoid.getNormalizedBoneNode("neck");
  
  if (!head) return;

  // Update look timer
  lookTimer += delta * 1000;

  // Decide to look somewhere new
  if (lookTimer > CONFIG.lookAroundInterval + Math.random() * CONFIG.lookAroundDuration) {
    lookTarget.x = (Math.random() - 0.5) * 2 * CONFIG.lookAmountX;
    lookTarget.y = (Math.random() - 0.5) * 2 * CONFIG.lookAmountY;
    lookTimer = 0;
  }

  // Return to center after looking duration
  if (lookTimer > CONFIG.lookAroundDuration && lookTimer < CONFIG.lookAroundInterval) {
    lookTarget.x *= 0.98;
    lookTarget.y *= 0.98;
  }

  // Smooth interpolation
  currentLook.x += (lookTarget.x - currentLook.x) * CONFIG.lookSmoothing;
  currentLook.y += (lookTarget.y - currentLook.y) * CONFIG.lookSmoothing;

  // Apply to head
  head.rotation.y = currentLook.x;
  head.rotation.x = currentLook.y;

  // Neck follows head slightly
  if (neck) {
    neck.rotation.y = currentLook.x * 0.3;
    neck.rotation.x = currentLook.y * 0.25;
  }
}

// ============================================
// ARM MOVEMENT - Subtle micro-movements
// ============================================
function updateArmMovement() {
  if (!currentVRM?.humanoid || isGesturing) return;

  const leftUpperArm = currentVRM.humanoid.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = currentVRM.humanoid.getNormalizedBoneNode("rightUpperArm");
  const leftLowerArm = currentVRM.humanoid.getNormalizedBoneNode("leftLowerArm");
  const rightLowerArm = currentVRM.humanoid.getNormalizedBoneNode("rightLowerArm");

  // Subtle sway synchronized with breathing
  const armSway = Math.sin(idleTime * CONFIG.armSwaySpeed) * CONFIG.armSwayAmount;
  const armSway2 = Math.sin(idleTime * CONFIG.armSwaySpeed * 0.7 + 0.5) * CONFIG.armSwayAmount * 0.7;
  
  if (leftUpperArm) {
    leftUpperArm.rotation.z = baseRotations.leftUpperArm.z + armSway;
    leftUpperArm.rotation.x = baseRotations.leftUpperArm.x + armSway2 * 0.3;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = baseRotations.rightUpperArm.z - armSway;
    rightUpperArm.rotation.x = baseRotations.rightUpperArm.x + armSway2 * 0.3;
  }

  // Lower arms micro-movement
  if (leftLowerArm) {
    leftLowerArm.rotation.y = baseRotations.leftLowerArm.y + armSway * 0.4;
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.y = baseRotations.rightLowerArm.y + armSway * 0.4;
  }
}

// ============================================
// OCCASIONAL GESTURES
// ============================================
function updateGestures(delta) {
  if (!currentVRM?.humanoid) return;

  gestureTimer += delta * 1000;

  // Start a new gesture occasionally
  if (!isGesturing && gestureTimer > CONFIG.gestureInterval + Math.random() * 5000) {
    isGesturing = true;
    gestureProgress = 0;
    gestureTimer = 0;
    gestureType = Math.floor(Math.random() * 3); // 0, 1, or 2
  }

  if (isGesturing) {
    gestureProgress += delta * 1000;
    
    const progress = gestureProgress / CONFIG.gestureDuration;
    const eased = Math.sin(progress * Math.PI); // Smooth in-out
    
    const rightUpperArm = currentVRM.humanoid.getNormalizedBoneNode("rightUpperArm");
    const rightLowerArm = currentVRM.humanoid.getNormalizedBoneNode("rightLowerArm");
    const leftUpperArm = currentVRM.humanoid.getNormalizedBoneNode("leftUpperArm");
    
    // Different gesture types
    switch (gestureType) {
      case 0: // Right hand slight raise
        if (rightUpperArm) {
          rightUpperArm.rotation.z = baseRotations.rightUpperArm.z + eased * CONFIG.gestureAmount;
          rightUpperArm.rotation.x = baseRotations.rightUpperArm.x - eased * CONFIG.gestureAmount * 0.5;
        }
        if (rightLowerArm) {
          rightLowerArm.rotation.y = baseRotations.rightLowerArm.y - eased * CONFIG.gestureAmount;
        }
        break;
        
      case 1: // Left hand slight raise
        if (leftUpperArm) {
          leftUpperArm.rotation.z = baseRotations.leftUpperArm.z - eased * CONFIG.gestureAmount;
          leftUpperArm.rotation.x = baseRotations.leftUpperArm.x - eased * CONFIG.gestureAmount * 0.5;
        }
        break;
        
      case 2: // Both hands slight adjustment
        if (rightUpperArm) {
          rightUpperArm.rotation.z = baseRotations.rightUpperArm.z + eased * CONFIG.gestureAmount * 0.7;
        }
        if (leftUpperArm) {
          leftUpperArm.rotation.z = baseRotations.leftUpperArm.z - eased * CONFIG.gestureAmount * 0.7;
        }
        break;
    }

    // End gesture
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
    
    // Blink
    if (expr.expressionMap["blink"]) {
      expr.setValue("blink", 1.0);
      
      setTimeout(() => {
        if (currentVRM?.expressionManager?.expressionMap["blink"]) {
          currentVRM.expressionManager.setValue("blink", 0.0);
          
          // Chance of double blink
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

  // Smooth interpolation to target
  currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * CONFIG.lipSyncSmooth;

  const expr = currentVRM.expressionManager;
  const intensity = CONFIG.lipSyncIntensity;
  
  // Primary mouth shape (aa)
  if (expr.expressionMap["aa"]) {
    expr.setValue("aa", currentMouthOpenness * intensity);
  }
  
  // Secondary shapes for variety
  if (expr.expressionMap["oh"]) {
    expr.setValue("oh", currentMouthOpenness * 0.3 * Math.abs(Math.sin(idleTime * 10)));
  }
  if (expr.expressionMap["ih"]) {
    expr.setValue("ih", currentMouthOpenness * 0.2 * Math.abs(Math.cos(idleTime * 12)));
  }

  // Slight expression while talking
  if (expr.expressionMap["happy"]) {
    expr.setValue("happy", currentMouthOpenness * 0.1);
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
  
  // Reset all mouth expressions
  if (currentVRM?.expressionManager) {
    const expr = currentVRM.expressionManager;
    const mouthExpressions = ["aa", "oh", "ih", "ou", "ee", "a"];
    mouthExpressions.forEach(name => {
      if (expr.expressionMap[name]) {
        expr.setValue(name, 0);
      }
    });
    if (expr.expressionMap["happy"]) {
      expr.setValue("happy", 0);
    }
  }
  
  console.log("[3D] 🤐 Avatar stopped talking");
}

function animateTalking() {
  if (!isTalking) {
    targetMouthOpenness = 0;
    return;
  }

  const time = Date.now() * 0.001;
  
  // Create natural speech-like variation
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

    // Update VRM
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
// CHANGE SKY COLORS
// ============================================
export function setSkyColors(topColor, bottomColor) {
  if (fallbackSky && fallbackSky.material.uniforms) {
    fallbackSky.material.uniforms.topColor.value.setHex(topColor);
    fallbackSky.material.uniforms.bottomColor.value.setHex(bottomColor);
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
export function isAvatarReady() {
  return avatarReady;
}

export function getVRM() {
  return currentVRM;
}

export function getScene() {
  return scene;
}

export function hasRoom() {
  return hasRoomLoaded;
}

export function getCamera() {
  return camera;
}

export function getRenderer() {
  return renderer;
}