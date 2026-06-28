import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));
const { default: objectiveExtension } = await import(
	requireFromTypeScriptWorkspace.resolve("@sdl/objective-pi/extension"),
);

export default objectiveExtension;
