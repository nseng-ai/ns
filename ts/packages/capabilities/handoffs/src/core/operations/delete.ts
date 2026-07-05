import { renderDestructiveResultBlock } from "@nseng-ai/foundation/cli-theme";
import { failure, ok, type RenderCapabilities } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { HandoffCliContext } from "../context.ts";
import { deleteHandoffArtifact, prepareHandoffDeletion } from "../artifact-storage.ts";
import { confirmDestructiveAction, resolveBranch } from "./shared.ts";

export const deleteRequestSchema = z.object({
	slug: z.string().describe("Handoff slug."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	yes: z.boolean().default(false).describe("Confirm deletion without prompting."),
});

export const deleteResultSchema = z.object({
	branch: z.string(),
	slug: z.string(),
	key: z.string(),
	entryLocator: z.string(),
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
		{ brmem: ctx.brmem },
		{ branch: branch.value, slug: request.slug },
	);
	if (target.type === "error") return failure(target.error.code, target.error.message);

	if (!request.yes) {
		const confirmed = await confirmDestructiveAction(ctx, {
			gateMessage: "Deleting a handoff requires --yes when non-interactive.",
			missingFlag: "--yes",
			howToSupply: "Pass --yes (or -y) to confirm deletion without prompting.",
			confirmMessage: `Delete handoff \`${target.value.slug}\` on branch \`${target.value.branch}\`?`,
		});
		if (confirmed.type === "gateFailure") return confirmed.exit;
		if (confirmed.type === "declined") return ok(cancelledResult(target.value));
		if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
	}

	const deleted = await deleteHandoffArtifact(
		{ brmem: ctx.brmem },
		{ branch: target.value.branch, key: target.value.key },
	);
	if (deleted.type === "error") return failure(deleted.error.code, deleted.error.message);
	return ok({
		branch: deleted.value.branch,
		slug: deleted.value.slug,
		key: deleted.value.key,
		entryLocator: deleted.value.entryLocator,
		deleted: true,
		cancelled: false,
		commit: deleted.value.commit,
	} satisfies DeleteResult);
}

export function renderDelete(
	result: DeleteResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.cancelled) {
		return renderDestructiveResultBlock(caps, {
			kind: "refusal",
			headline: "Cancelled handoff delete.",
			body: `No handoff was deleted. Target: ${result.slug} on branch ${result.branch}.`,
		});
	}
	return renderDestructiveResultBlock(caps, {
		kind: "success",
		headline: `Deleted handoff ${result.slug}.`,
		body: [
			`Branch: ${result.branch}`,
			`Entry Locator: ${result.entryLocator}`,
			`Commit: ${result.commit}`,
		].join("\n"),
	});
}

function cancelledResult(target: {
	slug: string;
	key: string;
	branch: string;
	entryLocator: string;
}): DeleteResult {
	return {
		branch: target.branch,
		slug: target.slug,
		key: target.key,
		entryLocator: target.entryLocator,
		deleted: false,
		cancelled: true,
		commit: null,
	};
}
