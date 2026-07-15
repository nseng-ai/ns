/**
 * The `bin` map that package preparation adds to the generated `@nseng-ai/ns` publish manifest.
 *
 * The source manifest advertises no executable: `bin/ns.js` is a build artifact that does not
 * exist in a source checkout. Preparation and registry verification share this constant so the
 * published entry point is defined in exactly one place.
 */
export const nsPublishBin = Object.freeze({ ns: "bin/ns.js" });
