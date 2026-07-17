import type {
	DispatchGraphitePublicationStage,
	DispatchPromptGateways,
	DispatchRemoteBranchTipResult,
} from "./contracts.ts";
import type {
	DispatchCompletedSourceLifecycle,
	DispatchSourceRevalidationReason,
} from "./lifecycle.ts";
import type { DispatchPromptOutcome } from "./outcome.ts";
import {
	runDispatchPreflight,
	type DispatchPreflightCheck,
	type DispatchPreflightSuccess,
} from "./preflight.ts";

interface PreparedDispatchSourceContext {
	readonly source: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly headSha: string;
	};
	readonly preflight: DispatchPreflightSuccess;
}

export interface PreparedDispatchSource {
	readonly context: PreparedDispatchSourceContext;
	readonly receipt: {
		readonly stage: "source";
		readonly source: DispatchCompletedSourceLifecycle;
	};
}

export type PrepareDispatchSourceResult =
	| { readonly ok: true; readonly prepared: PreparedDispatchSource }
	| { readonly ok: false; readonly outcome: DispatchPromptOutcome };

/**
 * Publish the exact source when needed and immediately establish the one
 * authoritative source/preflight context consumed by dispatch orchestration.
 */
export async function prepareDispatchSource(options: {
	readonly cwd: string;
	readonly initialSource: PreparedDispatchSourceContext["source"];
	readonly initialRemoteTip: DispatchRemoteBranchTipResult;
	readonly force: boolean;
	readonly onPhase?: (message: string) => void;
	readonly gateways: Pick<
		DispatchPromptGateways,
		"git" | "sourcePublication" | "publicationAuthorization" | "config" | "tokens" | "trigger"
	>;
}): Promise<PrepareDispatchSourceResult> {
	const publication = await publishDispatchSource(options);
	if (publication.ok === false) return publication;

	options.onPhase?.("Revalidating the source and dispatch identity…");
	const revalidated = await revalidateDispatchSource({
		...options,
		expectedSource: publication.expectedSource,
		publication: publication.publication,
	});
	if (revalidated.ok === false) return revalidated;

	const source: DispatchCompletedSourceLifecycle =
		publication.publication.type === "already-current"
			? { type: "already-current" }
			: {
					...publication.publication.source,
					mutation: { ...publication.publication.source.mutation, remote: "observed" },
				};
	return {
		ok: true,
		prepared: {
			context: revalidated.context,
			receipt: { stage: "source", source },
		},
	};
}

type PublicationDecision =
	| { readonly type: "already-current" }
	| {
			readonly type: "published";
			readonly source: Exclude<DispatchCompletedSourceLifecycle, { type: "already-current" }>;
	  };

async function publishDispatchSource(options: Parameters<typeof prepareDispatchSource>[0]): Promise<
	| {
			readonly ok: true;
			readonly publication: PublicationDecision;
			readonly expectedSource: PreparedDispatchSourceContext["source"];
	  }
	| { readonly ok: false; readonly outcome: DispatchPromptOutcome }
> {
	if (
		options.initialRemoteTip.type === "found" &&
		options.initialRemoteTip.sha === options.initialSource.headSha
	) {
		return {
			ok: true,
			publication: { type: "already-current" },
			expectedSource: options.initialSource,
		};
	}

	options.onPhase?.("Planning source publication…");
	const planned = await options.gateways.sourcePublication.planGraphitePublication({
		expectedBranch: options.initialSource.branch,
		expectedHeadSha: options.initialSource.headSha,
	});
	if (planned.type === "failed") {
		return {
			ok: false,
			outcome: {
				status: "source-publication-plan-failed",
				code: planned.code,
				message: planned.message,
				receipt: {
					stage: "source",
					source: { type: "graphite-planning", mutation: planned.mutation },
				},
			},
		};
	}

	if (planned.type === "not-graphite-tracked") {
		options.onPhase?.("Pushing the exact source revision with Git…");
		const push = await options.gateways.git.pushSourceBranch({
			cwd: options.cwd,
			branch: options.initialSource.branch,
			expectedRevision: options.initialSource.headSha,
		});
		if (push.ok === false) {
			return {
				ok: false,
				outcome: {
					status: "source-push-failed",
					sourceBranch: options.initialSource.branch,
					message: push.error.message,
					receipt: {
						stage: "source",
						source: {
							type: "git-push-attempted",
							mutation: { local: "none", remote: "possible" },
						},
					},
				},
			};
		}
		return {
			ok: true,
			expectedSource: options.initialSource,
			publication: {
				type: "published",
				source: {
					type: "git-pushed",
					mutation: { local: "none", remote: "possible" },
				},
			},
		};
	}

	const affectedBranches = [...planned.plan.affectedBranches];
	options.onPhase?.(`Graphite publication scope: ${affectedBranches.join(" → ")}`);
	const authorization =
		await options.gateways.publicationAuthorization.authorizeGraphitePublication({
			affectedBranches,
			isForceAuthorized: options.force,
		});
	if (authorization.type === "non-interactive-force-required") {
		return {
			ok: false,
			outcome: { status: "source-publication-force-required", affectedBranches },
		};
	}
	if (authorization.type === "declined") {
		return {
			ok: false,
			outcome: { status: "source-publication-declined", affectedBranches },
		};
	}

	const published = await options.gateways.sourcePublication.publishGraphiteSource({
		expectedBranch: options.initialSource.branch,
		expectedHeadSha: options.initialSource.headSha,
		expectedPlan: planned.plan,
		onPhase: (stage: DispatchGraphitePublicationStage) =>
			options.onPhase?.(`Publishing Graphite source: ${stage}…`),
	});
	if (published.type === "failed") {
		return {
			ok: false,
			outcome: {
				status: "graphite-publication-failed",
				stage: published.stage,
				code: published.code,
				message: published.message,
				receipt: {
					stage: "source",
					source: {
						type: "graphite-publication-attempted",
						mutation: published.mutation,
						affectedBranches,
					},
				},
			},
		};
	}
	return {
		ok: true,
		expectedSource: { ...options.initialSource, ...published.source },
		publication: {
			type: "published",
			source: {
				type: "graphite-submitted",
				mutation: published.mutation,
				affectedBranches,
			},
		},
	};
}

async function revalidateDispatchSource(options: {
	readonly cwd: string;
	readonly initialSource: PreparedDispatchSourceContext["source"];
	readonly expectedSource: PreparedDispatchSourceContext["source"];
	readonly publication: PublicationDecision;
	readonly gateways: Pick<DispatchPromptGateways, "git" | "config" | "tokens" | "trigger">;
}): Promise<
	| { readonly ok: true; readonly context: PreparedDispatchSourceContext }
	| { readonly ok: false; readonly outcome: DispatchPromptOutcome }
> {
	const source = await options.gateways.git.resolveSourceRef({ cwd: options.cwd });
	if (source.ok === false) {
		return sourceRevalidationFailure(
			options.publication,
			"source-read-failed",
			source.error.message,
		);
	}
	if (source.value.repoRoot !== options.initialSource.repoRoot) {
		return sourceRevalidationFailure(
			options.publication,
			"repository-drift",
			`Repository changed from ${options.initialSource.repoRoot} to ${source.value.repoRoot}.`,
		);
	}
	if (source.value.branch !== options.expectedSource.branch) {
		return sourceRevalidationFailure(
			options.publication,
			"branch-drift",
			`Current branch changed from ${options.expectedSource.branch} to ${source.value.branch}.`,
		);
	}
	if (source.value.headSha !== options.expectedSource.headSha) {
		return sourceRevalidationFailure(
			options.publication,
			"head-drift",
			`HEAD changed from ${options.expectedSource.headSha} to ${source.value.headSha}.`,
		);
	}
	const dirty = await options.gateways.git.listDirtyPaths({ cwd: options.cwd });
	if (dirty.ok === false) {
		return sourceRevalidationFailure(options.publication, "dirty-read-failed", dirty.error.message);
	}
	if (dirty.value.length > 0) {
		return sourceRevalidationFailure(
			options.publication,
			"dirty-tree",
			publicationFailureMessage(options.publication, "The worktree is no longer clean."),
			{ dirtyPaths: [...dirty.value] },
		);
	}
	const preflight = await runDispatchPreflight(
		{ repoRoot: source.value.repoRoot },
		options.gateways,
	);
	if (preflight.ok === false) {
		return sourceRevalidationFailure(
			options.publication,
			"preflight-failed",
			publicationFailureMessage(options.publication, "The final dispatch preflight failed."),
			{ checks: preflight.checks },
		);
	}
	const remote = await options.gateways.git.readRemoteBranchTip({
		cwd: options.cwd,
		branch: source.value.branch,
	});
	if (remote.type === "error") {
		return sourceRevalidationFailure(
			options.publication,
			"remote-tip-read-failed",
			remote.error.message,
		);
	}
	if (remote.type === "missing" || remote.sha !== source.value.headSha) {
		return sourceRevalidationFailure(
			options.publication,
			"remote-tip-mismatch",
			remote.type === "missing"
				? `Remote branch ${source.value.branch} is missing.`
				: `Remote branch ${source.value.branch} is at ${remote.sha}, expected ${source.value.headSha}.`,
		);
	}
	return { ok: true, context: { source: source.value, preflight } };
}

function publicationFailureMessage(publication: PublicationDecision, message: string): string {
	return publication.type === "already-current"
		? message
		: `Source publication completed, but ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
}

function sourceRevalidationFailure(
	publication: PublicationDecision,
	reason: DispatchSourceRevalidationReason,
	message: string,
	details: {
		readonly checks?: readonly DispatchPreflightCheck[];
		readonly dirtyPaths?: readonly string[];
	} = {},
): { readonly ok: false; readonly outcome: DispatchPromptOutcome } {
	return publication.type === "already-current"
		? {
				ok: false,
				outcome: { status: "source-revalidation-failed", reason, message, ...details },
			}
		: {
				ok: false,
				outcome: {
					status: "source-publication-verification-failed",
					reason,
					message,
					receipt: { stage: "source", source: publication.source },
					...details,
				},
			};
}
