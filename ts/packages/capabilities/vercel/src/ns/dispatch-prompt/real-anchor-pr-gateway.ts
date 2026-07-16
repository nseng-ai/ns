import { runGitHubCliAsExecResult } from "@nseng-ai/capability-kit/github/cli";
import {
	commandSucceeded,
	type CommandRunner,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { z } from "zod";

import { composeAnchorPrDescriptionWithRunIdStamp } from "../../dispatch/run-id-stamp.ts";
import type { DispatchAnchorPrGateway } from "../dispatch-client/contracts.ts";
import { dispatchCommandError } from "./dispatch-command-error.ts";

const GH_TIMEOUT_MS = 60_000;

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
					error: dispatchCommandError(
						"gh-pr-create-failed",
						"Opening the anchor PR failed",
						result,
					),
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
					error: dispatchCommandError(
						"gh-pr-view-failed",
						"Reading the anchor PR body failed",
						view,
					),
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
					error: dispatchCommandError(
						"gh-pr-edit-failed",
						"Stamping the run id on the anchor PR failed",
						edit,
					),
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
