import {
  renderEngine as createRenderEngine,
  world as createWorld,
  entity as createEntity,
  components,
  loaders,
} from "../index.js";

import createContext from "pex-context";
import { quat, vec3 } from "pex-math";
import createGUI from "pex-gui";
import { aabb } from "pex-geom";

import { cube } from "primitive-geometry";

import { dragon, getURL } from "./utils.js";

const State = { bbox: true };
const pixelRatio = devicePixelRatio;
const ctx = createContext({ pixelRatio });
const renderEngine = createRenderEngine({ ctx, debug: true });
const world = createWorld();

// Entities
const helperEntity = createEntity({
  transform: components.transform({ scale: [2, 2, 2] }),
  axesHelper: components.axesHelper(),
  gridHelper: components.gridHelper(),
});
world.add(helperEntity);
const gridTenEntity = createEntity({
  transform: components.transform({ scale: [2, 2, 2] }),
  gridHelper: components.gridHelper({ size: 10 }),
});
world.add(gridTenEntity);

const W = window.innerWidth * devicePixelRatio;
const H = window.innerHeight * devicePixelRatio;
const splitRatio = 0.66;
const aspect = ctx.gl.drawingBufferWidth / ctx.gl.drawingBufferHeight;

const cameraEntity = createEntity({
  transform: components.transform({ position: [2, 2, 2] }),
  camera: components.camera({
    fov: Math.PI / 3,
    aspect,
    near: 0.1,
    far: 100,
    viewport: [0, 0, Math.floor(splitRatio * W), H],
  }),
  orbiter: components.orbiter({ element: ctx.gl.canvas, maxDistance: 1 }),
  cameraHelper: components.cameraHelper({ color: [0, 1, 0, 1] }),
});
world.add(cameraEntity);

const perspectiveCameraEntity = createEntity({
  transform: components.transform({
    position: [0, 5, 0],
    rotation: quat.fromEuler(quat.create(), [-Math.PI / 2, 0, 0]),
  }),
  camera: components.camera({
    fov: Math.PI / 6,
    aspect,
    near: 1,
    far: 12,
    viewport: [splitRatio * W, 0.5 * H, (1 - splitRatio) * W, 0.5 * H],
  }),
  // orbiter: components.orbiter(),
  cameraHelper: components.cameraHelper({ color: [0, 1, 0, 1] }),
});
world.add(perspectiveCameraEntity);

const orthographicCameraEntity = createEntity({
  transform: components.transform({
    position: [0, 2, 3],
    rotation: quat.fromEuler(quat.create(), [-Math.PI / 5, 0, 0]),
  }),
  camera: components.camera({
    projection: "orthographic",
    aspect,
    near: 0.1,
    far: 10,
    zoom: 3,
    viewport: [splitRatio * W, 0, (1 - splitRatio) * W, 0.5 * H],
  }),
  cameraHelper: components.cameraHelper({ color: [0, 0, 1, 1] }),
});
world.add(orthographicCameraEntity);

const floorEntity = createEntity({
  transform: components.transform(),
  geometry: components.geometry(cube({ sx: 2, sy: 0.05, sz: 2 })),
  material: components.material({
    receiveShadows: true,
    castShadows: false,
  }),
  vertexHelper: components.vertexHelper({ size: 0.1 }),
  boundingBoxHelper: components.boundingBoxHelper(),
});
world.add(floorEntity);

// Static mesh
const dragonEntity = createEntity({
  transform: components.transform({
    position: [-0.5, 0.25, -0.5],
    scale: new Array(3).fill(0.5),
  }),
  geometry: components.geometry(dragon),
  material: components.material({
    baseColor: [0.5, 1, 0.7, 1],
    roughness: 0.27,
    metallic: 0.0,
    castShadows: true,
    receiveShadows: true,
  }),
  vertexHelper: components.vertexHelper({ size: 0.01 }),
  boundingBoxHelper: components.boundingBoxHelper(),
});
world.add(dragonEntity);

// Instanced mesh
const gridSize = 3;
let grid = [];
for (let i = 0; i < gridSize; i++) {
  for (let j = 0; j < gridSize; j++) {
    for (let k = 0; k < gridSize; k++) {
      grid.push([
        i / (gridSize - 1) - 0.5,
        j / (gridSize - 1) - 0.5,
        k / (gridSize - 1) - 0.5,
      ]);
    }
  }
}

function aabbFromInstances(geom, offsets) {
  const bounds = aabb.fromPoints(aabb.create(), offsets);
  const geomBounds = aabb.fromPoints(aabb.create(), geom.positions);
  vec3.add(bounds[0], geomBounds[0]);
  vec3.add(bounds[1], geomBounds[1]);
  return bounds;
}

const cubeGeometry = cube({ sx: 1 / gridSize });
const instancedEntity = createEntity({
  transform: components.transform({
    position: [0.5, 0.2, -0.5],
    scale: new Array(3).fill(0.25),
  }),
  geometry: components.geometry({
    positions: cubeGeometry.positions,
    normals: cubeGeometry.normals,
    uvs: cubeGeometry.uvs,
    cells: cubeGeometry.cells,
    offsets: grid,
    instances: grid.length,
    bounds: aabbFromInstances(cubeGeometry, grid),
  }),
  material: components.material({
    baseColor: [0.5, 1, 0.7, 1],
    castShadows: true,
    receiveShadows: true,
  }),
  vertexHelper: components.vertexHelper({ size: 0.1 }),
  boundingBoxHelper: components.boundingBoxHelper(),
});
world.add(instancedEntity);

// Animated skinned mesh
const glTFOptions = {
  ctx,
  includeCameras: false,
  dracoOptions: { transcoderPath: getURL("assets/decoders/draco/") },
  basisOptions: { transcoderPath: getURL("assets/decoders/basis/") },
};
const [cesiumManScene] = await loaders.gltf(
  getURL("assets/models/CesiumMan/CesiumMan.glb"),
  glTFOptions,
);
cesiumManScene.entities[0].transform.position = [0.5, 0, 0.5];
cesiumManScene.entities[0].transform.scale = new Array(3).fill(0.5);
cesiumManScene.entities.forEach((entity) => {
  if (entity.geometry) {
    entity.boundingBoxHelper = components.boundingBoxHelper();
  }
});
world.entities.push(...cesiumManScene.entities);

const [droneScene] = await loaders.gltf(
  getURL("assets/models/buster-drone/buster-drone-etc1s-draco.glb"),
  glTFOptions,
);
droneScene.entities[0].transform.position = [-0.5, 0.25, 0.5];
droneScene.entities[0].transform.scale = new Array(3).fill(0.0025);
droneScene.entities.forEach((entity) => {
  if (entity.geometry) {
    entity.boundingBoxHelper = components.boundingBoxHelper();
  }
});
world.entities.push(...droneScene.entities);

const skyEntity = createEntity({
  transform: components.transform(),
  skybox: components.skybox({
    sunPosition: [1, 1, 1],
    backgroundBlur: false,
  }),
  reflectionProbe: components.reflectionProbe(),
});
world.add(skyEntity);

const directionalLightEntity = createEntity({
  transform: components.transform({
    position: [2, 2, 0],
    rotation: quat.fromDirection(quat.create(), [0, -1, 0]),
  }),
  directionalLight: components.directionalLight({
    color: [1, 1, 0, 1],
    intensity: 2,
  }),
  lightHelper: components.lightHelper(),
});
world.add(directionalLightEntity);

// GUI
const gui = createGUI(ctx);
gui.addColumn("Camera");
gui.addHeader("Perspective");
gui.addParam("fov", perspectiveCameraEntity.camera, "fov", {
  min: 0,
  max: (120 / 180) * Math.PI,
});
gui.addParam("Near", perspectiveCameraEntity.camera, "near", {
  min: 0,
  max: 5,
});
gui.addParam("Far", perspectiveCameraEntity.camera, "far", { min: 5, max: 50 });

gui.addHeader("Orthographic");
gui.addParam("Near", orthographicCameraEntity.camera, "near", {
  min: 0,
  max: 5,
});
gui.addParam("Far", orthographicCameraEntity.camera, "far", {
  min: 5,
  max: 20,
});
gui.addParam("Zoom", orthographicCameraEntity.camera, "zoom", {
  min: 1,
  max: 5,
});
gui.addColumn("Light");
gui.addParam(
  "Intensity",
  directionalLightEntity.directionalLight,
  "intensity",
  {
    min: 0,
    max: 20,
  },
);
gui.addColumn("Geometry");
gui.addParam("Bounding box", State, "bbox", {}, () => {
  world.entities.forEach((entity) => {
    if (entity.geometry) {
      if (State.bbox) {
        entity.boundingBoxHelper ||= components.boundingBoxHelper();
      } else {
        delete entity.boundingBoxHelper;
      }
    }
  });
});

ctx.frame(() => {
  renderEngine.update(world.entities);
  renderEngine.render(
    world.entities,
    world.entities.filter((entity) => entity.camera),
  );

  gui.draw();

  window.dispatchEvent(new CustomEvent("pex-screenshot"));
});
