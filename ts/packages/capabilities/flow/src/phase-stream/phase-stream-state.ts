import type { NsProgressPhaseEvent } from "@nseng-ai/kernel/sdk";
import type { PhaseState, StatusLineItem } from "@nseng-ai/foundation/cli-theme";

import type { PhaseSpec } from "./phase-stream-specs.ts";

export interface PhaseView {
	item: StatusLineItem;
	state: PhaseState;
	label: string | undefined;
	history: readonly string[];
}

export type PhaseTransition =
	| { type: "ignored" }
	| { type: "surface"; line: string | undefined }
	| { type: "render"; clearTranscript: boolean };

export interface PhaseStateStore {
	views(): readonly PhaseView[];
	apply(event: NsProgressPhaseEvent): PhaseTransition;
	failActive(): void;
	settleOpenPhases(): void;
}

export function createPhaseStateStore(specs: readonly PhaseSpec[]): PhaseStateStore {
	const states: PhaseState[] = specs.map(() => "pending");
	const labels: (string | undefined)[] = specs.map((spec) => spec.item.label);
	const histories: string[][] = specs.map(() => []);
	const indexByKey = new Map(specs.map((spec, index) => [spec.key, index] as const));
	let activeIndex = -1;

	function views(): readonly PhaseView[] {
		return specs.map((spec, index) => ({
			item: spec.item,
			state: states[index] ?? "pending",
			label: labels[index],
			history: histories[index]?.slice() ?? [],
		}));
	}

	function markEarlierDone(index: number): void {
		for (let i = 0; i < index; i += 1) {
			const state = states[i];
			const spec = specs[i];
			if (state === "active" && spec !== undefined) pushSupersededLabel(i, spec.item.detail);
			if (state === "pending" || state === "active") states[i] = "done";
		}
	}

	function setActive(index: number): void {
		markEarlierDone(index);
		states[index] = "active";
		activeIndex = index;
	}

	function pushSupersededLabel(index: number, newLabel: string | undefined): void {
		const previous = labels[index];
		if (previous === undefined || previous === newLabel) return;
		histories[index]?.push(previous);
	}

	function apply(event: NsProgressPhaseEvent): PhaseTransition {
		if (event.type === "phases-declared" || event.type === "title-changed") {
			return { type: "ignored" };
		}
		const index = indexByKey.get(event.phaseKey);
		if (index === undefined) return { type: "ignored" };
		const spec = specs[index];
		if (spec === undefined) return { type: "ignored" };

		switch (event.type) {
			case "phase-started": {
				setActive(index);
				const label = event.label ?? spec.item.label;
				pushSupersededLabel(index, label);
				labels[index] = label;
				return { type: "surface", line: labels[index] };
			}
			case "phase-progress":
				if (states[index] === "pending") setActive(index);
				pushSupersededLabel(index, event.label);
				labels[index] = event.label;
				return { type: "surface", line: event.label };
			case "phase-done":
				pushSupersededLabel(index, spec.item.detail);
				states[index] = "done";
				return { type: "render", clearTranscript: true };
			case "phase-failed":
				pushSupersededLabel(index, event.detail);
				states[index] = "failed";
				labels[index] = event.detail;
				return { type: "render", clearTranscript: true };
		}
	}

	function failActive(): void {
		if (activeIndex >= 0) states[activeIndex] = "failed";
	}

	function settleOpenPhases(): void {
		const hasFailure = states.some((state) => state === "failed");
		if (hasFailure) return;
		for (let i = 0; i < states.length; i += 1) {
			const state = states[i];
			const spec = specs[i];
			if (state === "active" && spec !== undefined) pushSupersededLabel(i, spec.item.detail);
			if (state === "pending" || state === "active") states[i] = "done";
		}
	}

	return { views, apply, failActive, settleOpenPhases };
}
