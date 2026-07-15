import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import type { Caps } from "@nseng-ai/clinkr";
import type { ExecResult } from "@nseng-ai/foundation/command";
import { createCliCommandIo, runWithNsCommandIo } from "@nseng-ai/sdk/command-io";
import type { NsCommandIo } from "@nseng-ai/sdk";
import {
	createFlowAutobranchCheckpointFlow,
	type FlowAutobranchCheckpointInput,
	type FlowAutobranchRequest,
} from "../autobranch/checkpoint-flow.ts";
import {
	commitAutobranchCheckpointMessage,
	prepareAutobranchCheckpointMessage,
} from "../autobranch/checkpoint.ts";
import { renderAutoslotResultBlock } from "./presentation.ts";
import type { SlotClient } from "@nseng-ai/slots/api";
import {
	checkoutSlot,
	createFlowSlotClient,
	formatSlotCheckoutFailureCause,
} from "./slot-checkout.ts";

export interface AutoslotFlowInput extends FlowAutobranchCheckpointInput {
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	slotClient: SlotClient;
	io: NsCommandIo;
	/** Resolved terminal caps for house-style rendering of durable outcomes. */
	caps: Caps;
}

export interface AutoslotCliInput {
	cwd: string;
	env: Record<string, string | undefined>;
	args: FlowAutobranchRequest;
	textGenerator: TextGenerator;
	modelRef: string;
	/** Resolved terminal caps from the host seam (`resolveFlowStreamCaps` in the flow wrapper). */
	caps: Caps;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: (stream: "stdout" | "stderr", text: string) => void;
}

export async function runAutoslotCli(input: AutoslotCliInput): Promise<number> {
	let hasError = false;
	const io = createCliCommandIo(input, {
		onNotifyError: () => {
			hasError = true;
		},
	});
	await runWithNsCommandIo(io, async (io) => {
		const exec = (command: string, commandArgs: string[], timeout: number) =>
			input.exec(command, commandArgs, { cwd: input.cwd, timeout });
		await createAutoslotFlow({
			cwd: input.cwd,
			modelRef: input.modelRef,
			args: input.args,
			caps: input.caps,
			exec,
			prepareCheckpointMessage: (snapshot) =>
				prepareAutobranchCheckpointMessage(snapshot, input.modelRef, input.textGenerator),
			commitPreparedCheckpointMessage: (message) =>
				commitAutobranchCheckpointMessage(
					(command, commandArgs, commandCwd, timeout) =>
						input.exec(command, commandArgs, { cwd: commandCwd, timeout }),
					input.cwd,
					message,
				),
			io,
			env: input.env,
			slotClient: createFlowSlotClient({ cwd: input.cwd, env: input.env }),
		});
	});
	return hasError ? 1 : 0;
}

export async function createAutoslotFlow(input: AutoslotFlowInput): Promise<void> {
	const createdBranch = await createFlowAutobranchCheckpointFlow({
		...input,
		onPhase: (message) => {
			input.io.phase(message);
		},
	});
	if (!createdBranch.ok) {
		// Honor the autobranch outcome discriminator: a declined guardrail (e.g. an unsafe upstream
		// relationship, synchronized trunk, child branch, or root/merge commit) renders warn, not red
		// (house-style §7.3), while an operational failure renders failure/red. Both still flip the exit
		// code via the `error` notify level — the visual intent lives in the rendered block, the level
		// owns stderr routing and exit (see `autoslot-presentation.ts`).
		input.io.notify(
			renderAutoslotResultBlock(input.caps, {
				kind: createdBranch.outcome === "refusal" ? "refusal" : "failure",
				headline:
					createdBranch.outcome === "refusal"
						? "Autoslot did not create a Graphite branch."
						: "Autoslot could not create a Graphite branch.",
				cwd: input.cwd,
				body: createdBranch.error,
			}),
			"error",
		);
		return;
	}

	for (const warning of createdBranch.warnings) {
		input.io.notify(warning, "warning");
	}

	const branchName = parseCreatedBranchName(createdBranch.summary);
	if (!createdBranch.isClean) {
		// The branch was created; the slot move is a guardrail-declined follow-up (clean worktree
		// required), so this is a warn refusal at exit 0, not a failure.
		input.io.notify(
			renderAutoslotResultBlock(input.caps, {
				kind: "refusal",
				headline: `Autoslot created ${branchName}, but slot movement was skipped.`,
				cwd: input.cwd,
				body: "The worktree is not clean; `ns slot checkout --current` requires a clean worktree.",
			}),
			"warning",
		);
		return;
	}

	input.io.phase("Checking out branch slot…");
	const slot = await checkoutSlot(input.slotClient, { kind: "current" });
	if (!slot.ok) {
		input.io.notify(
			renderAutoslotResultBlock(input.caps, {
				kind: "failure",
				headline: `Autoslot created ${branchName}, but ns slot checkout failed.`,
				cwd: input.cwd,
				body: formatSlotCheckoutFailureCause(slot.failure),
			}),
			"error",
		);
		return;
	}

	input.io.notify(
		renderAutoslotResultBlock(input.caps, {
			kind: "success",
			headline: `Autoslot moved ${slot.target.branchName} to ${slot.target.slotName}.`,
			cwd: input.cwd,
			body: `Worktree: ${slot.target.worktreePath}`,
			// Keep the navigation line visible and copyable at normal weight (house-style §7.5).
			guidance: `ns slot co ${slot.target.branchName}`,
		}),
		"info",
	);
}

function parseCreatedBranchName(summary: string): string {
	const firstLine = summary.split("\n")[0] ?? "";
	return firstLine.replace(/^New branch: /, "").replace(/ \(base slug .*\)$/, "");
}
