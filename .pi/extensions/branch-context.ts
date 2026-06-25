import registerBranchContextExtension from "../../ts/packages/pi/src/branch-context/extension.ts";

export default function branchContextProjectExtension(pi) {
	registerBranchContextExtension(pi, {
		branchContextDefaultCreation: "graphite",
	});
}
