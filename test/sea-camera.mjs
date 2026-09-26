import assert from "node:assert/strict";
import { loadSea } from "./helpers/sea-module.mjs";
import { PerspectiveCamera, Raycaster, Vector2, Plane, Vector3 } from "three";

const { waterIntersection } = await loadSea();
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
assert.deepEqual(waterIntersection(400, 250, 800, 500, [0, 2.5, 0], identity, [1, -.115]), [0, -2.5 / .115]);
assert.equal(waterIntersection(400, 0, 800, 500, [0, 2.5, 0], identity, [1, -.115]), null);
assert.equal(waterIntersection(400, 400, 800, 500, [0, -1, 0], identity, [1, 0]), null);
assert.equal(waterIntersection(0, 0, 0, 0, [0, 2, 0], identity, [1, 0]), null);

const plane = new Plane(new Vector3(0, 1, 0), 0), ray = new Raycaster();
for (const [width, height] of [[1200, 800], [390, 844]]) {
  for (const [yaw, pitch, fov, zoom] of [[0, -.3, 55, 1], [1.2, -.6, 70, 1.3], [-2.4, -.1, 45, 1]]) {
    const camera = new PerspectiveCamera(fov, width / height, .1, 5000);
    camera.position.set(12, 3.4, 35);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements;
    const basis = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
    for (const [nx, ny] of [[.2, .7], [.7, .8], [.5, .5]]) {
      ray.setFromCamera(new Vector2(nx * 2 - 1, 1 - ny * 2), camera);
      const expected = ray.ray.intersectPlane(plane, new Vector3());
      const actual = waterIntersection(nx * width, ny * height, width, height,
        camera.position.toArray(), basis, [2 * Math.tan(fov * Math.PI / 360) / zoom, 0]);
      assert(expected && actual);
      assert(Math.abs(actual[0] - expected.x) < 1e-9);
      assert(Math.abs(actual[1] - expected.z) < 1e-9);
    }
  }
}
console.log("sea camera: default view and moving world rays agree with Three.js");
