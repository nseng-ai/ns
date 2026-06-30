import type { ExecResult, PiExecResultLike } from "@sdl/exec";

export type NotifyLevel = "info" | "success" | "warning" | "error";

/**
 * Visual intent of a land result block (house-style §3/§4/§7.3). Distinct from `NotifyLevel`, which
 * owns stdout/stderr routing and exit-code flipping: a declined guardrail renders `refusal` (warn)
 * even when it is notified at `error` level to flip the exit code.
 */
export type LandResultKind = "success" | "refusal" | "failure";

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

export type MessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export interface PrintOutput {
	write(chunk: string): unknown;
}

export interface LandStackCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, message: string): Promise<boolean>;
		setStatus(key: string, value: string | undefined): void;
		setWidget?(
			key: string,
			value: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
	};
	waitForIdle(): Promise<void>;
	/**
	 * CLI-only house-style result-block renderer (house-style §4). Set only by the SDL CLI edge
	 * (`runLandCli`); absent in the Pi command-stream path, which keeps plain notify text colored by
	 * `renderCommandStreamMessage`. Wraps a settled result message's first line as a bold +
	 * intent-painted + glyph headline with the remainder at normal weight. Because it is wired only on
	 * the CLI context, house-style ANSI never leaks into the shared Pi surface.
	 */
	renderResultBlock?: (kind: LandResultKind, message: string) => string;
}

export interface PrintAwareLandStackCommandContext extends LandStackCommandContext {
	mode?: ExtensionMode;
	printOutput?: PrintOutput;
}

export interface LandStackExtensionAPI {
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<PiExecResultLike>;
}

export interface ParsedArgs {
	shouldSkipConfirmation: boolean;
	isDryRun: boolean;
	shouldFreeSlot: boolean;
	shouldForceCleanup: boolean;
	shouldShowHelp: boolean;
	shouldStreamVerboseOutput: boolean;
}

export interface StackSnapshot {
	trunk: string;
	/** Actual branch checked out in this worktree when landing started. */
	current: string;
	actualCurrentBranch: string;
	landingTargetBranch: string;
	landingBranches: string[];
	remainingLandingBranches: string[];
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

export interface LandedChunk {
	index: number;
	landingTargetBranch: string;
	landed: LandedPr[];
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
}

export interface CommandStreamFinish {
	result: ExecResult;
	note?: string;
}
