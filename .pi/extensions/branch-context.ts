import registerBranchContextExtension from "../../ts/packages/pi-extensions/src/branch-context-extension.ts";

export default function branchContextProjectExtension(pi) {
	registerBranchContextExtension(pi, {
		branchContextDefaultCreation: "graphite",
	});
}
