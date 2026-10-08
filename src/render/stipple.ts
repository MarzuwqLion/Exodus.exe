/**
 * Screen-door translucency, the pixel-art way: a surface drawn at full strength in a fraction of its pixels,
 * picked by a 4×4 Bayer threshold anchored to the world's texel grid (the pattern moves with the world, not the
 * screen, so it doesn't crawl). A blended tint would fail here: a faint cyan or red quantizes to gray, because
 * the palette only gives the reserved colors to inputs with most of their chroma (spec §4.5's color rules).
 */
import * as THREE from 'three';

/** The snapped camera's texel origin, mod 4. The pipeline sets it before each scene render. */
export const STIPPLE_ORIGIN = { value: new THREE.Vector2() };

export function setStippleOrigin(texelX: number, texelY: number): void {
  STIPPLE_ORIGIN.value.set((((texelX % 4) + 4) % 4) | 0, (((texelY % 4) + 4) % 4) | 0);
}

/** The 4×4 Bayer threshold at a pixel, in (0, 1). Shared with the palette pass's dither. */
export const BAYER4_GLSL = /* glsl */ `
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[x + y * 4] + 0.5) / 16.0;
}`;

/**
 * Make `mat` draw only `density` (0..1) of its pixels: 0.5 is a checkerboard, 0.125 two pixels in sixteen.
 * Returns the uniform, so the density can change per frame.
 */
export function stipple(mat: THREE.Material, density: number): { value: number } {
  const u = { value: density };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStippleOrigin = STIPPLE_ORIGIN;
    shader.uniforms.uStipple = u;
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `uniform vec2 uStippleOrigin;
uniform float uStipple;
${BAYER4_GLSL}
void main() {
  if (bayer4(gl_FragCoord.xy + uStippleOrigin) > uStipple) discard;`,
    );
  };
  return u;
}
