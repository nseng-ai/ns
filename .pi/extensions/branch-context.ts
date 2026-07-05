import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const registerBranchContextExtension = await importTypeScriptWorkspaceDefault(
	"@nseng-ai/branch-context/pi/extension",
);

export default function branchContextProjectExtension(pi) {
	registerBranchContextExtension(pi, {
		branchContextDefaultCreation: "graphite",
	});
}
