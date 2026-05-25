import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fallbackCheckpointMessage,
	formatCheckpointMessage,
	formatCheckpointValidationFeedback,
	validateCheckpointMessage,
} from "./checkpoint-message.ts";

export type CommandResult = {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
};

export type DraftCheckpointRequest = {
	status: string;
	diff: string;
	previousDraft?: string;
	validationFeedback?: string;
};

export type DraftCheckpoint = (request: DraftCheckpointRequest) => Promise<{ output: string } | { error: string }>;

export async function prepareCheckpointMessage(input: {
	status: string;
	diff: string;
	draft: DraftCheckpoint;
	maxAttempts?: number;
}): Promise<
	| { ok: true; message: string; source: "model" | "repaired_model" | "fallback"; feedback?: string }
	| { ok: false; error: string }
> {
	const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
	const first = await input.draft({ status: input.status, diff: input.diff });
	if ("error" in first) {
		return { ok: false, error: first.error };
	}

	const firstValidation = validateCheckpointMessage(first.output);
	if (firstValidation.ok) {
		return { ok: true, message: formatCheckpointMessage(firstValidation.message), source: "model" };
	}

	const firstFeedback = formatCheckpointValidationFeedback(firstValidation.issues);
	if (maxAttempts > 1) {
		const second = await input.draft({
			status: input.status,
			diff: input.diff,
			previousDraft: first.output,
			validationFeedback: firstFeedback,
		});
		if (!("error" in second)) {
			const secondValidation = validateCheckpointMessage(second.output);
			if (secondValidation.ok) {
				return {
					ok: true,
					message: formatCheckpointMessage(secondValidation.message),
					source: "repaired_model",
					feedback: firstFeedback,
				};
			}

			return fallbackResult(input.status, input.diff, formatCheckpointValidationFeedback(secondValidation.issues));
		}
	}

	return fallbackResult(input.status, input.diff, firstFeedback);
}

export async function createCommitWithPreparedMessage(input: {
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	cwd: string;
	message: string;
}): Promise<{ summary: string } | { error: string }> {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-cp-commit-"));
	try {
		const messagePath = join(tempDir, "message.txt");
		await writeFile(messagePath, `${input.message}\n`, "utf8");

		const add = await input.exec("git", ["add", "-A"], input.cwd, 30_000);
		if (add.code !== 0) {
			return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
		}

		const commit = await input.exec("git", ["commit", "-F", messagePath], input.cwd, 120_000);
		if (commit.code !== 0) {
			return { error: formatCommandError("Checkpoint commit failed.", commit) };
		}

		const log = await input.exec("git", ["log", "-1", "--oneline"], input.cwd, 5_000);
		if (log.code !== 0) {
			return { error: formatCommandError("Created checkpoint commit, but failed to read it back.", log) };
		}

		return { summary: log.stdout.trim() };
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

function fallbackResult(status: string, diff: string, feedback: string): { ok: true; message: string; source: "fallback"; feedback: string } {
	const fallback = fallbackCheckpointMessage({ status, diff });
	return {
		ok: true,
		message: formatCheckpointMessage(fallback),
		source: "fallback",
		feedback,
	};
}

function formatCommandError(summary: string, result: CommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return [summary, details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`].filter(Boolean).join("\n");
}
