import type { ExecResult, PiExecResultLike } from "@asdl/core/exec";

export type NotifyLevel = "info" | "success" | "warning" | "error";

export interface AutocompleteItem {
	value: string;
	label?: string;
	description?: string;
}

export type CustomMessageContent = string | Array<{ type: string; text?: string }>;

export interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
}

export interface RenderTheme {
	fg(color: string, text: string): string;
}

export interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export interface LandStackCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, message: string): Promise<boolean>;
		setStatus(key: string, value: string | undefined): void;
		setWidget?(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	};
	waitForIdle(): Promise<void>;
}

export interface LandStackExtensionAPI {
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<PiExecResultLike>;
}

export interface ParsedArgs {
	yes: boolean;
	dryRun: boolean;
	help: boolean;
}

export interface StackSnapshot {
	trunk: string;
	current: string;
	landingBranches: string[];
	descendantBranches: string[];
	warnings: string[];
}

export interface LandingShape {
	repoRoot: string;
	current: string;
	trunk: string;
	metadataDbPath: string;
	stack: StackSnapshot;
}

export interface PullRequestSnapshot {
	number: number;
	title: string;
	body: string | null;
	state: string;
	isDraft: boolean;
	headRefName: string;
	baseRefName: string;
	headRefOid: string;
	mergeStateStatus: string | undefined;
	url: string | undefined;
	mergedAt: string | null | undefined;
}

export interface BranchPlan {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
}

export interface PrSubmitRequirement {
	branch: string;
	prNumber: number;
	localSha: string;
	prHeadSha: string;
	baseRefName: string;
	expectedBaseRefName: string | undefined;
	reasons: string[];
}

export interface RestackRequirement {
	branch: string;
	parent: string;
}

export interface WorktreeConflict {
	branch: string;
	path: string;
	kind: "current" | "managed-slot" | "manual-worktree";
}

export type DescendantMaintenancePlan =
	| { kind: "none"; branches: [] }
	| { kind: "auto"; branches: string[]; targetBranch: string }
	| {
			kind: "skipped";
			branches: string[];
			targetBranch: string | undefined;
			conflicts: WorktreeConflict[];
			reason: string;
		};

export interface WorktreeEntry {
	path: string;
	branch?: string;
}

export interface LandingPlan {
	repoRoot: string;
	metadataDbPath: string;
	stack: StackSnapshot;
	branchPlans: BranchPlan[];
	prSubmitRequirements: PrSubmitRequirement[];
	submitRestackRequirements: RestackRequirement[];
	managedSlotConflicts: WorktreeConflict[];
	descendantMaintenance: DescendantMaintenancePlan;
}

export interface LandedPr {
	branch: string;
	number: number;
	title: string;
	url?: string;
}

export interface CommandStreamPrLink {
	number: number;
	url: string;
}

export interface CommandStreamMessageDetails {
	prLinks: CommandStreamPrLink[];
}

export interface LandingWarning {
	level?: "warning" | "info";
	message: string;
	commandDisplay?: string;
	result?: ExecResult;
	suggestedAction?: string;
	notificationAction?: string;
}

export interface RetainedLocalBranchCleanup {
	branch: string;
	path: string;
}

export interface RemainingCleanup {
	retainedLocalBranches: RetainedLocalBranchCleanup[];
	detachedWorktreeTrunk: string | undefined;
}

export interface CommandStreamFinish {
	result: ExecResult;
	note?: string;
}
