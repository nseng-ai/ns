import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareCheckpointMessage } from "../checkpoint-flow.ts";
import { defineCommand, failed, ok, type ExecResult } from "../sdk.ts";
import { selectCheckpointModelRef } from "../text-generation.ts";

export const defaultCpCommand = defineCommand({
	name: "cp",
	description: "Create a checkpoint commit for the current diff.",
	async run(ctx) {
		const branch = await ctx.exec("git branch --show-current", { timeoutMs: 5_000 });
		if (branch.code !== 0) {
			return failed(formatCommandError("Could not determine current branch.", branch), 2);
		}

		const branchName = branch.stdout.trim();
		if (branchName.length === 0) {
			return failed(formatCommandError("Could not determine current branch.", branch), 2);
		}
		if (branchName === "main" || branchName === "master") {
			return failed(`Refusing to create checkpoint commit on trunk branch: ${branchName}`, 1);
		}

		const status = await ctx.exec("git status --porcelain", { timeoutMs: 10_000 });
		if (status.code !== 0) {
			return failed(formatCommandError("Could not inspect git status.", status), 2);
		}
		if (status.stdout.trim().length === 0) {
			return failed("Working tree is clean; nothing to checkpoint.", 1);
		}

		const diff = await ctx.exec("git diff HEAD", { timeoutMs: 30_000 });
		if (diff.code !== 0) {
			return failed(formatCommandError("Could not capture git diff.", diff), 2);
		}

		const prepared = await prepareCheckpointMessage({
			status: status.stdout,
			diff: diff.stdout,
			textGeneration: ctx.model,
			modelRef: selectCheckpointModelRef(ctx.env),
		});
		if (!prepared.ok) {
			return failed(prepared.error, 2);
		}

		const committed = await createCheckpointCommit((command, options) => ctx.exec(command, options), prepared.message);
		if (!committed.ok) return committed;

		return ok(`${committed.message}\n${prepared.message}`);
	},
});

async function createCheckpointCommit(
	exec: (command: string, options?: { timeoutMs?: number }) => Promise<ExecResult>,
	message: string,
) {
	const tempDir = await mkdtemp(join(tmpdir(), "sdl-cp-commit-"));
	try {
		const messagePath = join(tempDir, "message.txt");
		await writeFile(messagePath, `${message}\n`, "utf8");

		const add = await exec("git add -A", { timeoutMs: 30_000 });
		if (add.code !== 0) {
			return failed(formatCommandError("Failed to stage checkpoint changes.", add), 2);
		}

		const commit = await exec(`git commit -F ${shellQuote(messagePath)}`, { timeoutMs: 120_000 });
		if (commit.code !== 0) {
			return failed(formatCommandError("Checkpoint commit failed.", commit), 2);
		}

		const log = await exec("git log -1 --oneline", { timeoutMs: 5_000 });
		if (log.code !== 0) {
			return failed(formatCommandError("Created checkpoint commit, but failed to read it back.", log), 2);
		}

		return ok(log.stdout.trim());
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

function formatCommandError(summary: string, result: ExecResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return [summary, details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`].filter(Boolean).join("\n");
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
