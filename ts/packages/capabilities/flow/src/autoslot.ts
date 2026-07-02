import type { Caps } from "@sdl/clinkr";
import { runWithSdlCommandIo } from "@sdl/kernel/command-io";
import type { SdlCommandIo } from "@sdl/kernel/sdk";
import {
	createFlowAutobranchCheckpointFlow,
	type FlowAutobranchCheckpointInput,
	type FlowAutobranchRequest,
} from "./api/autobranch.ts";
import { createFlowCliCommandIo } from "./cli-command-io.ts";
import {
	commitAutobranchCheckpointMessage,
	prepareAutobranchCheckpointMessage,
} from "./autobranch/checkpoint.ts";
import { renderAutoslotResultBlock } from "./autoslot-presentation.ts";
import type { SlotClient } from "@sdl/slot/api";
import {
	checkoutSlot,
	createFlowSlotClient,
	formatSlotCheckoutFailureCause,
} from "./slot-checkout.ts";

export interface AutoslotFlowInput extends FlowAutobranchCheckpointInput {
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	slotClient: SlotClient;
	io: SdlCommandIo;
	/** Resolved terminal caps for house-style rendering of durable outcomes. */
	caps: Caps;
}

export interface AutoslotCliInput {
	cwd: string;
	env: Record<string, string | undefined>;
	args: FlowAutobranchRequest;
	/** Resolved terminal caps from the host seam (`resolveFlowStreamCaps` in the flow wrapper). */
	caps: Caps;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: (stream: "stdout" | "stderr", text: string) => void;
}

export async function runAutoslotCli(input: AutoslotCliInput): Promise<number> {
	let hasError = false;
	const io = createFlowCliCommandIo(input, {
		onNotifyError: () => {
			hasError = true;
		},
	});
	await runWithSdlCommandIo(
		io,
		async (io) =>
			await createAutoslotFlow({
				cwd: input.cwd,
				args: input.args,
				caps: input.caps,
				exec: (command, commandArgs, timeout) =>
					input.exec(command, commandArgs, { cwd: input.cwd, timeout }),
				prepareCheckpointMessage: (snapshot) =>
					prepareAutobranchCheckpointMessage(snapshot, input.env),
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
			}),
	);
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
		// Honor the autobranch outcome discriminator: a declined guardrail (e.g. pushed HEAD, child
		// branch, root/merge commit) renders warn, not red (house-style §7.3). Both still flip the exit
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
				body: "The worktree is not clean; `sdl slot checkout --current` requires a clean worktree.",
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
				headline: `Autoslot created ${branchName}, but sdl slot checkout failed.`,
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
			guidance: `sdl slot co ${slot.target.branchName}`,
		}),
		"info",
	);
}

function parseCreatedBranchName(summary: string): string {
	const firstLine = summary.split("\n")[0] ?? "";
	return firstLine.replace(/^New branch: /, "").replace(/ \(base slug .*\)$/, "");
}
