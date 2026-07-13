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

/**
 * Upper bound on the comments scanned for the idempotency marker. Anchor
 * PRs are dispatch-owned and short-lived, so the marker — when present —
 * sits within the first page.
 */
const FAILURE_COMMENT_SCAN_LIMIT = 100;

const pullRequestBodySchema = z.looseObject({ body: z.string().nullable() });

const issueCommentsSchema = z.array(z.looseObject({ body: z.string().optional() }));

export function createGitHubDispatchReportGateway(
	options: GitHubDispatchReportGatewayOptions,
): DispatchReportGateway {
	const fetchImpl = options.fetchImpl ?? fetch;
	const repository = options.repository;

	async function mintReportToken(): Promise<string | null> {
		const mintResult = await options.minter.mintDispatchToken({
			repository,
			purpose: "landing",
		});
		// `=== false` rather than `!`: the Vercel builder typechecks without
		// strictNullChecks, where truthiness checks do not narrow the union.
		if (mintResult.ok === false) return null;
		return mintResult.value.token;
	}

	async function githubRequest(input: {
		readonly token: string;
		readonly method: "GET" | "PATCH" | "POST";
		readonly path: string;
		readonly body?: Readonly<Record<string, unknown>>;
	}): Promise<{ readonly ok: true; readonly payload: unknown } | { readonly ok: false }> {
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
			if (!response.ok) return { ok: false };
			return { ok: true, payload: (await response.json()) as unknown };
		} catch {
			return { ok: false };
		}
	}

	return {
		async publishAnchorPrDecisionLog(request) {
			const token = await mintReportToken();
			if (token === null) return { ok: false };

			const pullPath = `/repos/${repository}/pulls/${request.anchorPrNumber}`;
			const current = await githubRequest({ token, method: "GET", path: pullPath });
			if (current.ok === false) return { ok: false };
			const parsed = pullRequestBodySchema.safeParse(current.payload);
			if (!parsed.success) return { ok: false };

			const section = buildDecisionLogSection(request.decisionLog);
			const body = composeAnchorPrDescription(parsed.data.body, section);
			if (body === (parsed.data.body ?? "")) return { ok: true };

			const update = await githubRequest({
				token,
				method: "PATCH",
				path: pullPath,
				body: { body },
			});
			if (update.ok === false) return { ok: false };
			return { ok: true };
		},

		async ensureAnchorPrFailureComment(request) {
			const token = await mintReportToken();
			if (token === null) return { ok: false };

			const commentsPath =
				`/repos/${repository}/issues/${request.anchorPrNumber}/comments` +
				`?per_page=${FAILURE_COMMENT_SCAN_LIMIT}`;
			const existing = await githubRequest({ token, method: "GET", path: commentsPath });
			if (existing.ok === false) return { ok: false };
			const parsed = issueCommentsSchema.safeParse(existing.payload);
			if (!parsed.success) return { ok: false };

			const marker = buildDispatchFailureMarker(request.anchorBranch);
			const alreadyPosted = parsed.data.some(
				(comment) => comment.body !== undefined && comment.body.includes(marker),
			);
			if (alreadyPosted) return { ok: true };

			const create = await githubRequest({
				token,
				method: "POST",
				path: `/repos/${repository}/issues/${request.anchorPrNumber}/comments`,
				body: {
					body: buildDispatchFailureComment({
						anchorBranch: request.anchorBranch,
						code: request.code,
						message: request.message,
					}),
				},
			});
			if (create.ok === false) return { ok: false };
			return { ok: true };
		},
	};
}
