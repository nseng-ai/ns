import { fileURLToPath } from "node:url";

import { shellQuote } from "@asdl/core/exec";

import { runRealCommand, type CommandOutput, type CommandRunner } from "./command-runner.ts";
import { isRecord, stringField } from "./json-fields.ts";
import {
	choicesForCmuxActivationPlan,
	planStackMapCmuxActivation,
	reduceStackMapState,
	type StackMapCmuxActivationPlan,
	type StackMapCmuxChoice,
	type StackMapCmuxTabTarget,
	type StackMapModel,
	type StackMapSlotAssignment,
	type StackMapState,
} from "./stack-map.ts";
import type { TabModuleDeps } from "./tabs/tab-module.ts";

const SDLCC_CLI_ENTRYPOINT_PATH = fileURLToPath(new URL("./cli.ts", import.meta.url));

const COMMAND_TIMEOUT_MS = 10_000;
const SLOT_CHECKOUT_TIMEOUT_MS = 30_000;

// The host's busy guard replaces the old `isActivating` flag, so effects only express *which*
// async cmux activation to run; computing the plan needs the model, which interpretKey lacks.
export type StackMapEffect =
	| { readonly type: "activate-cmux" }
	| { readonly type: "activate-choice" };

export interface StackMapCmuxActivationExecutor {
	focusTab(
		target: StackMapCmuxTabTarget,
	): Promise<{ readonly type: "focused" } | { readonly type: "failed"; readonly message: string }>;
	openNew(
		branch: string,
		slot?: StackMapSlotAssignment | undefined,
	): Promise<
		| { readonly type: "opened"; readonly message: string }
		| { readonly type: "failed"; readonly message: string }
	>;
}

export interface CreateStackMapCmuxActivationExecutorOptions {
	readonly cwd?: string | undefined;
	readonly runCommand?: CommandRunner | undefined;
}

interface SlotCheckoutTarget {
	readonly slotName: string;
	readonly branchName: string;
	readonly worktreePath: string;
}

export async function runStackMapEffect(
	model: StackMapModel,
	state: StackMapState,
	effect: StackMapEffect,
	deps: TabModuleDeps,
): Promise<StackMapState> {
	const executor = createStackMapCmuxActivationExecutor({
		cwd: deps.cwd,
		runCommand: deps.runCommand,
	});
	if (effect.type === "activate-choice") {
		if (state.mode.type !== "cmux-choice") return state;
		return executeChoice(model, state, executor, state.mode.choices[state.mode.selectedIndex]);
	}

	const plan = planStackMapCmuxActivation(model, state);
	if (plan.type === "choose-tab") {
		return reduceStackMapState(model, state, {
			type: "show-cmux-choice",
			branch: plan.branch,
			choices: choicesForCmuxActivationPlan(plan),
		});
	}
	return executeActivationPlan(model, state, executor, plan);
}

export function createStackMapCmuxActivationExecutor(
	options: CreateStackMapCmuxActivationExecutorOptions = {},
): StackMapCmuxActivationExecutor {
	const cwd = options.cwd ?? process.cwd();
	const runCommand = options.runCommand ?? runRealCommand;
	return {
		async focusTab(target) {
			const params = JSON.stringify({
				surface_id: target.surfaceRef,
				workspace_id: target.workspaceRef,
				window_id: target.windowRef,
			});
			const result = await runCommand("cmux", ["rpc", "surface.focus", params], {
				cwd,
				timeout: COMMAND_TIMEOUT_MS,
			});
			if (result.code === 0) return { type: "focused" };
			return { type: "failed", message: commandFailureMessage("cmux rpc surface.focus", result) };
		},
		async openNew(branch, slot) {
			const checkout =
				slot?.worktreePath === undefined
					? await checkoutSlot(runCommand, cwd, branch)
					: { type: "checked-out" as const, target: slotTargetFromAssignment(branch, slot) };
			if (checkout.type === "failed") return checkout;

			const target = checkout.target;
			const description = `sdlcc cmux workspace for ${target.branchName}`;
			const args = buildNewWorkspaceArgs({
				branchName: target.branchName,
				worktreePath: target.worktreePath,
				description,
			});
			const result = await runCommand("cmux", args, {
				cwd: target.worktreePath,
				timeout: COMMAND_TIMEOUT_MS,
			});
			if (result.code === 0)
				return {
					type: "opened",
					message: `Opened cmux workspace for ${target.branchName} in ${target.slotName}.`,
				};
			return { type: "failed", message: commandFailureMessage("cmux new-workspace", result) };
		},
	};
}

export function buildNewWorkspaceArgs(options: {
	readonly branchName: string;
	readonly worktreePath: string;
	readonly description: string;
}): readonly string[] {
	return [
		"new-workspace",
		"--name",
		options.branchName,
		"--description",
		options.description,
		"--cwd",
		options.worktreePath,
		"--command",
		buildSdlccCmuxReportBootstrapCommand(),
	];
}

export function buildSdlccCmuxReportBootstrapCommand(
	cliEntrypointPath: string = SDLCC_CLI_ENTRYPOINT_PATH,
): string {
	return `bun ${shellQuote(cliEntrypointPath)} cmux report || true; exec ${"${SHELL:-/bin/zsh}"} -l`;
}

async function executeChoice(
	model: StackMapModel,
	state: StackMapState,
	executor: StackMapCmuxActivationExecutor,
	choice: StackMapCmuxChoice | undefined,
): Promise<StackMapState> {
	if (choice === undefined) {
		return reduceStackMapState(model, state, {
			type: "set-status",
			message: "No cmux chooser item is selected.",
		});
	}
	const plan: StackMapCmuxActivationPlan =
		choice.type === "tab"
			? { type: "focus-tab", branch: state.selectedBranch, target: choice.target }
			: openNewActivationPlan(choice.branch, choice.slot);
	return executeActivationPlan(model, state, executor, plan);
}

async function executeActivationPlan(
	model: StackMapModel,
	state: StackMapState,
	executor: StackMapCmuxActivationExecutor,
	plan: StackMapCmuxActivationPlan,
): Promise<StackMapState> {
	if (plan.type === "unavailable") {
		return reduceStackMapState(model, state, { type: "set-status", message: plan.reason });
	}

	const result =
		plan.type === "focus-tab"
			? await executor.focusTab(plan.target)
			: await executor.openNew(plan.branch, plan.slot);
	const message =
		result.type === "failed"
			? result.message
			: result.type === "focused"
				? `Focused cmux tab for ${plan.branch}.`
				: result.message;
	return reduceStackMapState(model, state, { type: "set-status", message });
}

async function checkoutSlot(
	runCommand: CommandRunner,
	cwd: string,
	branch: string,
): Promise<
	| { readonly type: "checked-out"; readonly target: SlotCheckoutTarget }
	| { readonly type: "failed"; readonly message: string }
> {
	const args = ["checkout", branch, "--format", "json", "--no-clipboard"];
	const result = await runCommand("slot", args, { cwd, timeout: SLOT_CHECKOUT_TIMEOUT_MS });
	if (result.code !== 0)
		return { type: "failed", message: commandFailureMessage("slot checkout", result) };
	const target = parseSlotCheckoutTarget(result.stdout);
	if (target === undefined)
		return {
			type: "failed",
			message:
				"slot checkout returned unreadable JSON; expected slot_name, branch_name, and worktree_path.",
		};
	return { type: "checked-out", target };
}

function parseSlotCheckoutTarget(stdout: string): SlotCheckoutTarget | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || !isRecord(parsed.data)) return undefined;
	const slotName = stringField(parsed.data, "slot_name");
	const branchName = stringField(parsed.data, "branch_name");
	const worktreePath = stringField(parsed.data, "worktree_path");
	if (slotName === undefined || branchName === undefined || worktreePath === undefined)
		return undefined;
	return { slotName, branchName, worktreePath };
}

function openNewActivationPlan(
	branch: string,
	slot: StackMapSlotAssignment | undefined,
): StackMapCmuxActivationPlan {
	return slot === undefined ? { type: "open-new", branch } : { type: "open-new", branch, slot };
}

function slotTargetFromAssignment(
	branch: string,
	slot: StackMapSlotAssignment,
): SlotCheckoutTarget {
	return {
		slotName: slot.slotName,
		branchName: branch,
		worktreePath: slot.worktreePath ?? process.cwd(),
	};
}

function commandFailureMessage(commandName: string, result: CommandOutput): string {
	return `${commandName} failed with exit code ${result.code}. stdout: ${result.stdout.trim() || "(empty)"} stderr: ${result.stderr.trim() || "(empty)"}`;
}
