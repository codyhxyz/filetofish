/* Real Three scene/material/geometry classes; only GPU entry points are faked. */
export * from "three";
import { WebGLRenderTarget as Target, WebGLCubeRenderTarget as CubeTarget } from "three";
export const renders = [], captures = [], resources = [];
const snapshot = uniforms => Object.fromEntries(Object.entries(uniforms).map(([key, { value }]) =>
  [key, Array.isArray(value) || ArrayBuffer.isView(value) ? Array.from(value) : value]));
export class WebGLRenderTarget extends Target {
  constructor(...args) { super(...args); resources.push(this); }
  dispose() { this.disposed = true; super.dispose(); }
}
export class WebGLCubeRenderTarget extends CubeTarget {
  constructor(...args) { super(...args); resources.push(this); }
  dispose() { this.disposed = true; super.dispose(); }
}
export class CubeCamera {
  constructor(near, far, target) { Object.assign(this, { near, far, target }); }
  update(renderer, scene) {
    captures.push({ size: this.target.width, mode: "mipmaps", uniforms: snapshot(scene.children[0].material.uniforms) });
  }
}
export class WebGLRenderer {
  constructor({ canvas }) { this.canvas = canvas; resources.push(this); }
  setSize(w, h) { this.canvas.width = w; this.canvas.height = h; }
  setRenderTarget(target) { this.target = target; }
  render(mesh) { renders.push({ material: mesh.material, target: this.target, uniforms: snapshot(mesh.material.uniforms) }); }
  dispose() { this.disposed = true; }
}
export class PMREMGenerator {
  constructor(renderer) { this.renderer = renderer; resources.push(this); }
  fromScene(scene, sigma, near, far, { size }) {
    captures.push({ size, sigma, near, far, uniforms: snapshot(scene.children[0].material.uniforms), material: scene.children[0].material });
    return new WebGLRenderTarget(size * 3, size * 4);
  }
  dispose() { this.disposed = true; }
}
