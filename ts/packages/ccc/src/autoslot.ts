import type { ParsedAutobranchArgs } from "@sdl/autobranch/dirty-worktree";
import { createCommandIo, runWithCommandIo, type CommandIo } from "@sdl/core/command-io";
import type { ExtensionAPI } from "@sdl/pi-extension-runtime/cmux/types";
import {
	commitAutobranchCheckpointMessage,
	prepareAutobranchCheckpointMessage,
} from "./autobranch/checkpoint.ts";
import { createAutobranchCheckpointFlow, type AutobranchFlowInput } from "./autobranch/flow.ts";
import { checkoutSlot } from "./slot-checkout.ts";

export interface AutoslotFlowInput extends AutobranchFlowInput {
	slotExec: Pick<ExtensionAPI, "exec">;
	io: CommandIo;
}

export interface AutoslotCliInput {
	cwd: string;
	env: Record<string, string | undefined>;
	args: ParsedAutobranchArgs;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string | undefined; timeout?: number | undefined },
	): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
	stdout(text: string): void;
	stderr(text: string): void;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
}

export async function runAutoslotCli(input: AutoslotCliInput): Promise<number> {
	let hasError = false;
	const io = createAutoslotCliCommandIo(input, () => {
		hasError = true;
	});
	await runWithCommandIo(
		io,
		async (io) =>
			await createAutoslotFlow({
				cwd: input.cwd,
				args: input.args,
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
				slotExec: {
					exec: (command, args, options) => input.exec(command, args, options),
				},
			}),
	);
	return hasError ? 1 : 0;
}

export async function createAutoslotFlow(input: AutoslotFlowInput): Promise<void> {
	const createdBranch = await createAutobranchCheckpointFlow({
		...input,
		onPhase: (message) => {
			input.io.phase(message);
		},
	});
	if (!createdBranch.ok) {
		input.io.notify(createdBranch.error, "error");
		return;
	}

	for (const warning of createdBranch.warnings) {
		input.io.notify(warning, "warning");
	}

	const branchName = parseCreatedBranchName(createdBranch.summary);
	const isCleanAfter = createdBranch.summary.includes("Working directory is clean.");
	if (!isCleanAfter) {
		input.io.notify(
			[
				`Autoslot created ${branchName}, but slot movement was skipped.`,
				"The worktree is not clean; `slot checkout --current` requires a clean worktree.",
			].join("\n"),
			"warning",
		);
		return;
	}

	input.io.phase("Checking out branch slot…");
	const slot = await checkoutSlot(input.slotExec, input.cwd, { kind: "current" });
	if (!slot.ok) {
		input.io.notify(
			[`Autoslot created ${branchName}, but slot checkout failed.`, "", slot.error].join("\n"),
			"error",
		);
		return;
	}

	input.io.notify(
		[
			`Autoslot moved ${slot.target.branchName} to ${slot.target.slotName}.`,
			`Worktree: ${slot.target.worktreePath}`,
			`slot co ${slot.target.branchName}`,
		].join("\n"),
		"info",
	);
}

function createAutoslotCliCommandIo(input: AutoslotCliInput, onError: () => void): CommandIo {
	const io = createCommandIo({
		...(input.onOutput === undefined
			? {}
			: { phaseTransient: (text: string) => input.onOutput?.("stderr", text) }),
		phaseFallback: input.stderr,
		notifyInfo: input.stdout,
		notifyDiagnostic: input.stderr,
	});

	return {
		...io,
		notify: (message, level = "info") => {
			if (level === "error") {
				onError();
			}
			io.notify(message, level);
		},
	};
}

function parseCreatedBranchName(summary: string): string {
	const firstLine = summary.split("\n")[0] ?? "";
	return firstLine.replace(/^New branch: /, "").replace(/ \(base slug .*\)$/, "");
}
