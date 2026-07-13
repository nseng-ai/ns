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
import { isValidDispatchRunId } from "../../dispatch/run-id-stamp.ts";
import { buildAnchorBranchName, buildAnchorPrBody, buildAnchorPrTitle } from "./content.ts";
import type { DispatchPromptGateways } from "./contracts.ts";

export const DISPATCH_SETTINGS_FILE_NAME = "ns.toml";

/** One credentials-preflight check: named, actionable, value-free. */
export interface DispatchPreflightCheck {
	readonly id: "dispatch-config" | "development-oidc-token" | "trigger-identity";
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
	readonly config: DispatchProjectConfig;
	readonly deploymentUrl: string;
	readonly oidcToken: string;
}

export type DispatchPreflightResult = DispatchPreflightSuccess | DispatchPreflightFailure;

/**
 * The credentials preflight (closes the credentials row's remaining
 * item): required `[dispatch]` configuration present and valid, the
 * Development OIDC token present by name, and a read-only authenticated
 * reachability check against the deployable's run-status route. Failures
 * are actionable categories; no secret value is read into any detail.
 */
export async function runDispatchPreflight(
	options: { readonly repoRoot: string },
	gateways: Pick<DispatchPromptGateways, "config" | "tokens" | "trigger">,
): Promise<DispatchPreflightResult> {
	const checks: DispatchPreflightCheck[] = [];

	const configCheck = await readDispatchConfig(options.repoRoot, gateways);
	checks.push(configCheck.check);

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

	if (configCheck.config === undefined || tokenResult.type !== "found") {
		checks.push({
			id: "trigger-identity",
			status: "failed",
			detail: "Skipped: requires the [dispatch] configuration and the Development OIDC token.",
		});
		return { ok: false, checks };
	}

	const deploymentUrl = configCheck.config.deploymentUrl;
	if (deploymentUrl === undefined) {
		// Unreachable when configCheck succeeded (the config check requires
		// deployment_url), but keeps the narrowing honest.
		return { ok: false, checks };
	}

	const identity = await gateways.trigger.checkTriggerIdentity({
		deploymentUrl,
		oidcToken: tokenResult.token,
	});
	const identityCheck = triggerIdentityCheck(identity);
	checks.push(identityCheck);
	if (identityCheck.status === "failed") return { ok: false, checks };

	return {
		ok: true,
		checks,
		config: configCheck.config,
		deploymentUrl,
		oidcToken: tokenResult.token,
	};
}

async function readDispatchConfig(
	repoRoot: string,
	gateways: Pick<DispatchPromptGateways, "config">,
): Promise<{ readonly check: DispatchPreflightCheck; readonly config?: DispatchProjectConfig }> {
	const source = await gateways.config.readDispatchSettingsSource({ repoRoot });
	if (source.type === "missing") {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `No ${DISPATCH_SETTINGS_FILE_NAME} at the repository root; dispatch needs its [dispatch] table (see the dispatch README's Setup section).`,
			},
		};
	}
	if (source.type === "error") {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `Reading ${DISPATCH_SETTINGS_FILE_NAME} failed: ${source.message}`,
			},
		};
	}
	const parsed = parseDispatchProjectConfigToml(source.source, DISPATCH_SETTINGS_FILE_NAME);
	if (!parsed.ok) {
		return {
			check: { id: "dispatch-config", status: "failed", detail: parsed.error.message },
		};
	}
	if (parsed.value.deploymentUrl === undefined) {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `${DISPATCH_SETTINGS_FILE_NAME}: [dispatch] has no deployment_url; set it to the dispatch deployable's stable HTTPS URL (see the dispatch README's Setup section).`,
			},
		};
	}
	return {
		check: {
			id: "dispatch-config",
			status: "ok",
			detail: "[dispatch] configuration is present and valid.",
		},
		config: parsed.value,
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
}

/** The core's outcome union; the command handler maps it to exit shapes. */
export type DispatchPromptOutcome =
	| {
			readonly status: "dispatched";
			readonly revision: string;
			readonly sourceBranch: string;
			readonly sourcePushed: boolean;
			readonly anchorBranch: string;
			readonly anchorPrNumber: number;
			readonly anchorPrUrl: string;
			readonly runId: string;
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
			readonly anchorBranch: string;
			readonly anchorPrNumber: number;
			readonly anchorPrUrl: string;
	  }
	| {
			readonly status: "run-id-stamp-failed";
			readonly message: string;
			readonly anchorBranch: string;
			readonly anchorPrNumber: number;
			readonly anchorPrUrl: string;
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
	const sourceRef = await gateways.git.resolveSourceRef({ cwd: request.cwd });
	if (!sourceRef.ok) {
		return {
			status: "source-unusable",
			code: sourceRef.error.code,
			message: sourceRef.error.message,
		};
	}
	const { repoRoot, branch, headSha } = sourceRef.value;

	const dirty = await gateways.git.listDirtyPaths({ cwd: request.cwd });
	if (!dirty.ok) {
		return { status: "source-unusable", code: "git-read-failed", message: dirty.error.message };
	}
	if (dirty.value.length > 0) {
		return { status: "dirty-tree", dirtyPaths: dirty.value };
	}

	const preflight = await runDispatchPreflight({ repoRoot }, gateways);
	if (!preflight.ok) {
		return { status: "preflight-failed", checks: preflight.checks };
	}

	// Push-first: the sandbox clones the exact dispatched SHA from the
	// remote, so the head must be remotely reachable before anything is
	// submitted (README "What the remote agent sees").
	const remoteTip = await gateways.git.readRemoteBranchTip({ cwd: request.cwd, branch });
	if (remoteTip.type === "error") {
		return { status: "source-unusable", code: "git-read-failed", message: remoteTip.error.message };
	}
	let sourcePushed = false;
	if (remoteTip.type === "missing" || remoteTip.sha !== headSha) {
		const push = await gateways.git.pushSourceBranch({ cwd: request.cwd, branch });
		if (!push.ok) {
			return { status: "source-push-failed", sourceBranch: branch, message: push.error.message };
		}
		sourcePushed = true;
	}

	const anchorBranch = buildAnchorBranchName(branch, gateways.generateAnchorId());

	const anchorPush = await gateways.git.pushAnchorBranch({
		cwd: request.cwd,
		revision: headSha,
		anchorBranch,
	});
	if (!anchorPush.ok) {
		return { status: "anchor-push-failed", anchorBranch, message: anchorPush.error.message };
	}

	const pr = await gateways.anchorPrs.openAnchorPr({
		cwd: request.cwd,
		anchorBranch,
		baseBranch: branch,
		title: buildAnchorPrTitle(request.prompt),
		body: buildAnchorPrBody({ prompt: request.prompt, revision: headSha, sourceBranch: branch }),
	});
	if (!pr.ok) {
		return { status: "anchor-pr-failed", anchorBranch, message: pr.error.message };
	}
	const anchor = {
		anchorBranch,
		anchorPrNumber: pr.value.number,
		anchorPrUrl: pr.value.url,
	};

	// Defensive re-check of the run-input contract the trigger route
	// enforces on the wire; a violation here is reported on the already-open
	// anchor rather than sent to be rejected remotely.
	const runInput = validateDispatchRunInput({
		revision: headSha,
		anchorBranch,
		anchorPrNumber: pr.value.number,
		prompt: request.prompt,
	});
	if (!runInput.ok) {
		return {
			status: "trigger-failed",
			code: "invalid-request",
			message: runInput.message,
			...anchor,
		};
	}

	const started = await gateways.trigger.startDispatchRun({
		deploymentUrl: preflight.deploymentUrl,
		oidcToken: preflight.oidcToken,
		input: runInput.value,
	});
	if (!started.ok) {
		return {
			status: "trigger-failed",
			code: started.error.code,
			message: started.error.message,
			...anchor,
		};
	}
	const runId = started.value.runId;

	if (!isValidDispatchRunId(runId)) {
		return {
			status: "run-id-stamp-failed",
			message: "The trigger route returned a run id that cannot be stamped safely.",
			...anchor,
		};
	}
	const stamp = await gateways.anchorPrs.stampAnchorPrRunId({
		cwd: request.cwd,
		prNumber: pr.value.number,
		runId,
	});
	if (!stamp.ok) {
		return { status: "run-id-stamp-failed", message: stamp.error.message, ...anchor, runId };
	}

	return {
		status: "dispatched",
		revision: runInput.value.revision,
		sourceBranch: branch,
		sourcePushed,
		...anchor,
		runId,
	};
}
