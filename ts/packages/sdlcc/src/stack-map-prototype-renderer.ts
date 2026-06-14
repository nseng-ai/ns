import { fileURLToPath } from "node:url";

import { BoxRenderable, createCliRenderer, TextRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";

import { runRealCommand, type StackMapCommandOutput, type StackMapCommandRunner } from "./command-runner.ts";
import {
	buildStackMapPrototypeModel,
	choicesForCmuxActivationPlan,
	createInitialStackMapState,
	planStackMapCmuxActivation,
	reduceStackMapPrototypeState,
	renderStackMapPrototypeFrame,
	type StackMapCmuxActivationPlan,
	type StackMapCmuxChoice,
	type StackMapCmuxTabTarget,
	type StackMapPrototypeModel,
	type StackMapPrototypeState,
	type StackMapSlotAssignment,
} from "./stack-map-prototype.ts";

const SDLCC_CLI_ENTRYPOINT_PATH = fileURLToPath(new URL("./cli.ts", import.meta.url));

const COMMAND_TIMEOUT_MS = 10_000;
const SLOT_CHECKOUT_TIMEOUT_MS = 30_000;

export interface StartStackMapPrototypeTuiOptions {
	readonly model?: StackMapPrototypeModel | undefined;
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

interface MountedStackMapPrototypeScreen {
	readonly frame: TextRenderable;
}

interface SlotCheckoutTarget {
	readonly slotName: string;
	readonly branchName: string;
	readonly worktreePath: string;
}

export async function startStackMapPrototypeTui(options: StartStackMapPrototypeTuiOptions = {}): Promise<void> {
	const model = options.model ?? buildStackMapPrototypeModel();
	const activationExecutor = options.activationExecutor ?? createStackMapCmuxActivationExecutor();
	let state = createInitialStackMapState(model);
	let renderer: CliRenderer | undefined;
	let isActivating = false;

	try {
		renderer = await createCliRenderer({ exitOnCtrlC: true });
		const screen = mountStackMapPrototypeScreen(renderer, model, state);
		const setState = (nextState: StackMapPrototypeState): void => {
			if (nextState === state) return;
			state = nextState;
			screen.frame.content = renderStackMapPrototypeFrame(model, state);
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

function mountStackMapPrototypeScreen(
	renderer: CliRenderer,
	model: StackMapPrototypeModel,
	state: StackMapPrototypeState,
): MountedStackMapPrototypeScreen {
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
		content: renderStackMapPrototypeFrame(model, state),
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
	readonly model: StackMapPrototypeModel;
	readonly getState: () => StackMapPrototypeState;
	readonly setState: (state: StackMapPrototypeState) => void;
	readonly key: KeyEvent;
	readonly renderer: CliRenderer | undefined;
	readonly activationExecutor: StackMapCmuxActivationExecutor;
	readonly isActivating: boolean;
	readonly setActivating: (value: boolean) => void;
}): Promise<void> {
	const { model, key } = options;
	const state = options.getState();
	if (key.ctrl || key.meta) return;
	if (key.name === "q") {
		options.renderer?.destroy();
		return;
	}
	if (key.name === "escape") {
		if (state.mode.type === "cmux-choice") {
			options.setState(reduceStackMapPrototypeState(model, state, { type: "cancel-choice" }));
			return;
		}
		options.renderer?.destroy();
		return;
	}
	if (options.isActivating) return;

	if (state.mode.type === "cmux-choice") {
		await handleChooserKey(options);
		return;
	}

	const nextState = reduceFromRowsKey(model, state, key);
	if (nextState !== state) {
		options.setState(nextState);
		return;
	}
	if (key.name !== "c") return;

	const plan = planStackMapCmuxActivation(model, state);
	if (plan.type === "choose-tab") {
		options.setState(reduceStackMapPrototypeState(model, state, { type: "show-cmux-choice", branch: plan.branch, choices: choicesForCmuxActivationPlan(plan) }));
		return;
	}
	await executeActivationPlan(options, plan);
}

async function handleChooserKey(options: {
	readonly model: StackMapPrototypeModel;
	readonly getState: () => StackMapPrototypeState;
	readonly setState: (state: StackMapPrototypeState) => void;
	readonly key: KeyEvent;
	readonly renderer: CliRenderer | undefined;
	readonly activationExecutor: StackMapCmuxActivationExecutor;
	readonly isActivating: boolean;
	readonly setActivating: (value: boolean) => void;
}): Promise<void> {
	const state = options.getState();
	if (state.mode.type !== "cmux-choice") return;

	switch (options.key.name) {
		case "up":
		case "k":
			options.setState(reduceStackMapPrototypeState(options.model, state, { type: "move-choice", delta: -1 }));
			return;
		case "down":
		case "j":
			options.setState(reduceStackMapPrototypeState(options.model, state, { type: "move-choice", delta: 1 }));
			return;
		case "enter":
		case "return":
			await executeChoice(options, state.mode.choices[state.mode.selectedIndex]);
			return;
	}
}

function reduceFromRowsKey(
	model: StackMapPrototypeModel,
	state: StackMapPrototypeState,
	key: KeyEvent,
): StackMapPrototypeState {
	switch (key.name) {
		case "up":
		case "k":
			return reduceStackMapPrototypeState(model, state, { type: "move-selection", delta: -1 });
		case "down":
		case "j":
			return reduceStackMapPrototypeState(model, state, { type: "move-selection", delta: 1 });
		case "o":
			return reduceStackMapPrototypeState(model, state, { type: "toggle-filter" });
		case "?":
			return reduceStackMapPrototypeState(model, state, { type: "toggle-question" });
		default:
			return state;
	}
}

async function executeChoice(options: {
	readonly model: StackMapPrototypeModel;
	readonly getState: () => StackMapPrototypeState;
	readonly setState: (state: StackMapPrototypeState) => void;
	readonly activationExecutor: StackMapCmuxActivationExecutor;
	readonly setActivating: (value: boolean) => void;
}, choice: StackMapCmuxChoice | undefined): Promise<void> {
	const state = options.getState();
	if (choice === undefined) {
		options.setState(reduceStackMapPrototypeState(options.model, state, { type: "set-status", message: "No cmux chooser item is selected." }));
		return;
	}
	const plan: StackMapCmuxActivationPlan = choice.type === "tab"
		? { type: "focus-tab", branch: state.selectedBranch, target: choice.target }
		: choice.slot === undefined
			? { type: "open-new", branch: choice.branch }
			: { type: "open-new", branch: choice.branch, slot: choice.slot };
	await executeActivationPlan(options, plan);
}

async function executeActivationPlan(options: {
	readonly model: StackMapPrototypeModel;
	readonly getState: () => StackMapPrototypeState;
	readonly setState: (state: StackMapPrototypeState) => void;
	readonly activationExecutor: StackMapCmuxActivationExecutor;
	readonly setActivating: (value: boolean) => void;
}, plan: StackMapCmuxActivationPlan): Promise<void> {
	const state = options.getState();
	if (plan.type === "unavailable") {
		options.setState(reduceStackMapPrototypeState(options.model, state, { type: "set-status", message: plan.reason }));
		return;
	}

	options.setActivating(true);
	try {
		const pendingMessage = plan.type === "focus-tab" ? `Focusing cmux tab for ${plan.branch}…` : `Opening cmux workspace for ${plan.branch}…`;
		options.setState(reduceStackMapPrototypeState(options.model, state, { type: "set-status", message: pendingMessage }));
		const result = plan.type === "focus-tab"
			? await options.activationExecutor.focusTab(plan.target)
			: await options.activationExecutor.openNew(plan.branch, plan.slot);
		const message = result.type === "failed" ? result.message : result.type === "focused" ? `Focused cmux tab for ${plan.branch}.` : result.message;
		options.setState(reduceStackMapPrototypeState(options.model, options.getState(), { type: "set-status", message }));
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

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
