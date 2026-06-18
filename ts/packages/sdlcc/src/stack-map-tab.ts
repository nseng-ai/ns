import { runStackMapEffect, type StackMapEffect } from "./stack-map-effects.ts";
import { loadStackMapModel } from "./stack-map-model-loader.ts";
import {
	createInitialStackMapState,
	reduceStackMapState,
	renderStackMapFrame,
	type StackMapAction,
	type StackMapModel,
	type StackMapState,
} from "./stack-map.ts";
import type { TabIntent, TabKeyInput, TabModule, TabModuleDeps } from "./tabs/tab-module.ts";

export type StackMapTabModule = TabModule<StackMapModel, StackMapState, StackMapAction, StackMapEffect>;

export type StackMapKeyInput = TabKeyInput;

export type StackMapKeyIntent =
	| { readonly type: "none" }
	| { readonly type: "quit" }
	| { readonly type: "activate-cmux" }
	| { readonly type: "activate-choice" }
	| { readonly type: "action"; readonly action: StackMapAction };

export const stackMapTabModule: StackMapTabModule = {
	id: "stack-map",
	label: "stack map",
	loadModel: (deps: TabModuleDeps): Promise<StackMapModel> => loadStackMapModel({ cwd: deps.cwd, runCommand: deps.runCommand }),
	createInitialState: createInitialStackMapState,
	reduce: reduceStackMapState,
	render: (model, state) => renderStackMapFrame(model, state).split("\n"),
	interpretKey: (state, key) => mapStackMapIntent(interpretStackMapKey(state, key)),
	runEffect: runStackMapEffect,
};

function mapStackMapIntent(intent: StackMapKeyIntent): TabIntent<StackMapAction, StackMapEffect> {
	switch (intent.type) {
		case "none":
			return { type: "none" };
		case "quit":
			return { type: "quit" };
		case "action":
			return { type: "action", action: intent.action };
		case "activate-cmux":
			return { type: "effect", effect: { type: "activate-cmux" } };
		case "activate-choice":
			return { type: "effect", effect: { type: "activate-choice" } };
	}
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
		case "d":
			return { type: "action", action: { type: "toggle-diagnostics" } };
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
