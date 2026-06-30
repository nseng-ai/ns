import type { CommandRunner } from "../command-runner.ts";

export interface TabKeyInput {
	// optional-undefined-objective: preserve (key-event) — Terminal key-event payload shape (looser mirror of @opentui/core KeyEvent) consumed via `key.name ??`; Objective precedent preserves tab key descriptors as input surfaces.
	readonly name?: string | undefined;
	// optional-undefined-objective: preserve (key-event) — Terminal key-event payload field consumed via `=== undefined` checks; key-descriptor input surface preserved per precedent.
	readonly sequence?: string | undefined;
	// optional-undefined-objective: preserve (key-event) — Terminal key-event modifier payload field mirroring @opentui/core KeyEvent; key-descriptor input surface preserved per precedent.
	readonly ctrl?: boolean | undefined;
	// optional-undefined-objective: preserve (key-event) — Terminal key-event modifier payload field mirroring @opentui/core KeyEvent; key-descriptor input surface preserved per precedent.
	readonly meta?: boolean | undefined;
}

export interface TabModuleDeps {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly runCommand: CommandRunner;
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
	render(model: Model, state: State): readonly string[];
	interpretKey(state: State, key: TabKeyInput): TabIntent<Action, Effect>;
	// Optional; modules with no async effects use Effect = never and omit this.
	runEffect?(model: Model, state: State, effect: Effect, deps: TabModuleDeps): Promise<State>;
}
