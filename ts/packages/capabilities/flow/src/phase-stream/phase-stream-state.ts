import type { NsProgressPhaseEvent } from "@nseng-ai/kernel/sdk";
import type { PhaseState, StatusLineItem } from "@nseng-ai/foundation/cli-theme";

import type { PhaseSpec, PhaseSubstepSpec } from "./phase-stream-specs.ts";

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
	spec: PhaseSpec | PhaseSubstepSpec;
	state: PhaseState;
	label: string | undefined;
	history: string[];
	substeps: PhaseRecord[];
}

type PhaseLocation =
	| { type: "top"; index: number }
	| { type: "substep"; parentIndex: number; index: number };

export function createPhaseStateStore(specs: readonly PhaseSpec[]): PhaseStateStore {
	let records = specs.map(createRecord);
	// Phase keys are expected to be globally unique across top-level phases and declared substeps.
	const indexByKey = new Map<string, PhaseLocation>();
	records.forEach((record, index) => {
		indexByKey.set(record.spec.key, { type: "top", index });
		record.substeps.forEach((substep, substepIndex) => {
			indexByKey.set(substep.spec.key, {
				type: "substep",
				parentIndex: index,
				index: substepIndex,
			});
		});
	});
	let activeLocation: PhaseLocation | undefined;

	function views(): readonly PhaseView[] {
		return records.map(viewForRecord);
	}

	function createRecord(spec: PhaseSpec | PhaseSubstepSpec): PhaseRecord {
		return {
			spec,
			state: "pending",
			label: spec.item.label,
			history: [],
			substeps: "substeps" in spec ? (spec.substeps?.map(createRecord) ?? []) : [],
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

	function recordAt(location: PhaseLocation): PhaseRecord | undefined {
		if (location.type === "top") return records[location.index];
		return records[location.parentIndex]?.substeps[location.index];
	}

	function replaceRecord(location: PhaseLocation, record: PhaseRecord): void {
		if (location.type === "top") {
			records[location.index] = record;
			return;
		}
		const parent = records[location.parentIndex];
		if (parent === undefined) return;
		const substeps = parent.substeps.slice();
		substeps[location.index] = record;
		records[location.parentIndex] = { ...parent, substeps };
	}

	function withSupersededLabel(record: PhaseRecord, newLabel: string | undefined): PhaseRecord {
		const previous = record.label;
		if (previous === undefined || previous === newLabel) return record;
		return { ...record, history: [...record.history, previous] };
	}

	function settleSubstepsDone(parent: PhaseRecord): PhaseRecord {
		return {
			...parent,
			substeps: parent.substeps.map((substep) => {
				if (substep.state === "active") {
					return { ...withSupersededLabel(substep, substep.spec.item.detail), state: "done" };
				}
				if (substep.state === "pending") return { ...substep, state: "skipped" };
				return substep;
			}),
		};
	}

	function setDone(record: PhaseRecord): PhaseRecord {
		const labeled =
			record.state === "active" ? withSupersededLabel(record, record.spec.item.detail) : record;
		return settleSubstepsDone({ ...labeled, state: "done" });
	}

	function completeRecord(record: PhaseRecord): PhaseRecord {
		return settleSubstepsDone({
			...withSupersededLabel(record, record.spec.item.detail),
			state: "done",
		});
	}

	function markEarlierDone(items: readonly PhaseRecord[], index: number): PhaseRecord[] {
		return items.map((record, itemIndex) => {
			if (itemIndex >= index) return record;
			if (record.state === "pending" || record.state === "active") return setDone(record);
			return record;
		});
	}

	function activateParent(location: Extract<PhaseLocation, { type: "substep" }>): void {
		records = markEarlierDone(records, location.parentIndex);
		const parent = records[location.parentIndex];
		if (parent === undefined) return;
		records[location.parentIndex] = { ...parent, state: "active" };
	}

	function setActive(location: PhaseLocation): void {
		if (location.type === "top") {
			records = markEarlierDone(records, location.index);
			const record = recordAt(location);
			if (record !== undefined) replaceRecord(location, { ...record, state: "active" });
		} else {
			activateSubstep(location);
		}
		activeLocation = location;
	}

	function activateSubstep(location: Extract<PhaseLocation, { type: "substep" }>): void {
		activateParent(location);
		const parent = records[location.parentIndex];
		if (parent === undefined) return;
		const substeps = markEarlierDone(parent.substeps, location.index);
		const substep = substeps[location.index];
		if (substep !== undefined) substeps[location.index] = { ...substep, state: "active" };
		records[location.parentIndex] = { ...parent, substeps };
	}

	function ensureProgressTargetActive(location: PhaseLocation): void {
		const record = recordAt(location);
		if (record?.state === "pending") {
			setActive(location);
			return;
		}
		if (location.type === "top") return;
		if (record?.state === "active") {
			activateParent(location);
			activeLocation = location;
		}
	}

	function apply(event: NsProgressPhaseEvent): PhaseTransition {
		if (event.type === "phases-declared" || event.type === "title-changed") {
			return { type: "ignored" };
		}
		const location = indexByKey.get(event.phaseKey);
		if (location === undefined) return { type: "ignored" };
		const record = recordAt(location);
		if (record === undefined) return { type: "ignored" };

		switch (event.type) {
			case "phase-started": {
				setActive(location);
				const currentRecord = recordAt(location) ?? record;
				const label = event.label ?? currentRecord.spec.item.label;
				replaceRecord(location, { ...withSupersededLabel(currentRecord, label), label });
				return { type: "surface", line: label };
			}
			case "phase-progress": {
				ensureProgressTargetActive(location);
				const currentRecord = recordAt(location) ?? record;
				replaceRecord(location, {
					...withSupersededLabel(currentRecord, event.label),
					label: event.label,
				});
				return { type: "surface", line: event.label };
			}
			case "phase-done": {
				replaceRecord(location, completeRecord(recordAt(location) ?? record));
				return { type: "render", clearTranscript: true };
			}
			case "phase-failed": {
				const failed = {
					...withSupersededLabel(recordAt(location) ?? record, event.detail),
					state: "failed" as const,
					label: event.detail,
				};
				replaceRecord(location, failed);
				if (location.type === "substep") {
					const parent = records[location.parentIndex];
					if (parent !== undefined) records[location.parentIndex] = { ...parent, state: "failed" };
				}
				return { type: "render", clearTranscript: true };
			}
		}
	}

	function failActive(): void {
		if (activeLocation === undefined) return;
		const record = recordAt(activeLocation);
		if (record === undefined) return;
		replaceRecord(activeLocation, { ...record, state: "failed" });
		if (activeLocation.type === "substep") {
			const parent = records[activeLocation.parentIndex];
			if (parent !== undefined)
				records[activeLocation.parentIndex] = { ...parent, state: "failed" };
		}
	}

	function settleOpenPhases(): void {
		const hasFailure = records.some(
			(record) =>
				record.state === "failed" || record.substeps.some((substep) => substep.state === "failed"),
		);
		if (hasFailure) return;
		records = records.map((record) => {
			if (record.state === "pending" || record.state === "active") return setDone(record);
			return record;
		});
	}

	return { views, apply, failActive, settleOpenPhases };
}
