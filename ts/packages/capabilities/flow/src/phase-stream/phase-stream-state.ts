import {
	createProgressPhaseStateStore,
	type ProgressPhaseSpec,
	type ProgressPhaseView,
} from "@nseng-ai/sdk/progress-phase-state";
import { isMatrixProgressEvent, type NsProgressPhaseEvent } from "@nseng-ai/sdk";
import type { PhaseState, StatusLineItem } from "@nseng-ai/foundation/cli-theme";

import type { PhaseSpec, PhaseSubstepSpec } from "./phase-stream-specs.ts";

export interface PhaseView {
	key: string;
	item: StatusLineItem;
	state: PhaseState;
	label: string | undefined;
	history: readonly string[];
	substeps: readonly PhaseView[];
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
	const store = createProgressPhaseStateStore({ phases: specs.map(progressSpecForPhase) });
	const itemByKey = indexItems(specs);

	function views(): readonly PhaseView[] {
		return store.views().map(viewForProgressView);
	}

	function apply(event: NsProgressPhaseEvent): PhaseTransition {
		const affectedView = store.apply(event);
		if (
			event.type === "phases-declared" ||
			event.type === "title-changed" ||
			isMatrixProgressEvent(event)
		) {
			return { type: "ignored" };
		}
		if (affectedView === undefined) return { type: "ignored" };

		switch (event.type) {
			case "phase-started":
				return { type: "surface", line: affectedView.label };
			case "phase-progress":
				return { type: "surface", line: event.label };
			case "phase-done":
			case "phase-failed":
				return { type: "render", clearTranscript: true };
		}
	}

	function failActive(): void {
		store.failActive();
	}

	function settleOpenPhases(): void {
		store.settleOpenPhases();
	}

	function viewForProgressView(view: ProgressPhaseView): PhaseView {
		const item = itemByKey.get(view.key);
		if (item === undefined) {
			throw new Error(`progress phase view '${view.key}' has no matching flow status item`);
		}
		return {
			key: view.key,
			item,
			state: view.state,
			label: view.label,
			history: view.history,
			substeps: view.substeps.map(viewForProgressView),
		};
	}

	return { views, apply, failActive, settleOpenPhases };
}

function progressSpecForPhase(spec: PhaseSpec): ProgressPhaseSpec {
	return {
		...baseProgressSpec(spec),
		...(spec.substeps === undefined ? {} : { substeps: spec.substeps.map(progressSpecForSubstep) }),
	};
}

function progressSpecForSubstep(spec: PhaseSubstepSpec): ProgressPhaseSpec {
	return baseProgressSpec(spec);
}

function baseProgressSpec(spec: PhaseSpec | PhaseSubstepSpec): ProgressPhaseSpec {
	return {
		key: spec.key,
		name: spec.item.name,
		...(spec.item.label === undefined ? {} : { label: spec.item.label }),
		detail: spec.item.detail,
	};
}

function indexItems(specs: readonly PhaseSpec[]): ReadonlyMap<string, StatusLineItem> {
	const itemByKey = new Map<string, StatusLineItem>();
	for (const spec of specs) {
		itemByKey.set(spec.key, spec.item);
		for (const substep of spec.substeps ?? []) itemByKey.set(substep.key, substep.item);
	}
	return itemByKey;
}
