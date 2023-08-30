import { mat4, vec3, vec4 } from "pex-math";
import { Y_UP, TEMP_VEC4 } from "../utils.js";

const Z_UP_4 = Object.freeze([0, 0, 1, 0]);

export default () => ({
  type: "light-system",
  updateLight(light, transform) {
    light._projectionMatrix ??= mat4.create();
    light._viewMatrix ??= mat4.create();

    if (transform) {
      light._viewMatrix ??= mat4.create();
      light._direction ??= vec3.create();

      vec4.set(TEMP_VEC4, Z_UP_4);

      // Compute direction
      vec4.multMat4(TEMP_VEC4, transform.modelMatrix);
      vec3.set(light._direction, TEMP_VEC4);
      vec3.normalize(light._direction); // TODO: is it needed?

      // Set as target
      vec3.add(TEMP_VEC4, transform.worldPosition);
      // vec4.multMat4(up, lightEntity._transform.modelMatrix);
      mat4.lookAt(light._viewMatrix, transform.worldPosition, TEMP_VEC4, Y_UP);
    }
  },
  update(entities) {
    for (let i = 0; i < entities.length; i++) {
      const { directionalLight, spotLight, pointLight, _transform } =
        entities[i];

      if (directionalLight) this.updateLight(directionalLight, _transform);
      if (spotLight) this.updateLight(spotLight, _transform);
      if (pointLight) this.updateLight(pointLight);
    }
  },
});