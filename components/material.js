// let MaterialID = 0;

/**
 * Material component
 * @param {import("../types.js").MaterialComponentOptions | import("../types.js").LineMaterialComponentOptions} [options]
 * @returns {object}
 * @alias module:components.material
 */
export default (options) =>
  options?.type === "line" //TODO: MARCIN: Can we just have regular if () {} else {} for readability
    ? {
        baseColor: [1, 1, 1, 1],
        castShadows: false,
        lineWidth: 1,
        lineResolution: 6,
        perspectiveScaling: true,
        ...options,
      }
    : {
        // id: `Material_${MaterialID++}`,
        type: undefined,
        alphaTest: undefined, //0..1
        baseColor: [1, 1, 1, 1],
        emissiveColor: undefined,
        metallic: 1,
        roughness: 1,
        ior: 1.5, // ior = (1 + 0.4 * reflectance) / (1 - 0.4 * reflectance);
        // specular: 1,
        // specularTexture,
        // specularColor: [1, 1, 1],
        // specularColorTexture,
        depthTest: true,
        depthWrite: true,
        // depthFunc: ctx.DepthFunc.Less,
        blend: false,
        blendSrcRGBFactor: undefined,
        blendSrcAlphaFactor: undefined,
        blendDstRGBFactor: undefined,
        blendDstAlphaFactor: undefined,
        castShadows: false,
        receiveShadows: false,
        // unlit: true,
        // emissiveIntensity: 1,
        // baseColorTexture,
        // emissiveColorTexture,
        // normalTexture,
        normalTextureScale: 1, //TODO: MARCIN: why we have default for this while not for e.g. emissiveIntensity?
        // roughnessTexture,
        // metallicTexture,
        // metallicRoughnessTexture,
        // occlusionTexture,
        // clearCoat,
        // clearCoatRoughness,
        // clearCoatTexture,
        // clearCoatRoughnessTexture,
        // clearCoatNormalTexture,
        // clearCoatNormalTextureScale,
        // sheenColor,
        // sheenColorTexture,
        // sheenRoughness,
        // transmission,
        // transmissionTexture,
        // thickness,
        // thicknessTexture,
        // attenuationDistance,
        // attenuationColor,
        // dispersion,
        // alphaTexture,
        // pointSize: 1,
        ...options,
      };
