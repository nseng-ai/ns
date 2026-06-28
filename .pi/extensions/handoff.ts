import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));
const { default: handoffExtension } = await import(
	requireFromTypeScriptWorkspace.resolve("@sdl/handoff-pi/extension"),
);

export default handoffExtension;
