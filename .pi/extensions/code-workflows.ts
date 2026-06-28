import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));
const { default: codeWorkflowsExtension } = await import(
	requireFromTypeScriptWorkspace.resolve("@sdl/flow-pi/code-workflows-extension"),
);

export default codeWorkflowsExtension;
