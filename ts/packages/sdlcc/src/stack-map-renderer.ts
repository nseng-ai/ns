import { fileURLToPath } from "node:url";

import { BoxRenderable, createCliRenderer, TextRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";

import { runRealCommand, type StackMapCommandOutput, type StackMapCommandRunner } from "./command-runner.ts";
import { isRecord, stringField } from "./json-fields.ts";
import {
	choicesForCmuxActivationPlan,
	createInitialStackMapState,
	planStackMapCmuxActivation,
	reduceStackMapState,
	renderStackMapFrame,
	type StackMapAction,
	type StackMapCmuxActivationPlan,
	type StackMapCmuxChoice,
	type StackMapCmuxTabTarget,
	type StackMapModel,
	type StackMapState,
	type StackMapSlotAssignment,
} from "./stack-map.ts";

const SDLCC_CLI_ENTRYPOINT_PATH = fileURLToPath(new URL("./cli.ts", import.meta.url));

const COMMAND_TIMEOUT_MS = 10_000;
const SLOT_CHECKOUT_TIMEOUT_MS = 30_000;

export interface StartStackMapTuiOptions {
	readonly model: StackMapModel;
	readonly activationExecutor?: StackMapCmuxActivationExecutor | undefined;
}

export interface StackMapCmuxActivationExecutor {
	focusTab(target: StackMapCmuxTabTarget): Promise<{ readonly type: "focused" } | { readonly type: "failed"; readonly message: string }>;
	openNew(branch: string, slot?: StackMapSlotAssignment | undefined): Promise<{ readonly type: "opened"; readonly message: string } | { readonly type: "failed"; readonly message: string }>;
}

export interface CreateStackMapCmuxActivationExecutorOptions {
	readonly cwd?: string | undefined;
	readonly runCommand?: StackMapCommandRunner | undefined;
}

interface MountedStackMapScreen {
	readonly frame: TextRenderable;
}

interface SlotCheckoutTarget {
	readonly slotName: string;
	readonly branchName: string;
	readonly worktreePath: string;
}

export interface StackMapKeyInput {
	readonly name?: string | undefined;
	readonly sequence?: string | undefined;
	readonly ctrl?: boolean | undefined;
	readonly meta?: boolean | undefined;
}

export type StackMapKeyIntent =
	| { readonly type: "none" }
	| { readonly type: "quit" }
	| { readonly type: "activate-cmux" }
	| { readonly type: "activate-choice" }
	| { readonly type: "action"; readonly action: StackMapAction };

export async function startStackMapTui(options: StartStackMapTuiOptions): Promise<void> {
	const model = options.model;
	const activationExecutor = options.activationExecutor ?? createStackMapCmuxActivationExecutor();
	let state = createInitialStackMapState(model);
	let renderer: CliRenderer | undefined;
	let isActivating = false;

	try {
		renderer = await createCliRenderer({ exitOnCtrlC: true });
		const screen = mountStackMapScreen(renderer, model, state);
		const setState = (nextState: StackMapState): void => {
			if (nextState === state) return;
			state = nextState;
			screen.frame.content = renderStackMapFrame(model, state);
			renderer?.requestRender();
		};

		renderer.keyInput.on("keypress", (key: KeyEvent) => {
			void handleStackMapKey({ model, getState: () => state, setState, key, renderer, activationExecutor, isActivating, setActivating: (value) => { isActivating = value; } });
		});

		const destroyed = new Promise<void>((resolve) => {
			renderer?.once("destroy", () => resolve());
		});
		renderer.start();
		await destroyed;
	} catch (error) {
		if (renderer !== undefined && !renderer.isDestroyed) {
			renderer.destroy();
		}
		throw error;
	}
}

export function createStackMapCmuxActivationExecutor(options: CreateStackMapCmuxActivationExecutorOptions = {}): StackMapCmuxActivationExecutor {
	const cwd = options.cwd ?? process.cwd();
	const runCommand = options.runCommand ?? runRealCommand;
	return {
		async focusTab(target) {
			const params = JSON.stringify({
				surface_id: target.surfaceRef,
				workspace_id: target.workspaceRef,
				window_id: target.windowRef,
			});
			const result = await runCommand("cmux", ["rpc", "surface.focus", params], { cwd, timeoutMs: COMMAND_TIMEOUT_MS });
			if (result.code === 0) return { type: "focused" };
			return { type: "failed", message: commandFailureMessage("cmux rpc surface.focus", result) };
		},
		async openNew(branch, slot) {
			const checkout = slot?.worktreePath === undefined ? await checkoutSlot(runCommand, cwd, branch) : { type: "checked-out" as const, target: slotTargetFromAssignment(branch, slot) };
			if (checkout.type === "failed") return checkout;

			const target = checkout.target;
			const description = `sdlcc cmux workspace for ${target.branchName}`;
			const args = buildNewWorkspaceArgs({ branchName: target.branchName, worktreePath: target.worktreePath, description });
			const result = await runCommand("cmux", args, { cwd: target.worktreePath, timeoutMs: COMMAND_TIMEOUT_MS });
			if (result.code === 0) return { type: "opened", message: `Opened cmux workspace for ${target.branchName} in ${target.slotName}.` };
			return { type: "failed", message: commandFailureMessage("cmux new-workspace", result) };
		},
	};
}

export function buildNewWorkspaceArgs(options: { readonly branchName: string; readonly worktreePath: string; readonly description: string }): readonly string[] {
	return ["new-workspace", "--name", options.branchName, "--description", options.description, "--cwd", options.worktreePath, "--command", buildSdlccCmuxReportBootstrapCommand()];
}

export function buildSdlccCmuxReportBootstrapCommand(cliEntrypointPath: string = SDLCC_CLI_ENTRYPOINT_PATH): string {
	return `bun ${shellQuote(cliEntrypointPath)} cmux report || true; exec ${"${SHELL:-/bin/zsh}"} -l`;
}

function mountStackMapScreen(
	renderer: CliRenderer,
	model: StackMapModel,
	state: StackMapState,
): MountedStackMapScreen {
	const root = new BoxRenderable(renderer, {
		id: "sdlcc-stack-map-root",
		width: "100%",
		height: "100%",
		flexDirection: "column",
		border: true,
		borderStyle: "rounded",
		borderColor: "#7aa2f7",
		backgroundColor: "#111827",
		padding: 1,
		title: "sdlcc",
		titleAlignment: "center",
	});

	const frame = new TextRenderable(renderer, {
		id: "sdlcc-stack-map-frame",
		content: renderStackMapFrame(model, state),
		fg: "#cdd6f4",
		width: "100%",
		height: "100%",
	});

	root.add(frame);
	renderer.root.add(root);
	renderer.requestRender();

	return { frame };
}

async function handleStackMapKey(options: {
	readonly model: StackMapModel;
	readonly getState: () => StackMapState;
	readonly setState: (state: StackMapState) => void;
	readonly key: KeyEvent;
	readonly renderer: CliRenderer | undefined;
	readonly activationExecutor: StackMapCmuxActivationExecutor;
	readonly isActivating: boolean;
	readonly setActivating: (value: boolean) => void;
}): Promise<void> {
	const { model, key } = options;
	const state = options.getState();
	const intent = interpretStackMapKey(state, key);
	if (intent.type === "none") return;
	if (intent.type === "quit") {
		options.renderer?.destroy();
		return;
	}
	if (options.isActivating) return;
	if (intent.type === "action") {
		options.setState(reduceStackMapState(model, state, intent.action));
		return;
	}
	if (intent.type === "activate-choice") {
		if (state.mode.type === "cmux-choice") await executeChoice(options, state.mode.choices[state.mode.selectedIndex]);
		return;
	}
	if (intent.type !== "activate-cmux") return;

	const plan = planStackMapCmuxActivation(model, state);
	if (plan.type === "choose-tab") {
		options.setState(reduceStackMapState(model, state, { type: "show-cmux-choice", branch: plan.branch, choices: choicesForCmuxActivationPlan(plan) }));
		return;
	}
	await executeActivationPlan(options, plan);
}

export function interpretStackMapKey(state: StackMapState, key: StackMapKeyInput): StackMapKeyIntent {
	if (key.ctrl || key.meta) return { type: "none" };
	const keyName = key.name ?? printableCharacterFromStackMapKey(key);

	if (state.mode.type === "cmux-choice") {
		switch (keyName) {
			case "up":
			case "k":
				return { type: "action", action: { type: "move-choice", delta: -1 } };
			case "down":
			case "j":
				return { type: "action", action: { type: "move-choice", delta: 1 } };
			case "enter":
			case "return":
				return { type: "activate-choice" };
			case "escape":
				return { type: "action", action: { type: "cancel-choice" } };
			case "q":
				return { type: "quit" };
			default:
				return { type: "none" };
		}
	}

	if (state.mode.type === "query") {
		switch (keyName) {
			case "backspace":
				return { type: "action", action: { type: "delete-query-char" } };
			case "enter":
			case "return":
				return { type: "action", action: { type: "accept-query" } };
			case "escape":
				return { type: "action", action: { type: "clear-query" } };
			default: {
				const value = printableCharacterFromStackMapKey(key);
				return value === undefined ? { type: "none" } : { type: "action", action: { type: "append-query", value } };
			}
		}
	}

	switch (keyName) {
		case "up":
		case "k":
			return { type: "action", action: { type: "move-selection", delta: -1 } };
		case "down":
		case "j":
			return { type: "action", action: { type: "move-selection", delta: 1 } };
		case "o":
			return { type: "action", action: { type: "toggle-scope" } };
		case "/":
			return { type: "action", action: { type: "start-query" } };
		case "c":
			return { type: "activate-cmux" };
		case "q":
		case "escape":
			return { type: "quit" };
		default:
			return { type: "none" };
	}
}

export function printableCharacterFromStackMapKey(key: StackMapKeyInput): string | undefined {
	if (key.ctrl || key.meta) return undefined;
	const sequence = key.sequence;
	if (sequence === undefined || [...sequence].length !== 1) return undefined;
	if (sequence < " " || sequence === "\x7F") return undefined;
	return sequence;
}

async function executeChoice(options: {
	readonly model: StackMapModel;
	readonly getState: () => StackMapState;
	readonly setState: (state: StackMapState) => void;
	readonly activationExecutor: StackMapCmuxActivationExecutor;
	readonly setActivating: (value: boolean) => void;
}, choice: StackMapCmuxChoice | undefined): Promise<void> {
	const state = options.getState();
	if (choice === undefined) {
		options.setState(reduceStackMapState(options.model, state, { type: "set-status", message: "No cmux chooser item is selected." }));
		return;
	}
	const plan: StackMapCmuxActivationPlan = choice.type === "tab"
		? { type: "focus-tab", branch: state.selectedBranch, target: choice.target }
		: openNewActivationPlan(choice.branch, choice.slot);
	await executeActivationPlan(options, plan);
}

async function executeActivationPlan(options: {
	readonly model: StackMapModel;
	readonly getState: () => StackMapState;
	readonly setState: (state: StackMapState) => void;
	readonly activationExecutor: StackMapCmuxActivationExecutor;
	readonly setActivating: (value: boolean) => void;
}, plan: StackMapCmuxActivationPlan): Promise<void> {
	const state = options.getState();
	if (plan.type === "unavailable") {
		options.setState(reduceStackMapState(options.model, state, { type: "set-status", message: plan.reason }));
		return;
	}

	options.setActivating(true);
	try {
		const pendingMessage = plan.type === "focus-tab" ? `Focusing cmux tab for ${plan.branch}…` : `Opening cmux workspace for ${plan.branch}…`;
		options.setState(reduceStackMapState(options.model, state, { type: "set-status", message: pendingMessage }));
		const result = plan.type === "focus-tab"
			? await options.activationExecutor.focusTab(plan.target)
			: await options.activationExecutor.openNew(plan.branch, plan.slot);
		const message = result.type === "failed" ? result.message : result.type === "focused" ? `Focused cmux tab for ${plan.branch}.` : result.message;
		options.setState(reduceStackMapState(options.model, options.getState(), { type: "set-status", message }));
	} finally {
		options.setActivating(false);
	}
}

async function checkoutSlot(runCommand: StackMapCommandRunner, cwd: string, branch: string): Promise<{ readonly type: "checked-out"; readonly target: SlotCheckoutTarget } | { readonly type: "failed"; readonly message: string }> {
	const args = ["checkout", branch, "--format", "json", "--no-clipboard"];
	const result = await runCommand("slot", args, { cwd, timeoutMs: SLOT_CHECKOUT_TIMEOUT_MS });
	if (result.code !== 0) return { type: "failed", message: commandFailureMessage("slot checkout", result) };
	const target = parseSlotCheckoutTarget(result.stdout);
	if (target === undefined) return { type: "failed", message: "slot checkout returned unreadable JSON; expected slot_name, branch_name, and worktree_path." };
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
	if (slotName === undefined || branchName === undefined || worktreePath === undefined) return undefined;
	return { slotName, branchName, worktreePath };
}

function openNewActivationPlan(branch: string, slot: StackMapSlotAssignment | undefined): StackMapCmuxActivationPlan {
	return slot === undefined ? { type: "open-new", branch } : { type: "open-new", branch, slot };
}

function slotTargetFromAssignment(branch: string, slot: StackMapSlotAssignment): SlotCheckoutTarget {
	return {
		slotName: slot.slotName,
		branchName: branch,
		worktreePath: slot.worktreePath ?? process.cwd(),
	};
}

function commandFailureMessage(commandName: string, result: StackMapCommandOutput): string {
	return `${commandName} failed with exit code ${result.code}. stdout: ${result.stdout.trim() || "(empty)"} stderr: ${result.stderr.trim() || "(empty)"}`;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
