// The `ns dispatch prompt` command core (steel-thread sub-slice 3): pure
// orchestration over the gateway seams in `contracts.ts`. Order of
// operations mirrors the README's contract — local git refusals first
// (clean-tree rule with the dirty-file list), then the credentials
// preflight (README "Setup": report exactly what is missing before any
// remote work starts), then semantic timestamped anchor-name selection,
// push-first freshness, the up-front `dispatch/` anchor branch and PR on the user's own credentials, the
// authenticated trigger call, and the run-id stamp on the anchor PR.
// Live behavior against the deployed trigger route is pending
// verification; tests drive this core with in-memory fakes.
import {
	parseDispatchProjectConfigToml,
	type DispatchProjectConfig,
} from "../../api/project-config.ts";
import {
	DISPATCH_PACKAGE_MANAGER_FIELD,
	DISPATCH_PACKAGE_MANIFEST_PATH,
	DISPATCH_SETTINGS_PATH,
	parseDispatchPackageManagerSource,
} from "../../dispatch/harness-registry.ts";
import {
	buildDispatchAnchorNameCandidates,
	DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT,
	formatDispatchAnchorTimestamp,
} from "./anchor-name.ts";
import { buildAnchorPrBody, buildAnchorPrTitle } from "./content.ts";
import { normalizeDispatchSlugOverride } from "./content-slug.ts";
import type {
	DispatchPromptGateways,
	DispatchTriggerConnection,
} from "../dispatch-client/contracts.ts";
import {
	createDispatchAnchor,
	ensureDispatchSourceReachable,
	resolveDispatchSource,
	startDispatchWorkflow,
	type DispatchAnchorPr,
} from "../dispatch-client/core.ts";

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
	readonly onPhase?: (message: string) => void;
}

export type DispatchPromptOutcome =
	| {
			readonly status: "dispatched";
			readonly revision: string;
			readonly sourceBranch: string;
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
	  }
	| {
			readonly status: "anchor-branch-unavailable";
			readonly semanticSlug: string;
			readonly candidateLimit: number;
	  }
	| {
			readonly status: "source-unusable";
			readonly code: "not-a-repository" | "detached-head" | "git-read-failed";
			readonly message: string;
	  }
	| {
			readonly status: "source-push-failed";
			readonly sourceBranch: string;
			readonly message: string;
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
	const { repoRoot, branch, headSha } = sourceResult.source;

	request.onPhase?.("Validating dispatch configuration and identity…");
	const preflight = await runDispatchPreflight({ repoRoot }, gateways);
	if (preflight.ok === false) {
		return { status: "preflight-failed", checks: preflight.checks };
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

	const timestamp = formatDispatchAnchorTimestamp(gateways.clock.nowMs(), preflight.anchorTimeZone);
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
		};
	}

	// Push-first: the sandbox clones the exact dispatched SHA from the
	// remote, so the head must be remotely reachable before anything is
	// submitted (README "What the remote agent sees").
	request.onPhase?.("Ensuring the source revision is remotely reachable…");
	const reachable = await ensureDispatchSourceReachable(
		{ cwd: request.cwd, branch, headSha },
		gateways,
	);
	if (reachable.status !== "ready") return reachable;
	const { isSourcePushed } = reachable;

	request.onPhase?.("Creating the anchor branch and pull request…");
	const anchor = await createDispatchAnchor(
		{
			cwd: request.cwd,
			revision: headSha,
			anchorBranch,
			baseBranch: branch,
			title: buildAnchorPrTitle(request.prompt),
			body: buildAnchorPrBody({
				prompt: request.prompt,
				revision: headSha,
				sourceBranch: branch,
			}),
		},
		gateways,
	);
	if (anchor.status !== "ready") return anchor;

	const workflow = await startDispatchWorkflow(
		{
			cwd: request.cwd,
			input: {
				revision: headSha,
				anchorBranch: anchor.anchorPr.branch,
				anchorPrNumber: anchor.anchorPr.number,
				prompt: request.prompt,
			},
			anchorPr: anchor.anchorPr,
			connection: preflight.triggerConnection,
			workflowDashboardUrl: preflight.workflowDashboardUrl,
			...(request.onPhase === undefined ? {} : { onPhase: request.onPhase }),
		},
		gateways,
	);
	if (workflow.status !== "ready") return workflow;

	return {
		status: "dispatched",
		revision: workflow.runInput.revision,
		sourceBranch: branch,
		isSourcePushed,
		anchorPr: anchor.anchorPr,
		runId: workflow.runId,
		workflowRunUrl: workflow.workflowRunUrl,
	};
}
