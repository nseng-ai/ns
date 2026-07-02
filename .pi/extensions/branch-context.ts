import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerBranchContextExtension = await importTypeScriptWorkspaceDefault(
	"@sdl/branch-context/pi/extension",
);

export default function branchContextProjectExtension(pi) {
	registerBranchContextExtension(pi, {
		branchContextDefaultCreation: "graphite",
	});
}
