module.exports = /* glsl */`
#if NUM_DIRECTIONAL_LIGHTS > 0

struct DirectionalLight {
  vec3 direction;
  vec4 color;
  mat4 projectionMatrix;
  mat4 viewMatrix;
  bool castShadows;
  float near;
  float far;
  float bias;
  vec2 shadowMapSize;
};

uniform DirectionalLight uDirectionalLights[NUM_DIRECTIONAL_LIGHTS];
uniform sampler2D uDirectionalLightShadowMaps[NUM_DIRECTIONAL_LIGHTS]; //TODO: is it ok to sample depth texture as sampler2D?

void EvaluateDirectionalLight(inout PBRData data, DirectionalLight light, int i) {
  // Shadows
  vec4 lightViewPosition = light.viewMatrix * vec4(vPositionWorld, 1.0);
  float lightDistView = -lightViewPosition.z;
  vec4 lightDeviceCoordsPosition = light.projectionMatrix * lightViewPosition;
  vec2 lightDeviceCoordsPositionNormalized = lightDeviceCoordsPosition.xy / lightDeviceCoordsPosition.w;
  float lightDeviceCoordsZ = lightDeviceCoordsPosition.z / lightDeviceCoordsPosition.w;
  vec2 lightUV = lightDeviceCoordsPositionNormalized.xy * 0.5 + 0.5;

  float illuminated = 0.0;

  if (light.castShadows) {
    for (int i = 0; i < NUM_DIRECTIONAL_LIGHTS; i++) {
      illuminated += bool(light.castShadows) ? getShadow(uDirectionalLightShadowMaps[i], light.shadowMapSize, lightUV, lightDistView - light.bias, light.near, light.far) : 0.0;
    }
  } else {
    illuminated = 1.0;
  }

  if (illuminated > 0.0) {
    data.lightWorld = normalize(-light.direction);
    vec3 N = data.normalWorld;
    vec3 V = data.viewWorld;
    vec3 L = data.lightWorld;
    vec3 H = normalize(V + L);
    float NdotV = max(0.0, dot(N, V));

    data.NdotL = clamp(dot(N, L), 0.001, 1.0);
    data.HdotV = max(0.0, dot(H, V));
    data.NdotH = max(0.0, dot(N, H));
    data.LdotH = max(0.0, dot(L, H));

    vec3 F = SpecularReflection(data);
    float D = MicrofacetDistribution(data);
    float G = GeometricOcclusion(data);

    vec3 nominator = F * G * D;
    float denominator = 4.0 * data.NdotV * data.NdotL + 0.001;
    vec3 specularBrdf = nominator / denominator;

    vec3 lightColor = decode(light.color, 3).rgb;
    lightColor *= light.color.a; // intensity

    // TODO: is irradiance the right name? Three.js is using it
    vec3 irradiance = data.NdotL * lightColor * illuminated;

    // TODO: (1 - F) comes from glTF spec, three.js doesn't have it? Schlick BRDF
    data.directDiffuse += (1.0 - F) * DiffuseLambert(data.diffuseColor) * irradiance;
    data.directSpecular += specularBrdf * irradiance;
    // data.directSpecular = vec3(G);
  }
}
#endif
`
