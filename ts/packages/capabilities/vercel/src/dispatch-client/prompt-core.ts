// The `ns dispatch prompt` command core (steel-thread sub-slice 3): pure
// orchestration over the gateway seams in `contracts.ts`. Order of
// operations mirrors the README's contract — local git refusals first
// (clean-tree rule with the dirty-file list), then the credentials
// preflight (README "Setup": report exactly what is missing before any
// remote work starts), then semantic slug preparation, exact-source
// publication (Git push or Graphite submit) and revalidation, timestamped
// anchor-name selection, the up-front `dispatch/` anchor branch and PR on
// the user's own credentials, the authenticated trigger call, and the
// run-id stamp on the anchor PR. Live behavior against the deployed trigger
// route is pending verification; tests drive this core with in-memory fakes.
import { parseDispatchProjectConfigToml, type DispatchProjectConfig } from "./project-config.ts";
import {
	DISPATCH_PACKAGE_MANAGER_FIELD,
	DISPATCH_PACKAGE_MANIFEST_PATH,
	DISPATCH_SETTINGS_PATH,
	parseDispatchPackageManagerSource,
} from "../dispatch/harness-registry.ts";
import {
	buildDispatchAnchorNameCandidates,
	DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT,
	formatDispatchAnchorTimestamp,
} from "./anchor-name.ts";
import { buildAnchorPrBody, buildAnchorPrTitle } from "./content.ts";
import { normalizeDispatchSlugOverride } from "./content-slug.ts";
import type {
	DispatchGraphitePublicationStage,
	DispatchPromptGateways,
	DispatchSourcePublicationMutationEvidence,
	DispatchTriggerConnection,
} from "./contracts.ts";
import {
	createDispatchAnchor,
	resolveDispatchSource,
	startDispatchWorkflow,
	type DispatchAnchorPr,
} from "./core.ts";

/** One credentials-preflight check: named, actionable, value-free. */
export interface DispatchPreflightCheck {
	readonly id:
		| "dispatch-config"
		| "package-manager"
		| "development-oidc-token"
		| "trigger-identity";
	readonly status: "ok" | "failed";
	readonly detail: string;
}

export interface DispatchPreflightFailure {
	readonly ok: false;
	readonly checks: readonly DispatchPreflightCheck[];
}

interface DispatchPreflightSuccess {
	readonly ok: true;
	readonly checks: readonly DispatchPreflightCheck[];
	readonly deploymentUrl: string;
	readonly workflowDashboardUrl: string;
	readonly anchorTimeZone: string;
	readonly triggerConnection: DispatchTriggerConnection;
}

export type DispatchPreflightResult = DispatchPreflightSuccess | DispatchPreflightFailure;

/**
 * This remains in the command core: its parsing helpers and result feed only
 * this orchestration, so extraction would add ownership indirection rather
 * than create a deeper module.
 *
 * The credentials preflight (closes the credentials row's remaining
 * item): required `[dispatch]` configuration and exact pnpm contract
 * present and supported, the Development OIDC token present by name, and a
 * read-only authenticated reachability check against the deployable's
 * run-status route. Failures
 * are actionable categories; no secret value is read into any detail.
 */
export async function runDispatchPreflight(
	options: { readonly repoRoot: string },
	gateways: Pick<DispatchPromptGateways, "config" | "tokens" | "trigger">,
): Promise<DispatchPreflightResult> {
	const checks: DispatchPreflightCheck[] = [];

	const configCheck = await readDispatchConfig(options.repoRoot, gateways);
	checks.push(configCheck.check);

	const packageManagerCheck = await readPackageManagerConfig(options.repoRoot, gateways);
	checks.push(packageManagerCheck);

	const tokenResult = await gateways.tokens.readDevelopmentOidcToken();
	const tokenCheck: DispatchPreflightCheck =
		tokenResult.type === "found"
			? {
					id: "development-oidc-token",
					status: "ok",
					detail: "VERCEL_OIDC_TOKEN is available to the dispatch CLI.",
				}
			: {
					id: "development-oidc-token",
					status: "failed",
					detail:
						tokenResult.type === "missing"
							? tokenResult.detail
							: `Reading the local Development OIDC token failed: ${tokenResult.message}`,
				};
	checks.push(tokenCheck);

	if (
		configCheck.config === undefined ||
		packageManagerCheck.status === "failed" ||
		tokenResult.type !== "found"
	) {
		checks.push({
			id: "trigger-identity",
			status: "failed",
			detail:
				"Skipped: requires supported repository configuration and the Development OIDC token.",
		});
		return { ok: false, checks };
	}

	const { deploymentUrl, workflowDashboardUrl } = configCheck.config;
	const triggerConnection: DispatchTriggerConnection = {
		deploymentUrl,
		oidcToken: tokenResult.token,
	};
	const identity = await gateways.trigger.checkTriggerIdentity({ connection: triggerConnection });
	const identityCheck = triggerIdentityCheck(identity);
	checks.push(identityCheck);
	if (identityCheck.status === "failed") return { ok: false, checks };

	return {
		ok: true,
		checks,
		deploymentUrl,
		workflowDashboardUrl,
		anchorTimeZone: configCheck.config.anchorTimeZone,
		triggerConnection,
	};
}

type ValidDispatchProjectConfig = Omit<
	DispatchProjectConfig,
	"deploymentUrl" | "workflowDashboardUrl"
> & {
	readonly deploymentUrl: string;
	readonly workflowDashboardUrl: string;
};

async function readDispatchConfig(
	repoRoot: string,
	gateways: Pick<DispatchPromptGateways, "config">,
): Promise<{
	readonly check: DispatchPreflightCheck;
	readonly config?: ValidDispatchProjectConfig;
}> {
	const source = await gateways.config.readDispatchSettingsSource({ repoRoot });
	if (source.type === "missing") {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `No ${DISPATCH_SETTINGS_PATH} at the repository root; dispatch needs its [dispatch] table (see the dispatch README's Setup section).`,
			},
		};
	}
	if (source.type === "error") {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `Reading ${DISPATCH_SETTINGS_PATH} failed: ${source.message}`,
			},
		};
	}
	const parsed = parseDispatchProjectConfigToml(source.source, DISPATCH_SETTINGS_PATH);
	if (parsed.ok === false) {
		return {
			check: { id: "dispatch-config", status: "failed", detail: parsed.error.message },
		};
	}
	if (parsed.value.deploymentUrl === undefined) {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `${DISPATCH_SETTINGS_PATH}: [dispatch] has no deployment_url; set it to the dispatch deployable's stable HTTPS URL (see the dispatch README's Setup section).`,
			},
		};
	}
	if (parsed.value.workflowDashboardUrl === undefined) {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `${DISPATCH_SETTINGS_PATH}: [dispatch] has no workflow_dashboard_url; set it to the Vercel project's Workflows dashboard URL (see the dispatch README's Setup section).`,
			},
		};
	}
	return {
		check: {
			id: "dispatch-config",
			status: "ok",
			detail: "[dispatch] configuration is present and valid.",
		},
		config: {
			...parsed.value,
			deploymentUrl: parsed.value.deploymentUrl,
			workflowDashboardUrl: parsed.value.workflowDashboardUrl,
		},
	};
}

async function readPackageManagerConfig(
	repoRoot: string,
	gateways: Pick<DispatchPromptGateways, "config">,
): Promise<DispatchPreflightCheck> {
	const source = await gateways.config.readPackageManagerSource({ repoRoot });
	if (source.type === "error") {
		return {
			id: "package-manager",
			status: "failed",
			detail: `Reading ${DISPATCH_PACKAGE_MANIFEST_PATH} for ${DISPATCH_PACKAGE_MANAGER_FIELD} failed: ${source.message}`,
		};
	}

	const parsed = parseDispatchPackageManagerSource(
		source.type === "missing" ? null : source.source,
	);
	if (parsed.ok === false) {
		return {
			id: "package-manager",
			status: "failed",
			detail: parsed.error.message,
		};
	}
	return {
		id: "package-manager",
		status: "ok",
		detail: `${DISPATCH_PACKAGE_MANAGER_FIELD} declares a supported exact pnpm version.`,
	};
}

function triggerIdentityCheck(
	identity: Awaited<ReturnType<DispatchPromptGateways["trigger"]["checkTriggerIdentity"]>>,
): DispatchPreflightCheck {
	switch (identity.type) {
		case "authorized":
			return {
				id: "trigger-identity",
				status: "ok",
				detail: "The dispatch deployment accepted the caller's Development identity.",
			};
		case "unauthorized":
			return {
				id: "trigger-identity",
				status: "failed",
				detail:
					"The dispatch deployment rejected the caller's Development OIDC token (401). Refresh it with `vercel env pull .env.local --environment=development` from the dispatch package directory.",
			};
		case "forbidden":
			return {
				id: "trigger-identity",
				status: "failed",
				detail:
					"The dispatch deployment refused the caller's identity (403): wrong team, project, or environment for the configured OIDC trust.",
			};
		case "endpoint-misconfigured":
			return {
				id: "trigger-identity",
				status: "failed",
				detail:
					"The dispatch deployment reports its own configuration invalid (500); fix the deployable's NS_DISPATCH_* environment before dispatching.",
			};
		case "unreachable":
			return {
				id: "trigger-identity",
				status: "failed",
				detail: `The dispatch deployment is unreachable: ${identity.message}`,
			};
		case "unexpected-response":
			return {
				id: "trigger-identity",
				status: "failed",
				detail: `The dispatch deployment answered the identity preflight with unexpected status ${identity.status}.`,
			};
	}
}

export interface DispatchPromptRequest {
	readonly cwd: string;
	readonly prompt: string;
	readonly slugOverride?: string;
	readonly force: boolean;
	readonly onPhase?: (message: string) => void;
}

/** How the exact dispatched source revision was made remotely reachable. */
export type DispatchSourcePublication = "already-current" | "git-pushed" | "graphite-submitted";

export type DispatchPromptOutcome =
	| {
			readonly status: "dispatched";
			readonly revision: string;
			readonly sourceBranch: string;
			readonly sourcePublication: DispatchSourcePublication;
			readonly isSourcePushed: boolean;
			readonly anchorPr: DispatchAnchorPr;
			readonly runId: string;
			readonly workflowRunUrl: string;
	  }
	| { readonly status: "dirty-tree"; readonly dirtyPaths: readonly string[] }
	| { readonly status: "preflight-failed"; readonly checks: readonly DispatchPreflightCheck[] }
	| { readonly status: "invalid-branch-slug-override"; readonly message: string }
	| { readonly status: "branch-slug-generation-failed"; readonly message: string }
	| {
			readonly status: "anchor-branch-availability-failed";
			readonly anchorBranch: string;
			readonly message: string;
			readonly sourcePublication?: Exclude<DispatchSourcePublication, "already-current">;
			readonly mutation?: DispatchSourcePublicationMutationEvidence;
			readonly affectedBranches?: readonly string[];
	  }
	| {
			readonly status: "anchor-branch-unavailable";
			readonly semanticSlug: string;
			readonly candidateLimit: number;
			readonly sourcePublication?: Exclude<DispatchSourcePublication, "already-current">;
			readonly mutation?: DispatchSourcePublicationMutationEvidence;
			readonly affectedBranches?: readonly string[];
	  }
	| {
			readonly status: "source-unusable";
			readonly code: "not-a-repository" | "detached-head" | "git-read-failed";
			readonly message: string;
	  }
	| {
			readonly status: "source-publication-plan-failed";
			readonly code: string;
			readonly message: string;
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| {
			readonly status: "source-publication-force-required";
			readonly affectedBranches: readonly string[];
	  }
	| {
			readonly status: "source-publication-declined";
			readonly affectedBranches: readonly string[];
	  }
	| {
			readonly status: "source-push-failed";
			readonly sourceBranch: string;
			readonly message: string;
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| {
			readonly status: "graphite-publication-failed";
			readonly stage: DispatchGraphitePublicationStage;
			readonly code: string;
			readonly message: string;
			readonly affectedBranches: readonly string[];
			readonly mutation: DispatchSourcePublicationMutationEvidence;
	  }
	| {
			readonly status: "source-publication-verification-failed";
			readonly sourcePublication: Exclude<DispatchSourcePublication, "already-current">;
			readonly affectedBranches?: readonly string[];
			readonly reason:
				| "source-read-failed"
				| "repository-drift"
				| "branch-drift"
				| "head-drift"
				| "dirty-read-failed"
				| "dirty-tree"
				| "preflight-failed"
				| "remote-tip-read-failed"
				| "remote-tip-mismatch";
			readonly message: string;
			readonly mutation: DispatchSourcePublicationMutationEvidence;
			readonly checks?: readonly DispatchPreflightCheck[];
			readonly dirtyPaths?: readonly string[];
	  }
	| {
			readonly status: "anchor-push-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  }
	| {
			readonly status: "anchor-pr-failed";
			readonly anchorBranch: string;
			readonly message: string;
	  }
	| {
			readonly status: "trigger-failed";
			readonly code: string;
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
	  }
	| {
			readonly status: "run-id-stamp-failed";
			readonly message: string;
			readonly anchorPr: DispatchAnchorPr;
			/** Absent only when the returned run id itself was unusable. */
			readonly runId?: string;
	  };

/**
 * Execute one prompt dispatch end-to-end on the local side. Mutations
 * start only after every refusal/preflight gate passes; each failure
 * after a mutation reports what already exists (the pushed branch, the
 * open PR, the started run) so nothing is orphaned silently.
 */
export async function executeDispatchPrompt(
	request: DispatchPromptRequest,
	gateways: DispatchPromptGateways,
): Promise<DispatchPromptOutcome> {
	request.onPhase?.("Checking the source branch and worktree…");
	const sourceResult = await resolveDispatchSource({ cwd: request.cwd }, gateways);
	if (sourceResult.status !== "ready") return sourceResult;
	const initialSource = sourceResult.source;

	request.onPhase?.("Validating dispatch configuration and identity…");
	const initialPreflight = await runDispatchPreflight(
		{ repoRoot: initialSource.repoRoot },
		gateways,
	);
	if (initialPreflight.ok === false) {
		return { status: "preflight-failed", checks: initialPreflight.checks };
	}

	request.onPhase?.("Checking whether the source revision is already published…");
	const remoteTip = await gateways.git.readRemoteBranchTip({
		cwd: request.cwd,
		branch: initialSource.branch,
	});
	if (remoteTip.type === "error") {
		return { status: "source-unusable", code: "git-read-failed", message: remoteTip.error.message };
	}

	request.onPhase?.("Deriving the semantic anchor branch name…");
	const semanticSlugOverride =
		request.slugOverride === undefined
			? undefined
			: normalizeDispatchSlugOverride(request.slugOverride);
	if (request.slugOverride !== undefined && semanticSlugOverride === undefined) {
		return {
			status: "invalid-branch-slug-override",
			message:
				"The dispatch slug override must contain at least one ASCII letter or digit after normalization.",
		};
	}
	let semanticSlug = semanticSlugOverride;
	if (semanticSlug === undefined) {
		const derived = await gateways.semanticSlugs.deriveSemanticSlug({
			kind: "prompt",
			content: request.prompt,
			cwd: request.cwd,
		});
		if (derived.ok === false) {
			return { status: "branch-slug-generation-failed", message: derived.error.message };
		}
		semanticSlug = derived.slug;
	}

	let finalSource = initialSource;
	let finalPreflight = initialPreflight;
	let sourcePublication: DispatchSourcePublication = "already-current";
	let publicationAffectedBranches: readonly string[] | undefined;
	let completedPublication:
		| {
				readonly sourcePublication: Exclude<DispatchSourcePublication, "already-current">;
				readonly mutation: DispatchSourcePublicationMutationEvidence;
				readonly affectedBranches?: readonly string[];
		  }
		| undefined;
	if (remoteTip.type === "missing" || remoteTip.sha !== initialSource.headSha) {
		request.onPhase?.("Planning source publication…");
		const planned = await gateways.sourcePublication.planGraphitePublication({
			expectedBranch: initialSource.branch,
			expectedHeadSha: initialSource.headSha,
		});
		if (planned.type === "failed") {
			return {
				status: "source-publication-plan-failed",
				code: planned.code,
				message: planned.message,
				mutation: planned.mutation,
			};
		}

		let mutation: DispatchSourcePublicationMutationEvidence;
		let expectedPublishedSource: { readonly branch: string; readonly headSha: string } | undefined;
		if (planned.type === "not-graphite-tracked") {
			request.onPhase?.("Pushing the exact source revision with Git…");
			const push = await gateways.git.pushSourceBranch({
				cwd: request.cwd,
				branch: initialSource.branch,
				expectedRevision: initialSource.headSha,
			});
			if (push.ok === false) {
				return {
					status: "source-push-failed",
					sourceBranch: initialSource.branch,
					message: push.error.message,
					mutation: { local: "none", remote: "possible" },
				};
			}
			sourcePublication = "git-pushed";
			mutation = { local: "none", remote: "possible" };
		} else {
			publicationAffectedBranches = [...planned.plan.affectedBranches];
			request.onPhase?.(`Graphite publication scope: ${planned.plan.affectedBranches.join(" → ")}`);
			const authorization = await gateways.publicationAuthorization.authorizeGraphitePublication({
				affectedBranches: planned.plan.affectedBranches,
				isForceAuthorized: request.force,
			});
			if (authorization.type === "non-interactive-force-required") {
				return {
					status: "source-publication-force-required",
					affectedBranches: [...planned.plan.affectedBranches],
				};
			}
			if (authorization.type === "declined") {
				return {
					status: "source-publication-declined",
					affectedBranches: [...planned.plan.affectedBranches],
				};
			}
			const published = await gateways.sourcePublication.publishGraphiteSource({
				expectedBranch: initialSource.branch,
				expectedHeadSha: initialSource.headSha,
				expectedPlan: planned.plan,
				onPhase: (stage) => request.onPhase?.(`Publishing Graphite source: ${stage}…`),
			});
			if (published.type === "failed") {
				return {
					status: "graphite-publication-failed",
					stage: published.stage,
					code: published.code,
					message: published.message,
					affectedBranches: [...planned.plan.affectedBranches],
					mutation: published.mutation,
				};
			}
			sourcePublication = "graphite-submitted";
			mutation = published.mutation;
			expectedPublishedSource = published.source;
		}

		request.onPhase?.("Revalidating the published source and dispatch identity…");
		const revalidated = await revalidatePublishedSource({
			request,
			gateways,
			initialSource,
			sourcePublication,
			mutation,
			...(publicationAffectedBranches === undefined ? {} : { publicationAffectedBranches }),
			...(expectedPublishedSource === undefined ? {} : { expectedPublishedSource }),
		});
		if (revalidated.ok === false) return revalidated.outcome;
		finalSource = revalidated.source;
		finalPreflight = revalidated.preflight;
		completedPublication = {
			sourcePublication,
			mutation: { ...mutation, remote: "observed" },
			...(publicationAffectedBranches === undefined
				? {}
				: { affectedBranches: publicationAffectedBranches }),
		};
	}

	const timestamp = formatDispatchAnchorTimestamp(
		gateways.clock.nowMs(),
		finalPreflight.anchorTimeZone,
	);
	let anchorBranch: string | undefined;
	for (const candidate of buildDispatchAnchorNameCandidates(semanticSlug, timestamp)) {
		const availability = await gateways.git.isAnchorBranchNameAvailable({
			cwd: request.cwd,
			anchorBranch: candidate.name,
		});
		if (availability.type === "error") {
			return {
				status: "anchor-branch-availability-failed",
				anchorBranch: candidate.name,
				message: availability.error.message,
				...(completedPublication === undefined ? {} : completedPublication),
			};
		}
		if (availability.type === "available") {
			anchorBranch = candidate.name;
			break;
		}
	}
	if (anchorBranch === undefined) {
		return {
			status: "anchor-branch-unavailable",
			semanticSlug,
			candidateLimit: DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT,
			...(completedPublication === undefined ? {} : completedPublication),
		};
	}

	request.onPhase?.("Creating the anchor branch and pull request…");
	const anchor = await createDispatchAnchor(
		{
			cwd: request.cwd,
			revision: finalSource.headSha,
			anchorBranch,
			baseBranch: finalSource.branch,
			title: buildAnchorPrTitle(request.prompt),
			body: buildAnchorPrBody({
				prompt: request.prompt,
				revision: finalSource.headSha,
				sourceBranch: finalSource.branch,
			}),
		},
		gateways,
	);
	if (anchor.status !== "ready") return anchor;

	const workflow = await startDispatchWorkflow(
		{
			cwd: request.cwd,
			input: {
				revision: finalSource.headSha,
				anchorBranch: anchor.anchorPr.branch,
				anchorPrNumber: anchor.anchorPr.number,
				prompt: request.prompt,
			},
			anchorPr: anchor.anchorPr,
			connection: finalPreflight.triggerConnection,
			workflowDashboardUrl: finalPreflight.workflowDashboardUrl,
			...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		},
		gateways,
	);
	if (workflow.status !== "ready") return workflow;

	return {
		status: "dispatched",
		revision: workflow.runInput.revision,
		sourceBranch: finalSource.branch,
		sourcePublication,
		isSourcePushed: sourcePublication !== "already-current",
		anchorPr: anchor.anchorPr,
		runId: workflow.runId,
		workflowRunUrl: workflow.workflowRunUrl,
	};
}

async function revalidatePublishedSource(options: {
	readonly request: DispatchPromptRequest;
	readonly gateways: DispatchPromptGateways;
	readonly initialSource: {
		readonly repoRoot: string;
		readonly branch: string;
		readonly headSha: string;
	};
	readonly sourcePublication: Exclude<DispatchSourcePublication, "already-current">;
	readonly mutation: DispatchSourcePublicationMutationEvidence;
	readonly publicationAffectedBranches?: readonly string[];
	readonly expectedPublishedSource?: { readonly branch: string; readonly headSha: string };
}): Promise<
	| {
			readonly ok: true;
			readonly source: {
				readonly repoRoot: string;
				readonly branch: string;
				readonly headSha: string;
			};
			readonly preflight: DispatchPreflightSuccess;
	  }
	| {
			readonly ok: false;
			readonly outcome: Extract<
				DispatchPromptOutcome,
				{ readonly status: "source-publication-verification-failed" }
			>;
	  }
> {
	const source = await options.gateways.git.resolveSourceRef({ cwd: options.request.cwd });
	if (source.ok === false) {
		return verificationFailure(options, "source-read-failed", source.error.message);
	}
	if (source.value.repoRoot !== options.initialSource.repoRoot) {
		return verificationFailure(
			options,
			"repository-drift",
			`Repository changed from ${options.initialSource.repoRoot} to ${source.value.repoRoot}.`,
		);
	}
	if (source.value.branch !== options.initialSource.branch) {
		return verificationFailure(
			options,
			"branch-drift",
			`Current branch changed from ${options.initialSource.branch} to ${source.value.branch}.`,
		);
	}
	if (
		options.sourcePublication === "git-pushed" &&
		source.value.headSha !== options.initialSource.headSha
	) {
		return verificationFailure(
			options,
			"head-drift",
			`HEAD changed from ${options.initialSource.headSha} to ${source.value.headSha} during the exact-SHA Git push.`,
		);
	}
	if (
		options.expectedPublishedSource !== undefined &&
		(source.value.branch !== options.expectedPublishedSource.branch ||
			source.value.headSha !== options.expectedPublishedSource.headSha)
	) {
		return verificationFailure(
			options,
			"head-drift",
			"Flow's published source does not match the refreshed repository source.",
		);
	}
	const dirty = await options.gateways.git.listDirtyPaths({ cwd: options.request.cwd });
	if (dirty.ok === false) {
		return verificationFailure(options, "dirty-read-failed", dirty.error.message);
	}
	if (dirty.value.length > 0) {
		return {
			ok: false,
			outcome: {
				status: "source-publication-verification-failed",
				sourcePublication: options.sourcePublication,
				reason: "dirty-tree",
				message: "Source publication completed, but the worktree is no longer clean.",
				mutation: options.mutation,
				...(options.publicationAffectedBranches === undefined
					? {}
					: { affectedBranches: [...options.publicationAffectedBranches] }),
				dirtyPaths: [...dirty.value],
			},
		};
	}
	const preflight = await runDispatchPreflight(
		{ repoRoot: source.value.repoRoot },
		options.gateways,
	);
	if (preflight.ok === false) {
		return {
			ok: false,
			outcome: {
				status: "source-publication-verification-failed",
				sourcePublication: options.sourcePublication,
				reason: "preflight-failed",
				message: "Source publication completed, but the second dispatch preflight failed.",
				mutation: options.mutation,
				...(options.publicationAffectedBranches === undefined
					? {}
					: { affectedBranches: [...options.publicationAffectedBranches] }),
				checks: preflight.checks,
			},
		};
	}
	const remote = await options.gateways.git.readRemoteBranchTip({
		cwd: options.request.cwd,
		branch: source.value.branch,
	});
	if (remote.type === "error") {
		return verificationFailure(options, "remote-tip-read-failed", remote.error.message);
	}
	if (remote.type === "missing" || remote.sha !== source.value.headSha) {
		return verificationFailure(
			options,
			"remote-tip-mismatch",
			remote.type === "missing"
				? `Remote branch ${source.value.branch} is missing after source publication.`
				: `Remote branch ${source.value.branch} is at ${remote.sha}, expected ${source.value.headSha}.`,
		);
	}
	return { ok: true, source: source.value, preflight };
}

function verificationFailure(
	options: {
		readonly sourcePublication: Exclude<DispatchSourcePublication, "already-current">;
		readonly mutation: DispatchSourcePublicationMutationEvidence;
		readonly publicationAffectedBranches?: readonly string[];
	},
	reason: Extract<
		DispatchPromptOutcome,
		{ readonly status: "source-publication-verification-failed" }
	>["reason"],
	message: string,
) {
	return {
		ok: false as const,
		outcome: {
			status: "source-publication-verification-failed" as const,
			sourcePublication: options.sourcePublication,
			reason,
			message,
			mutation: options.mutation,
			...(options.publicationAffectedBranches === undefined
				? {}
				: { affectedBranches: [...options.publicationAffectedBranches] }),
		},
	};
}
