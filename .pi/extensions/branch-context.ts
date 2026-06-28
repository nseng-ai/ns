import registerBranchContextExtension from "../../ts/packages/capability-pi/branch-context/src/extension.ts";

export default function branchContextProjectExtension(pi) {
	registerBranchContextExtension(pi, {
		branchContextDefaultCreation: "graphite",
	});
}
