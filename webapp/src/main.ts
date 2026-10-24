import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FIXTURE_DATA, type FixtureBody, type GalaxyData } from './fixture';
import { initQuestPanel, renderQuestPanel, toggleQuestPanel, isQuestPanelOpen } from './quest-ui';
import { apiBoard, apiBegin, loadIdentity, saveIdentity, type ExplorerIdentity, type BoardResponse } from './quest-api';
import { QUEST_CATALOG } from './quest-catalog';

/**
 * ADCakeyuan 星图：博客=恒星，项目=行星。
 * 半径 ∝ 代码量 | 转速 ∝ 提交热度 | 光晕 ∝ 健康 | 环 = 有独立域名 | 小镇带 12 居民卫星。
 */

interface PlanetVisual {
  body: FixtureBody;
  group: THREE.Group;      // 轨道枢轴（绕恒星）
  holder: THREE.Group;     // 行星本体（含环/卫星/标签），挂在 group 上做公转
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  label: THREE.Sprite;
  speed: number;
  dir: 1 | -1; // 公转方向：奇偶交替，星系更自然
  angle: number;
  radius: number;
  moons: Array<{ pivot: THREE.Object3D; speed: number }>;
  lodTimer?: number;
  /** 轨道拖尾（世界坐标环形缓冲） */
  trail?: THREE.Points;
  trailPos?: Float32Array;
  /** 小镇卫星连线 */
  moonLines?: THREE.LineSegments;
}

const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04060d, 0.0028);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 26, 58);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x04060d);
container.appendChild(renderer.domElement);

// Bloom 后处理（移动端降档省 GPU）
const isMobile = Math.min(innerWidth, innerHeight) < 640;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  isMobile ? 0.35 : 0.55,  // 强度（R25 调低：只让太阳泛光，行星不吃 bloom）
  isMobile ? 0.4 : 0.55,   // 半径
  0.55                     // 阈值抬高：行星不再糊成光团
);
composer.addPass(bloomPass);

// ---------- 自适应画质：弱 GPU（软渲染/低端机）自动降级，保交互流畅 ----------
let lowMode = false;
let lowVotes = 0;
function enterLowMode(): void {
  lowMode = true;
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  bloomPass.enabled = false;
  starLayers.slice(0, 2).forEach((p) => (p.visible = false));
  for (const p of planets) {
    if (p.trail) p.trail.visible = false; // 拖尾也关
    if (p.moonLines) p.moonLines.visible = false; // 卫星连线/引力网也关
  }
  for (const m of otherMarkers) m.sprite.visible = false; // 同场探索者光点关
  if (sunGlow) sunGlow.visible = false; // 大光晕交给 bloom 关闭后的本体
  fpsEl.textContent += ' · 省电模式';
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 160;
controls.maxPolarAngle = Math.PI * 0.85;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;

// ---------- 星场（带闪烁相位） ----------
const starMats: Array<{ mat: THREE.PointsMaterial; base: number; phase: number; amp: number }> = [];
function makeStars(count: number, spread: number, size: number, opacity: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = spread * (0.35 + Math.random() * 0.65);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.6;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xbfd2ff, size, transparent: true, opacity, sizeAttenuation: true });
  starMats.push({ mat, base: opacity, phase: Math.random() * 6.28, amp: opacity * 0.35 });
  return new THREE.Points(geo, mat);
}
const starLayers: THREE.Points[] = [
  makeStars(2200, 320, 0.7, 0.75),
  makeStars(900, 240, 1.4, 0.4),
  makeStars(500, 380, 0.5, 0.55),
];
for (const l of starLayers) scene.add(l);

// ---------- 星云薄纱 ----------
function glowTexture(inner: string, outer: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const haloTex = glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');

// ---------- 真实行星贴图（Solar System Scope，CC BY 4.0；本地托管零外链） ----------
const TEX = {
  earth: '/textures/2k_earth_daymap.jpg',
  clouds: '/textures/2k_earth_clouds.jpg',
  jupiter: '/textures/2k_jupiter.jpg',
  mars: '/textures/2k_mars.jpg',
  mercury: '/textures/2k_mercury.jpg',
  moon: '/textures/2k_moon.jpg',
  neptune: '/textures/2k_neptune.jpg',
  saturn: '/textures/2k_saturn.jpg',
  uranus: '/textures/2k_uranus.jpg',
} as const;

/** 天体 → 贴图（theme 赋值；tint 可对同贴图做色相偏移） */
const BODY_TEX: Record<string, { tex: string; tint?: number }> = {
  town: { tex: TEX.earth },
  arcade: { tex: TEX.jupiter },
  cha: { tex: TEX.mars },
  deeplearn: { tex: TEX.uranus },
  guide: { tex: TEX.mercury },
  toolbox: { tex: TEX.moon },
  rss: { tex: TEX.neptune },
  wrapped: { tex: TEX.saturn },
  salary: { tex: TEX.moon, tint: 0xffd9a0 },
  pomo: { tex: TEX.mars, tint: 0xffb080 },
  filekit: { tex: TEX.uranus, tint: 0xa8ffd9 },
  cet4: { tex: TEX.neptune, tint: 0x9fc0ff },
  treasury: { tex: TEX.moon, tint: 0xa8ffc8 },
  imgbed: { tex: TEX.moon },
  timemark: { tex: TEX.mercury },
};

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function loadTex(url: string): THREE.Texture | null {
  if (texCache.has(url)) return texCache.get(url)!;
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(url, t);
  return t; // 异步加载：首帧可能为空贴图，加载完自动生效
}
for (const [color, x, z, s] of [
  ['#1b3a6b', -110, -70, 260],
  ['#3a1b5e', 120, 40, 220],
  ['#143c4a', 30, 130, 180],
] as const) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.position.set(x, -14, z);
  sp.scale.setScalar(s);
  scene.add(sp);
}

// ---------- 灯光 ----------
scene.add(new THREE.AmbientLight(0x8090b0, 0.55));
const sunLight = new THREE.PointLight(0xffd9a0, 320, 240, 1.8);
scene.add(sunLight);

// ---------- 太阳湍流着色器 ----------
const SUN_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SUN_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vPos;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  return n;
}
void main() {
  vec3 p = normalize(vPos) * 3.2;
  float n = 0.0; float a = 0.5; vec3 q = p;
  for (int i = 0; i < 4; i++) { n += a * noise(q); q = q * 2.1 + vec3(uTime * 0.12, uTime * 0.07, -uTime * 0.09); a *= 0.55; }
  n += 0.18 * sin(uTime * 1.3 + p.y * 5.0);
  vec3 deep = vec3(0.86, 0.35, 0.07);
  vec3 hot  = vec3(1.0, 0.85, 0.45);
  vec3 col = mix(deep, hot, smoothstep(0.35, 0.85, n));
  gl_FragColor = vec4(col, 1.0);
}`;
let sunMat: THREE.ShaderMaterial | null = null;

/** 行星菲涅尔大气（背面渲染的呼吸壳） */
function makeAtmosphere(radius: number, colorHex: number, intensity = 0.55): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.22, 28, 28),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(colorHex) }, uIntensity: { value: intensity } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uIntensity; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6); gl_FragColor = vec4(uColor, 1.0) * f * uIntensity; }`,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
}

// ---------- 文字标签 ----------
function labelSprite(text: string, color = '#c7d6f2', size = 42): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + 8;
  c.width = w; c.height = size + 10;
  const g2 = c.getContext('2d')!;
  g2.font = g.font;
  g2.fillStyle = color;
  g2.shadowColor = 'rgba(0,0,0,0.9)';
  g2.shadowBlur = 6;
  g2.fillText(text, 4, size * 0.86);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(w / 46, (size + 10) / 46, 1);
  return sp;
}

// ---------- 天体构建 ----------
const planets: PlanetVisual[] = [];
const clickables: THREE.Mesh[] = [];
let sunMesh: THREE.Mesh | null = null;
let sunGlow: THREE.Sprite | null = null;
let data: GalaxyData = FIXTURE_DATA;

function hsl(h: number, s: number, l: number): number {
  return new THREE.Color(`hsl(${h}, ${s}%, ${l}%)`).getHex();
}

function planetRadius(sizeKb: number): number {
  return Math.min(1.9, 0.55 + Math.log2(sizeKb + 2) / 3.4);
}

function orbitSpeed(pushedAt: string | null): number {
  if (!pushedAt) return 0.08;
  const days = (Date.now() - new Date(pushedAt).getTime()) / 86_400_000;
  return 0.1 + 0.55 * Math.exp(-days / 10);
}

function buildScene(bodies: FixtureBody[], snapIn: GalaxyData['latest']) {
  const snap: NonNullable<GalaxyData['latest']> = snapIn ?? (FIXTURE_DATA.latest as NonNullable<GalaxyData['latest']>);
  // 清场
  for (const p of planets) {
    scene.remove(p.group);
    if (p.trail) scene.remove(p.trail);
  }
  planets.length = 0;
  clickables.length = 0;
  if (sunMesh) { scene.remove(sunMesh); sunMesh = null; }
  if (sunGlow) { scene.remove(sunGlow); sunGlow = null; }

  const repoByBody = new Map<string, (typeof snap.repos)[number]>();
  for (const b of bodies) {
    if (!b.repo) continue;
    const hit = snap.repos.find((r) => r.repo === b.repo);
    if (hit) repoByBody.set(b.id, hit);
  }

  const orbiters = bodies.filter((b) => b.kind !== 'sun');
  const sun = bodies.find((b) => b.kind === 'sun');
  const repoOf = (id: string) => repoByBody.get(id);

  // 恒星
  if (sun) {
    sunMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
    });
    sunMesh = new THREE.Mesh(new THREE.SphereGeometry(3.4, 48, 48), sunMat);
    sunMesh.userData = { body: sun };
    scene.add(sunMesh);
    clickables.push(sunMesh);
    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffb347, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    sunGlow.scale.setScalar(9);
    scene.add(sunGlow);
    const label = labelSprite('博客', '#ffd9a0', 46);
    label.position.set(0, 5.6, 0);
    scene.add(label);
  }

  orbiters.forEach((body, i) => {
    const repo = repoOf(body.id);
    const site = snap.sites.find((s) => s.id === body.id);
    const alive = body.kind === 'dark' ? null : site?.alive ?? false;

    const group = new THREE.Group();
    group.rotation.y = (i * 137.5 * Math.PI) / 180; // 黄金角散布相位
    scene.add(group);

    const holder = new THREE.Group();
    const radius = 9.5 + i * 2.35 + (body.kind === 'dark' ? 5.2 : 0); // 暗星拖到外圈
    holder.position.x = radius;
    // 轴向倾斜：每颗不同的固定倾角，自转更有性格
    holder.rotation.z = ((i * 47) % 30 - 15) * (Math.PI / 180);
    group.add(holder);

    // 轨道线
    const pts: THREE.Vector3[] = [];
    for (let a = 0; a <= 128; a++) {
      const t = (a / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
    }
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x38507c, transparent: true, opacity: body.kind === 'dark' ? 0.08 : 0.16 })
    ));

    // 行星本体（LOD：三档分段；材质带真实贴图，运行时按相机距离切换 geometry）
    const r = planetRadius(repo?.sizeKb ?? 40);
    const color = hsl(body.hue, body.kind === 'dark' ? 22 : 62, body.kind === 'dark' ? 34 : 56);
    const emissive = alive === false ? 0x5a1414 : new THREE.Color(color).getHex();
    const lods: Array<[number, THREE.SphereGeometry]> = [
      [22, new THREE.SphereGeometry(r, 32, 32)],
      [40, new THREE.SphereGeometry(r, 16, 16)],
      [1e9, new THREE.SphereGeometry(r, 8, 8)],
    ];
    const bodyTexCfg = BODY_TEX[body.id];
    const tex = bodyTexCfg ? loadTex(bodyTexCfg.tex) : null;
    const tint = bodyTexCfg?.tint ?? null;
    if (tex) {
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); // 斜视角清晰
    }
    const mesh = new THREE.Mesh(
      lods[0][1],
      new THREE.MeshStandardMaterial({
        ...(tex ? { map: tex } : { color }),
        ...(tint ? { color: tint } : {}),
        // 自发光降到 0.08：贴图自己说话，不再被色光冲淡（R25 修复「看着糊」）
        emissive,
        emissiveIntensity: alive === false ? 0.22 : body.kind === 'dark' ? 0.12 : 0.08,
        roughness: 0.85,
        metalness: 0.02,
        ...(body.kind === 'dark' ? { transparent: true, opacity: 0.55 } : {}),
      })
    );
    mesh.userData = { body, lods };
    holder.add(mesh);
    clickables.push(mesh);

    // 小镇行星：云层壳（比本体略大，独立慢转）
    if (body.probe === 'town') {
      const cloudTex = loadTex(TEX.clouds);
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.03, 32, 32),
        new THREE.MeshStandardMaterial({
          ...(cloudTex ? { map: cloudTex, transparent: true, opacity: 0.55, alphaMap: cloudTex } : { transparent: true, opacity: 0.2 }),
          depthWrite: false,
          roughness: 1,
        })
      );
      clouds.userData.isClouds = true;
      holder.add(clouds);
      holder.userData.clouds = clouds;
    }

    // 不可见的加大命中球（移动端好点）
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(r * 1.9, 1.6), 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.userData = { body };
    holder.add(hit);
    clickables.push(hit);

    // 菲涅尔大气（暗星/挂掉的星球不加）
    if (alive !== false && body.kind !== 'dark') {
      holder.add(makeAtmosphere(r, color, 0.5));
    }

    // 光晕：健康绿色调，暗星无，挂掉的暗红
    // 光晕：克制的薄边（R25 修复——之前的大光团把贴图模型全吞了）
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex,
      color: alive === false ? 0xff5252 : body.kind === 'dark' ? 0x556070 : new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex(),
      transparent: true,
      opacity: body.kind === 'dark' ? 0.06 : alive === false ? 0.2 : 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.setScalar(r * 1.7);
    holder.add(glow);

    // 环 = 有独立域名
    if (body.kind !== 'dark') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.55, r * 2.05, 48),
        new THREE.MeshBasicMaterial({ color: hsl(body.hue, 50, 70), transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      ring.rotation.x = Math.PI / 2.35;
      ring.rotation.y = (i % 3 - 1) * 0.35;
      holder.add(ring);
    }

    // 标签
    const label = labelSprite(body.name.split(' ')[0], body.kind === 'dark' ? '#5d6b84' : '#c7d6f2', 40);
    label.position.set(0, r + 1.35, 0);
    holder.add(label);

    // 小镇居民卫星
    const moons: PlanetVisual['moons'] = [];
    let moonLines: THREE.LineSegments | undefined;
    if (body.probe === 'town' && snap?.town) {
      const n = Math.max(3, snap.town.agents);
      const moonMeshes: THREE.Mesh[] = [];
      for (let m = 0; m < n; m++) {
        const pivot = new THREE.Object3D();
        pivot.rotation.y = (m / n) * Math.PI * 2;
        pivot.rotation.x = ((m % 3) - 1) * 0.28;
        const moonR = r + 1.5 + (m % 2) * 0.7;
        const moon = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 12, 12),
          new THREE.MeshStandardMaterial({ map: loadTex(TEX.moon), roughness: 0.95 })
        );
        moon.position.x = moonR;
        pivot.add(moon);
        holder.add(pivot);
        moons.push({ pivot, speed: 0.6 + (m % 3) * 0.25 });
        moonMeshes.push(moon);
      }
      // 卫星连线（每帧更新端点）
      const linePos = new Float32Array(n * 2 * 3);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      moonLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
        color: 0x9fb8e8, transparent: true, opacity: 0.22,
      }));
      moonLines.userData = { moonMeshes };
      holder.add(moonLines);

      // R12 引力连线：居民关系 → 卫星间的动态连线（分数越高越亮，vertexColors 编码）
      const rels = snap.town.relationships ?? [];
      const relPos = new Float32Array(rels.length * 2 * 3);
      const relCol = new Float32Array(rels.length * 2 * 3);
      const relGeo = new THREE.BufferGeometry();
      relGeo.setAttribute('position', new THREE.BufferAttribute(relPos, 3));
      relGeo.setAttribute('color', new THREE.BufferAttribute(relCol, 3));
      const relLines = new THREE.LineSegments(relGeo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      // 卫星按居民 id 顺序创建（/api/status agents 按 id 排序，id 从 1 起）
      relLines.userData = { rels, moonMeshes };
      holder.add(relLines);
      moonLines.userData = { moonMeshes, relLines };
    }

    // 轨道拖尾：世界坐标环形缓冲（省电模式下隐藏）
    const TRAIL_N = 80;
    const trailPos = new Float32Array(TRAIL_N * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
      color: alive === false ? 0xff4455 : color, // 掉线星球拖尾红警
      transparent: true,
      // 延迟越高尾越淡（健康信号），暗星常态极淡
      opacity: alive === false ? 0.18 : body.kind === 'dark' ? 0.08 : Math.max(0.12, 0.34 - (site?.latencyMs ?? 200) / 4000),
      size: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    trail.visible = !lowMode;
    scene.add(trail);

    planets.push({
      body, group, holder, mesh, glow, label, moons,
      trail, trailPos,
      ...(moonLines ? { moonLines } : {}),
      speed: orbitSpeed(repo?.pushedAt ?? null),
      dir: i % 2 === 0 ? 1 : -1,
      angle: 0,
      radius,
    });
  });
}

// ---------- 信息卡 ----------
const card = document.getElementById('card')!;
const cardSpark = document.getElementById('card-spark') as HTMLCanvasElement;

function fmtAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} 小时前`;
  return `${Math.round(d)} 天前`;
}

function showCard(body: FixtureBody) {
  const snap = data.latest;
  if (!snap) return;
  const site = snap.sites.find((s) => s.id === body.id);
  const repo = snap.repos.find((r) => r.repo === body.repo);
  document.getElementById('card-name')!.textContent = body.name;
  document.getElementById('card-desc')!.textContent = body.desc;

  const statusLine =
    body.kind === 'dark' ? '<dd class="dim">暗星 · 无公网入口</dd>' :
    site?.alive ? `<dd class="ok">在线 ${site.status} · ${site.latencyMs}ms</dd>` :
    '<dd class="bad">离线 / 超时</dd>';

  // 在线率：按日聚合（今日/昨日），采集时间戳含日期
  let uptimeLine = '';
  if (body.kind !== 'dark') {
    const hist = data.history.filter((h) => h.sites.some((s) => s.id === body.id));
    if (hist.length >= 2) {
      const dayKey = (ts: string) => ts.slice(0, 10);
      const today = dayKey(new Date().toISOString());
      const todayRows = hist.filter((h) => dayKey(h.ts) === today);
      const yesterdayRows = hist.filter((h) => dayKey(h.ts) === dayKey(new Date(Date.now() - 86_400_000).toISOString()));
      const fmt = (rows: typeof hist): { n: number; pct: number } | null => {
        if (rows.length === 0) return null;
        const up = rows.filter((h) => h.sites.find((s) => s.id === body.id)?.alive).length;
        return { n: rows.length, pct: Math.round((up / rows.length) * 100) };
      };
      const t = fmt(todayRows);
      const y = fmt(yesterdayRows);
      const cls = (p: number) => (p >= 90 ? 'ok' : p >= 50 ? 'dim' : 'bad');
      if (t && y) {
        uptimeLine = `<dt>在线率</dt><dd><span class="${cls(t.pct)}">${t.pct}%</span>(${t.n}) · 昨 <span class="${cls(y.pct)}">${y.pct}%</span>(${y.n})</dd>`;
      } else if (t) {
        uptimeLine = `<dt>今日在线</dt><dd class="${cls(t.pct)}">${t.pct}%(${t.n} 采)</dd>`;
      }
    }
  }

  document.getElementById('card-stats')!.innerHTML = `
    <dt>状态</dt>${statusLine}
    ${uptimeLine}
    <dt>技术</dt><dd>${repo?.language ?? '—'}</dd>
    <dt>代码量</dt><dd>${repo ? (repo.sizeKb > 1024 ? (repo.sizeKb / 1024).toFixed(1) + ' MB' : repo.sizeKb + ' KB') : '私有仓库'}</dd>
    <dt>Star</dt><dd>${repo?.stars ?? '—'}</dd>
    <dt>最近提交</dt><dd>${fmtAgo(repo?.pushedAt ?? null)}</dd>
    ${body.probe === 'town' && snap.town ? `<dt>小镇</dt><dd class="ok">${snap.town.agents} 居民 · ${snap.town.clock} · 今日 ${snap.town.dailyTokens.toLocaleString()} tok</dd>` : ''}
    ${body.probe === 'town' && snap.town?.relationships?.length ? (() => {
      const top = [...snap.town.relationships].sort((x, y) => y.score - x.score)[0];
      return `<dt>最铁关系</dt><dd>${top.aName} × ${top.bName}（${top.score} 次互动）</dd><dt>关系网</dt><dd>${snap.town.relationships.length} 条引力连线</dd>`;
    })() : ''}
    ${body.probe === 'town' && snap.town?.recentConversations?.length ? (() => {
      const conv = snap.town.recentConversations[0];
      const bubbles = conv.lines
        .map((l) => `<div class="chat-bubble">${l.text}</div>`)
        .join('');
      return `<dt style="grid-column:1/-1;margin-top:6px;">🍵 茶镇广播</dt><div style="grid-column:1/-1;display:flex;flex-direction:column;gap:5px;">${bubbles}</div>`;
    })() : ''}
  `;

  const links = document.getElementById('card-links')!;
  links.innerHTML = '';
  if (body.url) {
    const a = document.createElement('a');
    a.href = body.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '访问 →';
    links.appendChild(a);
  }
  if (body.repo) {
    const a = document.createElement('a');
    a.href = `https://github.com/${body.repo}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'GitHub';
    links.appendChild(a);
  }

  // 延迟趋势
  const g = cardSpark.getContext('2d')!;
  g.clearRect(0, 0, cardSpark.width, cardSpark.height);
  const series = data.history
    .map((h) => h.sites.find((s) => s.id === body.id)?.latencyMs ?? null)
    .filter((v): v is number => v != null)
    .reverse();
  if (series.length > 1) {
    const max = Math.max(...series, 150);
    g.strokeStyle = '#6fb2ff';
    g.lineWidth = 1.6;
    g.beginPath();
    series.forEach((v, i) => {
      const x = (i / (series.length - 1)) * (cardSpark.width - 8) + 4;
      const y = cardSpark.height - 4 - (v / max) * (cardSpark.height - 10);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    });
    g.stroke();
  }

  card.classList.remove('hidden');
}
// 关闭按钮的监听在「点选」区块统一注册（跟拍也要复位）

// ---------- 点选 ----------
const tooltip = document.getElementById('tooltip')!;
const raycaster = new THREE.Raycaster();
raycaster.params.Line = { threshold: 0.35 }; // 引力连线拾取容差
const pointer = new THREE.Vector2();
let downAt = { x: 0, y: 0, t: 0 };
let followHolder: THREE.Group | THREE.Mesh | null = null; // 跟拍目标（行星 holder 或太阳）
let selMark: THREE.Sprite | null = null;
let selectedId: string | null = null;
let followDist = 0; // >0 时把相机与目标的距离缓动到该值（选中行星自适应取景）

function stopFollow(): void {
  followHolder = null;
  selectedId = null;
  followDist = 0;
  if (selMark) { selMark.parent?.remove(selMark); selMark = null; }
  controls.autoRotate = true;
}

renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: Date.now() }; });

/** 悬停引力连线 → 浮现居民对话备注（R12b） */
/** 引力连线拾取（hover 与移动端点按共用，R20） */
function pickRelLine(e: { clientX: number; clientY: number }): { aName: string; bName: string; score: number; note: string } | null {
  if (card.classList.contains('hidden') || !selectedId) return null;
  const townPv = planets.find((p) => p.body.probe === 'town');
  const relLines = townPv?.moonLines?.userData.relLines as THREE.LineSegments | undefined;
  if (!relLines || !relLines.visible) return null;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(relLines, false);
  const rels = relLines.userData.rels as Array<{ aName: string; bName: string; score: number; note: string }>;
  const idx = hits.length ? (hits[0].index as number) : -1;
  return idx >= 0 ? rels[idx] ?? null : null;
}

function showTooltip(e: { clientX: number; clientY: number }, rel: { aName: string; bName: string; score: number; note: string }): void {
  tooltip.innerHTML = `<div class="tt-who">${rel.aName} × ${rel.bName} · ${rel.score} 次互动</div>${rel.note ?? ''}`;
  tooltip.classList.remove('hidden');
  tooltip.style.left = `${Math.min(e.clientX + 16, innerWidth - 300)}px`;
  tooltip.style.top = `${Math.min(e.clientY + 14, innerHeight - 80)}px`;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  // 只在小镇被选中（卡片开着）时才检测连线，省射线
  const rel = pickRelLine(e);
  if (!rel) { tooltip.classList.add('hidden'); return; }
  showTooltip(e, rel);
});
renderer.domElement.addEventListener('pointerleave', () => tooltip.classList.add('hidden'));

// R20：移动端无 hover——点按连线时同样浮现备注（短按未命中星球且命中连线）
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || Date.now() - downAt.t > 450) return; // 拖拽不算点击
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickables, false)[0];
  const body = hit?.object.userData?.body as FixtureBody | undefined;
  if (body) {
    showCard(body);
    controls.autoRotate = false;
    selectedId = body.id;
    // 跟拍 + 选中标记
    stopFollow();
    const pv = planets.find((p) => p.body.id === body.id);
    followHolder = pv ? pv.holder : (body.kind === 'sun' ? sunMesh : null);
    if (pv) {
      selMark = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: 0xffffff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      selMark.scale.setScalar(5.2);
      pv.holder.add(selMark);
      // 相机距离自适应：小行星贴近些（按半径 6-9 倍取景）
      const pr = (pv.mesh.geometry as THREE.SphereGeometry).parameters.radius;
      followDist = Math.max(7, Math.min(22, pr * 8));
    } else {
      followDist = 0; // 太阳：不调整
    }
  } else {
    // 未命中星球：R20 移动端适配——若命中引力连线则浮现备注（桌面 hover 的点按等价物）
    const rel = pickRelLine(e);
    if (rel) { showTooltip(e, rel); return; }
    card.classList.add('hidden');
    tooltip.classList.add('hidden');
    stopFollow();
  }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { card.classList.add('hidden'); stopFollow(); }
});
document.getElementById('card-close')!.addEventListener('click', () => { card.classList.add('hidden'); stopFollow(); });

// ---------- 数据 ----------
let usingFixture = true; // 首帧用兜底渲染；真实数据到达后转 false

async function loadData(): Promise<void> {
  try {
    const res = await fetch('/api/galaxy', { signal: AbortSignal.timeout(9000) });
    if (res.ok) {
      const j = (await res.json()) as GalaxyData;
      if (j.latest) { data = j; usingFixture = false; }
      if (j.bodies?.length) BODIES = j.bodies; // 目录单一事实源：以 Worker 下发为准
    }
  } catch { /* 保留现有/兜底数据 */ }
  const latest = data.latest;
  if (!latest) return;
  buildScene(BODIES, latest);
  townActivity = latest.town ? Math.min(1, latest.town.dailyTokens / 500_000) : 0;
  const alive = latest.sites.filter((s) => s.alive).length;
  const total = BODIES.length; // 天体总数含暗星（无域名不探活）
  const ageMin = (Date.now() - new Date(latest.ts).getTime()) / 60_000;
  const stale = ageMin > 35 ? ` · 数据较旧(${Math.round(ageMin)}分前)` : '';
  const prefix = usingFixture ? '示例数据 · ' : '';
  document.getElementById('hud-meta')!.textContent =
    `${prefix}${total} 个天体 · ${alive} 在线 · ${data.history.length} 次采集 · 更新于 ${new Date(latest.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}${stale}`;
}

/** 内嵌兜底目录（真实目录由 /api/galaxy 的 bodies 字段下发，单一事实源在 Worker src/bodies.ts） */
let BODIES: FixtureBody[] = [
  { id: 'blog', name: '博客 adcakeyuan.top', desc: '一切的原点：Next.js 博客，AI 语义搜索 + RAG 问答 + 自动写作流水线', url: 'https://adcakeyuan.top', repo: 'huqinyuan923-hue/huqinyuan923-hue.github.io', kind: 'sun', hue: 45 },
  { id: 'town', name: 'AI 小镇 茶镇', desc: '12 位 LLM 居民自主生活的像素小镇：记忆、反思、日程与八卦，读博客过日子', url: 'https://town.adcakeyuan.top', repo: 'huqinyuan923-hue/cha-town', kind: 'planet', hue: 20, probe: 'town' },
  { id: 'arcade', name: '街机厅 Arcade Hub', desc: '40 款自研小游戏的在线街机厅，含排行与收藏', url: 'https://arcade.adcakeyuan.top', repo: 'huqinyuan923-hue/arcade-hub', kind: 'planet', hue: 320 },
  { id: 'cha', name: 'Cha 语言 Playground', desc: 'TypeScript 手写的编程语言：字节码编译器 + 栈式虚拟机，浏览器里跑', url: 'https://cha.adcakeyuan.top', repo: 'huqinyuan923-hue/cha-lang', kind: 'planet', hue: 160 },
  { id: 'deeplearn', name: '深学 DeepLearn', desc: '四条学习线 15 章的中文学习平台', url: 'https://deeplearn.adcakeyuan.top', repo: 'huqinyuan923-hue/deeplearn', kind: 'planet', hue: 210 },
  { id: 'guide', name: 'GitHub 新手村', desc: '零基础 GitHub 入门指南站', url: 'https://guide.adcakeyuan.top', repo: 'huqinyuan923-hue/github-guide', kind: 'planet', hue: 30 },
  { id: 'toolbox', name: '工具箱 Toolbox', desc: '15+ 个纯前端日常小工具，可离线', url: 'https://toolbox.adcakeyuan.top', repo: 'huqinyuan923-hue/toolbox', kind: 'planet', hue: 190 },
  { id: 'rss', name: 'RSS 阅读器', desc: '私有订阅聚合：定时抓取、未读管理', url: 'https://rss.adcakeyuan.top', repo: 'huqinyuan923-hue/rss-reader', kind: 'planet', hue: 100 },
  { id: 'wrapped', name: 'GitHub Wrapped', desc: '输入用户名一键生成年度报告', url: 'https://wrapped.adcakeyuan.top', repo: 'huqinyuan923-hue/github-wrapped', kind: 'planet', hue: 265 },
  { id: 'salary', name: '薪资计算器', desc: '五险一金 + 个税双向互算', url: 'https://salary.adcakeyuan.top', repo: 'huqinyuan923-hue/salarycalc', kind: 'planet', hue: 55 },
  { id: 'pomo', name: '番茄钟 PomoBox', desc: '专注计时 + 任务清单 + 周报图表', url: 'https://pomo.adcakeyuan.top', repo: 'huqinyuan923-hue/pomobox', kind: 'planet', hue: 5 },
  { id: 'filekit', name: '文件处理 FileKit', desc: '纯本地文件处理，不上传', url: 'https://filekit.adcakeyuan.top', repo: 'huqinyuan923-hue/filekit', kind: 'planet', hue: 140 },
  { id: 'cet4', name: '四级题库 CET4Lab', desc: '历年真题 + 刷题的四级备考站', url: 'https://cet4.adcakeyuan.top', repo: 'huqinyuan923-hue/cet4lab', kind: 'planet', hue: 230 },
  { id: 'treasury', name: '记账 Treasury', desc: '私有记账应用', url: 'https://treasury.adcakeyuan.top', repo: 'huqinyuan923-hue/treasury', kind: 'planet', hue: 85 },
  { id: 'imgbed', name: '图床 PicNest', desc: '私有图床（无公网入口，暗星）', url: null, repo: 'huqinyuan923-hue/imgbed', kind: 'dark', hue: 300 },
  { id: 'timemark', name: '时光账本 TimeMark', desc: '时间记录应用（部署中，暗星）', url: null, repo: 'huqinyuan923-hue/timemark-vercel', kind: 'dark', hue: 350 },
];

// ---------- Galaxy Quest：飞船 + 任务系统 ----------
initQuestPanel({
  onClaimed(questId, gained) {
    if (me) me.dust += gained;
    dustFloat(`✦ +${gained} 星尘`);
    flashPlanet(questId);
    void refreshQuestBoard();
  },
  onSupernova() { supernova(); },
  onOpen() { void refreshQuestBoard(); },
});
void refreshQuestBoard();
let me: BoardResponse['me'] = null;
/** 同场探索者标记（飞船旁边的小光点 + 名字） */
let otherMarkers: Array<{ sprite: THREE.Sprite; angle: number; radius: number; speed: number; name: string }> = [];
const otherGroup = new THREE.Group();
scene.add(otherGroup);

function renderOtherExplorers(others: Array<{ id: number; name: string; level: number }>): void {
  // 清旧
  for (const m of otherMarkers) otherGroup.remove(m.sprite);
  otherMarkers = [];
  if (others.length === 0) return;
  others.forEach((o, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x7ec8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(1.6);
    const radius = 5.2 + i * 1.1;
    const angle = (i / others.length) * Math.PI * 2;
    sprite.position.set(Math.cos(angle) * radius, 1.2, Math.sin(angle) * radius);
    const label = labelSprite(`${o.name} LV.${o.level}`, '#7ec8ff', 34);
    label.scale.setScalar(0.01); // 先隐藏，由主循环朝向控制透明度太复杂——直接常显
    label.position.y = 1.4;
    sprite.add(label);
    otherGroup.add(sprite);
    otherMarkers.push({ sprite, angle, radius, speed: 0.3 + i * 0.05, name: o.name });
  });
}
let ship: THREE.Group | null = null;
const shipVel = new THREE.Vector3();
const keys = new Set<string>();
let shipTrail: THREE.Points | null = null;
let shipTrailPos: Float32Array | null = null;
let shipTrailIdx = 0;
const SUPERNOVA_DONE = 'galaxy-supernova-seen';

function buildShip(): void {
  if (ship) return;
  ship = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd98a })
  );
  body.rotation.x = Math.PI / 2; // 锥尖朝 +Z
  ship.add(body);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, color: 0x8ab4ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flame.scale.setScalar(1.6);
  flame.position.z = -1;
  ship.add(flame);
  ship.position.set(6, 0, 6);
  scene.add(ship);

  // 飞船光尾
  const N = 60;
  shipTrailPos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(shipTrailPos, 3));
  shipTrail = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x8ab4ff, transparent: true, opacity: 0.5, size: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(shipTrail);
}

addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
    controls.autoRotate = false;
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// 点击空地 → 飞船飞向该点（与点选星球共存：命中星球时不移动）
const flyTarget = new THREE.Vector3();
let hasFlyTarget = false;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: Date.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || Date.now() - downAt.t > 450) return;
  if (!ship) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickables, false)[0];
  const body = hit?.object.userData?.body as FixtureBody | undefined;
  if (body) {
    showCard(body);
    controls.autoRotate = false;
    selectedId = body.id;
    stopFollow();
    const pv = planets.find((p) => p.body.id === body.id);
    followHolder = pv ? pv.holder : (body.kind === 'sun' ? sunMesh : null);
    if (pv) {
      selMark = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: 0xffffff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      selMark.scale.setScalar(5.2);
      pv.holder.add(selMark);
      const pr = (pv.mesh.geometry as THREE.SphereGeometry).parameters.radius;
      followDist = Math.max(7, Math.min(22, pr * 8));
    } else {
      followDist = 0;
    }
    return;
  }
  // 空点：关闭卡片 + 飞船前往射线与黄道面交点
  card.classList.add('hidden');
  stopFollow();
  if (raycaster.ray.intersectPlane(groundPlane, flyTarget)) {
    flyTarget.y = 0.8;
    hasFlyTarget = true;
  }
});

function updateShip(dt: number): void {
  if (!ship || !shipTrail || !shipTrailPos) return;
  const speed = 22 * dt;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  if (keys.has('w') || keys.has('arrowup')) ship.position.addScaledVector(fwd, speed);
  if (keys.has('s') || keys.has('arrowdown')) ship.position.addScaledVector(fwd, -speed);
  if (keys.has('a') || keys.has('arrowleft')) ship.position.addScaledVector(right, -speed);
  if (keys.has('d') || keys.has('arrowright')) ship.position.addScaledVector(right, speed);
  if (hasFlyTarget) {
    const to = flyTarget.clone().sub(ship.position);
    const d = to.length();
    if (d < 1) hasFlyTarget = false;
    else ship.position.addScaledVector(to.normalize(), Math.min(speed * 1.4, d));
  }
  ship.position.x = Math.max(-90, Math.min(90, ship.position.x));
  ship.position.z = Math.max(-90, Math.min(90, ship.position.z));

  // 朝向：朝移动方向
  const vel = shipVel;
  const prev = ship.position.clone();
  if (ship.position.distanceToSquared(prev) > 0) {
    // 位置更新已在上方完成，用键位向量近似朝向
    const move = new THREE.Vector3();
    if (keys.has('w') || keys.has('arrowup')) move.add(fwd);
    if (keys.has('s') || keys.has('arrowdown')) move.sub(fwd);
    if (keys.has('a') || keys.has('arrowleft')) move.sub(right);
    if (keys.has('d') || keys.has('arrowright')) move.add(right);
    if (move.lengthSq() > 0) ship.lookAt(ship.position.clone().add(move));
    else if (hasFlyTarget) ship.lookAt(flyTarget);
  }
  void vel;

  // 光尾环形缓冲
  shipTrailIdx = (shipTrailIdx + 1) % (shipTrailPos.length / 3);
  shipTrailPos[shipTrailIdx * 3] = ship.position.x;
  shipTrailPos[shipTrailIdx * 3 + 1] = ship.position.y;
  shipTrailPos[shipTrailIdx * 3 + 2] = ship.position.z;
  (shipTrail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
}

// ---------- 任务面板逻辑 ----------
async function refreshQuestBoard(): Promise<void> {
  const identity = loadIdentity();
  if (!identity) {
    // 未注册：表单必须带真实的 onBegin（曾经传过空操作导致注册按钮无效——踩坑）
    renderQuestPanel(null, null, [], { onClaimed: () => {}, onSupernova: () => {} }, null, async (name) => {
      const r = await apiBegin(name);
      saveIdentity({ explorerId: r.explorerId, name: r.name });
      await refreshQuestBoard();
    });
    return;
  }
  try {
    const board = await apiBoard(identity.explorerId);
    me = board.me;
    renderOtherExplorers(board.others ?? []);
    // 重放离线期间的领取（服务端幂等，重复领取 409 无副作用）
    try {
      const pending = JSON.parse(localStorage.getItem('galaxy-pending-claims') ?? '[]') as string[];
      if (pending.length) {
        await Promise.allSettled(
          pending.map((qid) => fetch('/api/quest/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ explorerId: identity.explorerId, questId: qid }),
          }))
        );
        localStorage.removeItem('galaxy-pending-claims');
        // 重放后可能有新的星尘，重拉一次板
        const fresh = await apiBoard(identity.explorerId);
        me = fresh.me;
        board.quests = fresh.quests;
        board.leaders = fresh.leaders;
      }
    } catch { /* 重放失败不影响本次渲染，队列保留 */ }
    renderQuestPanel(
      board.me,
      board.quests,
      board.leaders ?? [],
      {
        onClaimed(questId, gained) {
          if (me) me.dust += gained;
          dustFloat(`✦ +${gained} 星尘`);
          flashPlanet(questId);
          void refreshQuestBoard();
        },
        onSupernova() { supernova(); },
      },
      identity.explorerId,
      async (name) => {
        const r = await apiBegin(name);
        saveIdentity({ explorerId: r.explorerId, name: r.name });
        await refreshQuestBoard();
      }
    );
  } catch (err) {
    // 失败可见 + 兜底渲染：内嵌任务目录（done 未知→按未完成显示）+ 重试按钮，不让玩家卡死
    renderQuestPanel(
      { id: identity.explorerId, name: identity.name, dust: 0, level: 1, levelCur: 0, levelNext: 100, supernova: false, doneCount: 0 },
      QUEST_CATALOG.map((q) => ({ ...q, hidden: q.hidden ?? false, done: false, doneAt: null })),
      [],
      {
        onClaimed(questId, gained) {
          dustFloat(`✦ +${gained} 星尘`);
          flashPlanet(questId);
          // 离线记账：入队，下次联网 board 成功后自动重放（服务端幂等去重）
          try {
            const q = JSON.parse(localStorage.getItem('galaxy-pending-claims') ?? '[]') as string[];
            if (!q.includes(questId)) q.push(questId);
            localStorage.setItem('galaxy-pending-claims', JSON.stringify(q));
          } catch { /* localStorage 不可用忽略 */ }
        },
        onSupernova() {},
      },
      identity.explorerId,
      async () => {}
    );
    const errEl = document.getElementById('quest-me') as HTMLElement;
    errEl.insertAdjacentHTML('beforeend',
      `<div class="q-err">网络不稳，任务进度暂时读不到。已完成的部分照常可领，稍后自动重试。</div>
       <button class="q-go" id="q-retry">重试</button>`);
    errEl.querySelector('#q-retry')!.addEventListener('click', () => void refreshQuestBoard());
  }
}

function dustFloat(text: string): void {
  const el = document.getElementById('dust-float')!;
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // 重启动画
  el.classList.add('show');
}

function flashPlanet(questId: string): void {
  const map: Record<string, string> = {
    'blog-visit': 'blog', 'toolbox-use': 'toolbox', 'arcade-play': 'arcade',
    'town-chat': 'town', 'secret-mayor': 'town', 'pomo-focus': 'pomo',
    'guide-read': 'guide', 'cet4-quiz': 'cet4', 'treasury-log': 'treasury',
    'rss-sub': 'rss', 'filekit-magic': 'filekit', 'deeplearn-learn': 'deeplearn',
    'wrapped-gen': 'wrapped',
  };
  const bodyId = map[questId];
  const pv = planets.find((p) => p.body.id === bodyId);
  if (!pv) return;
  const orig = pv.glow.material.opacity;
  pv.glow.material.opacity = 1;
  pv.glow.scale.multiplyScalar(1.6);
  setTimeout(() => {
    pv.glow.material.opacity = orig;
    pv.glow.scale.divideScalar(1.6);
  }, 1200);
}

function supernova(): void {
  if (localStorage.getItem(SUPERNOVA_DONE)) return;
  localStorage.setItem(SUPERNOVA_DONE, '1');
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;z-index:60;background:radial-gradient(circle at 50% 50%, #fff8e0, #ffd98a 30%, transparent 70%);opacity:0;pointer-events:none;transition:opacity 0.4s;';
  document.body.appendChild(flash);
  requestAnimationFrame(() => (flash.style.opacity = '1'));
  setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), 500);
  }, 900);
  dustFloat('★ 超新星达成 —— 星系开拓者');
}

// ---------- 主循环 ----------
const clockT = new THREE.Clock();
const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
document.body.appendChild(fpsEl);
let frames = 0;
let fpsLast = performance.now();

const ORIGIN = new THREE.Vector3(0, 0, 0);
const followWp = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

/** 小镇活跃度 → 太阳耀斑强度（0..1，映射今日 token / 预算） */
let townActivity = 0;

function setLabelDim(exceptId?: string): void {
  for (const p of planets) {
    const target = exceptId && p.body.id !== exceptId ? 0.15 : 1;
    p.label.material.opacity += (target - p.label.material.opacity) * 0.15;
  }
}

function animate(): void {
  requestAnimationFrame(animate);
  if (document.hidden) { clockT.getDelta(); return; } // 后台标签页暂停渲染（省电）
  const dt = Math.min(clockT.getDelta(), 0.05);
  const t = clockT.elapsedTime;

  frames++;
  const now = performance.now();
  if (now - fpsLast >= 500) {
    const fps = Math.round((frames * 1000) / (now - fpsLast));
    fpsEl.textContent = lowMode ? `${fps} fps · 省电模式` : `${fps} fps`;
    // 连续 4 个采样 < 24fps → 降级（软渲染/低端机的兜底）
    if (!lowMode) {
      lowVotes = fps < 24 ? lowVotes + 1 : 0;
      if (lowVotes >= 4) enterLowMode();
    }
    frames = 0;
    fpsLast = now;
  }

  if (sunMesh) {
    const flare = 0.012 + townActivity * 0.035;            // 小镇越活跃，太阳越躁动
    sunMesh.scale.setScalar(1 + Math.sin(t * 1.6) * flare);
    sunLight.intensity = 320 + Math.sin(t * 2.3) * (24 + townActivity * 90);
  }
  if (sunMat) sunMat.uniforms.uTime.value = t;
  if (sunGlow) {
    sunGlow.scale.setScalar(9 * (1 + townActivity * 0.35));
    sunGlow.material.opacity = 0.5 + Math.sin(t * 1.1) * 0.08;
  }
  setLabelDim(selectedId ?? undefined);

  for (const s of starMats) {
    s.mat.opacity = s.base + Math.sin(t * 1.7 + s.phase) * s.amp;
  }

  for (const p of planets) {
    p.angle += p.speed * p.dir * dt;
    p.holder.position.set(Math.cos(p.angle) * p.radius, 0, Math.sin(p.angle) * p.radius);
    p.mesh.rotation.y += dt * 0.6;
    const clouds = p.holder.userData.clouds as THREE.Mesh | undefined;
    if (clouds) clouds.rotation.y += dt * 0.22; // 云层独立慢转

    // LOD：每 ~0.5s 按相机距离切换一次分段（低帧率设备收益最大）
    p.lodTimer = (p.lodTimer ?? 0) + dt;
    if (p.lodTimer > 0.5) {
      p.lodTimer = 0;
      const lods = p.mesh.userData.lods as Array<[number, THREE.SphereGeometry]>;
      const dist = camera.position.distanceTo(p.holder.position);
      const geo = lods.find(([d]) => dist >= d)?.[1];
      if (geo && p.mesh.geometry !== geo) p.mesh.geometry = geo;
    }
    for (const m of p.moons) m.pivot.rotation.y += m.speed * dt;

    // lowMode 下跳过拖尾/连线的逐帧刷新（不可见即不计算）
    if (lowMode) continue;

    // 轨道拖尾：环形缓冲左移一格，写入当前世界坐标
    if (p.trail && p.trailPos && p.trail.visible) {
      p.trailPos.copyWithin(0, 3);
      p.holder.getWorldPosition(tmpV);
      const k = (p.trailPos.length - 3);
      p.trailPos[k] = tmpV.x; p.trailPos[k + 1] = tmpV.y; p.trailPos[k + 2] = tmpV.z;
      (p.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    // 小镇卫星连线端点刷新 + 引力连线（关系图谱）
    if (p.moonLines) {
      const ud = p.moonLines.userData as { moonMeshes: THREE.Mesh[]; relLines?: THREE.LineSegments };
      const meshes = ud.moonMeshes;
      const attr = p.moonLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let mi = 0; mi < meshes.length; mi++) {
        meshes[mi].getWorldPosition(tmpV);
        const base = mi * 6;
        arr[base] = 0; arr[base + 1] = 0; arr[base + 2] = 0; // 行星中心（本地系）
        meshes[mi].parent!.worldToLocal(tmpV);
        arr[base + 3] = tmpV.x; arr[base + 4] = tmpV.y; arr[base + 5] = tmpV.z;
      }
      attr.needsUpdate = true;

      const relLines = ud.relLines;
      if (relLines) {
        const rels = relLines.userData.rels as Array<{ a: number; b: number; score: number }>;
        const rAttr = relLines.geometry.getAttribute('position') as THREE.BufferAttribute;
        const cAttr = relLines.geometry.getAttribute('color') as THREE.BufferAttribute;
        const rArr = rAttr.array as Float32Array;
        const cArr = cAttr.array as Float32Array;
        const maxScore = Math.max(1, ...rels.map((r) => r.score));
        for (let ri = 0; ri < rels.length; ri++) {
          const rel = rels[ri];
          const ma = meshes[rel.a - 1];
          const mb = meshes[rel.b - 1];
          if (!ma || !mb) continue;
          const base = ri * 6;
          ma.getWorldPosition(tmpV);
          ma.parent!.worldToLocal(tmpV);
          rArr[base] = tmpV.x; rArr[base + 1] = tmpV.y; rArr[base + 2] = tmpV.z;
          mb.getWorldPosition(tmpV2);
          mb.parent!.worldToLocal(tmpV2);
          rArr[base + 3] = tmpV2.x; rArr[base + 4] = tmpV2.y; rArr[base + 5] = tmpV2.z;
          // 亮度：分数归一 → 蓝→金渐变（金=最铁）
          const s = Math.min(1, rel.score / maxScore);
          const cr = 0.35 + s * 0.85, cg = 0.55 + s * 0.35, cb = 1.0 - s * 0.25;
          for (let e = 0; e < 2; e++) {
            cArr[base + e * 3] = cr; cArr[base + e * 3 + 1] = cg; cArr[base + e * 3 + 2] = cb;
          }
        }
        rAttr.needsUpdate = true;
        cAttr.needsUpdate = true;
      }
    }
  }

  // 跟拍：相机目标平滑追踪选中天体（关闭卡片即回到恒星并恢复自转）
  if (followHolder) {
    followHolder.getWorldPosition(followWp);
    controls.target.lerp(followWp, 0.07);
    if (followDist > 0) {
      // 相机沿当前视线收敛到理想距离（取景自适应）
      const dir = camera.position.clone().sub(controls.target);
      const d = dir.length();
      const nd = d + (followDist - d) * 0.05;
      camera.position.copy(controls.target).add(dir.setLength(nd));
    }
  } else {
    controls.target.lerp(ORIGIN, 0.02);
  }
  if (selMark) selMark.material.opacity = 0.55 + Math.sin(t * 4) * 0.3;

  updateShip(dt);
  for (const o of otherMarkers) {
    o.angle += o.speed * dt;
    o.sprite.position.set(Math.cos(o.angle) * o.radius, 1.2 + Math.sin(t + o.radius) * 0.3, Math.sin(o.angle) * o.radius);
  }

  controls.update();
  if (lowMode) renderer.render(scene, camera);
  else composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

buildScene(BODIES, FIXTURE_DATA.latest);
animate();
void loadData();
setInterval(() => void loadData(), 60_000);
