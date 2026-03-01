import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { brandRegions, brandDetails, spotlightParams } from './brands.js';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  1000
);
camera.position.z = 3;

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
  alpha: true
});
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

let pivot = null;
let autoRotate = true;
let autoRotateEnabled = true;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;
controls.enablePan = false;
controls.saveState();

let resumeTimeout = null;

controls.addEventListener('start', () => {
  autoRotate = false;
  if (resumeTimeout) {
    clearTimeout(resumeTimeout);
    resumeTimeout = null;
  }
});

controls.addEventListener('end', () => {
  if (autoRotateEnabled) {
    resumeTimeout = setTimeout(() => {
      autoRotate = true;
    }, 2000);
  }
});

/* === SPOTLIGHT SHADER === */
const spotlightVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const spotlightFragmentShader = `
  uniform sampler2D baseTexture;
  uniform bool hasTexture;
  uniform vec3 baseColor;
  uniform vec2 spotlightCenter;
  uniform float spotlightIntensity;
  uniform float ambientDim;
  uniform float k;
  uniform float a0;
  uniform float b0;
  uniform float maxBrightness;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  float e1Approx(float x) {
    if (x < 0.0001) return -log(x) - 0.5772156649;
    return exp(-x) / x * (x + 1.0) / (x + 2.0 - 1.0 / (x + 4.0));
  }
  
  void main() {
    vec4 texColor = hasTexture ? texture2D(baseTexture, vUv) : vec4(baseColor, 1.0);
    
    vec2 d = vUv - spotlightCenter;
    float r2 = (d.x * d.x) / (a0 * a0) + (d.y * d.y) / (b0 * b0);
    r2 = max(r2, 0.00001);
    float highlight = e1Approx(r2) / (2.0 * k);
    highlight = min(highlight, maxBrightness);
    
    float normalizedHighlight = highlight / maxBrightness;
    
    float dimFactor = mix(1.0, ambientDim, spotlightIntensity);
    float brightFactor = mix(dimFactor, 1.0 + normalizedHighlight * 0.5, normalizedHighlight * spotlightIntensity);
    
    vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0) - vPosition);
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.4;
    float lighting = ambient + diff * 0.6;
    
    vec3 finalColor = texColor.rgb * lighting * brightFactor;
    
    vec3 warmGlow = vec3(1.0, 0.9, 0.8) * normalizedHighlight * spotlightIntensity * 0.3;
    finalColor += warmGlow;
    
    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;

let originalMaterials = [];

function createSpotlightMaterial(originalMaterial) {
  const hasTexture = originalMaterial && originalMaterial.map !== null && originalMaterial.map !== undefined;
  const baseColor = (originalMaterial && originalMaterial.color) 
    ? originalMaterial.color.clone() 
    : new THREE.Color(0xffffff);
  
  const uniforms = {
    baseTexture: { value: hasTexture ? originalMaterial.map : null },
    hasTexture: { value: hasTexture },
    baseColor: { value: baseColor },
    spotlightCenter: { value: new THREE.Vector2(0.5, 0.5) },
    spotlightIntensity: { value: 0.0 },
    ambientDim: { value: spotlightParams.ambientDim },
    k: { value: spotlightParams.k },
    a0: { value: spotlightParams.a0 },
    b0: { value: spotlightParams.b0 },
    maxBrightness: { value: spotlightParams.maxBrightness }
  };

  return new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: spotlightVertexShader,
    fragmentShader: spotlightFragmentShader,
    transparent: true,
    side: THREE.DoubleSide
  });
}

/* === MODEL LOADING === */
const loader = new GLTFLoader();
loader.load(
  'ball.glb',
  (gltf) => {
    const model = gltf.scene;
    
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 4 / maxDim;
    
    model.traverse((child) => {
      if (child.isMesh) {
        child.geometry.computeBoundingBox();
        
        originalMaterials.push({
          mesh: child,
          material: child.material
        });
        
        const spotMaterial = createSpotlightMaterial(child.material);
        child.material = spotMaterial;
      }
    });
    
    pivot = new THREE.Group();
    scene.add(pivot);
    
    const inner = new THREE.Group();
    inner.position.set(-center.x, -center.y, -center.z);
    inner.add(model);
    
    pivot.add(inner);
    pivot.scale.setScalar(scale);
  },
  (progress) => {
    console.log('Loading:', (progress.loaded / progress.total * 100) + '%');
  },
  (error) => {
    console.error('Error loading model:', error);
  }
);

/* === LIGHTING === */
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0xff6b6b, 0.8);
pointLight.position.set(-5, 3, 5);
scene.add(pointLight);

const pointLight2 = new THREE.PointLight(0x4ecdc4, 0.5);
pointLight2.position.set(5, -3, 5);
scene.add(pointLight2);

/* === SPOTLIGHT STATE === */
const spotlightOverlay = document.getElementById('spotlight-overlay');
let activeBrandIndex = -1;
let spotlightIntensity = 0;
let targetSpotlightIntensity = 0;
let spotlightUV = { u: 0.5, v: 0.5 };
let targetSpotlightUV = { u: 0.5, v: 0.5 };

function activateSpotlight(brandIndex) {
  if (brandIndex < 0 || brandIndex >= brandRegions.length) {
    deactivateSpotlight();
    return;
  }

  activeBrandIndex = brandIndex;
  const brand = brandRegions[brandIndex];
  
  targetSpotlightIntensity = 1.0;
  targetSpotlightUV = { u: brand.uv.u, v: brand.uv.v };
  
  spotlightOverlay.classList.add('active');
  document.body.classList.add('brand-active');
  
  const screenX = brand.uv.u * 100;
  const screenY = (1 - brand.uv.v) * 100;
  spotlightOverlay.style.setProperty('--spotlight-x', screenX + '%');
  spotlightOverlay.style.setProperty('--spotlight-y', screenY + '%');
  
  document.querySelectorAll('.brand-side-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.brand) === brandIndex);
  });
}

function deactivateSpotlight() {
  activeBrandIndex = -1;
  targetSpotlightIntensity = 0;
  
  spotlightOverlay.classList.remove('active');
  document.body.classList.remove('brand-active');
  
  document.querySelectorAll('.brand-side-btn').forEach(btn => {
    btn.classList.remove('active');
  });
}

function updateSpotlightShader() {
  const lerpSpeed = 0.08;
  spotlightIntensity += (targetSpotlightIntensity - spotlightIntensity) * lerpSpeed;
  spotlightUV.u += (targetSpotlightUV.u - spotlightUV.u) * lerpSpeed;
  spotlightUV.v += (targetSpotlightUV.v - spotlightUV.v) * lerpSpeed;

  if (!pivot) return;

  pivot.traverse((child) => {
    if (child.isMesh && child.material && child.material.uniforms) {
      child.material.uniforms.spotlightCenter.value.set(spotlightUV.u, spotlightUV.v);
      child.material.uniforms.spotlightIntensity.value = spotlightIntensity;
    }
  });
}

/* === RESIZE HANDLER === */
function handleResize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener('resize', handleResize);

/* === RAYCASTING === */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let regionSize = 0.1;
let highlightGeometry = new THREE.RingGeometry(regionSize * 0.8, regionSize, 32);
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: 0x4ecdc4,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.8,
  depthTest: false
});
const highlightRing = new THREE.Mesh(highlightGeometry, highlightMaterial);
highlightRing.visible = false;
scene.add(highlightRing);

function updateHighlightRingSize(size) {
  regionSize = size;
  highlightRing.geometry.dispose();
  highlightRing.geometry = new THREE.RingGeometry(size * 0.8, size, 32);
}

let currentHighlight = null;
let mappingMode = false;
const savedRegions = [];

const highlightInfo = document.getElementById('highlight-info');
const info3D = document.getElementById('info-3d');
const infoUV = document.getElementById('info-uv');
const infoNormal = document.getElementById('info-normal');
const uvMarker = document.getElementById('uv-marker');
const uvPreview = document.getElementById('uv-preview');

function updateHighlightInfo(intersection) {
  if (!intersection) {
    highlightInfo.classList.remove('visible');
    return;
  }
  
  highlightInfo.classList.add('visible');
  
  const point = intersection.point;
  const normal = intersection.face ? intersection.face.normal.clone() : new THREE.Vector3(0, 0, 1);
  const uv = intersection.uv || { x: 0, y: 0 };
  
  info3D.textContent = `x: ${point.x.toFixed(3)}, y: ${point.y.toFixed(3)}, z: ${point.z.toFixed(3)}`;
  infoUV.textContent = `u: ${uv.x.toFixed(3)}, v: ${uv.y.toFixed(3)}`;
  infoNormal.textContent = `x: ${normal.x.toFixed(3)}, y: ${normal.y.toFixed(3)}, z: ${normal.z.toFixed(3)}`;
  
  const previewWidth = uvPreview.offsetWidth;
  const previewHeight = uvPreview.offsetHeight;
  uvMarker.style.left = `${uv.x * previewWidth}px`;
  uvMarker.style.top = `${(1 - uv.y) * previewHeight}px`;
  
  currentHighlight = {
    point: point.clone(),
    normal: normal.clone(),
    uv: { u: uv.x, v: uv.y }
  };
}

function positionHighlightRing(intersection) {
  if (!intersection || !intersection.face) {
    highlightRing.visible = false;
    return;
  }
  
  highlightRing.visible = true;
  highlightRing.position.copy(intersection.point);
  
  const normal = intersection.face.normal.clone();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld);
  normal.applyMatrix3(normalMatrix).normalize();
  
  highlightRing.position.addScaledVector(normal, 0.01);
  highlightRing.lookAt(highlightRing.position.clone().add(normal));
}

/* === BRAND POPUP === */
const brandPopup = document.getElementById('brand-popup');
const popupBrandName = document.getElementById('popup-brand-name');
const popupActionBtn = document.getElementById('popup-action-btn');
let currentPopupBrand = null;
let currentPopupBrandIndex = -1;

function findBrandAtUV(uv) {
  if (!uv) return null;
  
  for (let i = 0; i < brandRegions.length; i++) {
    const brand = brandRegions[i];
    const du = uv.x - brand.uv.u;
    const dv = uv.y - brand.uv.v;
    const distance = Math.sqrt(du * du + dv * dv);
    
    const threshold = brand.size * 0.1;
    if (distance < threshold) {
      return { brand, index: i };
    }
  }
  return null;
}

function showBrandPopup(brand, brandIndex, screenX, screenY) {
  popupBrandName.textContent = brand.name;
  brandPopup.style.left = `${screenX}px`;
  brandPopup.style.top = `${screenY}px`;
  brandPopup.classList.add('visible');
  currentPopupBrand = brand;
  currentPopupBrandIndex = brandIndex;
}

function hideBrandPopup() {
  brandPopup.classList.remove('visible');
  currentPopupBrand = null;
  currentPopupBrandIndex = -1;
}

popupActionBtn.addEventListener('click', () => {
  const brandIndex = currentPopupBrandIndex;
  if (brandIndex >= 0) {
    hideBrandPopup();
    animateToBrand(brandIndex);
  }
});

document.addEventListener('click', (event) => {
  if (!brandPopup.contains(event.target) && event.target !== canvas) {
    hideBrandPopup();
  }
});

function onCanvasClick(event) {
  if (!pivot) return;
  
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const meshes = [];
  pivot.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  
  const intersects = raycaster.intersectObjects(meshes, false);
  
  if (intersects.length > 0) {
    const intersection = intersects[0];
    
    if (!mappingMode) {
      const brandHit = findBrandAtUV(intersection.uv);
      if (brandHit) {
        showBrandPopup(brandHit.brand, brandHit.index, event.clientX, event.clientY);
        activateSpotlight(brandHit.index);
        return;
      } else {
        hideBrandPopup();
        if (activeBrandIndex >= 0) {
          deactivateSpotlight();
        }
      }
    }
    
    if (mappingMode) {
      positionHighlightRing(intersection);
      updateHighlightInfo(intersection);
    }
  }
}

canvas.addEventListener('click', onCanvasClick);

/* === CONTROL BUTTONS === */
const toggleAutorotateBtn = document.getElementById('toggle-autorotate-btn');
toggleAutorotateBtn.addEventListener('click', () => {
  autoRotateEnabled = !autoRotateEnabled;
  autoRotate = autoRotateEnabled;
  toggleAutorotateBtn.textContent = autoRotateEnabled ? 'Stop Rotation' : 'Start Rotation';
  toggleAutorotateBtn.classList.toggle('active', !autoRotateEnabled);
  
  if (resumeTimeout) {
    clearTimeout(resumeTimeout);
    resumeTimeout = null;
  }
});

const toggleMappingBtn = document.getElementById('toggle-mapping-btn');
toggleMappingBtn.addEventListener('click', () => {
  mappingMode = !mappingMode;
  toggleMappingBtn.textContent = mappingMode ? 'Disable Mapping' : 'Enable Mapping';
  toggleMappingBtn.classList.toggle('active', mappingMode);
  
  if (mappingMode) {
    autoRotate = false;
    autoRotateEnabled = false;
    toggleAutorotateBtn.textContent = 'Start Rotation';
    toggleAutorotateBtn.classList.add('active');
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }
  }
  
  if (!mappingMode) {
    highlightRing.visible = false;
    highlightInfo.classList.remove('visible');
    currentHighlight = null;
  }
});

const regionSizeSlider = document.getElementById('region-size-slider');
const regionSizeValue = document.getElementById('region-size-value');

regionSizeSlider.addEventListener('input', () => {
  const size = parseFloat(regionSizeSlider.value);
  updateHighlightRingSize(size);
  regionSizeValue.textContent = size.toFixed(2);
});

document.getElementById('save-region-btn').addEventListener('click', () => {
  if (!currentHighlight || !pivot) return;
  
  const name = prompt('Enter brand/region name:');
  if (!name) return;
  
  savedRegions.push({
    name: name,
    size: regionSize,
    rotation: {
      x: pivot.rotation.x,
      y: pivot.rotation.y,
      z: pivot.rotation.z
    },
    ...currentHighlight
  });
  
  console.log('Saved regions:', JSON.stringify(savedRegions, null, 2));
  alert(`Region "${name}" saved! Check console for data.`);
});

/* === ROTATION HELPERS === */
function getShortestRotation(current, target) {
  const normalizeAngle = (angle) => {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  };
  
  return {
    x: current.x + normalizeAngle(target.x - current.x),
    y: current.y + normalizeAngle(target.y - current.y),
    z: current.z + normalizeAngle(target.z - current.z)
  };
}

let isAnimatingToTarget = false;
let targetRotation = null;

function animateToRotation(target) {
  autoRotate = false;
  if (resumeTimeout) {
    clearTimeout(resumeTimeout);
    resumeTimeout = null;
  }
  
  controls.reset();
  
  if (pivot) {
    const currentRot = { x: pivot.rotation.x, y: pivot.rotation.y, z: pivot.rotation.z };
    targetRotation = getShortestRotation(currentRot, target);
  } else {
    targetRotation = target;
  }
  isAnimatingToTarget = true;
}

function animateToBrand(brandIndex) {
  const brand = brandRegions[brandIndex];
  if (!brand || !pivot) return;
  
  activateSpotlight(brandIndex);
  
  if (brand.rotation) {
    console.log(`Rotating to ${brand.name}:`, brand.rotation);
    animateToRotation(brand.rotation);
  } else {
    const longitude = (brand.uv.u - 0.5) * 2 * Math.PI;
    const latitude = (brand.uv.v - 0.5) * Math.PI;
    const optimalRot = { x: -latitude, y: -longitude, z: 0 };
    console.log(`Rotating to ${brand.name} (from UV):`, optimalRot);
    animateToRotation(optimalRot);
  }
  
  setTimeout(() => {
    showBrandDetailView(brand);
  }, 600);
}

/* === BRAND DETAIL VIEW === */
const brandDetailName = document.getElementById('brand-detail-name');
const brandDetailTagline = document.getElementById('brand-detail-tagline');
const brandDescription = document.getElementById('brand-description');
const backToSelectionBtn = document.getElementById('back-to-selection');
const canvasContainer = document.getElementById('canvas-container');

const scrollDistance = 200;

function getScrollAnimationParams() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    return {
      startScale: window.innerWidth <= 480 ? 0.4 : 0.45,
      endScale: 0.2,
      endTranslateX: 0,
      endTranslateY: 0
    };
  }
  return {
    startScale: 0.55,
    endScale: 0.15,
    endTranslateX: 0,
    endTranslateY: 0
  };
}

function showBrandDetailView(brand) {
  const details = brandDetails[brand.name] || {
    tagline: 'Premium eyewear collection',
    description: 'Discover our curated selection of high-quality frames designed for style and comfort.'
  };

  brandDetailName.textContent = brand.name;
  brandDetailTagline.textContent = details.tagline;
  brandDescription.textContent = details.description;

  window.scrollTo(0, 0);
  document.documentElement.classList.add('brand-detail-view');
  document.body.classList.add('brand-detail-view');
  document.body.classList.add('transitioning');
  const params = getScrollAnimationParams();
  canvasContainer.style.transform = `scale(${params.startScale})`;
  
  setTimeout(() => {
    document.body.classList.remove('transitioning');
  }, 600);
}

function hideBrandDetailView() {
  document.body.classList.add('transitioning');
  document.documentElement.classList.remove('brand-detail-view');
  document.body.classList.remove('brand-detail-view');
  canvasContainer.style.transform = '';
  window.scrollTo(0, 0);
  deactivateSpotlight();
  
  setTimeout(() => {
    document.body.classList.remove('transitioning');
    handleResize();
  }, 600);
}

backToSelectionBtn.addEventListener('click', hideBrandDetailView);

function updateBallOnScroll() {
  if (!document.body.classList.contains('brand-detail-view')) {
    return;
  }

  const params = getScrollAnimationParams();
  const scrollY = window.scrollY;
  const progress = Math.min(scrollY / scrollDistance, 1);
  
  const scale = params.startScale + (params.endScale - params.startScale) * progress;
  const translateX = params.endTranslateX * progress;
  const translateY = params.endTranslateY * progress;
  
  canvasContainer.style.transform = `scale(${scale}) translate(${translateX}vw, ${translateY}vh)`;
}

window.addEventListener('scroll', updateBallOnScroll);
window.addEventListener('resize', () => {
  if (document.body.classList.contains('brand-detail-view')) {
    updateBallOnScroll();
  }
});

/* === BRAND LIST === */
function saveBrandPosition() {
  if (!pivot) return;
  const name = prompt('Enter brand name:');
  if (!name) return;

  brandRegions.push({
    name: name,
    size: 0.1,
    point: { x: 0, y: 0, z: 1 },
    normal: { x: 0, y: 0, z: 1 },
    uv: { u: 0, v: 0 },
    rotation: { x: pivot.rotation.x, y: pivot.rotation.y, z: pivot.rotation.z }
  });

  renderBrandList();
  console.log('Brand regions:', JSON.stringify(brandRegions, null, 2));
}

function deleteBrand(index) {
  brandRegions.splice(index, 1);
  renderBrandList();
}

function renderBrandList() {
  const list = document.getElementById('brand-list');
  list.innerHTML = brandRegions.map((brand, i) => `
    <div class="brand-item">
      <button class="brand-btn" onclick="window.selectBrand(${i})">${brand.name}</button>
      <button class="brand-btn delete-btn" onclick="window.deleteBrand(${i})">X</button>
    </div>
  `).join('');
}

window.selectBrand = (index) => {
  animateToBrand(index);
};
window.deleteBrand = deleteBrand;

document.getElementById('save-brand-btn').addEventListener('click', saveBrandPosition);
renderBrandList();

document.querySelectorAll('.brand-side-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const index = parseInt(btn.dataset.brand);
    animateToBrand(index);
  });
});

/* === SLIDERS === */
const sliderX = document.getElementById('slider-x');
const sliderY = document.getElementById('slider-y');
const sliderZ = document.getElementById('slider-z');
const valueX = document.getElementById('value-x');
const valueY = document.getElementById('value-y');
const valueZ = document.getElementById('value-z');

function toDegrees(rad) {
  return Math.round(rad * 180 / Math.PI) + '°';
}

function onSliderChange() {
  if (!pivot) return;
  autoRotate = false;
  isAnimatingToTarget = false;
  if (resumeTimeout) {
    clearTimeout(resumeTimeout);
    resumeTimeout = null;
  }
  pivot.rotation.x = parseFloat(sliderX.value);
  pivot.rotation.y = parseFloat(sliderY.value);
  pivot.rotation.z = parseFloat(sliderZ.value);
  valueX.textContent = toDegrees(pivot.rotation.x);
  valueY.textContent = toDegrees(pivot.rotation.y);
  valueZ.textContent = toDegrees(pivot.rotation.z);
}

function updateSliders() {
  if (!pivot) return;
  sliderX.value = pivot.rotation.x;
  sliderY.value = pivot.rotation.y;
  sliderZ.value = pivot.rotation.z;
  valueX.textContent = toDegrees(pivot.rotation.x);
  valueY.textContent = toDegrees(pivot.rotation.y);
  valueZ.textContent = toDegrees(pivot.rotation.z);
}

sliderX.addEventListener('input', onSliderChange);
sliderY.addEventListener('input', onSliderChange);
sliderZ.addEventListener('input', onSliderChange);

/* === ANIMATION LOOP === */
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (pivot && isAnimatingToTarget && targetRotation) {
    const speed = 0.05;
    pivot.rotation.x += (targetRotation.x - pivot.rotation.x) * speed;
    pivot.rotation.y += (targetRotation.y - pivot.rotation.y) * speed;
    pivot.rotation.z += (targetRotation.z - pivot.rotation.z) * speed;

    const dx = Math.abs(targetRotation.x - pivot.rotation.x);
    const dy = Math.abs(targetRotation.y - pivot.rotation.y);
    const dz = Math.abs(targetRotation.z - pivot.rotation.z);
    if (dx < 0.001 && dy < 0.001 && dz < 0.001) {
      isAnimatingToTarget = false;
      targetRotation = null;
    }
  } else if (pivot && autoRotate) {
    pivot.rotation.x += 0.003;
    pivot.rotation.y += 0.007;
    pivot.rotation.z += 0.002;
    
    if (activeBrandIndex >= 0 && autoRotate) {
      deactivateSpotlight();
    }
  }

  updateSpotlightShader();
  updateSliders();
  renderer.render(scene, camera);
}

animate();
