import { z } from "@nseng-ai/sdk";

export const GS_AUTOBRANCH_MINIMUM_GH_STACK_VERSION = "0.1.0";
export const GS_AUTOBRANCH_EFFECTS_MAX_COUNT = 12;
export const GS_AUTOBRANCH_DIAGNOSTIC_MAX_CHARS = 1_100;

export const gsAutobranchRequestSchema = z.lazy(() =>
	z.strictObject({ slug: z.string().trim().min(1).optional(), yes: z.boolean().default(false) }),
);
export type GsAutobranchRequest = z.infer<typeof gsAutobranchRequestSchema>;

export const gsAutobranchResultSchema = z.lazy(() =>
	z.strictObject({
		outcome: z.enum(["refused", "completed", "known-partial-failure", "ambiguous-failure"]),
		path: z.enum(["trunk-bootstrap", "tracked-top-extension"]).nullable(),
		observedVersion: z.string().nullable(),
		worktreeGitDir: z.string().nullable(),
		trunk: z.string().nullable(),
		source: z.string().nullable(),
		child: z.string().nullable(),
		sourceSha: z.string().nullable(),
		childSha: z.string().nullable(),
		dirty: z.strictObject({
			staged: z.number().int().nonnegative(),
			unstaged: z.number().int().nonnegative(),
			untracked: z.number().int().nonnegative(),
			total: z.number().int().nonnegative(),
		}),
		clean: z.boolean().nullable(),
		checkpointSummary: z.string().max(300).nullable(),
		relationship: z.strictObject({
			trunk: z.string().nullable(),
			currentBranch: z.string().nullable(),
			top: z.string().nullable(),
			sourceTrackedOnce: z.boolean(),
			sourceCurrent: z.boolean(),
			sourceTopmost: z.boolean(),
			childDirectlyAboveSource: z.boolean(),
			childCurrentTopmost: z.boolean(),
		}),
		effects: z.array(z.string().max(200)).max(GS_AUTOBRANCH_EFFECTS_MAX_COUNT),
		diagnostic: z.string().max(GS_AUTOBRANCH_DIAGNOSTIC_MAX_CHARS).nullable(),
		recovery: z.strictObject({
			action: z.enum([
				"none",
				"authorize-mutation",
				"provide-slug",
				"inspect-worktree",
				"inspect-child",
				"inspect-stack-worktree",
				"install-supported-gh-stack",
			]),
			instruction: z.string().max(400),
		}),
	}),
);
export type GsAutobranchResult = z.infer<typeof gsAutobranchResultSchema>;

export interface GsAutobranchGitFacts {
	readonly root: string;
	readonly worktreeGitDir: string;
	readonly branch: string | null;
	readonly headSha: string | null;
	readonly trunk: string | null;
	readonly trunkSha: string | null;
	readonly operation: "none" | "rebase" | "merge" | "cherry-pick" | "revert" | "bisect";
	readonly status: string;
	readonly diff: string;
	readonly dirty: GsAutobranchResult["dirty"];
	readonly childSha: string | null;
	readonly sourceRefSha: string | null;
}

export type GsAutobranchGatewayResult<T> =
	| { readonly ok: true; readonly value: T }
	| {
			readonly ok: false;
			readonly message: string;
			readonly reason?: "untracked" | "command-failed" | "unsupported-output";
	  };

export interface GsAutobranchGitGateway {
	inspect(
		child: string | null,
		source?: string,
	): Promise<GsAutobranchGatewayResult<GsAutobranchGitFacts>>;
	validateChild(child: string): Promise<GsAutobranchGatewayResult<boolean>>;
	createAndSwitchChild(child: string): Promise<GsAutobranchGatewayResult<null>>;
}

export interface GsAutobranchStackView {
	readonly trunk: string;
	readonly currentBranch: string;
	readonly branches: readonly {
		readonly name: string;
		readonly base: string;
		readonly isCurrent: boolean;
	}[];
}

export interface GsAutobranchStackGateway {
	readVersion(): Promise<GsAutobranchGatewayResult<string>>;
	view(): Promise<GsAutobranchGatewayResult<GsAutobranchStackView>>;
	init(child: string): Promise<GsAutobranchGatewayResult<null>>;
	add(child: string): Promise<GsAutobranchGatewayResult<null>>;
}

export interface GsAutobranchCheckpointGateway {
	commit(message: string): Promise<GsAutobranchGatewayResult<string>>;
}

export interface GsAutobranchPreparationFacts {
	readonly root: string;
	readonly branch: string;
	readonly status: string;
	readonly diff: string;
}

export interface GsAutobranchPreparationGateway {
	prepare(input: {
		readonly requestedSlug?: string;
		readonly facts: GsAutobranchPreparationFacts;
	}): Promise<
		GsAutobranchGatewayResult<{ readonly child: string; readonly checkpointMessage: string }>
	>;
}

export interface GsAutobranchContext {
	readonly git: GsAutobranchGitGateway;
	readonly stack: GsAutobranchStackGateway;
	readonly checkpoint: GsAutobranchCheckpointGateway;
	readonly preparation: GsAutobranchPreparationGateway;
}
