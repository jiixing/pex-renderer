import { vec3 } from "pex-math";
import { pipeline as SHADERS } from "pex-shaders";
import createGeomBuilder from "geom-builder";

import createBaseSystem from "./base.js";
import { ProgramCache } from "../../utils.js";

// Impacts program caching
// prettier-ignore
const flagDefinitions = [
  [["options", "attachmentsLocations", "color"], "LOCATION_COLOR", { type: "value" }],
  [["options", "attachmentsLocations", "normal"], "LOCATION_NORMAL", { type: "value" }],
  [["options", "attachmentsLocations", "emissive"], "LOCATION_EMISSIVE", { type: "value" }],
];

const pointsToLine = (points) =>
  points.reduce((line, p, i) => {
    line.push(p);
    line.push([...points[(i + 1) % points.length]]);
    return line;
  }, []);

const getBBoxPositionsList = (bbox) => [
  [bbox[0][0], bbox[0][1], bbox[0][2]],
  [bbox[1][0], bbox[0][1], bbox[0][2]],
  [bbox[0][0], bbox[0][1], bbox[0][2]],
  [bbox[0][0], bbox[1][1], bbox[0][2]],
  [bbox[0][0], bbox[0][1], bbox[0][2]],
  [bbox[0][0], bbox[0][1], bbox[1][2]],
  [bbox[1][0], bbox[1][1], bbox[1][2]],
  [bbox[0][0], bbox[1][1], bbox[1][2]],
  [bbox[1][0], bbox[1][1], bbox[1][2]],
  [bbox[1][0], bbox[0][1], bbox[1][2]],
  [bbox[1][0], bbox[1][1], bbox[1][2]],
  [bbox[1][0], bbox[1][1], bbox[0][2]],
  [bbox[1][0], bbox[0][1], bbox[0][2]],
  [bbox[1][0], bbox[0][1], bbox[1][2]],
  [bbox[1][0], bbox[0][1], bbox[0][2]],
  [bbox[1][0], bbox[1][1], bbox[0][2]],
  [bbox[0][0], bbox[1][1], bbox[0][2]],
  [bbox[1][0], bbox[1][1], bbox[0][2]],
  [bbox[0][0], bbox[1][1], bbox[0][2]],
  [bbox[0][0], bbox[1][1], bbox[1][2]],
  [bbox[0][0], bbox[0][1], bbox[1][2]],
  [bbox[0][0], bbox[1][1], bbox[1][2]],
  [bbox[0][0], bbox[0][1], bbox[1][2]],
  [bbox[1][0], bbox[0][1], bbox[1][2]],
];

const getCirclePositions = ({ steps, axis, radius, center }) => {
  const points = [];

  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const x = Math.cos(t);
    const y = Math.sin(t);
    const pos = [0, 0, 0];
    pos[axis ? axis[0] : 0] = x;
    pos[axis ? axis[1] : 1] = y;
    vec3.scale(pos, radius || 1);
    vec3.add(pos, center || [0, 0, 0]);
    points.push(pos);
  }

  return pointsToLine(points);
};

// prettier-ignore
const getPrismPositions = ({ radius }) => ([
  [0, radius, 0], [radius, 0, 0],
  [0, -radius, 0], [radius, 0, 0],

  [0, radius, 0], [-radius, 0, 0],
  [0, -radius, 0], [-radius, 0, 0],

  [0, radius, 0], [0, 0, radius],
  [0, -radius, 0], [0, 0, radius],

  [0, radius, 0], [0, 0, -radius],
  [0, -radius, 0], [0, 0, -radius],

  [-radius, 0, 0], [0, 0, -radius],
  [radius, 0, 0], [0, 0, -radius],
  [radius, 0, 0], [0, 0, radius],
  [-radius, 0, 0], [0, 0, radius]
])

const getQuadPositions = ({
  width = 1,
  height = 1,
  size = 2,
  position = [0, 0, 0],
} = {}) =>
  // prettier-ignore
  [
    [-1, -1, 0], [1, -1, 0],
    [1, -1, 0], [1, 1, 0],
    [1, 1, 0], [-1, 1, 0],
    [-1, 1, 0], [-1, -1, 0],
    [-1, -1, 0], [1, 1, 0],
    [-1, 1, 0], [1, -1, 0],

    [-1, -1, 0], [-1, -1, size],
    [1, -1, 0], [1, -1, size],
    [1, 1, 0], [1, 1, size],
    [-1, 1, 0], [-1, 1, size],
    [0, 0, 0], [0, 0, size]
  ].map((p) =>
    vec3.add([(p[0] * width) / 2, (p[1] * height) / 2, p[2]], position)
  );

const getPyramidEdgePositions = ({ sx, sy = sx, sz = sx }) => [
  [0, 0, 0],
  [-sx, sy, sz],
  [0, 0, 0],
  [sx, sy, sz],
  [0, 0, 0],
  [sx, -sy, sz],
  [0, 0, 0],
  [-sx, -sy, sz],
];

// Lights
const getDirectionalLight = (directionalLight) => {
  const intensity = directionalLight.intensity;
  const prismRadius = intensity * 0.1;

  return getPrismPositions({ radius: prismRadius }).concat(
    // prettier-ignore
    [
      [0, 0, prismRadius], [0, 0, intensity],
      [prismRadius, 0, 0], [prismRadius, 0, intensity],
      [-prismRadius, 0, 0], [-prismRadius, 0, intensity],
      [0, prismRadius, 0], [0, prismRadius, intensity],
      [0, -prismRadius, 0], [0, -prismRadius, intensity]
    ]
  );
};

const getPointLight = (pointLight) => {
  const radius = pointLight.range / 2;
  const prismRadius = radius * 0.1;

  return getPrismPositions({ radius: prismRadius }).concat(
    // prettier-ignore
    [
      [prismRadius, 0, 0], [radius, 0, 0],
      [-prismRadius, 0, 0], [-radius, 0, 0],
      [0, prismRadius, 0], [0, radius, 0],
      [0, -prismRadius, 0], [0, -radius, 0],
      [0, 0, prismRadius], [0, 0, radius],
      [0, 0, -prismRadius], [0, 0, -radius],
    ]
  );
};

const spotLightCircleOptions = { steps: 32, axis: [0, 1] };

const getSpotLight = (spotLight) => {
  const intensity = spotLight.intensity;
  const distance = spotLight.range;
  const radius = distance * Math.tan(spotLight.angle);
  const innerRadius = distance * Math.tan(spotLight.innerAngle);

  return getCirclePositions({
    radius: intensity * 0.1,
    ...spotLightCircleOptions,
  })
    .concat(
      getPyramidEdgePositions({
        sx: radius * Math.sin(Math.PI / 4),
        sz: distance,
      })
    )
    .concat(
      getCirclePositions({
        radius,
        center: [0, 0, distance],
        ...spotLightCircleOptions,
      })
    )
    .concat(
      getCirclePositions({
        radius: innerRadius,
        center: [0, 0, distance],
        ...spotLightCircleOptions,
      })
    );
};

const getAreaLight = (areaLight) =>
  getQuadPositions({ size: areaLight.intensity });

// Cameras
const getPerspectiveCamera = (camera) => {
  const nearHalfHeight = Math.tan(camera.fov / 2) * camera.near;
  const farHalfHeight = Math.tan(camera.fov / 2) * camera.far;
  const nearHalfWidth = nearHalfHeight * camera.aspect;
  const farHalfWidth = farHalfHeight * camera.aspect;

  return [
    ...getPyramidEdgePositions({
      sx: farHalfWidth,
      sy: farHalfHeight,
      sz: -camera.far,
    }),

    ...pointsToLine([
      [-farHalfWidth, farHalfHeight, -camera.far],
      [farHalfWidth, farHalfHeight, -camera.far],
      [farHalfWidth, -farHalfHeight, -camera.far],
      [-farHalfWidth, -farHalfHeight, -camera.far],
    ]),

    ...pointsToLine([
      [-nearHalfWidth, nearHalfHeight, -camera.near],
      [nearHalfWidth, nearHalfHeight, -camera.near],
      [nearHalfWidth, -nearHalfHeight, -camera.near],
      [-nearHalfWidth, -nearHalfHeight, -camera.near],
    ]),
  ];
};

const getOrthographicCamera = (camera) => {
  let left =
    (camera.right + camera.left) / 2 -
    (camera.right - camera.left) / (2 / camera.zoom);
  let right =
    (camera.right + camera.left) / 2 +
    (camera.right - camera.left) / (2 / camera.zoom);
  let top =
    (camera.top + camera.bottom) / 2 +
    (camera.top - camera.bottom) / (2 / camera.zoom);
  let bottom =
    (camera.top + camera.bottom) / 2 -
    (camera.top - camera.bottom) / (2 / camera.zoom);

  if (camera.view) {
    const zoomW =
      1 / camera.zoom / (camera.view.size[0] / camera.view.totalSize[0]);
    const zoomH =
      1 / camera.zoom / (camera.view.size[1] / camera.view.totalSize[1]);
    const scaleW = (camera.right - camera.left) / camera.view.size[0];
    const scaleH = (camera.top - camera.bottom) / camera.view.size[1];

    left += scaleW * (camera.view.offset[0] / zoomW);
    right = left + scaleW * (camera.view.size[0] / zoomW);
    top -= scaleH * (camera.view.offset[1] / zoomH);
    bottom = top - scaleH * (camera.view.size[1] / zoomH);
  }
  return getBBoxPositionsList([
    [left, top, -camera.near],
    [right, bottom, -camera.far],
  ]);
};

// Extras
const AXES_COLORS = [
  [1, 0, 0, 1],
  [1, 0, 0, 1],
  [0, 1, 0, 1],
  [0, 1, 0, 1],
  [0, 0, 1, 1],
  [0, 0, 1, 1],
];
const AXES_POSITIONS = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
  [0, 0, 1],
];
const getGridLines = ({ size = 1, step = 10 } = {}) =>
  Array.from({ length: step + 1 }, (_, k) => {
    const halfSize = size * 0.5;
    const offset = size * (k / step) - halfSize;
    return [
      [-halfSize, 0, offset],
      [halfSize, 0, offset],
    ];
  });
const getGrid = (grid) => [
  ...getGridLines(grid).flat(),
  ...getGridLines(grid)
    .flat()
    .map((p) => p.reverse()),
];

export default ({ ctx }) => {
  const geomBuilder = createGeomBuilder({ positions: 1, colors: 1 });

  const drawHelperLinesCmd = {
    name: "drawHelperLinesCmd",
    attributes: {
      aPosition: ctx.vertexBuffer({ data: [0, 0, 0] }),
      aVertexColor: ctx.vertexBuffer({ data: [0, 0, 0, 0] }),
    },
    count: 1,
  };

  const helperSystem = Object.assign(createBaseSystem({ ctx }), {
    type: "helper-renderer",
    cache: {
      // Cache based on: vertex source (material.vert or default), fragment source (material.frag or default) and list of flags
      programs: new ProgramCache(),
      // Cache based on: program.id
      pipelines: {},
    },
    debug: false,
    flagDefinitions,
    getVertexShader: () => SHADERS.helper.vert,
    getFragmentShader: () => SHADERS.helper.frag,
    getPipelineOptions() {
      return {
        depthTest: true,
        depthWrite: true,
        primitive: ctx.Primitive.Lines,
      };
    },
    render(renderView, entities, options) {
      geomBuilder.reset();

      const addToBuilder = (
        positions,
        color = [0.23, 0.23, 0.23, 1],
        modelMatrix
      ) => {
        for (let i = 0; i < positions.length; i++) {
          const position = positions[i];
          if (modelMatrix) vec3.multMat4(position, modelMatrix);
          geomBuilder.addPosition(position);
          geomBuilder.addColor(Array.isArray(color[0]) ? color[i] : color);
        }
      };

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const modelMatrix = entity._transform?.modelMatrix;
        if (entity.transform?.position && entity.boundingBoxHelper) {
          addToBuilder(
            getBBoxPositionsList(entity.transform.worldBounds),
            entity.boundingBoxHelper?.color || [1, 0, 0, 1]
          );
        }

        // TODO: cache
        if (entity.lightHelper) {
          if (entity.directionalLight) {
            addToBuilder(
              getDirectionalLight(entity.directionalLight),
              entity.directionalLight.color,
              modelMatrix
            );
          }
          if (entity.pointLight) {
            addToBuilder(
              getPointLight(entity.pointLight),
              entity.pointLight.color,
              modelMatrix
            );
          }
          if (entity.spotLight) {
            addToBuilder(
              getSpotLight(entity.spotLight),
              entity.spotLight.color,
              modelMatrix
            );
          }
          if (entity.areaLight) {
            addToBuilder(
              getAreaLight(entity.areaLight),
              entity.areaLight.color,
              modelMatrix
            );
          }
        }
        if (
          entity.cameraHelper &&
          entity.camera &&
          renderView.camera !== entity.camera
        ) {
          addToBuilder(
            entity.camera.projection === "orthographic"
              ? getOrthographicCamera(entity.camera)
              : getPerspectiveCamera(entity.camera),
            entity.cameraHelper.color,
            modelMatrix
          );
        }
        if (entity.axesHelper) {
          addToBuilder(
            AXES_POSITIONS.map((p) => [...p]),
            AXES_COLORS.map((p) => [...p]),
            modelMatrix
          );
        }
        if (entity.gridHelper) {
          addToBuilder(
            getGrid(entity.gridHelper),
            entity.gridHelper.color,
            modelMatrix
          );
        }
      }
      if (!geomBuilder.count) return;

      const geometry = geomBuilder;

      const pipeline = this.getPipeline(ctx, { geometry }, options);

      const cmd = drawHelperLinesCmd;
      ctx.update(cmd.attributes.aPosition, { data: geometry.positions });
      ctx.update(cmd.attributes.aVertexColor, { data: geometry.colors });

      cmd.pipeline = pipeline;
      cmd.count = geometry.count;
      cmd.uniforms = {
        uExposure: renderView.exposure,
        uOutputEncoding: renderView.outputEncoding,

        uProjectionMatrix: renderView.camera.projectionMatrix,
        uViewMatrix: renderView.camera.viewMatrix,
      };

      ctx.submit(cmd);
    },
    renderStages: {
      opaque: (renderView, entities, options) => {
        helperSystem.render(renderView, entities, options);
      },
    },
  });

  return helperSystem;
};
