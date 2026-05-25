import registerPlannedBranchExtension from "../../ts/packages/pi-extensions/src/planned-branch-extension.ts";

export default function plannedBranchProjectExtension(pi) {
	registerPlannedBranchExtension(pi, {
		plannedBranchDefaultCreation: "graphite",
	});
}
