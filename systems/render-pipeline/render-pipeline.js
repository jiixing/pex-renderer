import { vec3, avec4, utils } from "pex-math";
import { parser as ShaderParser } from "pex-shaders";

import addDescriptors from "./descriptors.js";
import addShadowMapping from "./shadow-mapping.js";
import { getPostProcessingPasses } from "./post-processing-passes.js";

import { NAMESPACE, TEMP_VEC3, TEMP_VEC4 } from "../../utils.js";

function isEntityInFrustum(entity, frustum) {
  if (entity.geometry.culled !== false) {
    const worldBounds = entity.transform.worldBounds;
    for (let i = 0; i < 6; i++) {
      avec4.set(TEMP_VEC4, 0, frustum, i);
      TEMP_VEC3[0] = TEMP_VEC4[0] >= 0 ? worldBounds[1][0] : worldBounds[0][0];
      TEMP_VEC3[1] = TEMP_VEC4[1] >= 0 ? worldBounds[1][1] : worldBounds[0][1];
      TEMP_VEC3[2] = TEMP_VEC4[2] >= 0 ? worldBounds[1][2] : worldBounds[0][2];

      // Distance from plane to point
      if (vec3.dot(TEMP_VEC4, TEMP_VEC3) + TEMP_VEC4[3] < 0) return false;
    }
  }

  return true;
}

const cullEntities = (entities, camera) =>
  camera.culling
    ? entities.filter(
        (entity) =>
          !entity.geometry ||
          (entity.transform && isEntityInFrustum(entity, camera.frustum)),
      )
    : entities;

/**
 * Render pipeline system
 *
 * Adds:
 * - "_near", "_far", "_radiusUV" and "_sceneBboxInLightSpace" to light components that cast shadows
 * - "_shadowCubemap" to pointLight components and "_shadowMap" to other light components
 * - "_targets" to postProcessing components
 * @param {import("../../types.js").SystemOptions} options
 * @returns {import("../../types.js").System}
 * @alias module:systems.renderPipeline
 */
export default ({ ctx, resourceCache, renderGraph }) => ({
  type: "render-pipeline-system",
  cache: {},
  debug: false,
  renderers: [],

  descriptors: addDescriptors(ctx),
  postProcessingPasses: null,
  shadowMapping: null,

  outputs: new Set(["color", "depth"]), // "normal", "emissive"

  checkLight(light, lightEntity) {
    if (!lightEntity._transform) {
      console.warn(
        NAMESPACE,
        `"${this.type}" light entity missing transform. Add a transformSystem.update(entities).`,
      );
    } else if (!light._projectionMatrix) {
      console.warn(
        NAMESPACE,
        `"${this.type}" light component missing matrices. Add a lightSystem.update(entities).`,
      );
    } else {
      return true;
    }
  },

  cullEntities,

  getAttachmentsLocations(colorAttachments) {
    return Object.fromEntries(
      Object.keys(colorAttachments).map((key, index) => [key, index]),
    );
  },

  drawMeshes({
    renderers,
    renderView,
    colorAttachments,
    entitiesInView,
    shadowMappingLight,
    transparent,
    backgroundColorTexture,
  }) {
    renderView.exposure ||= 1;
    renderView.toneMap ||= null;
    renderView.outputEncoding ||= ctx.Encoding.Linear;

    const options = {
      attachmentsLocations: this.getAttachmentsLocations(colorAttachments),
    };

    if (shadowMappingLight) {
      for (let i = 0; i < renderers.length; i++) {
        renderers[i].renderShadow?.(renderView, entitiesInView, {
          ...options,
          shadowMappingLight,
        });
      }
    } else {
      if (!transparent) {
        for (let i = 0; i < renderers.length; i++) {
          renderers[i].renderOpaque?.(
            renderView,
            this.cullEntities(entitiesInView, renderView.camera),
            options,
          );
        }
        for (let i = 0; i < renderers.length; i++) {
          renderers[i].renderBackground?.(renderView, entitiesInView, options);
        }
      } else {
        //TODO: capture color buffer and blur it for transmission/refraction
        for (let i = 0; i < renderers.length; i++) {
          renderers[i].renderTransparent?.(
            renderView,
            this.cullEntities(entitiesInView, renderView.camera),
            {
              ...options,
              backgroundColorTexture,
            },
          );
        }
      }
    }
  },

  update(entities, options = {}) {
    let { renderView, renderers, drawToScreen = true } = options;

    const shadowCastingEntities = entities.filter(
      (entity) => entity.geometry && entity.material?.castShadows,
    );
    const cameraEntities = entities.filter((entity) => entity.camera);

    renderView ||= {
      camera: cameraEntities[0].camera,
      viewport: [0, 0, ctx.gl.drawingBufferWidth, ctx.gl.drawingBufferHeight],
    };

    const postProcessing = renderView.cameraEntity.postProcessing;

    // Set the render pipeline encoding and tone mapping settings before blit
    // Output will depend on camera settings
    if (drawToScreen) {
      // Render pipeline is linear.
      // Output is tone mapped in "BlitPass" or in post-processing "final"
      renderView.outputEncoding ||= ctx.Encoding.Linear;
      renderView.exposure ||= 1;
      renderView.toneMap ||= null;
    } else {
      // Output depends on camera settings
      // Render pipeline is gamma so we assume tone map should be applied
      // but only if no post-processing "final"
      if (
        renderView.camera.outputEncoding === ctx.Encoding.Gamma &&
        !postProcessing
      ) {
        renderView.outputEncoding ||= renderView.camera.outputEncoding;
        renderView.exposure ||= renderView.camera.exposure;
        renderView.toneMap ||= renderView.camera.toneMap;
      } else {
        // Render pipeline is linear.
        // Tone mapping needs to happen manually on the returned color attachment
        renderView.outputEncoding ||= ctx.Encoding.Linear;
        renderView.exposure ||= 1;
        renderView.toneMap ||= null;
      }
    }

    // Setup attachments. Can be overwritten by PostProcessingPass
    const outputs = new Set(this.outputs);

    if (postProcessing?.ssao) outputs.add("normal");
    if (postProcessing?.bloom) outputs.add("emissive");

    const colorAttachments = {};
    let depthAttachment;

    // TODO: this should be done on the fly by render graph
    this.descriptors.mainPass.outputTextureDesc.width = renderView.viewport[2];
    this.descriptors.mainPass.outputTextureDesc.height = renderView.viewport[3];

    colorAttachments.color = resourceCache.texture2D(
      this.descriptors.mainPass.outputTextureDesc,
    );

    if (outputs.has("depth")) {
      this.descriptors.mainPass.outputDepthTextureDesc.width =
        renderView.viewport[2];
      this.descriptors.mainPass.outputDepthTextureDesc.height =
        renderView.viewport[3];
      depthAttachment = resourceCache.texture2D(
        this.descriptors.mainPass.outputDepthTextureDesc,
      );
      depthAttachment.name = `mainPassDepth (id: ${depthAttachment.id})`;
    }

    if (outputs.has("normal")) {
      colorAttachments.normal = resourceCache.texture2D(
        this.descriptors.mainPass.outputTextureDesc,
      );
    }

    if (outputs.has("emissive")) {
      colorAttachments.emissive = resourceCache.texture2D(
        this.descriptors.mainPass.outputTextureDesc,
      );
    }

    if (outputs.has("velocity")) {
      this.descriptors.mainPass.velocityTextureDesc.width =
        renderView.viewport[2];
      this.descriptors.mainPass.velocityTextureDesc.height =
        renderView.viewport[3];
      colorAttachments.velocity = resourceCache.texture2D(
        this.descriptors.mainPass.velocityTextureDesc,
      );
    }

    for (let name of Object.keys(colorAttachments)) {
      const texture = colorAttachments[name];
      texture.name = `mainPass${name} (id: ${texture.id})`;
    }

    // Update shadow maps
    if (shadowCastingEntities.length) {
      // Compose shadow mapping
      if (!this.directionalLight) {
        Object.assign(this, addShadowMapping({ renderGraph, resourceCache }));
      }

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];

        if (
          entity.directionalLight?.castShadows &&
          this.checkLight(entity.directionalLight, entity)
        ) {
          this.renderDirectionalLightShadowMap(
            entity,
            entities,
            renderers,
            colorAttachments,
            shadowCastingEntities,
          );
        }
        if (
          entity.pointLight?.castShadows &&
          this.checkLight(entity.pointLight, entity)
        ) {
          this.renderPointLightShadowMap(
            entity,
            entities,
            renderers,
            colorAttachments,
          );
        }
        if (
          entity.spotLight?.castShadows &&
          this.checkLight(entity.spotLight, entity)
        ) {
          this.renderSpotLightShadowMap(
            entity,
            entities,
            renderers,
            colorAttachments,
            shadowCastingEntities,
          );
        }
        if (
          entity.areaLight?.castShadows &&
          this.checkLight(entity.areaLight, entity)
        ) {
          this.renderSpotLightShadowMap(
            entity,
            entities,
            renderers,
            colorAttachments,
            shadowCastingEntities,
          );
        }
      }
    }

    // TODO: this also get entities with shadowmap regardless of castShadows changes
    const shadowMaps = entities
      .map(
        (entity) =>
          entity.directionalLight?._shadowMap ||
          entity.spotLight?._shadowMap ||
          entity.areaLight?._shadowMap ||
          entity.pointLight?._shadowCubemap,
      )
      .filter(Boolean);

    // Filter entities by layer
    const layer = renderView.cameraEntity.layer;
    const entitiesInView = layer
      ? entities.filter((entity) => !entity.layer || entity.layer === layer)
      : entities.filter((entity) => !entity.layer);

    const renderPassView = {
      ...renderView,
      viewport: [0, 0, renderView.viewport[2], renderView.viewport[3]],
    };

    // Main pass
    renderGraph.renderPass({
      name: `MainPass [${renderView.viewport}]`,
      uses: [...shadowMaps],
      renderView: renderPassView,
      pass: resourceCache.pass({
        name: "mainPass",
        color: Object.values(colorAttachments),
        depth: depthAttachment,
        clearColor: renderView.camera.clearColor,
        clearDepth: 1,
      }),
      render: () => {
        this.drawMeshes({
          renderers,
          renderView,
          colorAttachments,
          entitiesInView,
          shadowMappingLight: false,
          transparent: false,
        });
      },
    });

    // Grab pass
    let grabPassColorCopyTexture;
    if (entitiesInView.some((entity) => entity.material?.transmission)) {
      const viewport = [
        0,
        0,
        utils.prevPowerOfTwo(renderView.viewport[2]),
        utils.prevPowerOfTwo(renderView.viewport[3]),
      ];
      // const viewport = [0, 0, renderView.viewport[2], renderView.viewport[3]];
      this.descriptors.grabPass.colorCopyTextureDesc.width = viewport[2];
      this.descriptors.grabPass.colorCopyTextureDesc.height = viewport[3];
      grabPassColorCopyTexture = resourceCache.texture2D(
        this.descriptors.grabPass.colorCopyTextureDesc,
      );
      grabPassColorCopyTexture.name = `grabPassOutput (id: ${grabPassColorCopyTexture.id})`;

      const fullscreenTriangle = resourceCache.fullscreenTriangle();

      const copyTextureCmd = {
        name: "grabPassCopyTextureCmd",
        attributes: fullscreenTriangle.attributes,
        count: fullscreenTriangle.count,
        pipeline: resourceCache.pipeline(
          this.descriptors.grabPass.copyTexturePipelineDesc,
        ),
        uniforms: {
          uViewport: viewport,
          uTexture: colorAttachments.color,
        },
      };

      renderGraph.renderPass({
        name: `GrabPass [${viewport}]`,
        uses: [colorAttachments.color],
        renderView: { ...renderView, viewport },
        pass: resourceCache.pass({
          name: "grabPass",
          color: [grabPassColorCopyTexture],
        }),
        render: () => {
          ctx.submit(copyTextureCmd);
        },
      });
    }

    // Transparent pass
    renderGraph.renderPass({
      name: `TransparentPass [${renderView.viewport}]`,
      uses: [...shadowMaps, grabPassColorCopyTexture].filter(Boolean),
      renderView: renderPassView,
      pass: resourceCache.pass({
        name: "transparentPass",
        color: [colorAttachments.color],
        depth: depthAttachment,
      }),
      render: () => {
        this.drawMeshes({
          renderers,
          renderView,
          colorAttachments: { color: colorAttachments.color },
          entitiesInView,
          shadowMappingLight: false,
          transparent: true,
          backgroundColorTexture: grabPassColorCopyTexture,
        });
      },
    });

    // Post-processing pass
    if (postProcessing) {
      this.postProcessingPasses ||= getPostProcessingPasses({
        ctx,
        resourceCache,
        descriptors: this.descriptors,
      });
      renderGraph.renderPass({
        name: `PostProcessingPass [${renderView.viewport}]`,
        uses: Object.values(colorAttachments).filter(Boolean),
        renderView: renderPassView,
        render: () => {
          for (let i = 0; i < renderers.length; i++) {
            const renderer = renderers[i];
            renderer.renderPost?.(renderView, entitiesInView, {
              colorAttachments,
              depthAttachment,
              descriptors: this.descriptors,
              passes: this.postProcessingPasses,
            });
          }
        },
      });
    }

    if (drawToScreen !== false) {
      const fullscreenTriangle = resourceCache.fullscreenTriangle();

      let exposure = renderView.camera.exposure;
      let toneMap = renderView.camera.toneMap;
      let outputEncoding = renderView.camera.outputEncoding;

      // Post Processing already uses renderView.camera settings
      if (postProcessing) {
        exposure = 1;
        toneMap = null;
        outputEncoding = ctx.Encoding.Linear;
      }

      // TODO: cache
      const pipelineDesc = { ...this.descriptors.blit.pipelineDesc };
      pipelineDesc.vert = ShaderParser.build(ctx, pipelineDesc.vert);
      pipelineDesc.frag = ShaderParser.build(
        ctx,
        pipelineDesc.frag,
        [toneMap && `TONE_MAP ${toneMap}`].filter(Boolean),
      );

      const blitCmd = {
        name: "drawBlitFullScreenTriangleCmd",
        attributes: fullscreenTriangle.attributes,
        count: fullscreenTriangle.count,
        pipeline: resourceCache.pipeline(pipelineDesc),
      };

      renderGraph.renderPass({
        name: `BlitPass [${renderView.viewport}]`,
        uses: [colorAttachments.color],
        renderView,
        render: () => {
          ctx.submit(blitCmd, {
            uniforms: {
              uExposure: exposure,
              uOutputEncoding: outputEncoding,
              uTexture: colorAttachments.color,
            },
          });
        },
      });
    }

    // Return the original object: the color attachment value can be modified
    // after post processing renderGraph.renderPass so values are final after
    // renderGraph.endFrame()
    return Object.assign(colorAttachments, { depth: depthAttachment });
  },

  dispose(entities) {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.material) {
        for (let property of Object.values(entity.material)) {
          if (
            property?.class === "texture" &&
            ctx.resources.indexOf(property) !== -1
          ) {
            ctx.dispose(property);
          }
        }
      }
    }
  },
});
