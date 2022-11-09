import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

// Variables
varying vec2 vTexCoord;
uniform float uTextureSize;
uniform sampler2D uOctMapAtlas;
uniform float uOctMapAtlasSize;
uniform int uOctMapAtlasEncoding;
uniform sampler2D uHammersleyPointSetMap;
uniform int uNumSamples;
uniform float uLevel;
uniform float uSourceMipmapLevel;
uniform float uSourceRoughnessLevel;
uniform float uRoughnessLevel;
uniform int uOutputEncoding;

// Includes
${SHADERS.math.PI}
${SHADERS.math.saturate}
${SHADERS.octMap}
${SHADERS.octMapUvToDir}
${SHADERS.rgbm}
${SHADERS.gamma}
${SHADERS.encodeDecode}

//Sampled from a texture generated by code based on
//http://holger.dammertz.org/stuff/notes_HammersleyOnHemisphere.html
vec2 Hammersley(int i, int N) {
  return texture2D(uHammersleyPointSetMap, vec2(0.5, (float(i) + 0.5)/float(N))).rg;
}

//Based on Real Shading in Unreal Engine 4
vec3 ImportanceSampleGGX(vec2 Xi, float Roughness, vec3 N) {
  //this is mapping 2d point to a hemisphere but additionally we add spread by roughness
  float a = Roughness * Roughness;
  // a *= 0.75; // to prevent overblurring as we sample from previous roughness level with smaller number of samples
  float Phi = 2.0 * PI * Xi.x;
  float CosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));
  float SinTheta = sqrt(1.0 - CosTheta * CosTheta);
  vec3 H;
  H.x = SinTheta * cos(Phi);
  H.y = SinTheta * sin(Phi);
  H.z = CosTheta;

  //Tangent space vectors
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, N));
  vec3 bitangent = normalize(cross(N, tangent));

  //Tangent to World Space
  vec3 sampleVec = tangent * H.x + bitangent * H.y + N * H.z;
  return normalize(sampleVec);
}

//TODO: optimize this using sign()
//Source: http://webglinsights.github.io/downloads/WebGL-Insights-Chapter-16.pdf

float rand(vec2 co){
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 textureOctMapLod(sampler2D tex, vec2 uv, float sourceRoughnessLevel, float sourceMipmapLevel) {
  float width = uOctMapAtlasSize;
  float maxLevel = log2(width); // this should come from log of size

  float levelSize = width / pow(2.0, 1.0 + sourceMipmapLevel + sourceRoughnessLevel);
  float roughnessLevelWidth = width / pow(2.0, 1.0 + sourceMipmapLevel);

  float vOffset = (width - pow(2.0, maxLevel - sourceRoughnessLevel));
  float hOffset = 2.0 * roughnessLevelWidth - pow(2.0, log2(2.0 * roughnessLevelWidth) - sourceMipmapLevel);

  // trying to fix oveflow from atlas..
  uv = (uv * levelSize + 0.5) / (levelSize + 1.0);
  uv *= levelSize;
  uv = (uv + vec2(hOffset, vOffset)) / width;
  return texture2D(uOctMapAtlas, uv);
}

vec4 textureOctMapLod(sampler2D tex, vec2 uv) {
  return textureOctMapLod(tex, uv, uSourceRoughnessLevel, uSourceMipmapLevel);
}

vec3 PrefilterEnvMap( float roughness, vec3 R, vec2 uv ) {
  vec3 N = R;
  vec3 V = R;
  vec3 PrefilteredColor = vec3(0.0);
  const int NumSamples = 1024;
  float TotalWeight = 0.0;
  for( int i = 0; i < NumSamples; i++ ) {
    if (i >= uNumSamples) {
      break;
    }
    vec2 Xi = Hammersley( i, uNumSamples );
    //vec3 H = ImportanceSampleGGX( Xi, roughness, normalize(N + 0.02* vec3(rand(uv), rand(uv.yx), rand(uv * 2.0))));
    vec3 H = ImportanceSampleGGX( Xi, roughness, N);
    vec3 L = normalize(2.0 * dot( V, H ) * H - V);
    float NoL = saturate( dot( N, L ) );
    if( NoL > 0.0 ) {
      vec4 color = textureOctMapLod(uOctMapAtlas, envMapOctahedral(L));
      PrefilteredColor += NoL * decode(color, uOctMapAtlasEncoding).rgb;
      TotalWeight += NoL;
    }
  }
  return PrefilteredColor / TotalWeight;
}

void main() {
  vec3 normal = octMapUVToDir(vTexCoord);
  vec3 color = PrefilterEnvMap(uRoughnessLevel / 5.0, normal, vTexCoord);
  gl_FragColor = encode(vec4(color, 1.0), uOutputEncoding);
}
`;