import createBrmemPlanBranchExtension from "../../ts/packages/pi-extensions/src/create-brmem-plan-branch.ts";

export default function createBrmemPlanBranchProjectExtension(pi) {
	createBrmemPlanBranchExtension(pi, {
		plannedBranchDefaultCreation: "graphite",
		plannedBranchPrefix: "brmem-plans/",
	});
}
