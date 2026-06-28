import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));
const { default: registerBranchContextExtension } = await import(
	requireFromTypeScriptWorkspace.resolve("@sdl/branch-context-pi/extension"),
);

export default function branchContextProjectExtension(pi) {
	registerBranchContextExtension(pi, {
		branchContextDefaultCreation: "graphite",
	});
}
