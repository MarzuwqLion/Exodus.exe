/**
 * Low-resolution pipeline (spec §4.1): the scene renders into a 640×360 target (plus a small margin for the
 * sub-texel offset), then emissive bloom → outline → vignette → dither → palette quantization (OKLab lookup)
 * at low resolution, then a final pass upscales by the largest whole-number factor with nearest sampling,
 * offsets the world by the leftover sub-texel amount, and composites the pixel UI and transitions.
 */
import * as THREE from 'three';
import { TUNING } from '../content/tuning';
import { EPILOGUE, MAIN, buildLut, type PaletteData } from './palettes';

const LUT_SIZE = 64;

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BAYER = /* glsl */ `
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[x + y * 4] + 0.5) / 16.0;
}`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform vec2 uShift;
varying vec2 vUv;
vec3 tap(vec2 uv) {
  vec4 s = texture2D(tScene, uv);
  return s.rgb * step(0.75, s.a);
}
void main() {
  // uShift keeps the half-res bloom grid anchored to world texel pairs, so glows don't shimmer when the
  // camera moves by an odd number of texels.
  vec2 uv = vUv + uTexel * uShift;
  vec3 c = tap(uv + uTexel * vec2(-0.5, -0.5)) + tap(uv + uTexel * vec2(0.5, -0.5))
         + tap(uv + uTexel * vec2(-0.5, 0.5)) + tap(uv + uTexel * vec2(0.5, 0.5));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const QUANTIZE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler3D tLut;
uniform sampler3D tLut2;
uniform float uLutMix;
uniform float uBloom;
uniform float uVignette;
uniform float uDither;
uniform float uOutline;
uniform vec2 uDitherOffset;
uniform float uLutSize;
uniform float uRaw;
uniform vec2 uBloomShift;
varying vec2 vUv;
${BAYER}
bool isChar(float a) { return a > 0.35 && a < 0.65; }
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(tScene, ip, 0);
  vec3 col = s.rgb;
  if (uOutline > 0.5 && s.a < 0.25) {
    ivec2 sz = textureSize(tScene, 0) - 1;
    if (isChar(texelFetch(tScene, clamp(ip + ivec2(1, 0), ivec2(0), sz), 0).a) ||
        isChar(texelFetch(tScene, clamp(ip - ivec2(1, 0), ivec2(0), sz), 0).a) ||
        isChar(texelFetch(tScene, clamp(ip + ivec2(0, 1), ivec2(0), sz), 0).a) ||
        isChar(texelFetch(tScene, clamp(ip - ivec2(0, 1), ivec2(0), sz), 0).a)) {
      col = vec3(0.0549, 0.0627, 0.0745);
    }
  }
  col += texture2D(tBloom, vUv - uBloomShift).rgb * uBloom;
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.82);
  col *= clamp(1.0 - uVignette * dot(q, q) * 2.4, 0.0, 1.0);
  if (uRaw > 0.5) { gl_FragColor = vec4(col, 1.0); return; }
  float b = bayer4(gl_FragCoord.xy + uDitherOffset);
  col = clamp(col + (b - 0.5) * uDither, 0.0, 1.0);
  vec3 lc = col * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
  vec3 c1 = texture(tLut, lc).rgb;
  if (uLutMix > 0.0) {
    vec3 c2 = texture(tLut2, lc).rgb;
    if (b < uLutMix) c1 = c2;
  }
  gl_FragColor = vec4(c1, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tWorld;
uniform sampler2D tUi;
uniform vec2 uOrigin;
uniform float uScale;
uniform vec2 uOffsetPx;
uniform vec2 uWorldSize;
uniform vec2 uLowSize;
uniform float uMargin;
uniform float uCoverage;
uniform float uWipe;
uniform vec3 uFlashColor;
uniform float uFlash;
uniform float uUiOn;
${BAYER}
void main() {
  vec2 p = gl_FragCoord.xy - uOrigin;
  vec2 full = uLowSize * uScale;
  if (p.x < 0.0 || p.y < 0.0 || p.x >= full.x || p.y >= full.y) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 lowUi = floor(p / uScale);
  vec2 lowW = floor((p - uOffsetPx) / uScale) + uMargin;
  vec3 col = texture2D(tWorld, (lowW + 0.5) / uWorldSize).rgb;
  if (uFlash > 0.0) col = uFlashColor;
  if (uUiOn > 0.5) {
    vec4 ui = texture2D(tUi, (lowUi + 0.5) / uLowSize);
    if (ui.a > 0.5) col = ui.rgb;
  }
  if (uCoverage > 0.0) {
    bool covered;
    if (uWipe > 0.5) {
      float row = uLowSize.y - 1.0 - lowUi.y;
      float band = row / uLowSize.y;
      covered = band < uCoverage * 1.25 - mod(row, 2.0) * 0.25;
    } else {
      covered = bayer4(lowUi) < uCoverage;
    }
    if (covered) col = vec3(0.0);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function makeTarget(w: number, h: number, depth: boolean, linear = false): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(w, h, {
    minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
    magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
    depthBuffer: depth,
    stencilBuffer: false,
    generateMipmaps: false,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
  });
  t.texture.colorSpace = THREE.NoColorSpace;
  return t;
}

function makeLut(p: PaletteData): THREE.Data3DTexture {
  const tex = new THREE.Data3DTexture(buildLut(p, LUT_SIZE), LUT_SIZE, LUT_SIZE, LUT_SIZE);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapR = tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

class Pass {
  readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  readonly scene = new THREE.Scene();
  constructor(frag: string, uniforms: Record<string, THREE.IUniform>) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: frag,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  get u(): Record<string, THREE.IUniform> {
    return this.material.uniforms;
  }
}

export interface FrameInput {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Leftover sub-texel camera offset, in texels (x right, y up). */
  subTexel: { x: number; y: number };
  /** Snapped camera position in whole texels, to anchor the dither pattern to the world. */
  texelOrigin: { x: number; y: number };
  /** 0 = main palette, 1 = epilogue palette (dithered crossfade in between). */
  lutMix: number;
  /** Transition coverage 0..1 and style. */
  coverage: number;
  wipe: boolean;
  /** Lightning flash this frame. */
  flash: boolean;
  /** Draw the UI layer. */
  ui: boolean;
}

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly W = TUNING.render.width;
  readonly H = TUNING.render.height;
  readonly M = TUNING.render.margin;
  readonly uiCanvas: HTMLCanvasElement;
  readonly uiTexture: THREE.CanvasTexture;
  /** Whole-number upscale factor and the image origin in device pixels. */
  scale = 1;
  origin = { x: 0, y: 0 };
  bloomStrength: number = TUNING.render.bloomStrength;
  vignette: number = TUNING.render.vignette;
  dither: number = TUNING.render.ditherStrength;
  outline: boolean = TUNING.render.outline;
  /** F8: show the scene before quantization. */
  paletteDebug = false;
  contextLost = false;

  private sceneTarget: THREE.WebGLRenderTarget;
  private bloomA: THREE.WebGLRenderTarget;
  private bloomB: THREE.WebGLRenderTarget;
  private quantTarget: THREE.WebGLRenderTarget;
  private lowFinal: THREE.WebGLRenderTarget | null = null;
  private lutMain: THREE.Data3DTexture;
  private lutEpi: THREE.Data3DTexture | null = null;
  private prefilter: Pass;
  private blur: Pass;
  private quantize: Pass;
  private final: Pass;
  private passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private lastInput: FrameInput | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    opts: { preserveDrawingBuffer?: boolean } = {},
  ) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(1);
    this.renderer.info.autoReset = false;
    this.renderer.autoClear = true;

    const ww = this.W + this.M * 2;
    const wh = this.H + this.M * 2;
    this.sceneTarget = makeTarget(ww, wh, true);
    this.bloomA = makeTarget(Math.ceil(ww / 2), Math.ceil(wh / 2), false, true);
    this.bloomB = makeTarget(Math.ceil(ww / 2), Math.ceil(wh / 2), false, true);
    this.quantTarget = makeTarget(ww, wh, false);
    this.lutMain = makeLut(MAIN);

    this.uiCanvas = document.createElement('canvas');
    this.uiCanvas.width = this.W;
    this.uiCanvas.height = this.H;
    this.uiTexture = new THREE.CanvasTexture(this.uiCanvas);
    this.uiTexture.minFilter = THREE.NearestFilter;
    this.uiTexture.magFilter = THREE.NearestFilter;
    this.uiTexture.generateMipmaps = false;
    this.uiTexture.colorSpace = THREE.NoColorSpace;

    this.prefilter = new Pass(PREFILTER_FRAG, {
      tScene: { value: this.sceneTarget.texture },
      uTexel: { value: new THREE.Vector2(1 / ww, 1 / wh) },
      uShift: { value: new THREE.Vector2() },
    });
    this.blur = new Pass(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.quantize = new Pass(QUANTIZE_FRAG, {
      tScene: { value: this.sceneTarget.texture },
      tBloom: { value: this.bloomA.texture },
      tLut: { value: this.lutMain },
      tLut2: { value: this.lutMain },
      uLutMix: { value: 0 },
      uBloom: { value: this.bloomStrength },
      uVignette: { value: this.vignette },
      uDither: { value: this.dither },
      uOutline: { value: this.outline ? 1 : 0 },
      uDitherOffset: { value: new THREE.Vector2() },
      uLutSize: { value: LUT_SIZE },
      uRaw: { value: 0 },
      uBloomShift: { value: new THREE.Vector2() },
    });
    this.final = new Pass(FINAL_FRAG, {
      tWorld: { value: this.quantTarget.texture },
      tUi: { value: this.uiTexture },
      uOrigin: { value: new THREE.Vector2() },
      uScale: { value: 1 },
      uOffsetPx: { value: new THREE.Vector2() },
      uWorldSize: { value: new THREE.Vector2(ww, wh) },
      uLowSize: { value: new THREE.Vector2(this.W, this.H) },
      uMargin: { value: this.M },
      uCoverage: { value: 0 },
      uWipe: { value: 0 },
      uFlashColor: { value: new THREE.Vector3(0xd8 / 255, 0xdc / 255, 0xda / 255) },
      uFlash: { value: 0 },
      uUiOn: { value: 1 },
    });

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.lutMain.needsUpdate = true;
      if (this.lutEpi) this.lutEpi.needsUpdate = true;
      this.uiTexture.needsUpdate = true;
    });
    this.resize();
  }

  /** The epilogue lookup is built lazily (only the voyage and Ghana need it). */
  ensureEpilogueLut(): void {
    if (!this.lutEpi) {
      this.lutEpi = makeLut(EPILOGUE);
      this.quantize.u.tLut2.value = this.lutEpi;
    }
  }

  /** Use the epilogue palette as the primary lookup (Ghana scenes). */
  setPrimaryPalette(which: 'main' | 'epilogue'): void {
    if (which === 'epilogue') {
      this.ensureEpilogueLut();
      this.quantize.u.tLut.value = this.lutEpi;
    } else {
      this.quantize.u.tLut.value = this.lutMain;
    }
  }

  /** Match the canvas to its CSS size × devicePixelRatio and pick the whole-number scale. */
  resize(): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cw = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) this.renderer.setSize(cw, ch, false);
    this.scale = Math.max(1, Math.floor(Math.min(cw / this.W, ch / this.H)));
    this.origin.x = Math.floor((cw - this.W * this.scale) / 2);
    this.origin.y = Math.floor((ch - this.H * this.scale) / 2);
  }

  /** Convert canvas CSS pixel coordinates to low-res UI coordinates (top-left origin). */
  cssToLow(x: number, y: number): { x: number; y: number } {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const px = x * dpr;
    const py = y * dpr;
    const ch = this.canvas.height;
    // origin.y is measured from the bottom in GL; convert to a top-left origin.
    const top = ch - this.origin.y - this.H * this.scale;
    return { x: (px - this.origin.x) / this.scale, y: (py - top) / this.scale };
  }

  render(input: FrameInput): void {
    if (this.contextLost) return;
    this.lastInput = input;
    const r = this.renderer;
    r.info.reset();

    // 1. Scene into the low-res target. Clear with alpha 0 (an ordinary surface) in the fog color, so the
    // sky never feeds the bloom. Scenes must not set `scene.background` (that clears with alpha 1).
    const fog = input.scene.fog;
    r.setClearColor(fog ? fog.color : 0x000000, 0);
    r.setRenderTarget(this.sceneTarget);
    r.render(input.scene, input.camera);

    // 2. Bloom: prefilter emissive pixels to half res, blur H then V. The half-res grid is shifted by the
    // camera's texel parity so it stays anchored to world texel pairs.
    const half = this.bloomA;
    const ox = (((-input.texelOrigin.x % 2) + 2) % 2) | 0;
    const oy = (((-input.texelOrigin.y % 2) + 2) % 2) | 0;
    this.prefilter.u.uShift.value.set(ox, oy);
    this.quantize.u.uBloomShift.value.set(ox / this.sceneTarget.width, oy / this.sceneTarget.height);
    r.setRenderTarget(half);
    r.render(this.prefilter.scene, this.passCamera);
    this.blur.u.tSrc.value = half.texture;
    this.blur.u.uDir.value.set(1 / half.width, 0);
    r.setRenderTarget(this.bloomB);
    r.render(this.blur.scene, this.passCamera);
    this.blur.u.tSrc.value = this.bloomB.texture;
    this.blur.u.uDir.value.set(0, 1 / half.height);
    r.setRenderTarget(half);
    r.render(this.blur.scene, this.passCamera);

    // 3. Outline, bloom add, vignette, dither, palette quantization.
    const q = this.quantize.u;
    q.uBloom.value = this.bloomStrength;
    q.uVignette.value = this.vignette;
    q.uDither.value = this.dither;
    q.uOutline.value = this.outline ? 1 : 0;
    q.uDitherOffset.value.set(
      (((input.texelOrigin.x % 4) + 4) % 4) | 0,
      (((input.texelOrigin.y % 4) + 4) % 4) | 0,
    );
    q.uRaw.value = this.paletteDebug ? 1 : 0;
    if (input.lutMix > 0) this.ensureEpilogueLut();
    q.uLutMix.value = input.lutMix;
    r.setRenderTarget(this.quantTarget);
    r.render(this.quantize.scene, this.passCamera);

    // 4. Upscale to the canvas with the sub-texel offset, UI, transitions, flash.
    this.uiTexture.needsUpdate = input.ui;
    this.drawFinal(null, this.scale, this.origin, input);
  }

  private drawFinal(
    target: THREE.WebGLRenderTarget | null,
    scale: number,
    origin: { x: number; y: number },
    input: FrameInput,
  ): void {
    const f = this.final.u;
    f.uScale.value = scale;
    f.uOrigin.value.set(origin.x, origin.y);
    f.uOffsetPx.value.set(-Math.round(input.subTexel.x * scale), -Math.round(input.subTexel.y * scale));
    f.uCoverage.value = input.coverage;
    f.uWipe.value = input.wipe ? 1 : 0;
    f.uFlash.value = input.flash ? 1 : 0;
    f.uUiOn.value = input.ui ? 1 : 0;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.final.scene, this.passCamera);
  }

  /**
   * The final low-res output (world + UI, no sub-texel offset) read back as RGBA, top row first.
   * Used by the palette test and portraits.
   */
  readLowRes(includeUi = true): Uint8Array {
    if (!this.lowFinal) this.lowFinal = makeTarget(this.W, this.H, false);
    const input = this.lastInput;
    if (!input) return new Uint8Array(this.W * this.H * 4);
    this.drawFinal(this.lowFinal, 1, { x: 0, y: 0 }, { ...input, subTexel: { x: 0, y: 0 }, ui: includeUi });
    const buf = new Uint8Array(this.W * this.H * 4);
    this.renderer.readRenderTargetPixels(this.lowFinal, 0, 0, this.W, this.H, buf);
    this.renderer.setRenderTarget(null);
    return flipRows(buf, this.W, this.H);
  }

  stats(): { calls: number; triangles: number; textures: number; geometries: number } {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      textures: i.memory.textures,
      geometries: i.memory.geometries,
    };
  }
}

function flipRows(buf: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(buf.length);
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(buf.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
  return out;
}
