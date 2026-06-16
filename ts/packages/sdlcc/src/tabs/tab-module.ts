import type { StackMapCommandRunner } from "../command-runner.ts";

export interface TabViewport {
	readonly width: number;
	readonly height: number;
}

export interface TabKeyInput {
	readonly name?: string | undefined;
	readonly sequence?: string | undefined;
	readonly ctrl?: boolean | undefined;
	readonly meta?: boolean | undefined;
}

export interface TabModuleDeps {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly runCommand: StackMapCommandRunner;
}

// The host handles Tab/Shift+Tab itself, so modules never emit a "switch-tab" intent.
export type TabIntent<Action, Effect> =
	| { readonly type: "none" }
	| { readonly type: "quit" }
	| { readonly type: "action"; readonly action: Action }
	| { readonly type: "effect"; readonly effect: Effect };

export interface TabModule<Model, State, Action, Effect> {
	readonly id: string;
	readonly label: string;
	loadModel(deps: TabModuleDeps): Promise<Model>;
	createInitialState(model: Model): State;
	reduce(model: Model, state: State, action: Action): State;
	render(model: Model, state: State, viewport: TabViewport): readonly string[];
	interpretKey(state: State, key: TabKeyInput): TabIntent<Action, Effect>;
	// Optional; modules with no async effects use Effect = never and omit this.
	runEffect?(model: Model, state: State, effect: Effect, deps: TabModuleDeps): Promise<State>;
}
