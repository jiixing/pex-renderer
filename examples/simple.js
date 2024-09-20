import {
    world as createWorld,
    entity as createEntity,
    renderGraph as createRenderGraph,
    resourceCache as createResourceCache,
    systems,
    components,
} from "../index.js";
import createContext from "pex-context";
import {quat} from "pex-math";
import {cube} from "primitive-geometry";

const OPTIONS = {
    ANIMATE: true,//false,
    AMBIENT: true
}


const ctx = createContext();
const world = createWorld();
const renderGraph = createRenderGraph(ctx);
const resourceCache = createResourceCache(ctx);

const cameraEntity = createEntity({
    transform: components.transform({position: [0, 2, 13]}),
    camera: components.camera({
        aspect: ctx.gl.drawingBufferWidth / ctx.gl.drawingBufferHeight,
    }),
    orbiter: components.orbiter({element: ctx.gl.canvas}),
});
world.add(cameraEntity);

const cubeEntity = createEntity({
    transform: components.transform({position: [0, -1, 0]}),
    geometry: components.geometry(cube({sx: 2, sy: 2, sz: 3})),
    material: components.material({
        baseColor: [0.7, 0.7, 0, 1],
        metallic: 0,
        roughness: 0.2,
        castShadows: true,
        receiveShadows: true,
    }),
});
world.add(cubeEntity);


const directionalLightEntity = createEntity({
    transform: components.transform({
        position: [-3, 2, 0],
        rotation: quat.fromDirection(quat.create(), [3, -1, 0]),
    }),
    directionalLight: components.directionalLight({
        color: [1, 0, 0, 1],
        intensity: 3,
    }),
});
world.add(directionalLightEntity);

const ambientLightEntity = createEntity({
    ambientLight: components.ambientLight({
        intensity: 0.2,
        color:[0.3,0.3,0.8,1]
    }),
});
world.add(ambientLightEntity);

// Systems
const geometrySystem = systems.geometry({ctx});
const transformSystem = systems.transform();
const cameraSystem = systems.camera();
const lightSystem = systems.light();
const renderPipelineSystem = systems.renderPipeline({
    ctx,
    resourceCache,
    renderGraph,
    outputEncoding: ctx.Encoding.Linear,
});
const standardRendererSystem = systems.renderer.standard({
    ctx,
    resourceCache,
    renderGraph,
});

window.addEventListener("resize", () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.set({ width, height});
    cameraEntity.camera.aspect = width / height;
    cameraEntity.camera.dirty = true;
});
const renderView = {
    camera: cameraEntity.camera,
    cameraEntity: cameraEntity,
    viewport: [0, 0, ctx.gl.drawingBufferWidth, ctx.gl.drawingBufferHeight],
};
ctx.frame(() => {
    const now = performance.now() * 0.001;
    if (OPTIONS.ANIMATE){
        quat.fromAxisAngle(cubeEntity.transform.rotation, [1, 0, 0], now);
        cubeEntity.transform.dirty = true;
    }
    resourceCache.beginFrame();
    renderGraph.beginFrame();

    // update to handle when window is resized
    renderView.viewport[2] = ctx.gl.drawingBufferWidth
    renderView.viewport[3] = ctx.gl.drawingBufferHeight


    geometrySystem.update(world.entities);
    transformSystem.update(world.entities);
    cameraSystem.update(world.entities);
    lightSystem.update(world.entities);
    renderPipelineSystem.update(world.entities, {
        renderers: [standardRendererSystem],
        renderView,
    });

    renderGraph.endFrame();
    resourceCache.endFrame();
})
;
