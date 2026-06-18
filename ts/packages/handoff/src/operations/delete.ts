import { confirmFromStdin, failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { deleteHandoffArtifact, prepareHandoffDeletion } from "../artifact-storage.ts";
import { resolveBranch } from "./shared.ts";

export const deleteRequestSchema = z.object({
	slug: z.string().describe("Handoff slug."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	force: z.boolean().default(false).describe("Delete without prompting."),
});

export const deleteResultSchema = z.object({
	branch: z.string(),
	slug: z.string(),
	key: z.string(),
	entry_locator: z.string(),
	deleted: z.boolean(),
	cancelled: z.boolean(),
	commit: z.string().nullable(),
});

export type DeleteRequest = z.infer<typeof deleteRequestSchema>;
export type DeleteResult = z.infer<typeof deleteResultSchema>;

export async function runDelete(ctx: HandoffCliContext, request: DeleteRequest) {
	const branch = await resolveBranch(ctx, request.branch, {
		detachedMessage: "Cannot delete handoff in detached HEAD; pass --branch <branch>.",
	});
	if (branch.type !== "resolved") return branch;

	const target = await prepareHandoffDeletion(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ branch: branch.value, slug: request.slug },
	);
	if (target.type === "error") return failure(target.error.code, target.error.message);

	if (!request.force) {
		const confirmed = await confirmFromStdin({
			stdin: ctx.stdin,
			stderr: ctx.stderr,
			prompt: `Delete handoff \`${target.value.slug}\` on branch \`${target.value.branch}\`? [y/N]: `,
			defaultAnswer: "no",
		});
		if (confirmed === "no") return ok(cancelledResult(target.value));
		if (confirmed !== "yes") return confirmed;
	}

	const deleted = await deleteHandoffArtifact(
		{ brmem: ctx.brmem, git: ctx.git, cwd: ctx.cwd },
		{ branch: target.value.branch, key: target.value.key },
	);
	if (deleted.type === "error") return failure(deleted.error.code, deleted.error.message);
	return ok({
		branch: deleted.value.branch,
		slug: deleted.value.slug,
		key: deleted.value.key,
		entry_locator: deleted.value.entry_locator,
		deleted: true,
		cancelled: false,
		commit: deleted.value.commit,
	} satisfies DeleteResult);
}

export function renderDelete(result: DeleteResult): string {
	if (result.cancelled) return "Cancelled — no handoff deleted.";
	return [
		`Deleted handoff \`${result.slug}\` on branch \`${result.branch}\`.`,
		`Entry Locator: ${result.entry_locator}`,
		`Commit: ${result.commit}`,
	].join("\n");
}

function cancelledResult(target: {
	slug: string;
	key: string;
	branch: string;
	entry_locator: string;
}): DeleteResult {
	return {
		branch: target.branch,
		slug: target.slug,
		key: target.key,
		entry_locator: target.entry_locator,
		deleted: false,
		cancelled: true,
		commit: null,
	};
}
