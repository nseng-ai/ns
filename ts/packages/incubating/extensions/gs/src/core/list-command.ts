import { renderTextTable } from "@nseng-ai/foundation/text-table";
import { truncateTextHead } from "@nseng-ai/foundation/text-truncation";
import { failure, ok, usageError, z } from "@nseng-ai/sdk";

import type {
	GsLocalInventory,
	GsLocalInventoryFailure,
	GsLocalInventoryGateway,
} from "./local-inventory.ts";
import { gsLocalStackSummary } from "./local-state.ts";

const DETAIL_MAX_CHARS = 500;
const EMPTY_MESSAGE = "No current-worktree gh-stack stacks found.";

export const gsListRequestSchema = z.lazy(() =>
	z.strictObject({
		verbose: z.boolean().default(false),
	}),
);
export type GsListRequest = z.infer<typeof gsListRequestSchema>;

export const gsListResultSchema = z.lazy(() =>
	z.strictObject({
		worktreeGitDir: z.string().min(1),
		stacks: z.array(
			z.strictObject({
				number: z.number().int().positive().nullable(),
				base: z.string().min(1),
				branches: z
					.array(
						z.strictObject({
							name: z.string().min(1),
							pullRequest: z
								.strictObject({
									number: z.number().int().positive(),
									recordedMerged: z.boolean(),
								})
								.nullable(),
						}),
					)
					.min(1),
			}),
		),
	}),
);
export type GsListResult = z.infer<typeof gsListResultSchema>;

export interface GsListInvocation {
	readonly cwd: string;
	readonly outputFormat?: "human" | "json" | "md";
}

export async function runGsList(
	inventory: GsLocalInventoryGateway,
	invocation: GsListInvocation,
	request: GsListRequest,
) {
	if (request.verbose && invocation.outputFormat === "json") {
		return usageError("--verbose cannot be combined with --format json.", {
			conflictingOptions: ["--verbose", "--format json"],
		});
	}
	const result = await inventory.readLocalInventory({ cwd: invocation.cwd });
	if (!result.ok) return localInventoryFailure(result.error);
	const data: GsListResult = {
		worktreeGitDir: result.value.worktreeGitDir,
		stacks: result.value.stacks.map((stack) => ({
			number: stack.number,
			base: stack.base,
			branches: stack.branches.map((branch) => ({
				name: branch.name,
				pullRequest:
					branch.pullRequest === null
						? null
						: {
								number: branch.pullRequest.number,
								recordedMerged: branch.pullRequest.recordedMerged,
							},
			})),
		})),
	};
	return ok(data);
}

export function renderGsListHuman(inventory: GsLocalInventory, verbose: boolean): string {
	const provenance = `Worktree Git directory: ${inventory.worktreeGitDir}`;
	if (inventory.stacks.length === 0) return `${provenance}\n${EMPTY_MESSAGE}`;
	if (verbose) {
		const stacks = inventory.stacks
			.map((stack) => {
				const heading = stack.number === null ? "(no number)" : String(stack.number);
				const branches = stack.branches
					.toReversed()
					.map((branch) => ` ├─ ${branch.name}`)
					.join("\n");
				return `${heading}\n${branches}\n └─ ${stack.base} (base)`;
			})
			.join("\n\n");
		return `${provenance}\n\n${stacks}`;
	}

	const table = renderTextTable({
		columns: [{ header: "NUMBER" }, { header: "STACK" }, { header: "BASE" }],
		rows: inventory.stacks.map((stack) => [
			stack.number === null ? "—" : String(stack.number),
			gsLocalStackSummary(stack),
			stack.base,
		]),
	});
	return `${provenance}\n\n${table}`;
}

function localInventoryFailure(error: GsLocalInventoryFailure) {
	const detail = truncateTextHead({
		value: error.message,
		maxChars: DETAIL_MAX_CHARS,
		buildMarker: (omittedChars) => `… [omitted ${omittedChars} chars]`,
	});
	switch (error.type) {
		case "git-repository-unavailable":
			return failure(error.type, "Could not inspect the local Git repository.", {
				code: error.type,
				detail,
			});
		case "gh-stack-state-read-failed":
			return failure(error.type, "Could not read local gh-stack state.", {
				code: error.type,
				detail,
			});
		case "gh-stack-state-unsupported":
			return failure(error.type, "Local gh-stack state is malformed or unsupported.", {
				code: error.type,
				detail,
			});
	}
}
