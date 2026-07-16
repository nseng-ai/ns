// The `ns dispatch prompt` command core (steel-thread sub-slice 3): pure
// orchestration over the gateway seams in `contracts.ts`. Order of
// operations mirrors the README's contract — local git refusals first
// (clean-tree rule with the dirty-file list), then the credentials
// preflight (README "Setup": report exactly what is missing before any
// remote work starts), then push-first freshness, the up-front
// `dispatch/` anchor branch and PR on the user's own credentials, the
// authenticated trigger call, and the run-id stamp on the anchor PR.
// Live behavior against the deployed trigger route is pending
// verification; tests drive this core with in-memory fakes.
import {
	parseDispatchProjectConfigToml,
	type DispatchProjectConfig,
} from "../../api/project-config.ts";
import { validateDispatchRunInput } from "../../dispatch/dispatch-run.ts";
import {
	DISPATCH_PACKAGE_MANAGER_FIELD,
	DISPATCH_PACKAGE_MANIFEST_PATH,
	DISPATCH_SETTINGS_PATH,
	parseDispatchPackageManagerSource,
} from "../../dispatch/harness-registry.ts";
import { isValidDispatchRunId } from "../../dispatch/run-id-stamp.ts";
import { preflightDispatchBrmemSetup } from "../dispatch-plan/delivery-preflight.ts";
import {
	deliverPreparedDispatchPlanAfterPreflight,
	type DispatchPlanDeliveryOutcome,
} from "../dispatch-plan/delivery.ts";
import { prepareDispatchPlan } from "../dispatch-plan/preparation.ts";
import {
	buildAnchorBranchName,
	buildAnchorPrBody,
	buildAnchorPrTitle,
	buildPlanAnchorPrBody,
} from "./content.ts";
import type {
	DispatchPlanGateways,
	DispatchPromptGateways,
	DispatchTriggerConnection,
} from "./contracts.ts";

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

	return { ok: true, checks, deploymentUrl, workflowDashboardUrl, triggerConnection };
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

export interface DispatchPlanRequest {
	readonly cwd: string;
	readonly planRef: string;
	readonly onPhase?: (message: string) => void;
}

export interface DispatchPromptRequest {
	readonly cwd: string;
	readonly prompt: string;
	readonly onPhase?: (message: string) => void;
}

export interface DispatchAnchorPr {
	readonly branch: string;
	readonly number: number;
	readonly url: string;
}

/** The core's outcome union; the command handler maps it to exit shapes. */
export type DispatchPlanOutcome =
	| {
			readonly status: "dispatched";
			readonly dispatchId: string;
			readonly revision: string;
			readonly sourceBranch: string;
			readonly isSourcePushed: boolean;
			readonly locator: Extract<
				DispatchPlanDeliveryOutcome,
				{ readonly status: "ready" }
			>["locator"];
			readonly anchorPr: DispatchAnchorPr;
			readonly runId: string;
			readonly workflowRunUrl: string;
	  }
	| Exclude<DispatchPlanDeliveryOutcome, { readonly status: "ready" }>
	| Exclude<DispatchPromptOutcome, { readonly status: "dispatched" }>;

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

/** Execute one Saved Plan dispatch through the prompt command's shared local spine. */
export async function executeDispatchPlan(
	request: DispatchPlanRequest,
	gateways: DispatchPlanGateways,
): Promise<DispatchPlanOutcome> {
	request.onPhase?.("Checking the source branch and worktree…");
	const sourceRef = await gateways.git.resolveSourceRef({ cwd: request.cwd });
	if (sourceRef.ok === false) {
		return {
			status: "source-unusable",
			code: sourceRef.error.code,
			message: sourceRef.error.message,
		};
	}
	const { repoRoot, branch, headSha } = sourceRef.value;
	const dirty = await gateways.git.listDirtyPaths({ cwd: request.cwd });
	if (dirty.ok === false) {
		return { status: "source-unusable", code: "git-read-failed", message: dirty.error.message };
	}
	if (dirty.value.length > 0) return { status: "dirty-tree", dirtyPaths: dirty.value };

	request.onPhase?.("Validating dispatch configuration and identity…");
	const preflight = await runDispatchPreflight({ repoRoot }, gateways);
	if (preflight.ok === false) return { status: "preflight-failed", checks: preflight.checks };

	// Preparation creates dispatch identity and resolves the exact plan before
	// the first external mutation, so every later artifact can be correlated
	// even across a partial failure.
	request.onPhase?.("Resolving the Saved Plan…");
	const preparation = await prepareDispatchPlan(request, gateways);
	if (preparation.status !== "ready") return preparation;
	const brmemPreflight = await preflightDispatchBrmemSetup(gateways.brmem);
	if (brmemPreflight.status !== "ready") {
		return {
			...brmemPreflight,
			dispatchId: preparation.dispatchId,
			artifacts: [],
		};
	}

	request.onPhase?.("Ensuring the source revision is remotely reachable…");
	const remoteTip = await gateways.git.readRemoteBranchTip({ cwd: request.cwd, branch });
	if (remoteTip.type === "error") {
		return { status: "source-unusable", code: "git-read-failed", message: remoteTip.error.message };
	}
	let isSourcePushed = false;
	if (remoteTip.type === "missing" || remoteTip.sha !== headSha) {
		const push = await gateways.git.pushSourceBranch({ cwd: request.cwd, branch });
		if (push.ok === false) {
			return { status: "source-push-failed", sourceBranch: branch, message: push.error.message };
		}
		isSourcePushed = true;
	}

	request.onPhase?.("Delivering the Saved Plan through Branch Memory…");
	const delivery = await deliverPreparedDispatchPlanAfterPreflight(
		request,
		preparation,
		gateways,
		brmemPreflight.remote,
	);
	if (delivery.status !== "ready") return delivery;

	request.onPhase?.("Creating the anchor branch and pull request…");
	const anchorBranch = buildAnchorBranchName(branch, delivery.dispatchId);
	const anchorPush = await gateways.git.pushAnchorBranch({
		cwd: request.cwd,
		revision: headSha,
		anchorBranch,
	});
	if (anchorPush.ok === false) {
		return { status: "anchor-push-failed", anchorBranch, message: anchorPush.error.message };
	}
	const pr = await gateways.anchorPrs.openAnchorPr({
		cwd: request.cwd,
		anchorBranch,
		baseBranch: branch,
		title: buildAnchorPrTitle(`Execute Saved Plan: ${request.planRef}`),
		body: buildPlanAnchorPrBody({
			planRef: request.planRef,
			revision: headSha,
			locator: delivery.locator,
		}),
	});
	if (pr.ok === false) {
		return { status: "anchor-pr-failed", anchorBranch, message: pr.error.message };
	}
	const anchorPr: DispatchAnchorPr = {
		branch: anchorBranch,
		number: pr.value.number,
		url: pr.value.url,
	};
	const runInput = validateDispatchRunInput({
		revision: headSha,
		anchorBranch,
		anchorPrNumber: anchorPr.number,
		dispatchId: delivery.dispatchId,
		contextLocator: delivery.locator,
	});
	if (runInput.ok === false) {
		return {
			status: "trigger-failed",
			code: "invalid-request",
			message: runInput.message,
			anchorPr,
		};
	}

	request.onPhase?.("Starting the remote workflow…");
	const started = await gateways.trigger.startDispatchRun({
		connection: preflight.triggerConnection,
		input: runInput.value,
	});
	if (started.ok === false) {
		return {
			status: "trigger-failed",
			code: started.error.code,
			message: started.error.message,
			anchorPr,
		};
	}
	const runId = started.value.runId;
	if (!isValidDispatchRunId(runId)) {
		return {
			status: "run-id-stamp-failed",
			message: "The trigger route returned a run id that cannot be stamped safely.",
			anchorPr,
		};
	}
	request.onPhase?.("Recording the workflow run on the anchor PR…");
	const stamp = await gateways.anchorPrs.stampAnchorPrRunId({
		cwd: request.cwd,
		prNumber: anchorPr.number,
		runId,
	});
	if (stamp.ok === false) {
		return { status: "run-id-stamp-failed", message: stamp.error.message, anchorPr, runId };
	}

	return {
		status: "dispatched",
		dispatchId: delivery.dispatchId,
		revision: runInput.value.revision,
		sourceBranch: branch,
		isSourcePushed,
		locator: delivery.locator,
		anchorPr,
		runId,
		workflowRunUrl: buildWorkflowRunUrl(preflight.workflowDashboardUrl, runId),
	};
}

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
	const sourceRef = await gateways.git.resolveSourceRef({ cwd: request.cwd });
	if (sourceRef.ok === false) {
		return {
			status: "source-unusable",
			code: sourceRef.error.code,
			message: sourceRef.error.message,
		};
	}
	const { repoRoot, branch, headSha } = sourceRef.value;

	const dirty = await gateways.git.listDirtyPaths({ cwd: request.cwd });
	if (dirty.ok === false) {
		return { status: "source-unusable", code: "git-read-failed", message: dirty.error.message };
	}
	if (dirty.value.length > 0) {
		return { status: "dirty-tree", dirtyPaths: dirty.value };
	}

	request.onPhase?.("Validating dispatch configuration and identity…");
	const preflight = await runDispatchPreflight({ repoRoot }, gateways);
	if (preflight.ok === false) {
		return { status: "preflight-failed", checks: preflight.checks };
	}

	// Push-first: the sandbox clones the exact dispatched SHA from the
	// remote, so the head must be remotely reachable before anything is
	// submitted (README "What the remote agent sees").
	request.onPhase?.("Ensuring the source revision is remotely reachable…");
	const remoteTip = await gateways.git.readRemoteBranchTip({ cwd: request.cwd, branch });
	if (remoteTip.type === "error") {
		return { status: "source-unusable", code: "git-read-failed", message: remoteTip.error.message };
	}
	let isSourcePushed = false;
	if (remoteTip.type === "missing" || remoteTip.sha !== headSha) {
		const push = await gateways.git.pushSourceBranch({ cwd: request.cwd, branch });
		if (push.ok === false) {
			return { status: "source-push-failed", sourceBranch: branch, message: push.error.message };
		}
		isSourcePushed = true;
	}

	request.onPhase?.("Creating the anchor branch and pull request…");
	const anchorBranch = buildAnchorBranchName(branch, gateways.generateAnchorId());

	const anchorPush = await gateways.git.pushAnchorBranch({
		cwd: request.cwd,
		revision: headSha,
		anchorBranch,
	});
	if (anchorPush.ok === false) {
		return { status: "anchor-push-failed", anchorBranch, message: anchorPush.error.message };
	}

	const pr = await gateways.anchorPrs.openAnchorPr({
		cwd: request.cwd,
		anchorBranch,
		baseBranch: branch,
		title: buildAnchorPrTitle(request.prompt),
		body: buildAnchorPrBody({ prompt: request.prompt, revision: headSha, sourceBranch: branch }),
	});
	if (pr.ok === false) {
		return { status: "anchor-pr-failed", anchorBranch, message: pr.error.message };
	}
	const anchorPr: DispatchAnchorPr = {
		branch: anchorBranch,
		number: pr.value.number,
		url: pr.value.url,
	};

	// Defensive re-check of the run-input contract the trigger route
	// enforces on the wire; a violation here is reported on the already-open
	// anchor rather than sent to be rejected remotely.
	const runInput = validateDispatchRunInput({
		revision: headSha,
		anchorBranch: anchorPr.branch,
		anchorPrNumber: anchorPr.number,
		prompt: request.prompt,
	});
	if (runInput.ok === false) {
		return {
			status: "trigger-failed",
			code: "invalid-request",
			message: runInput.message,
			anchorPr,
		};
	}

	request.onPhase?.("Starting the remote workflow…");
	const started = await gateways.trigger.startDispatchRun({
		connection: preflight.triggerConnection,
		input: runInput.value,
	});
	if (started.ok === false) {
		return {
			status: "trigger-failed",
			code: started.error.code,
			message: started.error.message,
			anchorPr,
		};
	}
	const runId = started.value.runId;

	if (!isValidDispatchRunId(runId)) {
		return {
			status: "run-id-stamp-failed",
			message: "The trigger route returned a run id that cannot be stamped safely.",
			anchorPr,
		};
	}
	request.onPhase?.("Recording the workflow run on the anchor PR…");
	const stamp = await gateways.anchorPrs.stampAnchorPrRunId({
		cwd: request.cwd,
		prNumber: anchorPr.number,
		runId,
	});
	if (stamp.ok === false) {
		return { status: "run-id-stamp-failed", message: stamp.error.message, anchorPr, runId };
	}

	return {
		status: "dispatched",
		revision: runInput.value.revision,
		sourceBranch: branch,
		isSourcePushed,
		anchorPr,
		runId,
		workflowRunUrl: buildWorkflowRunUrl(preflight.workflowDashboardUrl, runId),
	};
}

function buildWorkflowRunUrl(workflowDashboardUrl: string, runId: string): string {
	const base = workflowDashboardUrl.replace(/\/$/, "");
	return `${base}/runs/${encodeURIComponent(runId)}?environment=production`;
}
