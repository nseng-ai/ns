// The real GitHub REST adapter behind DispatchReportGateway. The credential
// is a GitHub App installation token minted in-process per operation
// (landing purpose: `contents: write`, `pull_requests: write`,
// `issues: write`) and held only in this module's memory — never returned,
// logged, or embedded in report content. Idempotency lives here per the
// gateway contract: the decision log replaces a marked section of the PR
// description in place, and the failure comment is posted only when no
// comment already carries the dispatch's marker. Anchor-PR activity
// attributes to `ns-dispatch[bot]`. Live behavior against GitHub is pending
// verification. `fetchImpl` is the test seam; production callers use global
// `fetch`.
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { DispatchTokenMinter } from "../mint/mint-core.ts";
import {
	buildDecisionLogSection,
	buildDispatchFailureComment,
	buildDispatchFailureMarker,
	composeAnchorPrDescription,
	type DispatchReportGateway,
} from "./anchor-pr-report.ts";

export interface GitHubDispatchReportGatewayOptions {
	/** Exact `owner/name` repository the anchor PR lives in. */
	readonly repository: string;
	readonly minter: DispatchTokenMinter;
	readonly fetchImpl?: typeof fetch;
}

const GITHUB_API_BASE_URL = "https://api.github.com";
const FAILURE_COMMENT_SCAN_LIMIT_COMMENTS = 100;
const pullRequestBodySchema = z.looseObject({ body: z.string().nullable() });
const issueCommentsSchema = z.array(z.looseObject({ body: z.string().optional() }));

type ReportTokenResult =
	| { readonly ok: true; readonly token: string }
	| { readonly ok: false; readonly message: string };

type GitHubRequestResult =
	| { readonly ok: true; readonly payload: unknown }
	| { readonly ok: false; readonly message: string };

export function createGitHubDispatchReportGateway(
	options: GitHubDispatchReportGatewayOptions,
): DispatchReportGateway {
	const fetchImpl = options.fetchImpl ?? fetch;
	const repository = options.repository;

	async function mintReportToken(): Promise<ReportTokenResult> {
		const mintResult = await options.minter.mintDispatchToken({
			repository,
			purpose: "landing",
		});
		if (mintResult.ok === false) {
			return {
				ok: false,
				message: mintResult.error.message ?? "GitHub report token mint failed",
			};
		}
		return { ok: true, token: mintResult.value.token };
	}

	async function githubRequest(input: {
		readonly token: string;
		readonly method: "GET" | "PATCH" | "POST";
		readonly path: string;
		readonly body?: Readonly<Record<string, unknown>>;
	}): Promise<GitHubRequestResult> {
		try {
			const response = await fetchImpl(`${GITHUB_API_BASE_URL}${input.path}`, {
				method: input.method,
				headers: {
					accept: "application/vnd.github+json",
					authorization: `Bearer ${input.token}`,
					"user-agent": "ns-dispatch",
					"x-github-api-version": "2022-11-28",
					...(input.body === undefined ? {} : { "content-type": "application/json" }),
				},
				...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
			});
			if (!response.ok) {
				return {
					ok: false,
					message: `GitHub ${input.method} ${githubPathKind(input.path)} returned HTTP ${response.status}`,
				};
			}
			return { ok: true, payload: (await response.json()) as unknown };
		} catch (error) {
			return { ok: false, message: formatErrorMessage(error) };
		}
	}

	return {
		async publishAnchorPrDecisionLog(request) {
			const token = await mintReportToken();
			if (token.ok === false) return token;

			const pullPath = `/repos/${repository}/pulls/${request.anchorPrNumber}`;
			const current = await githubRequest({ token: token.token, method: "GET", path: pullPath });
			if (current.ok === false) return current;
			const parsed = pullRequestBodySchema.safeParse(current.payload);
			if (!parsed.success)
				return { ok: false, message: "GitHub pull request response was invalid" };

			const section = buildDecisionLogSection(request.decisionLog);
			const body = composeAnchorPrDescription(parsed.data.body, section);
			if (body === (parsed.data.body ?? "")) return { ok: true };

			const update = await githubRequest({
				token: token.token,
				method: "PATCH",
				path: pullPath,
				body: { body },
			});
			if (update.ok === false) return update;
			return { ok: true };
		},

		async ensureAnchorPrFailureComment(request) {
			const token = await mintReportToken();
			if (token.ok === false) return token;

			const commentsPath =
				`/repos/${repository}/issues/${request.anchorPrNumber}/comments` +
				`?per_page=${FAILURE_COMMENT_SCAN_LIMIT_COMMENTS}`;
			const existing = await githubRequest({
				token: token.token,
				method: "GET",
				path: commentsPath,
			});
			if (existing.ok === false) return existing;
			const parsed = issueCommentsSchema.safeParse(existing.payload);
			if (!parsed.success) return { ok: false, message: "GitHub comments response was invalid" };

			const marker = buildDispatchFailureMarker(request.anchorBranch);
			const isAlreadyPosted = parsed.data.some(
				(comment) => comment.body !== undefined && comment.body.includes(marker),
			);
			if (isAlreadyPosted) return { ok: true };

			const create = await githubRequest({
				token: token.token,
				method: "POST",
				path: `/repos/${repository}/issues/${request.anchorPrNumber}/comments`,
				body: {
					body: buildDispatchFailureComment({
						anchorBranch: request.anchorBranch,
						code: request.code,
						message: request.message,
						...(request.diagnostic === undefined ? {} : { diagnostic: request.diagnostic }),
						...(request.workflowRunId === undefined
							? {}
							: { workflowRunId: request.workflowRunId }),
					}),
				},
			});
			if (create.ok === false) return create;
			return { ok: true };
		},
	};
}

function githubPathKind(path: string): string {
	return path.includes("/comments") ? "anchor PR comments" : "anchor PR";
}
