import type { NsProgressPhaseEvent } from "@nseng-ai/kernel/sdk";
import type { PhaseState, StatusLineItem } from "@nseng-ai/foundation/cli-theme";

import type { PhaseSpec } from "./phase-stream-specs.ts";

export interface PhaseView {
	item: StatusLineItem;
	state: PhaseState;
	label: string | undefined;
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
	const indexByKey = new Map(specs.map((spec, index) => [spec.key, index] as const));
	let activeIndex = -1;

	function views(): readonly PhaseView[] {
		return specs.map((spec, index) => ({
			item: spec.item,
			state: states[index] ?? "pending",
			label: labels[index],
		}));
	}

	function markEarlierDone(index: number): void {
		for (let i = 0; i < index; i += 1) {
			const state = states[i];
			if (state === "pending" || state === "active") states[i] = "done";
		}
	}

	function setActive(index: number): void {
		markEarlierDone(index);
		states[index] = "active";
		activeIndex = index;
	}

	function apply(event: NsProgressPhaseEvent): PhaseTransition {
		const index = indexByKey.get(event.phaseKey);
		if (index === undefined) return { type: "ignored" };
		const spec = specs[index];
		if (spec === undefined) return { type: "ignored" };

		switch (event.type) {
			case "phase-started":
				setActive(index);
				labels[index] = event.label ?? spec.item.label;
				return { type: "surface", line: labels[index] };
			case "phase-progress":
				if (states[index] === "pending") setActive(index);
				labels[index] = event.label;
				return { type: "surface", line: event.label };
			case "phase-done":
				states[index] = "done";
				return { type: "render", clearTranscript: true };
			case "phase-failed":
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
			if (state === "pending" || state === "active") states[i] = "done";
		}
	}

	return { views, apply, failActive, settleOpenPhases };
}
