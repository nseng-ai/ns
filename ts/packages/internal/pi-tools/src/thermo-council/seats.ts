import type { ThermoCouncilSeatConfig, ThermoCouncilSeatId } from "./contract.ts";

export interface EnvReader {
	readonly get: (name: string) => string | undefined;
}

interface DefaultSeat {
	readonly id: ThermoCouncilSeatId;
	readonly label: string;
	readonly model: string;
	readonly envVar: string;
}

interface ModelOverrideOptions {
	readonly seatSpecific: string | undefined;
	readonly positional: string | undefined;
	readonly defaultModel: string;
	readonly label: string;
}

const DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY = 3;
const THERMO_COUNCIL_MAX_CONCURRENCY_ENV = "THERMO_COUNCIL_MAX_CONCURRENCY";

const DEFAULT_SEATS = [
	{
		id: "anthropic-fable",
		label: "Fable",
		model: "vercel-ai-gateway/anthropic/claude-fable-5",
		envVar: "THERMO_COUNCIL_ANTHROPIC_MODEL",
	},
	{
		id: "openai-high",
		label: "Sol",
		model: "vercel-ai-gateway/openai/gpt-5.6-sol",
		envVar: "THERMO_COUNCIL_OPENAI_MODEL",
	},
	{
		id: "gemini-high",
		label: "Gemini",
		model: "vercel-ai-gateway/google/gemini-2.5-pro",
		envVar: "THERMO_COUNCIL_GEMINI_MODEL",
	},
] as const satisfies readonly DefaultSeat[];

export function parseThermoCouncilMaxConcurrency(env: EnvReader): number {
	const raw = env.get(THERMO_COUNCIL_MAX_CONCURRENCY_ENV);
	if (raw === undefined) return DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY;
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) return DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY;
	const parsed = Number(trimmed);
	if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_THERMO_COUNCIL_MAX_CONCURRENCY;
	return parsed;
}

export function parseThermoCouncilSeats(env: EnvReader): readonly ThermoCouncilSeatConfig[] {
	const positionalModels = parsePositionalModels(env.get("THERMO_COUNCIL_MODELS"));
	if (positionalModels.length > DEFAULT_SEATS.length) {
		throw new Error(
			`THERMO_COUNCIL_MODELS has ${positionalModels.length} entries but only ${DEFAULT_SEATS.length} council seats are configured.`,
		);
	}
	return DEFAULT_SEATS.map((seat, index) => ({
		id: seat.id,
		label: seat.label,
		model: modelOverride({
			seatSpecific: env.get(seat.envVar),
			positional: positionalModels[index],
			defaultModel: seat.model,
			label: seat.label,
		}),
	}));
}

function parsePositionalModels(value: string | undefined): readonly string[] {
	if (value === undefined || value.trim() === "") return [];
	const entries = value.split(",").map((entry) => entry.trim());
	const emptyIndex = entries.findIndex((entry) => entry.length === 0);
	if (emptyIndex >= 0) {
		throw new Error(`THERMO_COUNCIL_MODELS entry ${emptyIndex + 1} is empty.`);
	}
	return entries;
}

function modelOverride({
	seatSpecific,
	positional,
	defaultModel,
	label,
}: ModelOverrideOptions): string {
	const candidate = seatSpecific?.trim() || positional?.trim() || defaultModel;
	if (candidate.length === 0) throw new Error(`Empty model override for ${label}.`);
	return candidate;
}
