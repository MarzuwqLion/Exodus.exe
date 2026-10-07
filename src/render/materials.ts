/**
 * Shared materials (spec §4.4). Toon materials (flat: kit geometry carries per-face normals) with a 3-step gradient, vertex colors from the
 * palette, and an alpha channel that tags each pixel for post-processing:
 *   alpha 0   = ordinary surface
 *   alpha 0.5 = character (gets the 1-texel outline)
 *   alpha 1   = emissive (feeds the bloom)
 */
import * as THREE from 'three';
import { TUNING } from '../content/tuning';

export const MASK = { surface: 0, character: 0.5, emissive: 1 } as const;

let gradient: THREE.DataTexture | null = null;

/** 3-step gradient map: shadow, mid, lit. Nearest filtering so surfaces never get smooth gradients. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([46, 150, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RedFormat, THREE.UnsignedByteType);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/**
 * Shared fog uniforms (spec §4.6: exponential fog, heavier at the edges). The camera sits far back along the
 * view direction, so plain depth fog would drown everything; instead fog distance is measured past the focus
 * plane, plus a radial term from the camera focus on the ground, so the middle of the screen stays readable
 * and the edges sink into the haze.
 */
export const FOG = {
  uFogPlane: { value: 60 },
  uFogRadial: { value: 0.55 },
  uFogFocus: { value: new THREE.Vector2() },
};

const FOG_VERTEX = /* glsl */ `#include <fog_vertex>
#ifdef USE_FOG
  vec4 fogWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    fogWorld = instanceMatrix * fogWorld;
  #endif
  vFogWorld = (modelMatrix * fogWorld).xyz;
#endif`;

const FOG_FRAGMENT = /* glsl */ `#ifdef USE_FOG
  float fogDist = max(0.0, vFogDepth - uFogPlane) + uFogRadial * length(vFogWorld.xz - uFogFocus);
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, fogDist);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;

/**
 * Patches a material: writes the post-processing tag into the alpha channel at the very end of the fragment
 * shader, and swaps in the focus-relative fog.
 */
export function withMask<M extends THREE.Material>(mat: M, mask: number, lift = 0): M {
  const tag = mask.toFixed(2);
  mat.onBeforeCompile = (shader) => {
    if (lift > 0) {
      // Readability floor: the surface glows faintly in its own color so it never sinks into the dark.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
	totalEmissiveRadiance += diffuseColor.rgb * ${lift.toFixed(3)};`,
      );
    }
    shader.uniforms.uFogPlane = FOG.uFogPlane;
    shader.uniforms.uFogRadial = FOG.uFogRadial;
    shader.uniforms.uFogFocus = FOG.uFogFocus;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <fog_pars_vertex>',
        '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying vec3 vFogWorld;\n#endif',
      )
      .replace('#include <fog_vertex>', FOG_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <fog_pars_fragment>',
        '#include <fog_pars_fragment>\n#ifdef USE_FOG\nvarying vec3 vFogWorld;\nuniform float uFogPlane;\nuniform float uFogRadial;\nuniform vec2 uFogFocus;\n#endif',
      )
      .replace('#include <fog_fragment>', FOG_FRAGMENT)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n\tgl_FragColor.a = ${tag};`);
  };
  mat.customProgramCacheKey = () => `mask${tag}lift${lift}`;
  return mat;
}

export interface MaterialSet {
  /** Static props and buildings: vertex colors, toon shading. */
  toon: THREE.MeshToonMaterial;
  /** Characters: per-instance colors, toon shading, outline tag. */
  character: THREE.MeshToonMaterial;
  /** Character emissive bits (seams, baton tips, scanner wands, eyes). */
  characterGlow: THREE.MeshBasicMaterial;
  /** Emissive surfaces: lamps, screens, beacons. Unaffected by fog so glows read through it. */
  glow: THREE.MeshBasicMaterial;
  /** Emissive with per-instance colors (particles that glow, light bulbs drawn as instances). */
  glowInstanced: THREE.MeshBasicMaterial;
  /** Unlit, fogged, non-emissive (blob shadows, decals). */
  flat: THREE.MeshBasicMaterial;
  /** Toon with per-instance colors (instanced props). */
  toonInstanced: THREE.MeshToonMaterial;
}

let shared: MaterialSet | null = null;

export function materials(): MaterialSet {
  if (shared) return shared;
  const g = toonGradient();
  shared = {
    toon: withMask(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g }), MASK.surface),
    character: withMask(
      new THREE.MeshToonMaterial({ gradientMap: g }),
      MASK.character,
      TUNING.render.characterLift,
    ),
    characterGlow: withMask(new THREE.MeshBasicMaterial({ fog: false }), MASK.emissive),
    glow: withMask(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), MASK.emissive),
    glowInstanced: withMask(new THREE.MeshBasicMaterial({ fog: false }), MASK.emissive),
    flat: withMask(new THREE.MeshBasicMaterial({ vertexColors: true }), MASK.surface),
    toonInstanced: withMask(new THREE.MeshToonMaterial({ gradientMap: g }), MASK.surface),
  };
  return shared;
}

/** A canvas texture with nearest filtering for signs, screens, posters, and the ship's name. */
export function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Emissive material for a canvas-textured sign. */
export function signMaterial(tex: THREE.Texture, emissive = true): THREE.MeshBasicMaterial {
  return withMask(
    new THREE.MeshBasicMaterial({ map: tex, fog: !emissive }),
    emissive ? MASK.emissive : MASK.surface,
  );
}
