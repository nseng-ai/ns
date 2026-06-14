import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { handoffKeyFromSlug, HANDOFF_NAMESPACE } from "../identity.ts";
import { confirmFromStdin, gatewayFailure, mustHandoffEntryLocator, resolveBranch } from "./shared.ts";

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
	const key = handoffKeyFromSlug(request.slug);
	if (key.type === "error") return failure(key.error.code, key.error.message);
	const branch = await resolveBranch(ctx, request.branch, {
		detachedMessage: "Cannot delete handoff in detached HEAD; pass --branch <branch>.",
	});
	if (branch.type !== "resolved") return branch;
	const locator = mustHandoffEntryLocator(key.value, branch.value);

	const existing = await ctx.brmem.checkEntry({ namespace: HANDOFF_NAMESPACE, key: key.value, branch: branch.value });
	if (existing.type === "error") return gatewayFailure(existing.error, "Failed to check handoff");
	if (existing.type === "missing") return failure("handoff_not_found", `No handoff \`${request.slug}\` found on branch \`${branch.value}\`.`);

	if (!request.force) {
		const confirmed = await confirmFromStdin({
			stdin: ctx.stdin,
			stderr: ctx.stderr,
			prompt: `Delete handoff \`${request.slug}\` on branch \`${branch.value}\`? [y/N]: `,
		});
		if (confirmed === "no") return ok(cancelledResult({ slug: request.slug, key: key.value, branch: branch.value, locator }));
		if (confirmed !== "yes") return confirmed;
	}

	const deleted = await ctx.brmem.deleteEntry({ namespace: HANDOFF_NAMESPACE, key: key.value, branch: branch.value });
	if (deleted.type === "error") {
		if (deleted.error.code === "key_not_found") return failure("handoff_not_found", `No handoff \`${request.slug}\` found on branch \`${branch.value}\`.`);
		return gatewayFailure(deleted.error, "Failed to delete handoff");
	}
	return ok({
		branch: branch.value,
		slug: request.slug,
		key: key.value,
		entry_locator: locator,
		deleted: true,
		cancelled: false,
		commit: deleted.value.commitSha,
	} satisfies DeleteResult);
}

export function renderDelete(result: DeleteResult): string {
	if (result.cancelled) return "Cancelled — no handoff deleted.";
	return [`Deleted handoff \`${result.slug}\` on branch \`${result.branch}\`.`, `Entry Locator: ${result.entry_locator}`, `Commit: ${result.commit}`].join("\n");
}

interface CancelledResultOptions {
	slug: string;
	key: string;
	branch: string;
	locator: string;
}

function cancelledResult({ slug, key, branch, locator }: CancelledResultOptions): DeleteResult {
	return {
		branch,
		slug,
		key,
		entry_locator: locator,
		deleted: false,
		cancelled: true,
		commit: null,
	};
}
