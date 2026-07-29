import registerBranchContextExtension from "./extension.ts";
import type { ExtensionAPI } from "./host-types.ts";

export default function registerBranchContextProjectExtension(pi: ExtensionAPI): void {
	registerBranchContextExtension(pi, {
		branchContextDefaultCreation: "graphite",
	});
}
