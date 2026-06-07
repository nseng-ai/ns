// Compatibility shim: @asdl/ccc owns cmux command orchestration.
export {
	CMUX_WORKSPACE_SUMMARY_TIMEOUT_MS,
	applyObjectiveSidebarFields,
	formatObjectiveSidebarFields,
	listObjectiveSidebarChoices,
	readCurrentBranchSlug,
	resolveObjectiveSelector,
	slotSlugFromCwd,
	validateObjectiveSidebarSlug,
} from "../../../ccc/src/cmux/objective-sidebar.ts";
export type {
	BranchSlugReadResult,
	ObjectiveSelectorParseResult,
	ObjectiveSidebarApplyResult,
	ObjectiveSidebarChoicesLoadResult,
	ObjectiveSidebarFormatInput,
	ObjectiveSidebarValidationResult,
	SidebarFields,
} from "../../../ccc/src/cmux/objective-sidebar.ts";
