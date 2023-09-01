import { postProcessing as SHADERS } from "pex-shaders";
import { CUBEMAP_SIDES } from "../../utils.js";

export default (ctx) => ({
  directionalLightShadows: {
    colorMapDesc: {
      name: "directionalLightColorMap",
      width: 2048,
      height: 2048,
      pixelFormat: ctx.PixelFormat.RGBA8,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Linear,
      mag: ctx.Filter.Linear,
    },
    shadowMapDesc: {
      name: "directionalLightShadowMap",
      width: 2048,
      height: 2048,
      pixelFormat: ctx.PixelFormat.DEPTH_COMPONENT24,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Nearest,
      mag: ctx.Filter.Nearest,
    },
    pass: {
      name: "directionalLightShadowMappingPass",
      color: [],
      depth: null,
      clearColor: [0, 0, 0, 1],
      clearDepth: 1,
    },
  },
  spotLightShadows: {
    colorMapDesc: {
      name: "spotLightColorMap",
      width: 2048,
      height: 2048,
      pixelFormat: ctx.PixelFormat.RGBA8,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Linear,
      mag: ctx.Filter.Linear,
    },
    shadowMapDesc: {
      name: "spotLightShadowMap",
      width: 2048,
      height: 2048,
      pixelFormat: ctx.PixelFormat.DEPTH_COMPONENT24,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Nearest,
      mag: ctx.Filter.Nearest,
    },
    pass: {
      name: "spotLightShadowMappingPass",
      color: [],
      depth: null,
      clearColor: [0, 0, 0, 1],
      clearDepth: 1,
    },
  },
  pointLightShadows: {
    shadowCubemapDesc: {
      name: "pointLightShadowCubemap",
      width: 2048,
      height: 2048,
      pixelFormat: ctx.PixelFormat.RGBA8,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Linear,
      mag: ctx.Filter.Linear,
    },
    shadowMapDesc: {
      name: "pointLightShadowMap",
      width: 2048,
      height: 2048,
      pixelFormat: ctx.PixelFormat.DEPTH_COMPONENT24,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Nearest,
      mag: ctx.Filter.Nearest,
    },
    cubemapSides: structuredClone(CUBEMAP_SIDES),
    passes: CUBEMAP_SIDES.map((side, i) => ({
      name: `pointLightShadowMappingSide${i}`,
      color: [
        {
          target: ctx.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        },
      ],
      depth: null,
      clearColor: side.color,
      clearDepth: 1,
    })),
  },
  mainPass: {
    outputTextureDesc: {
      name: "mainPassColorTexture",
      width: 1,
      height: 1,
      pixelFormat: ctx.PixelFormat.RGBA16F,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Linear,
      mag: ctx.Filter.Linear,
    },
    outputDepthTextureDesc: {
      name: "mainPassDepthTexture",
      width: 1,
      height: 1,
      pixelFormat: ctx.PixelFormat.DEPTH_COMPONENT24,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.Nearest,
      mag: ctx.Filter.Nearest,
    },
    pass: {
      color: [],
    },
  },
  grabPass: {
    colorCopyTextureDesc: {
      name: "grabPassColorCopyTexture",
      width: 1,
      height: 1,
      pixelFormat: ctx.PixelFormat.RGBA16F,
      encoding: ctx.Encoding.Linear,
      min: ctx.Filter.LinearMipmapLinear,
      // min: ctx.Filter.Linear,
      mag: ctx.Filter.Linear,
      mipmap: true,
    },
    copyTexturePipelineDesc: {
      vert: SHADERS.postProcessing.vert,
      frag: /* glsl */ `
precision highp float;

uniform vec4 uViewport;
uniform sampler2D uTexture;

varying vec2 vTexCoord0;

void main() {
  gl_FragColor = texture2D(uTexture, vTexCoord0);
  // gl_FragColor.rgb = vec3(
  //   max(
  //     max(gl_FragColor.r, gl_FragColor.g),
  //     gl_FragColor.b)
  // );
}`,
    },
  },
  tonemap: {
    pipelineDesc: {
      vert: /* glsl */ `
          attribute vec2 aPosition;
          void main () {
            gl_Position = vec4(aPosition, 0.0, 1.0);
          }
          `,
      frag: /* glsl */ `
          precision highp float;
          uniform vec4 uViewport;
          uniform sampler2D uTexture;

          vec3 tonemapAces( vec3 x ) {
              float tA = 2.5;
              float tB = 0.03;
              float tC = 2.43;
              float tD = 0.59;
              float tE = 0.14;
              return clamp((x*(tA*x+tB))/(x*(tC*x+tD)+tE),0.0,1.0);
          }

          void main () {
            vec2 vUV = vec2((gl_FragCoord.x - uViewport.x) / uViewport.z, (gl_FragCoord.y - uViewport.y) / uViewport.w);
            gl_FragColor = vec4(vUV, 0.0, 1.0);
            vec4 color = texture2D(uTexture, vUV);
            color.rgb = tonemapAces(color.rgb);
            color.rgb = pow(color.rgb, vec3(1.0 / 2.2)); //to gamma
            gl_FragColor = color;
          }
          `,
    },
    pass: {
      color: [],
      clearColor: [0, 0, 0, 1],
    },
  },
});
