import { renderTextTable } from "@nseng-ai/foundation/text-table";
import { failure, ok, usageError, z } from "@nseng-ai/sdk";

import type {
	GsLocalInventory,
	GsLocalInventoryFailure,
	GsLocalInventoryGateway,
} from "./local-inventory.ts";
import { gsLocalStackSummary } from "./local-state.ts";

const DETAIL_MAX_CHARS = 500;
const EMPTY_MESSAGE = "No local gh-stack stacks found.";

export const gsListRequestSchema = z.strictObject({
	verbose: z.boolean().default(false),
});
export type GsListRequest = z.infer<typeof gsListRequestSchema>;

const pullRequestSchema = z.strictObject({
	number: z.number().int().positive(),
	recordedMerged: z.boolean(),
});
const branchSchema = z.strictObject({
	name: z.string().min(1),
	pullRequest: pullRequestSchema.nullable(),
});
const stackSchema = z.strictObject({
	number: z.number().int().positive().nullable(),
	base: z.string().min(1),
	branches: z.array(branchSchema).min(1),
});
export const gsListResultSchema = z.strictObject({ stacks: z.array(stackSchema) });
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
	if (inventory.stacks.length === 0) return EMPTY_MESSAGE;
	if (verbose) {
		return inventory.stacks
			.map((stack) => {
				const heading = stack.number === null ? "(no number)" : String(stack.number);
				const branches = stack.branches
					.toReversed()
					.map((branch) => ` ├─ ${branch.name}`)
					.join("\n");
				return `${heading}\n${branches}\n └─ ${stack.base} (base)`;
			})
			.join("\n\n");
	}

	return renderTextTable({
		columns: [{ header: "NUMBER" }, { header: "STACK" }, { header: "BASE" }],
		rows: inventory.stacks.map((stack) => [
			stack.number === null ? "—" : String(stack.number),
			gsLocalStackSummary(stack),
			stack.base,
		]),
	});
}

function localInventoryFailure(error: GsLocalInventoryFailure) {
	const detail = error.message.slice(0, DETAIL_MAX_CHARS);
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
