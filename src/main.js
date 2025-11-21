import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { vertexShader, fragmentShaderCorona } from "./SunShaders.js";
import { bhVertexShader, bhFragmentShader } from "./BlackHoleShaders.js";

// TEMP OBJECTS TO AVOID PER-FRAME ALLOCATIONS
const TMP_VEC3 = new THREE.Vector3();
const TMP_DUMMY = new THREE.Object3D();

// SHARED GEOMETRIES
const PLANET_SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 32, 24);
const SUN_CORONA_GEOMETRY = new THREE.SphereGeometry(0.5, 32, 24);
const SATURN_RING_GEOMETRY = new THREE.RingGeometry(1.4, 2.2, 48);

const SATELLITE_DIST_FACTOR = 50.0;

const TEXTURES_DIR = "textures/";

const DEFAULTS = {
  planetVisualScale: 5.0,
  universeScale: 2.0,
  orbitOpacity: 0.4,
  orbitColor: "#7afff0",
  uiOpacity: 0.1,
  meteorCount: 2000,
  meteorSize: 3.0,
  meteorSpeed: 1.0,
  blackHoleVisible: false,
};

const SETTINGS = {
  planetVisualScale: DEFAULTS.planetVisualScale,
  universeScale: DEFAULTS.universeScale,
  orbitOpacity: DEFAULTS.orbitOpacity,
  orbitColor: DEFAULTS.orbitColor,
  uiOpacity: DEFAULTS.uiOpacity,
  meteorCount: DEFAULTS.meteorCount,
  meteorSize: DEFAULTS.meteorSize,
  meteorSpeed: DEFAULTS.meteorSpeed,
  blackHoleVisible: DEFAULTS.blackHoleVisible,
};

const CELESTIAL_BODIES = [
  {
    name: "Sun",
    radius: 0.05,
    elements: { a: 0, e: 0, i: 0, L: 0, w: 0, o: 0 },
    rotPeriod: 600,
    baseColor: 0xffff00,
    texture: "sun_smallsize.jpeg",
    isStar: true,
  },
  {
    name: "Mercury",
    radius: 0.005,
    elements: {
      a: 0.387098,
      e: 0.20563,
      i: 7.00487,
      L: 252.25084,
      w: 77.45645,
      o: 48.33167,
    },
    rotPeriod: 1407.6,
    baseColor: 0xaaaaaa,
    texture: "mercury_smallsize.jpeg",
  },
  {
    name: "Venus",
    radius: 0.012,
    elements: {
      a: 0.723332,
      e: 0.006773,
      i: 3.39471,
      L: 181.97973,
      w: 131.53298,
      o: 76.68069,
    },
    rotPeriod: -5832.5,
    baseColor: 0xeecb8b,
    texture: "venus_smallsize.jpeg",
  },
  {
    name: "Earth",
    radius: 0.013,
    elements: {
      a: 1.0,
      e: 0.016708,
      i: 0.00005,
      L: 100.46435,
      w: 102.94719,
      o: 0,
    },
    rotPeriod: 23.9,
    baseColor: 0x2233ff,
    texture: "earth_smallsize.jpeg",
    satellites: [
      {
        name: "Moon",
        radius: 0.0035,
        elements: {
          a: 0.00257,
          e: 0.0549,
          i: 5.145,
          L: 218.31617,
          w: 318.15,
          o: 125.08,
        },
        distanceFactor: 50.0,
        rotPeriod: 655.7,
        baseColor: 0x888888,
        texture: "moon_smallsize.jpeg",
      },
    ],
  },
  {
    name: "Mars",
    radius: 0.007,
    elements: {
      a: 1.523679,
      e: 0.0934,
      i: 1.85,
      L: -4.55,
      w: 336.04,
      o: 49.57854,
    },
    rotPeriod: 24.6,
    baseColor: 0xff3300,
    texture: "mars_smallsize.jpeg",
  },
  {
    name: "Jupiter",
    radius: 0.04,
    elements: {
      a: 5.204267,
      e: 0.048498,
      i: 1.3053,
      L: 34.40438,
      w: 14.75385,
      o: 100.55615,
    },
    rotPeriod: 9.9,
    baseColor: 0xd8ca9d,
    texture: "jupiter_smallsize.jpeg",
    satellites: [
      {
        name: "Europa",
        radius: 0.0035,
        elements: {
          a: 0.00449,
          e: 0.009,
          i: 0.47,
          L: 200.39,
          w: 44.0,
          o: 219.106,
        },
        distanceFactor: 100.0,
        rotPeriod: 85.2,
        baseColor: 0xccccff,
        texture: "jupiter-europa-texture.jpeg",
      },
    ],
  },
  {
    name: "Saturn",
    radius: 0.035,
    elements: {
      a: 9.582017,
      e: 0.055546,
      i: 2.485,
      L: 49.94432,
      w: 92.43194,
      o: 113.71504,
    },
    rotPeriod: 10.7,
    baseColor: 0xc5ab6e,
    texture: "saturn_smallsize.jpeg",
    hasRing: true,
  },
  {
    name: "Uranus",
    radius: 0.02,
    elements: {
      a: 19.2184,
      e: 0.047318,
      i: 0.773,
      L: 313.23218,
      w: 170.96424,
      o: 74.22988,
    },
    rotPeriod: -17.2,
    baseColor: 0x4fd0e7,
    texture: "uranus_smallsize.jpeg",
  },
  {
    name: "Neptune",
    radius: 0.02,
    elements: {
      a: 30.0709,
      e: 0.008606,
      i: 1.77,
      L: -55.12,
      w: 44.97135,
      o: 131.7806,
    },
    rotPeriod: 16.1,
    baseColor: 0x2974ff,
    texture: "neptune_smallsize.jpeg",
  },
];

const STATE = {
  lastUIUpdate: 0,
  uiUpdateInterval: 0.25, // seconds
  speedMultiplier: 1,
  activeBodies: [],
  focusedBody: null,
  sunEffects: { glow: null, flares: [] },
  meteorSystem: { mesh: null, data: [] },

  // Black Hole System
  blackHole: {
    group: null,
    accretionDisk: null,
    eventHorizon: null,
    diskUniforms: null,
  },

  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  textureLoader: null,
  raycaster: new THREE.Raycaster(),
  mouse: new THREE.Vector2(),
  clock: new THREE.Clock(),
  simulationDate: new Date(),
};

const DEG_TO_RAD = Math.PI / 180;

function generateGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.25, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.3, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.5, "rgba(255, 200, 50, 0.9)");
  gradient.addColorStop(0.8, "rgba(255, 60, 0, 0.4)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function generateNoiseFlareTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.2, "rgba(255, 200, 50, 0.8)");
  gradient.addColorStop(0.5, "rgba(255, 50, 0, 0.2)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 20;
    const opacity = Math.random() * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 200, 100, ${opacity})`;
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function getJulianDate(date) {
  return (
    date.getTime() / 86400000 - date.getTimezoneOffset() / 1440 + 2440587.5
  );
}

function getOrbitPosition(elements, M_degrees) {
  const e = elements.e;
  const M = M_degrees * DEG_TO_RAD;
  let E = M;
  let delta = 1.0;
  let iter = 0;
  while (Math.abs(delta) > 1e-6 && iter < 100) {
    delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E = E - delta;
    iter++;
  }
  const a = elements.a;
  const X_orb = a * (Math.cos(E) - e);
  const Y_orb = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const i_rad = elements.i * DEG_TO_RAD;
  const o_rad = elements.o * DEG_TO_RAD;
  const w_rad = (elements.w - elements.o) * DEG_TO_RAD;
  const cos_o = Math.cos(o_rad);
  const sin_o = Math.sin(o_rad);
  const cos_w = Math.cos(w_rad);
  const sin_w = Math.sin(w_rad);
  const cos_i = Math.cos(i_rad);
  const sin_i = Math.sin(i_rad);
  const x_ecl =
    (cos_o * cos_w - sin_o * sin_w * cos_i) * X_orb +
    (-cos_o * sin_w - sin_o * cos_w * cos_i) * Y_orb;
  const y_ecl =
    (sin_o * cos_w + cos_o * sin_w * cos_i) * X_orb +
    (-sin_o * sin_w + cos_o * cos_w * cos_i) * Y_orb;
  const z_ecl = sin_w * sin_i * X_orb + cos_w * sin_i * Y_orb;
  return new THREE.Vector3(x_ecl, z_ecl, y_ecl);
}

function getMeanAnomaly(elements, jd) {
  const n = 0.9856076686 / Math.pow(elements.a, 1.5);
  const daysSinceJ2000 = jd - 2451545.0;
  const currentL = elements.L + n * daysSinceJ2000;
  return currentL - elements.w;
}

function initAssetLoader() {
  const manager = new THREE.LoadingManager();
  manager.onLoad = () => {
    const loader = document.getElementById("loader-container");
    loader.style.opacity = "0";
    animate();
    setTimeout(() => (loader.style.display = "none"), 500);
  };
  STATE.textureLoader = new THREE.TextureLoader(manager);
}

function initScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    20,
    window.innerWidth / window.innerHeight,
    0.001,
    2000
  );
  camera.position.set(0, 3, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // Downscale a bit to avoid huge GPU load on HiDPI
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Shadows are expensive; keep them but dial them down
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  STATE.scene = scene;
  STATE.camera = camera;
  STATE.renderer = renderer;
  STATE.controls = controls;

  window.addEventListener("resize", () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Keep black hole shader in sync with aspect
    if (STATE.blackHole.diskUniforms) {
      STATE.blackHole.diskUniforms.uAspect.value = aspect;
    }
  });

  renderer.domElement.addEventListener("pointerdown", onCanvasClick);
}

function onCanvasClick(event) {
  STATE.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  STATE.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  STATE.raycaster.setFromCamera(STATE.mouse, STATE.camera);
  const meshes = [];
  function gatherMeshes(body) {
    if (body.mesh) meshes.push(body.mesh);
    if (body.satellites) body.satellites.forEach(gatherMeshes);
  }
  STATE.activeBodies.forEach(gatherMeshes);
  const intersects = STATE.raycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    const selectedMesh = intersects[0].object;
    STATE.focusedBody = selectedMesh;
  }
}

function createLighting(scene) {
  const ambient = new THREE.AmbientLight(0x404040);
  scene.add(ambient);

  const sunLight = new THREE.PointLight(0xffffff, 1.4, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.bias = -0.00005;
  scene.add(sunLight);
}

function createStarField(scene) {
  const geo = new THREE.BufferGeometry();
  const verts = [];
  for (let i = 0; i < 5000; i++) {
    verts.push(
      (Math.random() - 0.5) * 1000,
      (Math.random() - 0.5) * 1000,
      (Math.random() - 0.5) * 1000
    );
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
  scene.add(new THREE.Points(geo, mat));
}

function addSunEffects(sunMesh) {
  const coronaGeo = SUN_CORONA_GEOMETRY;
  const coronaMat = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShaderCorona,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffaa00) },
      uRimPower: { value: 2.5 },
    },
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
  coronaMesh.scale.set(1.0, 1.0, 1.0);
  sunMesh.add(coronaMesh);
  STATE.sunEffects.glow = coronaMesh;

  const flareTexture = generateNoiseFlareTexture();
  const flareGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const flareMat = new THREE.SpriteMaterial({
      map: flareTexture,
      color: 0xffaf00,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flare = new THREE.Sprite(flareMat);
    const scale = 4 + Math.random() * 3;
    flare.scale.set(scale, scale, 1);
    flareGroup.add(flare);
    STATE.sunEffects.flares.push({
      sprite: flare,
      speed: (Math.random() - 0.5) * 0.01,
      baseScale: scale,
      pulseSpeed: 2 + Math.random() * 3,
    });
  }
  sunMesh.add(flareGroup);
}

function createBlackHole() {
  const aspect = window.innerWidth / window.innerHeight;
  const group = new THREE.Group();
  // Position far in the distance (Adjusted Z for better initial view)
  group.position.set(150, 20, -150);
  // Scale: large enough to be seen
  group.scale.set(50, 50, 50);

  const geometry = new THREE.PlaneGeometry(2, 1, 1, 1);

  const diskUniforms = {
    uTime: { value: 0.0 },
    uAspect: { value: aspect },
    uCameraDistance: { value: 5.0 }, // distance from camera to BH center in plane space
    uMaxDistance: { value: 40.0 },

    uBlackHoleRadius: { value: 0.001 },
    uLensStrength: { value: 0.18 },

    uDiskInnerRadius: { value: 1.4 },
    uDiskOuterRadius: { value: 5.0 },
    uDiskThickness: { value: 0.25 },

    uDiskColorInner: { value: new THREE.Color(1.0, 0.95, 0.8) },
    uDiskColorOuter: { value: new THREE.Color(1.0, 0.4, 0.05) },
    uDopplerStrength: { value: 0.9 },

    uBackgroundColor: { value: new THREE.Color(0.03, 0.04, 0.08) },
    uGlowStrength: { value: 1.5 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: bhVertexShader,
    fragmentShader: bhFragmentShader,
    uniforms: diskUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  STATE.scene.add(group);
  STATE.blackHole = {
    group: group,
    diskUniforms: diskUniforms,
    mesh: mesh,
  };

  group.visible = SETTINGS.blackHoleVisible;
}

function createCelestialBody(data, parentObject) {
  // Reuse shared sphere geometry instead of creating a new one per body
  const geo = PLANET_SPHERE_GEOMETRY;
  let mat;

  try {
    const tex = STATE.textureLoader.load(TEXTURES_DIR + data.texture);
    if (data.isStar) {
      mat = new THREE.MeshBasicMaterial({ map: tex, color: data.baseColor });
    } else {
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xffffff,
        roughness: 0.6,
        metalness: 0.2,
      });
    }
  } catch (e) {
    mat = new THREE.MeshStandardMaterial({ color: data.baseColor });
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(data.radius, data.radius, data.radius);

  if (data.isStar) {
    addSunEffects(mesh);
  } else {
    mesh.castShadow = data.radius > 0.01;
    mesh.receiveShadow = data.radius > 0.01;
  }

  parentObject.add(mesh);

  let orbitLine = null;
  if (data.elements.a > 0) {
    const points = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const M = (i / segments) * 360;
      const pos = getOrbitPosition(data.elements, M);
      points.push(pos);
    }
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(SETTINGS.orbitColor),
      transparent: true,
      opacity: SETTINGS.orbitOpacity,
    });
    orbitLine = new THREE.LineLoop(orbitGeometry, orbitMaterial);
    parentObject.add(orbitLine);
  }

  if (data.hasRing) {
    const ringTex = STATE.textureLoader.load(TEXTURES_DIR + "saturn-ring.jpg");
    const ringMat = new THREE.MeshStandardMaterial({
      map: ringTex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(SATURN_RING_GEOMETRY, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.receiveShadow = true;
    mesh.add(ring);
  }

  const bodyObject = {
    mesh,
    data,
    orbitLine,
    satellites: [],
  };

  if (data.satellites && data.satellites.length > 0) {
    data.satellites.forEach((satData) => {
      const satObj = createCelestialBody(satData, mesh);
      bodyObject.satellites.push(satObj);
    });
  }

  return bodyObject;
}

function createSolarSystem(scene) {
  CELESTIAL_BODIES.forEach((data) => {
    const bodyObj = createCelestialBody(data, scene);
    STATE.activeBodies.push(bodyObj);
  });
}

// METEOROID SYSTEM
function createMeteoroids() {
  if (STATE.meteorSystem.mesh) {
    STATE.scene.remove(STATE.meteorSystem.mesh);
    STATE.meteorSystem.mesh.geometry.dispose();
    STATE.meteorSystem.mesh.material.dispose();
    STATE.meteorSystem.data = [];
  }
  const count = SETTINGS.meteorCount;
  if (count === 0) return;
  const geometry = new THREE.DodecahedronGeometry(
    0.003 * SETTINGS.meteorSize,
    0
  );
  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.9,
    metalness: 0.1,
  });
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const dataArray = [];
  for (let i = 0; i < count; i++) {
    let orbitRadius, angle, yOffset;
    let collision = true;
    let attempts = 0;
    while (collision && attempts < 10) {
      collision = false;
      if (Math.random() > 0.3) {
        orbitRadius = 2.0 + Math.random() * 2.5;
      } else {
        orbitRadius = 30.0 + Math.random() * 20.0;
      }
      CELESTIAL_BODIES.forEach((body) => {
        if (body.elements.a > 0) {
          if (Math.abs(orbitRadius - body.elements.a) < 0.3) {
            collision = true;
          }
        }
      });
      attempts++;
    }
    angle = Math.random() * Math.PI * 2;
    yOffset = (Math.random() - 0.5) * 0.2 * orbitRadius;
    const speed = 0.02 / Math.sqrt(orbitRadius);
    const rotationAxis = new THREE.Vector3(
      Math.random(),
      Math.random(),
      Math.random()
    ).normalize();
    const rotationSpeed = Math.random() * 0.05;
    dataArray.push({
      orbitRadius,
      angle,
      yOffset,
      speed,
      rotationAxis,
      rotationSpeed,
      currentRotation: 0,
    });
    const x = Math.cos(angle) * orbitRadius;
    const z = Math.sin(angle) * orbitRadius;
    dummy.position.set(x, yOffset, z);
    dummy.scale.setScalar(1 + Math.random());
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  STATE.scene.add(instancedMesh);
  STATE.meteorSystem.mesh = instancedMesh;
  STATE.meteorSystem.data = dataArray;
}

function updateMeteoroids() {
  if (!STATE.meteorSystem.mesh) return;

  const dummy = TMP_DUMMY;
  const universeScale = SETTINGS.universeScale;
  const timeScale = STATE.speedMultiplier;

  for (let i = 0; i < STATE.meteorSystem.data.length; i++) {
    const d = STATE.meteorSystem.data[i];
    const moveSpeed = d.speed * timeScale * SETTINGS.meteorSpeed * 0.01;

    d.angle += moveSpeed;
    d.currentRotation += d.rotationSpeed * (timeScale > 0 ? 1 : 0);

    const r = d.orbitRadius * universeScale;
    const x = Math.cos(d.angle) * r;
    const z = Math.sin(d.angle) * r;
    const y = d.yOffset * universeScale;

    dummy.position.set(x, y, z);
    dummy.rotation.set(
      d.currentRotation * d.rotationAxis.x,
      d.currentRotation * d.rotationAxis.y,
      d.currentRotation * d.rotationAxis.z
    );
    dummy.updateMatrix();
    STATE.meteorSystem.mesh.setMatrixAt(i, dummy.matrix);
  }

  STATE.meteorSystem.mesh.instanceMatrix.needsUpdate = true;
}

function updateBodyPhysics(bodyObj, jd, hoursPassed) {
  const { mesh, data, orbitLine } = bodyObj;
  const isSatellite = mesh.parent && mesh.parent.isMesh;

  if (!data.isStar) {
    const currentM = getMeanAnomaly(data.elements, jd);
    const pos = getOrbitPosition(data.elements, currentM);
    pos.multiplyScalar(SETTINGS.universeScale);

    if (isSatellite) {
      pos.multiplyScalar(data.distanceFactor || SATELLITE_DIST_FACTOR);
      pos.divide(mesh.parent.scale);
    }

    mesh.position.copy(pos);
  }

  const rotationAngle = (hoursPassed / data.rotPeriod) * (Math.PI * 2);
  mesh.rotation.y = rotationAngle;

  const globalScale = data.radius * SETTINGS.planetVisualScale;
  if (isSatellite) {
    const parentScale = mesh.parent.scale.x;
    const relativeScale = globalScale / parentScale;
    mesh.scale.set(relativeScale, relativeScale, relativeScale);

    if (orbitLine) {
      const desiredOrbitScale =
        SETTINGS.universeScale * (data.distanceFactor || SATELLITE_DIST_FACTOR);
      const relativeOrbitScale = desiredOrbitScale / parentScale;
      orbitLine.scale.set(
        relativeOrbitScale,
        relativeOrbitScale,
        relativeOrbitScale
      );
    }
  } else {
    mesh.scale.set(globalScale, globalScale, globalScale);
    if (orbitLine) {
      orbitLine.scale.set(
        SETTINGS.universeScale,
        SETTINGS.universeScale,
        SETTINGS.universeScale
      );
    }
  }

  if (bodyObj.satellites) {
    bodyObj.satellites.forEach((sat) =>
      updateBodyPhysics(sat, jd, hoursPassed)
    );
  }
}

function updatePhysics() {
  const jd = getJulianDate(STATE.simulationDate);
  const hoursPassed = STATE.simulationDate.getTime() / 3600000;

  STATE.activeBodies.forEach((body) =>
    updateBodyPhysics(body, jd, hoursPassed)
  );
  updateMeteoroids();
}

function animateSun() {
  const time = STATE.clock.getElapsedTime();
  if (STATE.sunEffects.glow) {
    STATE.sunEffects.glow.material.uniforms.uTime.value = time;
    const pulse = 1.0 + Math.sin(time * 0.5) * 0.02;
    STATE.sunEffects.glow.scale.set(pulse, pulse, pulse);
    STATE.sunEffects.glow.lookAt(STATE.camera.position);
  }
  STATE.sunEffects.flares.forEach((f) => {
    f.sprite.material.rotation += f.speed;
    const s = f.baseScale + Math.sin(time * f.pulseSpeed) * 0.2;
    f.sprite.scale.set(s, s, s);
    f.sprite.material.opacity = 0.4 + Math.sin(time * 5) * 0.1;
  });

  // Animate Black Hole
  if (STATE.blackHole.group && STATE.blackHole.group.visible) {
    STATE.blackHole.diskUniforms.uTime.value = time;
    // BILLBOARDING: Make the plane always face the camera
    STATE.blackHole.group.lookAt(STATE.camera.position);
  }
}

function animate() {
  requestAnimationFrame(animate);

  const delta = STATE.clock.getDelta();
  const elapsed = STATE.clock.elapsedTime;

  const timeStep = delta * STATE.speedMultiplier * 1000;
  STATE.simulationDate = new Date(STATE.simulationDate.getTime() + timeStep);

  updatePhysics();
  animateSun();

  if (STATE.focusedBody) {
    const targetPos = TMP_VEC3;
    STATE.focusedBody.getWorldPosition(targetPos);
    STATE.controls.target.lerp(targetPos, 0.1);
  }

  if (elapsed - STATE.lastUIUpdate > STATE.uiUpdateInterval) {
    updateUI();
    STATE.lastUIUpdate = elapsed;
  }

  STATE.controls.update();
  STATE.renderer.render(STATE.scene, STATE.camera);
}

function updateUI() {
  const tbody = document.getElementById("planet-data-body");
  const worldPos = TMP_VEC3;

  let html = "";
  for (let i = 0; i < STATE.activeBodies.length; i++) {
    const p = STATE.activeBodies[i];
    p.mesh.getWorldPosition(worldPos);
    html += `<tr>
      <td>${p.data.name}</td>
      <td>${worldPos.x.toFixed(2)}, ${worldPos.z.toFixed(2)}</td>
    </tr>`;
  }

  tbody.innerHTML = html;

  document.getElementById(
    "datetime-display"
  ).innerText = `Date: ${STATE.simulationDate.toLocaleString()}`;
}

function updateUIOpacity(val) {
  const panels = document.querySelectorAll(".ui-panel");
  panels.forEach((p) => {
    p.style.backgroundColor = `rgba(0, 0, 0, ${val})`;
  });
}

function updateVisualsRecursive(bodyObj) {
  if (bodyObj.orbitLine) {
    bodyObj.orbitLine.material.opacity = SETTINGS.orbitOpacity;
    bodyObj.orbitLine.material.color.set(SETTINGS.orbitColor);
  }
  if (bodyObj.satellites) {
    bodyObj.satellites.forEach((sat) => updateVisualsRecursive(sat));
  }
}

function initUISettings() {
  const scaleInput = document.getElementById("input-planet-scale");
  scaleInput.value = DEFAULTS.planetVisualScale;
  scaleInput.addEventListener("input", (e) => {
    SETTINGS.planetVisualScale = parseFloat(e.target.value);
    document.getElementById("disp-planet-scale").innerText =
      SETTINGS.planetVisualScale;
  });

  const universeInput = document.getElementById("input-universe-scale");
  universeInput.value = DEFAULTS.universeScale;
  universeInput.addEventListener("input", (e) => {
    SETTINGS.universeScale = parseFloat(e.target.value);
    document.getElementById("disp-universe-scale").innerText =
      SETTINGS.universeScale;
    createMeteoroids();
  });

  // Black Hole Toggle
  const bhCheck = document.getElementById("input-bh-visible");
  bhCheck.checked = DEFAULTS.blackHoleVisible;
  bhCheck.addEventListener("change", (e) => {
    SETTINGS.blackHoleVisible = e.target.checked;
    if (STATE.blackHole.group) {
      STATE.blackHole.group.visible = SETTINGS.blackHoleVisible;
    }
  });

  const opacityInput = document.getElementById("input-orbit-opacity");
  opacityInput.value = DEFAULTS.orbitOpacity;
  opacityInput.addEventListener("input", (e) => {
    SETTINGS.orbitOpacity = parseFloat(e.target.value);
    document.getElementById("disp-orbit-opacity").innerText =
      SETTINGS.orbitOpacity;
    STATE.activeBodies.forEach((b) => updateVisualsRecursive(b));
  });

  const colorInput = document.getElementById("input-orbit-color");
  colorInput.value = DEFAULTS.orbitColor;
  colorInput.addEventListener("input", (e) => {
    SETTINGS.orbitColor = e.target.value;
    STATE.activeBodies.forEach((b) => updateVisualsRecursive(b));
  });

  const uiOpacityInput = document.getElementById("input-ui-opacity");
  uiOpacityInput.value = DEFAULTS.uiOpacity;
  uiOpacityInput.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    SETTINGS.uiOpacity = val;
    document.getElementById("disp-ui-opacity").innerText = val;
    updateUIOpacity(val);
  });

  // METEOR SETTINGS
  const mCountDisplay = document.getElementById("disp-meteor-count");
  mCountDisplay.innerText = SETTINGS.meteorCount;
  const mCountInput = document.getElementById("input-meteor-count");
  mCountInput.value = SETTINGS.meteorCount;
  mCountInput.addEventListener("change", (e) => {
    SETTINGS.meteorCount = parseInt(e.target.value);
    document.getElementById("disp-meteor-count").innerText =
      SETTINGS.meteorCount;
    createMeteoroids();
  });

  const mSizeDisplay = document.getElementById("disp-meteor-size");
  mSizeDisplay.innerText = SETTINGS.meteorSize;
  const mSizeInput = document.getElementById("input-meteor-size");
  mSizeInput.value = SETTINGS.meteorSize;
  mSizeInput.addEventListener("input", (e) => {
    SETTINGS.meteorSize = parseFloat(e.target.value);
    document.getElementById("disp-meteor-size").innerText = SETTINGS.meteorSize;
    createMeteoroids();
  });

  const mSpeedDisplay = document.getElementById("disp-meteor-speed");
  mSpeedDisplay.innerText = SETTINGS.meteorSpeed;
  const mSpeedInput = document.getElementById("input-meteor-speed");
  mSpeedInput.value = SETTINGS.meteorSpeed;
  mSpeedInput.addEventListener("input", (e) => {
    SETTINGS.meteorSpeed = parseFloat(e.target.value);
    document.getElementById("disp-meteor-speed").innerText =
      SETTINGS.meteorSpeed;
  });
}

function resetVisuals() {
  SETTINGS.planetVisualScale = DEFAULTS.planetVisualScale;
  SETTINGS.universeScale = DEFAULTS.universeScale;
  SETTINGS.orbitOpacity = DEFAULTS.orbitOpacity;
  SETTINGS.orbitColor = DEFAULTS.orbitColor;
  SETTINGS.uiOpacity = DEFAULTS.uiOpacity;
  SETTINGS.meteorCount = DEFAULTS.meteorCount;
  SETTINGS.meteorSize = DEFAULTS.meteorSize;
  SETTINGS.meteorSpeed = DEFAULTS.meteorSpeed;
  SETTINGS.blackHoleVisible = DEFAULTS.blackHoleVisible;

  STATE.focusedBody = null;
  STATE.camera.position.set(0, 3, 10);
  STATE.controls.target.set(0, 0, 0);
  STATE.controls.update();

  // Reset DOM
  document.getElementById("input-planet-scale").value =
    DEFAULTS.planetVisualScale;
  document.getElementById("disp-planet-scale").innerText =
    DEFAULTS.planetVisualScale;
  document.getElementById("input-universe-scale").value =
    DEFAULTS.universeScale;
  document.getElementById("disp-universe-scale").innerText =
    DEFAULTS.universeScale;
  document.getElementById("input-orbit-opacity").value = DEFAULTS.orbitOpacity;
  document.getElementById("disp-orbit-opacity").innerText =
    DEFAULTS.orbitOpacity;
  document.getElementById("input-orbit-color").value = DEFAULTS.orbitColor;
  document.getElementById("input-ui-opacity").value = DEFAULTS.uiOpacity;
  document.getElementById("disp-ui-opacity").innerText = DEFAULTS.uiOpacity;
  document.getElementById("input-meteor-count").value = DEFAULTS.meteorCount;
  document.getElementById("disp-meteor-count").innerText = DEFAULTS.meteorCount;
  document.getElementById("input-meteor-size").value = DEFAULTS.meteorSize;
  document.getElementById("disp-meteor-size").innerText = DEFAULTS.meteorSize;
  document.getElementById("input-meteor-speed").value = DEFAULTS.meteorSpeed;
  document.getElementById("disp-meteor-speed").innerText = DEFAULTS.meteorSpeed;
  document.getElementById("input-bh-visible").checked =
    DEFAULTS.blackHoleVisible;

  STATE.activeBodies.forEach((b) => updateVisualsRecursive(b));
  updateUIOpacity(DEFAULTS.uiOpacity);
  createMeteoroids();

  if (STATE.blackHole.group) {
    STATE.blackHole.group.visible = DEFAULTS.blackHoleVisible;
  }
}

function resetTime() {
  STATE.simulationDate = new Date();
  STATE.speedMultiplier = 1;
  document.getElementById("speed-display").innerText = "Real Time";
  document
    .querySelectorAll(".speed-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("btn-real").classList.add("active");
}

function bindEvents() {
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const val = parseInt(e.target.dataset.speed);
      STATE.speedMultiplier = val;
      let text = "";
      if (val === 0) text = "Paused";
      else if (val === 1) text = "Real Time";
      else if (val >= 86400) text = "Fast Forward";
      else if (val <= -86400) text = "Rewind";
      document.getElementById("speed-display").innerText = text;
      document
        .querySelectorAll(".speed-btn")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
    });
  });
  document
    .getElementById("btn-reset-time")
    .addEventListener("click", resetTime);
  document
    .getElementById("btn-reset-visuals")
    .addEventListener("click", resetVisuals);
}

function init() {
  // Initialize Scene
  initAssetLoader();
  initScene();
  initUISettings();

  // Create Solar System
  createLighting(STATE.scene);
  createStarField(STATE.scene);
  createSolarSystem(STATE.scene);
  createMeteoroids();
  createBlackHole();

  bindEvents();
  document.getElementById("btn-real").classList.add("active");
}

init();
