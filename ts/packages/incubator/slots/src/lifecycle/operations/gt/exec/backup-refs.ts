import { failure, ok, usageError } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../../../../core/context.ts";

const BACKUP_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const backupRefSchema = z.object({
	branch: z.string(),
	backupBranch: z.string(),
});

export const gtBackupRefsRequestSchema = z.object({
	label: z
		.string()
		.describe("Operation label used in the backup ref prefix (for example smush or linearize)."),
	branch: z.array(z.string()).default([]).describe("Branch to back up. May be repeated."),
});

export const gtBackupRefsResultSchema = z.object({
	prefix: z.string(),
	label: z.string(),
	stamp: z.string(),
	refs: z.array(backupRefSchema),
});

export type GtBackupRefsRequest = z.infer<typeof gtBackupRefsRequestSchema>;
export type GtBackupRefsResult = z.infer<typeof gtBackupRefsResultSchema>;
export type BackupRef = z.infer<typeof backupRefSchema>;

export async function runGtBackupRefs(ctx: SlotCliContext, request: GtBackupRefsRequest) {
	if (ctx.repo.type !== "repo") return failure(ctx.repo.errorType, ctx.repo.message);
	if (!BACKUP_LABEL_PATTERN.test(request.label)) {
		return usageError(
			`Invalid --label '${request.label}': use lowercase letters, digits, and hyphens (for example smush or linearize).`,
			{ argument: "--label" },
		);
	}
	const branches = dedupePreservingOrder(request.branch);
	if (branches.length === 0) {
		return usageError("Provide at least one --branch to back up.", { argument: "--branch" });
	}

	const missing: string[] = [];
	for (const branch of branches) {
		if (!(await ctx.git.branchExists(branch))) missing.push(branch);
	}
	if (missing.length > 0) {
		return failure("branch-not-found", `Local branch(es) not found: ${missing.join(", ")}.`, {
			missing,
		});
	}

	const stamp = backupStampFromMs(ctx.clock.nowMs());
	const plan = planBackupRefs({ label: request.label, stamp, branches });

	const existing: string[] = [];
	for (const ref of plan.refs) {
		if (await ctx.git.branchExists(ref.backupBranch)) existing.push(ref.backupBranch);
	}
	if (existing.length > 0) {
		return failure(
			"backup-ref-exists",
			`Backup ref(s) already exist: ${existing.join(", ")}. Re-run to get a fresh stamp or remove the stale backups.`,
			{ existing },
		);
	}

	const created: BackupRef[] = [];
	for (const ref of plan.refs) {
		const createFailure = await ctx.git.createBranch(ref.backupBranch, ref.branch, {
			shouldForce: false,
		});
		if (createFailure !== null) {
			return failure(
				"backup-create-failed",
				`Failed to create ${ref.backupBranch} from ${ref.branch}: ${createFailure.message}`,
				{ branch: ref.branch, backupBranch: ref.backupBranch, created },
			);
		}
		created.push(ref);
	}

	return ok({
		prefix: plan.prefix,
		label: request.label,
		stamp,
		refs: created,
	} satisfies GtBackupRefsResult);
}

export function renderBackupRefs(result: GtBackupRefsResult): string {
	// Hidden exec command: compact JSON is the intentional human renderer for skill/agent callers.
	return JSON.stringify({ prefix: result.prefix, refs: result.refs });
}

export function backupStampFromMs(nowMs: number): string {
	const date = new Date(nowMs);
	const pad = (value: number) => String(value).padStart(2, "0");
	return [
		String(date.getUTCFullYear()),
		pad(date.getUTCMonth() + 1),
		pad(date.getUTCDate()),
		pad(date.getUTCHours()),
		pad(date.getUTCMinutes()),
		pad(date.getUTCSeconds()),
	].join("");
}

export function encodeBranchSegment(branch: string): string {
	return branch.replaceAll("/", "__");
}

export function planBackupRefs(options: {
	readonly label: string;
	readonly stamp: string;
	readonly branches: readonly string[];
}): { prefix: string; refs: readonly BackupRef[] } {
	const prefix = `backup/${options.label}-${options.stamp}/`;
	return {
		prefix,
		refs: options.branches.map((branch) => ({
			branch,
			backupBranch: `${prefix}${encodeBranchSegment(branch)}`,
		})),
	};
}

function dedupePreservingOrder(values: readonly string[]): readonly string[] {
	return [...new Set(values)];
}
