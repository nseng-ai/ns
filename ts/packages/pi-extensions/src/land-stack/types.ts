import type { ExecResult, PiExecResultLike } from "../command-runtime.ts";

export type NotifyLevel = "info" | "success" | "warning" | "error";

export type AutocompleteItem = {
	value: string;
	label?: string;
	description?: string;
};

export type CustomMessageContent = string | Array<{ type: string; text?: string }>;

export type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

export type RenderTheme = {
	fg(color: string, text: string): string;
};

export type RenderComponent = {
	render(width: number): string[];
	invalidate(): void;
};

export type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export type ExtensionCommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm(title: string, message: string): Promise<boolean>;
		setStatus(key: string, value: string | undefined): void;
		setWidget?(key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(
		message: CustomMessage,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<PiExecResultLike>;
};

export type ParsedArgs = {
	yes: boolean;
	dryRun: boolean;
	help: boolean;
};

export type StackSnapshot = {
	trunk: string;
	current: string;
	landingBranches: string[];
	descendantBranches: string[];
	warnings: string[];
};

export type PullRequestSnapshot = {
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
};

export type BranchPlan = {
	branch: string;
	localSha: string;
	pr: PullRequestSnapshot;
};

export type PrSubmitRequirement = {
	branch: string;
	prNumber: number;
	localSha: string;
	prHeadSha: string;
	baseRefName: string;
	expectedBaseRefName: string | undefined;
	reasons: string[];
};

export type RestackRequirement = {
	branch: string;
	parent: string;
};

export type WorktreeConflict = {
	branch: string;
	path: string;
	kind: "current" | "managed-slot" | "manual-worktree";
};

export type WorktreeEntry = {
	path: string;
	branch?: string;
};

export type ParsedStackOutput = {
	trunk: string;
	current: string;
	ancestors: string[];
	descendants: string[];
	warnings: string[];
};

export type LandingPlan = {
	repoRoot: string;
	stack: StackSnapshot;
	branchPlans: BranchPlan[];
	prSubmitRequirements: PrSubmitRequirement[];
	submitRestackRequirements: RestackRequirement[];
	managedSlotConflicts: WorktreeConflict[];
};

export type LandedPr = {
	branch: string;
	number: number;
	title: string;
	url?: string;
};

export type CommandStreamPrLink = {
	number: number;
	url: string;
};

export type CommandStreamMessageDetails = {
	prLinks: CommandStreamPrLink[];
};

export type LandingWarning = {
	message: string;
	commandDisplay?: string;
	result?: ExecResult;
	suggestedAction?: string;
};

export type CommandStreamFinish = {
	result: ExecResult;
	note?: string;
};
