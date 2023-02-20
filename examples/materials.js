import {
  renderEngine as createRenderEngine,
  world as createWorld,
  entity as createEntity,
  components,
} from "../index.js";

import createContext from "pex-context";
import createGUI from "pex-gui";
import { vec3, quat, mat2x3, mat3, vec2 } from "pex-math";
import * as io from "pex-io";
import { sphere } from "primitive-geometry";
import gridCells from "grid-cells";
import parseHdr from "parse-hdr";
import { getTexture, getURL } from "./utils.js";

const pixelRatio = devicePixelRatio;
const ctx = createContext({ pixelRatio });

const world = (window.world = createWorld());
const renderEngine = createRenderEngine({ ctx });
world.addSystem(renderEngine);

const gui = createGUI(ctx);
gui.addFPSMeeter().setPosition(10, 40);
gui.addStats();

const W = ctx.gl.drawingBufferWidth;
const H = ctx.gl.drawingBufferHeight;
const nW = 5;
const nH = 2;
let debugOnce = false;

// Materials
const transform23 = mat2x3.create();
mat2x3.scale(transform23, [1.5, 1.5]);
const transform = mat3.fromMat2x3(mat3.create(), transform23);
const materials = [
  {
    header: gui.addHeader("Default"),
  },
  {
    header: gui.addHeader("Unlit"),
    unlit: true,
    baseColor: [1, 0, 0, 0.5],
  },
  {
    header: gui.addHeader("Unlit Base Color Map"),
    unlit: true,
    baseColor: [1, 1, 1, 0.5],
    baseColorMap: getURL(
      `assets/materials/plastic-green.material/plastic-green_basecolor.png`
    ),
  },
  {
    header: gui.addHeader("Base Color"),
    roughness: 0.5,
    metallic: 0,
    baseColor: [0.1, 0.5, 0.8, 1.0],
  },
  {
    header: gui.addHeader("Transparent"),
    roughness: 0.5,
    metallic: 0,
    baseColor: [1, 1, 1, 0.5],
    blend: true,
    depthWrite: false,
    blendSrcRGBFactor: ctx.BlendFactor.SrcAlpha,
    blendSrcAlphaFactor: ctx.BlendFactor.One,
    blendDstRGBFactor: ctx.BlendFactor.OneMinusSrcAlpha,
    blendDstAlphaFactor: ctx.BlendFactor.One,
  },
  // Base color map
  {
    header: gui.addHeader("Base Color Map"),
    baseColor: [1.0, 1.0, 1.0, 1.0],
    metallic: 0,
    roughness: 1,
    baseColorMap: getURL(`assets/textures/uv-wide/uv-wide.png`),
    baseColorMapTransform: transform,
  },
  // Roughness map
  {
    header: gui.addHeader("Roughness Map"),
    baseColor: [1.0, 1.0, 0.9, 1.0],
    metallic: 1,
    roughness: 1,
    roughnessMap: getURL(`assets/textures/roughness-test/roughness-test.png`),
  },
  // Basic PBR maps
  {
    header: gui.addHeader("Basic PBR Maps"),
    baseColorMap: getURL(
      `assets/materials/plastic-red.material/plastic-red_basecolor.png`
    ),
    roughnessMap: getURL(
      `assets/materials/plastic-red.material/plastic-red_roughness.png`
    ),
    metallicMap: getURL(
      `assets/materials/plastic-red.material/plastic-red_metallic.png`
    ),
    normalMap: getURL(
      `assets/materials/plastic-red.material/plastic-red_n.png`
    ),
  },
  // Emissive
  {
    header: gui.addHeader("Emissive Map"),
    baseColor: [1, 1, 1, 1],
    baseColorMap: getURL(
      `assets/materials/plastic-glow.material/plastic-glow_basecolor.png`
    ),
    roughnessMap: getURL(
      `assets/materials/plastic-glow.material/plastic-glow_roughness.png`
    ),
    metallicMap: getURL(
      `assets/materials/plastic-glow.material/plastic-glow_metallic.png`
    ),
    normalMap: getURL(
      `assets/materials/plastic-glow.material/plastic-glow_n.png`
    ),
    emissiveColor: [1, 1, 1, 1],
    emissiveColorMap: getURL(
      `assets/materials/plastic-glow.material/plastic-glow_emissive.png`
    ),
    emissiveIntensity: 4,
  },
  // Alpha map
  {
    header: gui.addHeader("Alpha Map"),
    roughness: 0.5,
    metallic: 0,
    baseColor: [1, 1, 1, 1],
    alphaTest: 0.5,
    cullFace: false,
    baseColorMap: getURL(`assets/textures/alpha-test-mask/alpha-test-mask.png`),
    alphaMap: getURL(`assets/textures/checkerboard/checkerboard.png`),
  },
];

await Promise.allSettled(
  materials.map(async (material) => {
    if (material.baseColorMap) {
      material.baseColorMap = await getTexture(
        ctx,
        material.baseColorMap,
        ctx.Encoding.SRGB
      );
      if (material.baseColorMapTransform) {
        material.baseColorMap = {
          texture: material.baseColorMap,
          texCoordTransformMatrix: material.baseColorMapTransform,
        };
      }
    }

    if (material.roughnessMap) {
      material.roughnessMap = await getTexture(
        ctx,
        material.roughnessMap,
        ctx.Encoding.Linear
      );
    }
    if (material.metallicMap) {
      material.metallicMap = await getTexture(
        ctx,
        material.metallicMap,
        ctx.Encoding.Linear
      );
    }
    if (material.normalMap) {
      material.normalMap = await getTexture(
        ctx,
        material.normalMap,
        ctx.Encoding.Linear
      );
    }
    if (material.alphaMap) {
      material.alphaMap = await getTexture(
        ctx,
        material.alphaMap,
        ctx.Encoding.Linear
      );
    }
    if (material.emissiveColorMap) {
      material.emissiveColorMap = await getTexture(
        ctx,
        material.emissiveColorMap,
        ctx.Encoding.SRGB
      );
    }
    material.castShadows = false;
    material.receiveShadows = false;
  })
);

// Meshes
const geometry = sphere({ nx: 32, ny: 32 });

const mesh = {
  positions: { buffer: ctx.vertexBuffer(geometry.positions) },
  normals: { buffer: ctx.vertexBuffer(geometry.normals) },
  uvs: { buffer: ctx.vertexBuffer(geometry.uvs) },
  cells: { buffer: ctx.indexBuffer(geometry.cells) },
};

const viewportToCanvasPosition = (viewport) => [
  viewport[0] / pixelRatio,
  (H * (1 - viewport[1] / H - viewport[3] / H)) / pixelRatio,
];

const cells = gridCells(W, H, nW, nH, 0).map((cell) => [
  cell[0],
  H - cell[1] - cell[3], // flip upside down as we are using viewport coordinates
  cell[2],
  cell[3],
]);

cells.forEach((cell, cellIndex) => {
  const layer = `cell${cellIndex}`;
  const material = materials[cellIndex];
  if (!material) return;

  const labelPosition = [10, 10];
  vec2.add(labelPosition, viewportToCanvasPosition(cell));
  material.header.setPosition(...labelPosition);

  // const postProcessingCmp = renderer.postProcessing({
  //   fxaa: true,
  // });
  // if (material.emissiveColor) {
  //   postProcessingCmp.set({
  //     bloom: true,
  //     bloomIntensity: 0.5,
  //     bloomThreshold: 3,
  //     bloomRadius: 1.25,
  //   });
  // }

  const cameraEntity = createEntity({
    camera: components.camera({
      fov: Math.PI / 3,
      aspect: W / nW / (H / nH),
      viewport: cell,
    }),
    transform: components.transform({
      position: [0, 0, 2],
    }),
    orbiter: components.orbiter({
      element: ctx.gl.canvas,
    }),
    layer,
  });
  world.add(cameraEntity);

  const materialEntity = createEntity({
    transform: components.transform(),
    geometry: components.geometry(mesh),
    material: components.material(material),
    layer,
  });
  world.add(materialEntity);
});

// Sky
const hdrImg = parseHdr(
  await io.loadArrayBuffer(
    getURL("assets/envmaps/garage/garage.hdr")
    // getURL(`assets/envmaps/Mono_Lake_B/Mono_Lake_B.hdr`)
  )
);
const envMap = ctx.texture2D({
  data: hdrImg.data,
  width: hdrImg.shape[0],
  height: hdrImg.shape[1],
  pixelFormat: ctx.PixelFormat.RGBA32F,
  encoding: ctx.Encoding.Linear,
  flipY: true,
});

const sunEntity = createEntity({
  transform: components.transform({
    position: [-2, 2, 2],
    rotation: quat.fromTo(
      quat.create(),
      [0, 0, 1],
      vec3.normalize([-2, -2, -1])
    ),
  }),
  directionalLight: components.directionalLight({
    color: [1, 1, 1, 2],
    intensity: 1,
  }),
});
world.add(sunEntity);

const skyEntity = createEntity({
  skybox: components.skybox({
    sunPosition: [0, 5, -5],
    envMap,
  }),
  reflectionProbe: components.reflectionProbe(),
});
world.add(skyEntity);

window.addEventListener("keydown", ({ key }) => {
  if (key === "g") gui.enabled = !gui.enabled;
  if (key === "d") debugOnce = true;
});

ctx.frame(() => {
  ctx.debug(debugOnce);
  debugOnce = false;

  renderEngine.update(world.entities);
  renderEngine.render(
    world.entities,
    world.entities.filter((e) => e.camera)
  );

  gui.draw();

  window.dispatchEvent(new CustomEvent("pex-screenshot"));
});
