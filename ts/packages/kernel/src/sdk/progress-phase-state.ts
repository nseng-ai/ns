import {
	isMatrixProgressEvent,
	type NsProgressPhaseEvent,
	type NsProgressPhaseInfo,
} from "./services.ts";

export type ProgressPhaseState = "pending" | "active" | "done" | "skipped" | "failed";

export interface ProgressPhaseSpec extends NsProgressPhaseInfo {
	readonly substeps?: readonly ProgressPhaseSpec[];
}

export interface ProgressPhaseView {
	readonly key: string;
	readonly name: string;
	readonly detail?: string;
	readonly state: ProgressPhaseState;
	readonly label: string | undefined;
	readonly history: readonly string[];
	readonly substeps: readonly ProgressPhaseView[];
}

export type ProgressPhaseUnknownKeyPolicy = "ignore" | "append";

export interface ProgressPhaseStateStoreOptions {
	readonly phases?: readonly ProgressPhaseSpec[];
	readonly unknownKeyPolicy?: ProgressPhaseUnknownKeyPolicy;
}

export interface ProgressPhaseStateStore {
	views(): readonly ProgressPhaseView[];
	title(): string | undefined;
	apply(event: NsProgressPhaseEvent): ProgressPhaseView | undefined;
	failActive(): void;
	settleOpenPhases(): void;
}

interface PhaseRecord {
	spec: ProgressPhaseSpec;
	runtimeDetail: string | undefined;
	state: ProgressPhaseState;
	label: string | undefined;
	history: string[];
	substeps: PhaseRecord[];
}

type PhaseLocation =
	| { type: "top"; index: number }
	| { type: "substep"; parentIndex: number; index: number };

export function createProgressPhaseStateStore(
	options: ProgressPhaseStateStoreOptions = {},
): ProgressPhaseStateStore {
	const unknownKeyPolicy = options.unknownKeyPolicy ?? "ignore";
	let records = (options.phases ?? []).map(createRecord);
	let indexByKey = indexRecords(records);
	let activeLocation: PhaseLocation | undefined;
	let currentTitle: string | undefined;

	function views(): readonly ProgressPhaseView[] {
		return records.map(viewForRecord);
	}

	function title(): string | undefined {
		return currentTitle;
	}

	function apply(event: NsProgressPhaseEvent): ProgressPhaseView | undefined {
		// Matrix events carry no phase state; hosts with matrix support consume them separately.
		if (isMatrixProgressEvent(event)) return undefined;
		switch (event.type) {
			case "phases-declared":
				currentTitle = event.title;
				records = event.phases.map(createRecord);
				indexByKey = indexRecords(records);
				activeLocation = undefined;
				return undefined;
			case "title-changed":
				currentTitle = event.title;
				return undefined;
			case "phase-started":
				return applyStarted(event.phaseKey, event.label);
			case "phase-progress":
				return applyProgress(event.phaseKey, event.label);
			case "phase-done":
				return applyDone(event.phaseKey, event.detail);
			case "phase-failed":
				return applyFailed(event.phaseKey, event.detail);
		}
	}

	function applyStarted(
		phaseKey: string,
		label: string | undefined,
	): ProgressPhaseView | undefined {
		return updateRecord(phaseKey, {
			prepare: setActive,
			update: (record) => withLabel(record, label ?? record.spec.label),
		});
	}

	function applyProgress(phaseKey: string, label: string): ProgressPhaseView | undefined {
		return updateRecord(phaseKey, {
			prepare: ensureProgressTargetActive,
			update: (record) => withLabel(record, label),
		});
	}

	function applyDone(phaseKey: string, detail: string | undefined): ProgressPhaseView | undefined {
		return updateRecord(phaseKey, { update: (record) => completeRecord(record, detail) });
	}

	function applyFailed(phaseKey: string, detail: string): ProgressPhaseView | undefined {
		return updateRecord(phaseKey, {
			update: (record) => withLabel(record, detail, { state: "failed" }),
			after: failParentForSubstep,
		});
	}

	function updateRecord(
		phaseKey: string,
		options: {
			prepare?(location: PhaseLocation): void;
			update(record: PhaseRecord): PhaseRecord;
			after?(location: PhaseLocation): void;
		},
	): ProgressPhaseView | undefined {
		const location = ensureLocation(phaseKey);
		if (location === undefined) return undefined;
		options.prepare?.(location);
		const record = recordAt(location);
		if (record === undefined) return undefined;
		const nextRecord = options.update(record);
		replaceRecord(location, nextRecord);
		options.after?.(location);
		return viewForRecord(nextRecord);
	}

	function ensureLocation(phaseKey: string): PhaseLocation | undefined {
		const existing = indexByKey.get(phaseKey);
		if (existing !== undefined) return existing;
		if (unknownKeyPolicy === "ignore") return undefined;
		const record = createRecord({ key: phaseKey, name: phaseKey });
		records = [...records, record];
		const location = { type: "top", index: records.length - 1 } satisfies PhaseLocation;
		indexByKey = indexRecords(records);
		return location;
	}

	function recordAt(location: PhaseLocation): PhaseRecord | undefined {
		if (location.type === "top") return records[location.index];
		return records[location.parentIndex]?.substeps[location.index];
	}

	function replaceRecord(location: PhaseLocation, record: PhaseRecord): void {
		if (location.type === "top") {
			records = replaceAt(records, location.index, record);
			return;
		}
		const parent = records[location.parentIndex];
		if (parent === undefined) return;
		records = replaceAt(records, location.parentIndex, {
			...parent,
			substeps: replaceAt(parent.substeps, location.index, record),
		});
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
		const parent = activateParentForSubstep(location);
		if (parent === undefined) return;
		const substeps = markEarlierDone(parent.substeps, location.index);
		const substep = substeps[location.index];
		const nextSubsteps =
			substep === undefined
				? substeps
				: replaceAt(substeps, location.index, {
						...substep,
						state: "active",
					} satisfies PhaseRecord);
		records = replaceAt(records, location.parentIndex, {
			...parent,
			substeps: nextSubsteps,
		} satisfies PhaseRecord);
	}

	function activateParentForSubstep(
		location: Extract<PhaseLocation, { type: "substep" }>,
	): PhaseRecord | undefined {
		records = markEarlierDone(records, location.parentIndex);
		const parent = records[location.parentIndex];
		if (parent === undefined) return undefined;
		const activeParent = { ...parent, state: "active" } satisfies PhaseRecord;
		records = replaceAt(records, location.parentIndex, activeParent);
		return activeParent;
	}

	function ensureProgressTargetActive(location: PhaseLocation): void {
		const record = recordAt(location);
		if (record?.state === "pending") {
			setActive(location);
			return;
		}
		if (location.type === "top") return;
		if (record?.state === "active") {
			activateParentForSubstep(location);
			activeLocation = location;
		}
	}

	function failActive(): void {
		if (activeLocation === undefined) return;
		const record = recordAt(activeLocation);
		if (record === undefined) return;
		replaceRecord(activeLocation, { ...record, state: "failed" });
		failParentForSubstep(activeLocation);
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

	function failParentForSubstep(location: PhaseLocation): void {
		if (location.type === "top") return;
		const parent = records[location.parentIndex];
		if (parent !== undefined) {
			records = replaceAt(records, location.parentIndex, { ...parent, state: "failed" });
		}
	}

	return { views, title, apply, failActive, settleOpenPhases };
}

function createRecord(spec: ProgressPhaseSpec): PhaseRecord {
	return {
		spec: copySpec(spec),
		runtimeDetail: undefined,
		state: "pending",
		label: spec.label,
		history: [],
		substeps: spec.substeps?.map(createRecord) ?? [],
	};
}

function copySpec(spec: ProgressPhaseSpec): ProgressPhaseSpec {
	return {
		key: spec.key,
		name: spec.name,
		...(spec.label === undefined ? {} : { label: spec.label }),
		...(spec.detail === undefined ? {} : { detail: spec.detail }),
		...(spec.substeps === undefined ? {} : { substeps: spec.substeps.map(copySpec) }),
	};
}

function viewForRecord(record: PhaseRecord): ProgressPhaseView {
	const detail = detailForRecord(record);
	return {
		key: record.spec.key,
		name: record.spec.name,
		...(detail === undefined ? {} : { detail }),
		state: record.state,
		label: record.label,
		history: record.history.slice(),
		substeps: record.substeps.map(viewForRecord),
	};
}

function indexRecords(records: readonly PhaseRecord[]): Map<string, PhaseLocation> {
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
	return indexByKey;
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
	return items.map((current, currentIndex) => (currentIndex === index ? item : current));
}

function withLabel(
	record: PhaseRecord,
	nextLabel: string | undefined,
	extra: Partial<PhaseRecord> = {},
): PhaseRecord {
	return { ...withSupersededLabel(record, nextLabel), label: nextLabel, ...extra };
}

function withSupersededLabel(record: PhaseRecord, nextLabel: string | undefined): PhaseRecord {
	const previous = record.label;
	if (previous === undefined || previous === nextLabel) return record;
	return { ...record, history: [...record.history, previous] };
}

function detailForRecord(record: PhaseRecord): string | undefined {
	return record.runtimeDetail ?? record.spec.detail;
}

function settleSubstepsDone(parent: PhaseRecord): PhaseRecord {
	return {
		...parent,
		substeps: parent.substeps.map((substep) => {
			if (substep.state === "active") {
				return { ...withSupersededLabel(substep, detailForRecord(substep)), state: "done" };
			}
			if (substep.state === "pending") return { ...substep, state: "skipped" };
			return substep;
		}),
	};
}

function setDone(record: PhaseRecord): PhaseRecord {
	const labeled =
		record.state === "active" ? withSupersededLabel(record, detailForRecord(record)) : record;
	return settleSubstepsDone({ ...labeled, state: "done" });
}

function completeRecord(record: PhaseRecord, detail: string | undefined): PhaseRecord {
	const settledDetail = detail ?? detailForRecord(record);
	return settleSubstepsDone({
		...withSupersededLabel(record, settledDetail),
		runtimeDetail: detail ?? record.runtimeDetail,
		state: "done",
		label: settledDetail ?? record.label,
	});
}

function markEarlierDone(items: readonly PhaseRecord[], index: number): PhaseRecord[] {
	return items.map((record, itemIndex) => {
		if (itemIndex >= index) return record;
		if (record.state === "pending" || record.state === "active") return setDone(record);
		return record;
	});
}
