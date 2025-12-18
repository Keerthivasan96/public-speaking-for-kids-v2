// ============================================
// threejs-avatar-3d.js - CINEMATIC VERSION
// Replika-style atmospheric lighting & composition
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

// Store base rotations
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

// Lighting objects
let keyLight, fillLight, rimLight, ambientLight, pointLights = [];

// ============================================
// SETTINGS - CINEMATIC REPLIKA STYLE
// ============================================
const CONFIG = {
  // Avatar
  avatarScale: 0.9,
  avatarPositionY: 0,
  
  // Camera - CINEMATIC COMPOSITION
  cameraDistance: 2.2,      // Close-up for intimacy
  cameraHeight: 1.35,       // Slightly below eye level
  cameraFOV: 38,            // Natural field of view
  cameraLookAtY: 1.25,      // Focus on face/upper body
  cameraAngleX: 0.08,       // Subtle downward angle
  
  // Room camera (when 3D room loaded)
  roomCameraDistance: 112.8,
  roomCameraHeight: 111.4,
  roomCameraLookAtY: 111.2,
  roomCameraOffsetX: 0.3,   // Slight side angle
  
  // Ground
  groundSize: 30,
  
  // Sky colors
  skyTopColor: 0x87CEEB,
  skyBottomColor: 0xE6B3CC,
  
  // Lighting - CINEMATIC 3-POINT SETUP
  keyLightIntensity: 2.5,
  keyLightColor: 0xfff5e6,      // Warm key light
  fillLightIntensity: 1.2,
  fillLightColor: 0xb3d9ff,     // Cool fill light
  rimLightIntensity: 1.8,
  rimLightColor: 0xffffff,
  ambientIntensity: 0.6,
  ambientColor: 0x404866,       // Subtle blue ambient
  
  // Atmospheric effects
  enableFog: true,
  fogColor: 0x1a1a2e,
  fogNear: 8,
  fogFar: 20,
  
  // Breathing
  breathingSpeed: 0.5,
  breathingAmount: 0.005,
  
  // Head movement
  lookAroundInterval: 5000,
  lookAroundDuration: 2500,
  lookAmountX: 0.12,
  lookAmountY: 0.06,
  
  // Arm movement
  armSwayAmount: 0.008,
  armSwaySpeed: 0.3,
  
  // Gestures
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

  // Renderer with enhanced settings
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;  // Slightly brighter
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f); // Dark background for contrast
  
  // Add atmospheric fog
  if (CONFIG.enableFog) {
    scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFar);
  }
  
  createSky();
  createGround();
  
  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFOV,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  
  updateCameraPosition();
  setupCinematicLights();

  window.addEventListener("resize", onResize, { passive: true });

  animate();

  console.log("[3D] ✅ Cinematic scene initialized");
  return true;
}

// ============================================
// UPDATE CAMERA POSITION - CINEMATIC ANGLES
// ============================================
function updateCameraPosition() {
  const hasRoomLoaded = currentRoom !== null;
  
  if (hasRoomLoaded) {
    // Room view - slightly off-center for depth
    camera.position.set(
      CONFIG.roomCameraOffsetX,
      CONFIG.roomCameraHeight,
      CONFIG.roomCameraDistance
    );
    camera.lookAt(0, CONFIG.roomCameraLookAtY, 0);
  } else {
    // Default view - centered
    camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
    camera.lookAt(0, CONFIG.cameraLookAtY, 0);
  }
  
  camera.rotation.x -= CONFIG.cameraAngleX;
  
  console.log("[3D] Camera positioned:", camera.position);
}

// ============================================
// CINEMATIC 3-POINT LIGHTING SETUP
// ============================================
function setupCinematicLights() {
  // Clear existing lights
  scene.children = scene.children.filter(child => 
    !(child instanceof THREE.Light)
  );
  pointLights = [];

  // 1. AMBIENT - Soft base illumination
  ambientLight = new THREE.AmbientLight(
    CONFIG.ambientColor,
    CONFIG.ambientIntensity
  );
  scene.add(ambientLight);

  // 2. KEY LIGHT - Main dramatic light (front-right)
  keyLight = new THREE.DirectionalLight(
    CONFIG.keyLightColor,
    CONFIG.keyLightIntensity
  );
  keyLight.position.set(3, 4, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 15;
  keyLight.shadow.camera.left = -4;
  keyLight.shadow.camera.right = 4;
  keyLight.shadow.camera.top = 4;
  keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.bias = -0.0001;
  scene.add(keyLight);

  // 3. FILL LIGHT - Soften shadows (front-left)
  fillLight = new THREE.DirectionalLight(
    CONFIG.fillLightColor,
    CONFIG.fillLightIntensity
  );
  fillLight.position.set(-2.5, 2, 2);
  scene.add(fillLight);

  // 4. RIM LIGHT - Edge highlight (back)
  rimLight = new THREE.DirectionalLight(
    CONFIG.rimLightColor,
    CONFIG.rimLightIntensity
  );
  rimLight.position.set(0, 3, -4);
  scene.add(rimLight);

  // 5. HEMISPHERE - Natural sky/ground bounce
  const hemiLight = new THREE.HemisphereLight(
    0x4a5f8f,  // Sky color - cool blue
    0x2a2a3e,  // Ground color - dark purple
    0.5
  );
  scene.add(hemiLight);

  // 6. ACCENT POINT LIGHTS - Add depth & atmosphere
  const accentLight1 = new THREE.PointLight(0x00d4ff, 1.5, 8);
  accentLight1.position.set(-3, 2, 1);
  scene.add(accentLight1);
  pointLights.push(accentLight1);

  const accentLight2 = new THREE.PointLight(0xff6b9d, 1.2, 6);
  accentLight2.position.set(2, 1.5, -2);
  scene.add(accentLight2);
  pointLights.push(accentLight2);

  console.log("[3D] ✅ Cinematic lighting setup complete");
}

// ============================================
// ROOM-SPECIFIC LIGHTING ENHANCEMENT
// ============================================
function enhanceRoomLighting() {
  if (!currentRoom) return;

  // Add room-specific atmospheric lights
  const roomAccent1 = new THREE.PointLight(0x00ffff, 2.0, 10);
  roomAccent1.position.set(0, 2.5, -3);
  scene.add(roomAccent1);
  pointLights.push(roomAccent1);

  const roomAccent2 = new THREE.PointLight(0xff00ff, 1.8, 8);
  roomAccent2.position.set(3, 2, 0);
  scene.add(roomAccent2);
  pointLights.push(roomAccent2);

  // Increase key light for room scenes
  if (keyLight) keyLight.intensity = 3.0;
  if (ambientLight) ambientLight.intensity = 0.8;

  console.log("[3D] Room lighting enhanced");
}

// ============================================
// CREATE SKY - GRADIENT BACKDROP
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
// CREATE GROUND - SUBTLE GRADIENT
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
          -box.min.y * scale + CONFIG.avatarPositionY,
          -center.z * scale
        );

        // Enhanced material properties for better lighting response
        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            
            if (obj.material) {
              obj.material.side = THREE.FrontSide;
              obj.material.depthWrite = true;
              obj.material.depthTest = true;
              
              // Enhance lighting interaction
              if (obj.material.type === 'MeshStandardMaterial') {
                obj.material.roughness = Math.max(obj.material.roughness || 0.5, 0.4);
                obj.material.metalness = Math.min(obj.material.metalness || 0, 0.2);
              }
            }
          }
        });

        scene.add(vrm.scene);
        currentVRM = vrm;
        avatarReady = true;

        idleTime = 0;
        blinkTimer = 0;
        gestureTimer = 0;
        lookTimer = 0;
        lookTarget = { x: 0, y: 0 };

        setRelaxedPose(vrm);

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ VRM loaded with cinematic lighting!");
        
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
// LOAD ROOM MODEL - WITH PROPER POSITIONING
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
        
        const roomBox = new THREE.Box3().setFromObject(room);
        const roomSize = roomBox.getSize(new THREE.Vector3());
        const roomCenter = roomBox.getCenter(new THREE.Vector3());
        
        console.log("[3D] Room bounds:", {
          size: roomSize,
          center: roomCenter,
          min: roomBox.min,
          max: roomBox.max
        });
        
        // Position room: floor at y=0, centered horizontally
        room.position.set(
          -roomCenter.x,
          -roomBox.min.y,
          -roomCenter.z + 1.5  // Push room back slightly
        );
        
        // Optional scaling for Tron Studio (it's usually well-scaled)
        // Uncomment if needed:
        // room.scale.setScalar(0.8);
        
        // Enhance materials for cinematic look
        room.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            
            if (obj.material) {
              obj.material.side = THREE.FrontSide;
              obj.material.depthWrite = true;
              obj.material.depthTest = true;
              
              // Enhance emissive materials (screens, lights in room)
              if (obj.material.emissive) {
                obj.material.emissiveIntensity = 1.5;
              }
              
              // Adjust metallicness for sci-fi look
              if (obj.material.metalness !== undefined) {
                obj.material.metalness = Math.min(obj.material.metalness * 1.2, 0.9);
              }
              if (obj.material.roughness !== undefined) {
                obj.material.roughness = Math.max(obj.material.roughness, 0.3);
              }
            }
          }
        });

        // Hide default environment
        if (defaultGround) defaultGround.visible = false;
        if (defaultSky) defaultSky.visible = false;

        scene.add(room);
        currentRoom = room;
        
        // Update lighting and camera for room
        enhanceRoomLighting();
        updateCameraPosition();
        
        // Reposition avatar if loaded
        if (currentVRM) {
          positionAvatarInRoom();
        }

        if (loadingEl) loadingEl.classList.remove("active");

        console.log("[3D] ✅ Room loaded with cinematic setup!");
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
  
  // Avatar stands on floor, slightly forward in frame
  currentVRM.scene.position.z = 0.8;
  currentVRM.scene.position.x = 0;
  
  console.log("[3D] Avatar positioned in room:", currentVRM.scene.position);
}

// ============================================
// REMOVE ROOM
// ============================================
export function removeRoom() {
  if (currentRoom) {
    scene.remove(currentRoom);
    currentRoom = null;
  }
  
  // Remove room-specific lights
  pointLights.forEach(light => {
    if (light.parent) scene.remove(light);
  });
  pointLights = [];
  
  // Reset lighting
  if (keyLight) keyLight.intensity = CONFIG.keyLightIntensity;
  if (ambientLight) ambientLight.intensity = CONFIG.ambientIntensity;
  
  // Show default environment
  if (defaultGround) defaultGround.visible = true;
  if (defaultSky) defaultSky.visible = true;
  
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
    console.log("[3D] Avatar position:", currentVRM.scene.position);
  }
}

export function adjustCameraPosition(distance, height, lookAtY) {
  if (camera) {
    camera.position.set(0, height, distance);
    camera.lookAt(0, lookAtY, 0);
    console.log("[3D] Camera:", camera.position);
  }
}

export function adjustLighting(keyIntensity, fillIntensity, rimIntensity) {
  if (keyLight) keyLight.intensity = keyIntensity;
  if (fillLight) fillLight.intensity = fillIntensity;
  if (rimLight) rimLight.intensity = rimIntensity;
  console.log("[3D] Lighting adjusted");
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
