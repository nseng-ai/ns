import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));
const { default: sdlExtension } = await import(
	requireFromTypeScriptWorkspace.resolve("@sdl/flow-pi/sdl-extension"),
);

export default sdlExtension;
