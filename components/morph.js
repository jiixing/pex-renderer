/**
 * Morph component
 * @param {import("../types.js").MorphComponentOptions} options
 * @returns {object}
 * @alias module:components.morph
 */
export default (options) => ({
  weights: [],
  current:
    options.current ||
    Object.keys(options.sources).reduce((current, attribute) => {
      current[attribute] = [...options.sources[attribute]];
      return current;
    }, {}),
  ...options,
});
