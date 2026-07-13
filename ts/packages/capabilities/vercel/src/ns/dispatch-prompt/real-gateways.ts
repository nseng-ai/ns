// Real adapters for the `ns dispatch prompt` gateway seams: git and gh on
// the user's own machine and credentials, the authenticated HTTPS
// trigger/observe calls, the local Development-OIDC token source, and the
// repo-root `ns.toml` read. Wire parsing lives in exported pure helpers
// so the protocol details are unit-testable without subprocesses. Live
// behavior against the deployed trigger route is pending verification.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { runGitHubCliAsExecResult } from "@nseng-ai/capability-kit/github/cli";
import {
	commandSucceeded,
	type CommandRunner,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { DISPATCH_SETTINGS_FILE_NAME } from "./core.ts";
import { composeAnchorPrDescriptionWithRunIdStamp } from "../../dispatch/run-id-stamp.ts";
import type {
	DispatchAnchorPrGateway,
	DispatchConfigGateway,
	DispatchGatewayError,
	DispatchLocalTokenGateway,
	DispatchStartRunResult,
	DispatchTriggerGateway,
	DispatchTriggerIdentityResult,
	DispatchWorkspaceGitGateway,
} from "./contracts.ts";

const GIT_READ_TIMEOUT_MS = 30_000;
const GIT_PUSH_TIMEOUT_MS = 120_000;
const GH_TIMEOUT_MS = 60_000;
const DISPATCH_REMOTE_NAME = "origin";

/** The caller-owned auth header the deployable's routes verify. */
export const DISPATCH_OIDC_HEADER_NAME = "x-ns-dispatch-oidc-token";

/** The env name `vercel env pull` writes the Development token under. */
export const DISPATCH_OIDC_TOKEN_ENV_NAME = "VERCEL_OIDC_TOKEN";

/** Run id used by the read-only identity preflight; can never exist. */
const IDENTITY_PREFLIGHT_RUN_ID = "ns-dispatch-identity-preflight";

export function createRealDispatchWorkspaceGitGateway(
	runner: CommandRunner,
): DispatchWorkspaceGitGateway {
	async function git(args: readonly string[], cwd: string, timeoutMs: number) {
		return await runner("git", args, { cwd, timeout: timeoutMs });
	}
	return {
		async resolveSourceRef({ cwd }) {
			const repoRoot = await git(["rev-parse", "--show-toplevel"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(repoRoot)) {
				return {
					ok: false,
					error: {
						code: "not-a-repository",
						message: `Not inside a git repository: ${firstErrorLine(repoRoot)}`,
					},
				};
			}
			const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(branch)) {
				return {
					ok: false,
					error: {
						code: "git-read-failed",
						message: `Could not resolve the current branch: ${firstErrorLine(branch)}`,
					},
				};
			}
			const branchName = branch.stdout.trim();
			if (branchName === "HEAD") {
				return {
					ok: false,
					error: {
						code: "detached-head",
						message:
							"HEAD is detached; dispatch sends your current branch's head, so check out a branch first.",
					},
				};
			}
			const head = await git(["rev-parse", "HEAD"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(head)) {
				return {
					ok: false,
					error: {
						code: "git-read-failed",
						message: `Could not resolve HEAD: ${firstErrorLine(head)}`,
					},
				};
			}
			return {
				ok: true,
				value: {
					repoRoot: repoRoot.stdout.trim(),
					branch: branchName,
					headSha: head.stdout.trim().toLowerCase(),
				},
			};
		},
		async listDirtyPaths({ cwd }) {
			const status = await git(["status", "--porcelain"], cwd, GIT_READ_TIMEOUT_MS);
			if (!commandSucceeded(status)) {
				return {
					ok: false,
					error: gitError("git-status-failed", "Could not inspect the worktree status", status),
				};
			}
			return { ok: true, value: parseGitPorcelainStatusPaths(status.stdout) };
		},
		async readRemoteBranchTip({ cwd, branch }) {
			const result = await git(
				["ls-remote", DISPATCH_REMOTE_NAME, `refs/heads/${branch}`],
				cwd,
				GIT_READ_TIMEOUT_MS,
			);
			if (!commandSucceeded(result)) {
				return {
					type: "error",
					error: gitError("git-ls-remote-failed", "Could not read the remote branch tip", result),
				};
			}
			const sha = parseGitLsRemoteSha(result.stdout);
			if (sha === null) return { type: "missing" };
			return { type: "found", sha };
		},
		async pushSourceBranch({ cwd, branch }) {
			const result = await git(
				["push", DISPATCH_REMOTE_NAME, `${branch}:refs/heads/${branch}`],
				cwd,
				GIT_PUSH_TIMEOUT_MS,
			);
			if (!commandSucceeded(result)) {
				return {
					ok: false,
					error: gitError("git-push-failed", `Pushing branch ${branch} failed`, result),
				};
			}
			return { ok: true };
		},
		async pushAnchorBranch({ cwd, revision, anchorBranch }) {
			const result = await git(
				["push", DISPATCH_REMOTE_NAME, `${revision}:refs/heads/${anchorBranch}`],
				cwd,
				GIT_PUSH_TIMEOUT_MS,
			);
			if (!commandSucceeded(result)) {
				return {
					ok: false,
					error: gitError(
						"git-push-failed",
						`Pushing anchor branch ${anchorBranch} failed`,
						result,
					),
				};
			}
			return { ok: true };
		},
	};
}

/**
 * Parse `git status --porcelain` output into the dirty path list. Rename
 * lines keep their `old -> new` rendering so the refusal names both
 * sides.
 */
export function parseGitPorcelainStatusPaths(stdout: string): readonly string[] {
	return stdout
		.split("\n")
		.filter((line) => line.length > 3)
		.map((line) => line.slice(3));
}

/** Parse the SHA out of `git ls-remote` output; `null` when absent. */
export function parseGitLsRemoteSha(stdout: string): string | null {
	const match = /^([0-9a-fA-F]{40})\t/.exec(stdout.trim());
	if (match === null || match[1] === undefined) return null;
	return match[1].toLowerCase();
}

const ghPrViewBodySchema = z.object({ body: z.string().nullable() });

export function createRealDispatchAnchorPrGateway(runner: CommandRunner): DispatchAnchorPrGateway {
	async function gh(args: readonly string[], cwd: string): Promise<ExecResult> {
		return await runGitHubCliAsExecResult({ runner, args, cwd, timeoutMs: GH_TIMEOUT_MS });
	}
	return {
		async openAnchorPr({ cwd, anchorBranch, baseBranch, title, body }) {
			const result = await gh(
				[
					"pr",
					"create",
					"--head",
					anchorBranch,
					"--base",
					baseBranch,
					"--title",
					title,
					"--body",
					body,
				],
				cwd,
			);
			if (!commandSucceeded(result)) {
				return {
					ok: false,
					error: gitError("gh-pr-create-failed", "Opening the anchor PR failed", result),
				};
			}
			const parsed = parseGhPrCreateUrl(result.stdout);
			if (parsed === null) {
				return {
					ok: false,
					error: {
						code: "gh-pr-create-unparsable",
						message: "gh pr create succeeded but printed no recognizable PR URL.",
					},
				};
			}
			return { ok: true, value: parsed };
		},
		async stampAnchorPrRunId({ cwd, prNumber, runId }) {
			const view = await gh(["pr", "view", String(prNumber), "--json", "body"], cwd);
			if (!commandSucceeded(view)) {
				return {
					ok: false,
					error: gitError("gh-pr-view-failed", "Reading the anchor PR body failed", view),
				};
			}
			let existingBody: string | null;
			try {
				existingBody = ghPrViewBodySchema.parse(JSON.parse(view.stdout)).body;
			} catch {
				return {
					ok: false,
					error: {
						code: "gh-pr-view-unparsable",
						message: "gh pr view returned an unrecognizable body payload.",
					},
				};
			}
			const nextBody = composeAnchorPrDescriptionWithRunIdStamp(existingBody, runId);
			const edit = await gh(["pr", "edit", String(prNumber), "--body", nextBody], cwd);
			if (!commandSucceeded(edit)) {
				return {
					ok: false,
					error: gitError("gh-pr-edit-failed", "Stamping the run id on the anchor PR failed", edit),
				};
			}
			return { ok: true };
		},
	};
}

/** Parse the PR URL + number printed by `gh pr create`. */
export function parseGhPrCreateUrl(
	stdout: string,
): { readonly number: number; readonly url: string } | null {
	for (const line of stdout
		.split("\n")
		.map((entry) => entry.trim())
		.reverse()) {
		const match = /^(https:\/\/[^\s]+\/pull\/(\d+))$/.exec(line);
		if (match !== null && match[1] !== undefined && match[2] !== undefined) {
			const number = Number.parseInt(match[2], 10);
			if (Number.isInteger(number) && number > 0) return { number, url: match[1] };
		}
	}
	return null;
}

const triggerSuccessSchema = z.object({ runId: z.string().min(1) });
const triggerErrorSchema = z.object({
	error: z.object({ code: z.string(), message: z.string() }),
});

export function createRealDispatchTriggerGateway(
	fetchFn: typeof fetch = fetch,
): DispatchTriggerGateway {
	return {
		async checkTriggerIdentity({ deploymentUrl, oidcToken }) {
			let response: Response;
			try {
				const url = new URL("/api/runs", deploymentUrl);
				url.searchParams.set("runId", IDENTITY_PREFLIGHT_RUN_ID);
				response = await fetchFn(url, {
					method: "GET",
					headers: { [DISPATCH_OIDC_HEADER_NAME]: oidcToken },
				});
			} catch (error) {
				return { type: "unreachable", message: formatErrorMessage(error) };
			}
			return identityResultFromStatus(response.status);
		},
		async startDispatchRun({ deploymentUrl, oidcToken, input }) {
			let response: Response;
			try {
				response = await fetchFn(new URL("/api/trigger", deploymentUrl), {
					method: "POST",
					headers: {
						"content-type": "application/json",
						[DISPATCH_OIDC_HEADER_NAME]: oidcToken,
					},
					body: JSON.stringify({ workflow: "dispatch", ...input }),
				});
			} catch (error) {
				return {
					ok: false,
					error: { code: "unreachable", message: formatErrorMessage(error) },
				};
			}
			return await startRunResultFromResponse(response);
		},
	};
}

function identityResultFromStatus(status: number): DispatchTriggerIdentityResult {
	// 404 run-not-found is this preflight's success signal: the route is
	// reachable and the caller's identity was accepted before the lookup.
	if (status === 404) return { type: "authorized" };
	if (status === 401) return { type: "unauthorized" };
	if (status === 403) return { type: "forbidden" };
	if (status === 500) return { type: "endpoint-misconfigured" };
	return { type: "unexpected-response", status };
}

async function startRunResultFromResponse(response: Response): Promise<DispatchStartRunResult> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		payload = undefined;
	}
	if (response.status === 200) {
		const parsed = triggerSuccessSchema.safeParse(payload);
		if (!parsed.success) {
			return {
				ok: false,
				error: {
					code: "unexpected-response",
					message: "The trigger route answered 200 without a run id.",
				},
			};
		}
		return { ok: true, value: { runId: parsed.data.runId } };
	}
	const parsedError = triggerErrorSchema.safeParse(payload);
	const remoteMessage = parsedError.success
		? `${parsedError.data.error.code}: ${parsedError.data.error.message}`
		: `status ${response.status}`;
	return {
		ok: false,
		error: {
			code: startRunErrorCodeFromStatus(response.status),
			message: `The trigger route refused the dispatch (${remoteMessage}).`,
		},
	};
}

function startRunErrorCodeFromStatus(
	status: number,
): Extract<DispatchStartRunResult, { ok: false }>["error"]["code"] {
	if (status === 400) return "invalid-request";
	if (status === 401) return "unauthorized";
	if (status === 403) return "forbidden";
	if (status === 500) return "endpoint-misconfigured";
	if (status === 502) return "workflow-start-failed";
	return "unexpected-response";
}

export interface RealDispatchLocalTokenGatewayOptions {
	readonly env: Readonly<Record<string, string | undefined>>;
	/**
	 * The deployable package's `.env.local` (the proven `vercel env pull`
	 * location). Defaults to this package's own root, which is the linked
	 * Vercel project directory.
	 */
	readonly envLocalPath?: string;
}

const PACKAGE_ENV_LOCAL_URL = new URL("../../../.env.local", import.meta.url);

export function createRealDispatchLocalTokenGateway(
	options: RealDispatchLocalTokenGatewayOptions,
): DispatchLocalTokenGateway {
	return {
		async readDevelopmentOidcToken() {
			const fromEnv = options.env[DISPATCH_OIDC_TOKEN_ENV_NAME];
			if (fromEnv !== undefined && fromEnv.length > 0) {
				return { type: "found", token: fromEnv };
			}
			const envLocalPath = options.envLocalPath ?? PACKAGE_ENV_LOCAL_URL.pathname;
			let content: string;
			try {
				content = await readFile(envLocalPath, "utf8");
			} catch (error) {
				if (errorCodeFromUnknown(error) === "ENOENT") {
					return { type: "missing", detail: missingTokenDetail(envLocalPath) };
				}
				return { type: "error", message: formatErrorMessage(error) };
			}
			const token = parseEnvFileValue(content, DISPATCH_OIDC_TOKEN_ENV_NAME);
			if (token === null || token.length === 0) {
				return { type: "missing", detail: missingTokenDetail(envLocalPath) };
			}
			return { type: "found", token };
		},
	};
}

function missingTokenDetail(envLocalPath: string): string {
	return (
		`${DISPATCH_OIDC_TOKEN_ENV_NAME} is not available (checked the process environment and ${envLocalPath}). ` +
		"Run `vercel env pull .env.local --environment=development` from the dispatch package directory."
	);
}

/**
 * Minimal `.env.local` value lookup for one known key: `KEY=value` or
 * `KEY="value"` lines as `vercel env pull` writes them. Only the named
 * key's value is ever extracted.
 */
export function parseEnvFileValue(content: string, name: string): string | null {
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith(`${name}=`)) continue;
		const raw = trimmed.slice(name.length + 1);
		if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
			return raw.slice(1, -1);
		}
		return raw;
	}
	return null;
}

export function createRealDispatchConfigGateway(): DispatchConfigGateway {
	return {
		async readDispatchSettingsSource({ repoRoot }) {
			try {
				return {
					type: "found",
					source: await readFile(join(repoRoot, DISPATCH_SETTINGS_FILE_NAME), "utf8"),
				};
			} catch (error) {
				if (errorCodeFromUnknown(error) === "ENOENT") return { type: "missing" };
				return { type: "error", message: formatErrorMessage(error) };
			}
		},
	};
}

/** Eight hex characters of randomness for anchor branch uniqueness. */
export function generateRealAnchorId(): string {
	return randomBytes(4).toString("hex");
}

function gitError(code: string, prefix: string, result: ExecResult): DispatchGatewayError {
	return { code, message: `${prefix}: ${firstErrorLine(result)}` };
}

function firstErrorLine(result: ExecResult): string {
	const text = (result.stderr.trim() || result.stdout.trim()).split("\n")[0] ?? "";
	if (text.length > 0) return text;
	if (result.type === "exited") return `exit code ${result.code ?? "unknown"}`;
	return result.type;
}
