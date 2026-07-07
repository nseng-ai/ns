import {
	runnerSubagentPrimaryActivityPreview,
	type RunnerSubagentUpdate,
} from "@internal/pi-tools/runner-subagents";

import type { ThermoCouncilReviewerOutcome, ThermoCouncilSeatConfig } from "./contract.ts";
import { summarizeThermoCouncilReviewerOutcome } from "./report.ts";
import type { EnvReader } from "./seats.ts";

const DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY = 3;
const THERMO_COUNCIL_MAX_CONCURRENCY_ENV = "THERMO_COUNCIL_MAX_CONCURRENCY";

interface CouncilSeatRunState {
	readonly seat: ThermoCouncilSeatConfig;
	readonly update?: RunnerSubagentUpdate;
	readonly outcome?: ThermoCouncilReviewerOutcome;
}

export interface CouncilProgressTracker {
	recordProgress(seat: ThermoCouncilSeatConfig, update: RunnerSubagentUpdate): void;
	recordOutcome(seat: ThermoCouncilSeatConfig, outcome: ThermoCouncilReviewerOutcome): void;
}

export function parseThermoCouncilMaxConcurrency(env: EnvReader): number {
	const raw = env.get(THERMO_COUNCIL_MAX_CONCURRENCY_ENV);
	if (raw === undefined) return DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY;
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) return DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY;
	const parsed = Number(trimmed);
	if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY;
	return parsed;
}

export function createCouncilProgressTracker(input: {
	readonly seats: readonly ThermoCouncilSeatConfig[];
	readonly onStatus: (value: string | undefined) => void;
}): CouncilProgressTracker {
	const states = new Map<ThermoCouncilSeatConfig["id"], CouncilSeatRunState>(
		input.seats.map((seat) => [seat.id, { seat }]),
	);
	return {
		recordProgress(seat, update) {
			const current = states.get(seat.id) ?? { seat };
			states.set(seat.id, { ...current, update });
			input.onStatus(renderCouncilProgressStatus(input.seats, states));
		},
		recordOutcome(seat, outcome) {
			const current = states.get(seat.id) ?? { seat };
			states.set(seat.id, { ...current, outcome });
			input.onStatus(
				areAllCouncilSeatsDone(input.seats, states)
					? undefined
					: renderCouncilProgressStatus(input.seats, states),
			);
		},
	};
}

export function renderFinalSynthesisStatus(update: RunnerSubagentUpdate): string {
	const progress = update.progress;
	const preview = runnerSubagentPrimaryActivityPreview(update.activity);
	if (preview !== undefined) return compactStatus(`final synthesis ${progress.state}: ${preview}`);
	if (progress.turnCount > 0) return `final synthesis ${progress.state} turn ${progress.turnCount}`;
	return `final synthesis ${progress.state}`;
}

export function seatLabels(seats: readonly ThermoCouncilSeatConfig[]): string {
	return seats.map((seat) => seat.label).join(", ");
}

function renderCouncilProgressStatus(
	seats: readonly ThermoCouncilSeatConfig[],
	states: ReadonlyMap<ThermoCouncilSeatConfig["id"], CouncilSeatRunState>,
): string {
	const completed = seats.filter((seat) => isCouncilSeatDone(seat, states)).length;
	const summaries = seats.map((seat) => renderCouncilSeatProgress(states.get(seat.id) ?? { seat }));
	return compactStatus(`council ${completed}/${seats.length} done · ${summaries.join(" · ")}`);
}

function areAllCouncilSeatsDone(
	seats: readonly ThermoCouncilSeatConfig[],
	states: ReadonlyMap<ThermoCouncilSeatConfig["id"], CouncilSeatRunState>,
): boolean {
	return seats.every((seat) => isCouncilSeatDone(seat, states));
}

function isCouncilSeatDone(
	seat: ThermoCouncilSeatConfig,
	states: ReadonlyMap<ThermoCouncilSeatConfig["id"], CouncilSeatRunState>,
): boolean {
	return states.get(seat.id)?.outcome !== undefined;
}

function renderCouncilSeatProgress(state: CouncilSeatRunState): string {
	if (state.outcome !== undefined) return renderCouncilSeatOutcome(state.outcome);
	const progress = state.update?.progress;
	if (progress === undefined) return `${state.seat.label} queued`;
	const activity = state.update?.activity;
	const preview =
		activity === undefined ? undefined : runnerSubagentPrimaryActivityPreview(activity);
	if (preview !== undefined) return `${state.seat.label} ${progress.state}: ${preview}`;
	if (progress.currentTool !== undefined)
		return `${state.seat.label} ${progress.state} ${progress.currentTool}`;
	if (progress.turnCount > 0)
		return `${state.seat.label} ${progress.state} turn ${progress.turnCount}`;
	return `${state.seat.label} ${progress.state}`;
}

function renderCouncilSeatOutcome(outcome: ThermoCouncilReviewerOutcome): string {
	return summarizeThermoCouncilReviewerOutcome(outcome).progress;
}

function compactStatus(value: string): string {
	const limit = 240;
	if (value.length <= limit) return value;
	return `${value.slice(0, limit - 1)}…`;
}
