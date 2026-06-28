import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));
const { default: codeExtension } = await import(
	requireFromTypeScriptWorkspace.resolve("@sdl/flow-pi/code-extension"),
);

export default codeExtension;
