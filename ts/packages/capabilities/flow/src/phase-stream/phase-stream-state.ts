import type { NsProgressPhaseEvent } from "@nseng-ai/kernel/sdk";
import type { PhaseState, StatusLineItem } from "@nseng-ai/foundation/cli-theme";

import type { PhaseSpec } from "./phase-stream-specs.ts";

export interface PhaseView {
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

interface PhaseRecord {
	spec: PhaseSpec;
	state: PhaseState;
	label: string | undefined;
	history: string[];
	substeps: PhaseRecord[];
}

type PhaseLocation =
	| { type: "top"; index: number; record: PhaseRecord }
	| {
			type: "substep";
			parentIndex: number;
			index: number;
			parent: PhaseRecord;
			record: PhaseRecord;
	  };

export function createPhaseStateStore(specs: readonly PhaseSpec[]): PhaseStateStore {
	const records = specs.map(createRecord);
	// Phase keys are expected to be globally unique across top-level phases and declared substeps.
	const indexByKey = new Map<string, PhaseLocation>();
	records.forEach((record, index) => {
		indexByKey.set(record.spec.key, { type: "top", index, record });
		record.substeps.forEach((substep, substepIndex) => {
			indexByKey.set(substep.spec.key, {
				type: "substep",
				parentIndex: index,
				index: substepIndex,
				parent: record,
				record: substep,
			});
		});
	});
	let activeLocation: PhaseLocation | undefined;

	function views(): readonly PhaseView[] {
		return records.map(viewForRecord);
	}

	function createRecord(spec: PhaseSpec): PhaseRecord {
		return {
			spec,
			state: "pending",
			label: spec.item.label,
			history: [],
			substeps: spec.substeps?.map(createRecord) ?? [],
		};
	}

	function viewForRecord(record: PhaseRecord): PhaseView {
		return {
			item: record.spec.item,
			state: record.state,
			label: record.label,
			history: record.history.slice(),
			substeps: record.substeps.map(viewForRecord),
		};
	}

	function pushSupersededLabel(record: PhaseRecord, newLabel: string | undefined): void {
		const previous = record.label;
		if (previous === undefined || previous === newLabel) return;
		record.history.push(previous);
	}

	function settleSubstepsDone(parent: PhaseRecord): void {
		for (const substep of parent.substeps) {
			if (substep.state === "active") {
				pushSupersededLabel(substep, substep.spec.item.detail);
				substep.state = "done";
			} else if (substep.state === "pending") {
				substep.state = "skipped";
			}
		}
	}

	function setDone(record: PhaseRecord): void {
		if (record.state === "active") pushSupersededLabel(record, record.spec.item.detail);
		record.state = "done";
		settleSubstepsDone(record);
	}

	function markEarlierTopDone(index: number): void {
		for (let i = 0; i < index; i += 1) {
			const record = records[i];
			if (record !== undefined && (record.state === "pending" || record.state === "active")) {
				setDone(record);
			}
		}
	}

	function markEarlierSiblingDone(parent: PhaseRecord, index: number): void {
		for (let i = 0; i < index; i += 1) {
			const substep = parent.substeps[i];
			if (substep !== undefined && (substep.state === "pending" || substep.state === "active")) {
				if (substep.state === "active") pushSupersededLabel(substep, substep.spec.item.detail);
				substep.state = "done";
			}
		}
	}

	function setActive(location: PhaseLocation): void {
		if (location.type === "top") {
			markEarlierTopDone(location.index);
			location.record.state = "active";
		} else {
			activateSubstep(location);
		}
		activeLocation = location;
	}

	function activateSubstep(location: Extract<PhaseLocation, { type: "substep" }>): void {
		markEarlierTopDone(location.parentIndex);
		location.parent.state = "active";
		markEarlierSiblingDone(location.parent, location.index);
		location.record.state = "active";
	}

	function ensureProgressTargetActive(location: PhaseLocation): void {
		if (location.type === "top") {
			if (location.record.state === "pending") setActive(location);
			return;
		}
		if (location.record.state === "pending") {
			setActive(location);
			return;
		}
		if (location.record.state === "active") {
			markEarlierTopDone(location.parentIndex);
			location.parent.state = "active";
			activeLocation = location;
		}
	}

	function apply(event: NsProgressPhaseEvent): PhaseTransition {
		if (event.type === "phases-declared" || event.type === "title-changed") {
			return { type: "ignored" };
		}
		const location = indexByKey.get(event.phaseKey);
		if (location === undefined) return { type: "ignored" };
		const record = location.record;

		switch (event.type) {
			case "phase-started": {
				setActive(location);
				const label = event.label ?? record.spec.item.label;
				pushSupersededLabel(record, label);
				record.label = label;
				return { type: "surface", line: record.label };
			}
			case "phase-progress":
				ensureProgressTargetActive(location);
				pushSupersededLabel(record, event.label);
				record.label = event.label;
				return { type: "surface", line: event.label };
			case "phase-done":
				pushSupersededLabel(record, record.spec.item.detail);
				record.state = "done";
				if (location.type === "top") settleSubstepsDone(record);
				return { type: "render", clearTranscript: true };
			case "phase-failed":
				pushSupersededLabel(record, event.detail);
				record.state = "failed";
				record.label = event.detail;
				if (location.type === "substep") location.parent.state = "failed";
				return { type: "render", clearTranscript: true };
		}
	}

	function failActive(): void {
		if (activeLocation === undefined) return;
		activeLocation.record.state = "failed";
		if (activeLocation.type === "substep") activeLocation.parent.state = "failed";
	}

	function settleOpenPhases(): void {
		const hasFailure = records.some(
			(record) =>
				record.state === "failed" || record.substeps.some((substep) => substep.state === "failed"),
		);
		if (hasFailure) return;
		for (const record of records) {
			if (record.state === "pending" || record.state === "active") setDone(record);
		}
	}

	return { views, apply, failActive, settleOpenPhases };
}
