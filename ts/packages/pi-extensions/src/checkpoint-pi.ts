import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type DraftCheckpointRequest,
} from "./checkpoint-flow.ts";
import {
	draftWithFastText,
	selectDraftHarness,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "./fast-text-draft.ts";
import type { PendingWorktreeSnapshot } from "./pending-worktree.ts";

export type { ExtensionAPI, ExtensionCommandContext } from "./fast-text-draft.ts";

const SYSTEM_PROMPT = `You write terse checkpoint commit messages for coding agents.

Given git status and diff, output exactly one git commit message:
- Subject line first, prefixed with "[cp]".
- Subject must be at most 52 characters total. Shorter is better. Use imperative mood with no trailing period.
- Then one blank line.
- Then 1 to 3 bullet lines, each starting with "- ".
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- No Co-Authored-By trailer.
- Mention untracked files by filename when they matter.
- Optimize for later agents scanning git log, not for a polished PR description.`;

export type PreparedCheckpointMessage =
	| { ok: true; message: string; source: "model" | "repaired_model" | "fallback"; feedback?: string }
	| { ok: false; error: string };

export async function prepareCheckpointMessageForPi(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionCommandContext,
	snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
): Promise<PreparedCheckpointMessage> {
	const harness = selectDraftHarness();
	if ("error" in harness) {
		return { ok: false, error: harness.error };
	}

	const prepared = await prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		draft: (request) => {
			const action = request.previousDraft ? "Repairing" : "Drafting";
			return draftWithFastText(pi, ctx, {
				harness: harness.value,
				systemPrompt: SYSTEM_PROMPT,
				userPrompt: buildUserPrompt(request),
				spinnerKey: "cp",
				progressMessage: (label) => `${action} checkpoint message with ${label}…`,
				taskNoun: "checkpoint message",
			});
		},
	});
	if (prepared.ok) {
		notifyPreparationSource(ctx, prepared.source, prepared.feedback);
	}
	return prepared;
}

export async function commitPreparedCheckpointMessage(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return createCommitWithPreparedMessage({
		cwd,
		message,
		exec: (command, args, commandCwd, timeout) => pi.exec(command, args, { cwd: commandCwd, timeout }),
	});
}

function buildUserPrompt(input: DraftCheckpointRequest): string {
	const base = `Draft a checkpoint commit message for this pending git state.\n\n## git status --porcelain\n\n${input.status.trim() || "(clean)"}\n\n## git diff HEAD\n\n${input.diff.trim() || "(no tracked diff; rely on untracked filenames in status)"}\n`;
	if (!input.previousDraft || !input.validationFeedback) {
		return base;
	}
	return `${base}\n## previous invalid draft\n\n${input.previousDraft.trim()}\n\n## deterministic validation feedback\n\n${input.validationFeedback}\n\nRewrite the checkpoint message so it satisfies every validation rule. Return only the corrected commit message.\n`;
}

function notifyPreparationSource(
	ctx: ExtensionCommandContext,
	source: "model" | "repaired_model" | "fallback",
	feedback: string | undefined,
): void {
	if (source === "repaired_model") {
		ctx.ui.notify("Checkpoint message repaired after validation feedback.", "info");
		return;
	}
	if (source === "fallback") {
		ctx.ui.notify(
			[
				"Using deterministic fallback checkpoint message after validation failure.",
				conciseFeedback(feedback),
			]
				.filter(Boolean)
				.join("\n"),
			"warning",
		);
	}
}

function conciseFeedback(feedback: string | undefined): string | undefined {
	if (!feedback) {
		return undefined;
	}
	return feedback.split("\n").filter(Boolean).slice(0, 5).join("\n");
}
