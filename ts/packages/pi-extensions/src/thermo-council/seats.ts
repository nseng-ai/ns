import type { ThermoCouncilSeatConfig } from "../thermo-council-contract.ts";
import type { DefaultSeat, EnvReader } from "./types.ts";

interface ModelOverrideOptions {
	readonly seatSpecific: string | undefined;
	readonly positional: string | undefined;
	readonly defaultModel: string;
	readonly label: string;
}

const DEFAULT_SEATS = [
	{
		id: "anthropic-opus",
		label: "Anthropic Opus",
		model: "anthropic/claude-opus-4-1",
		envVar: "THERMO_COUNCIL_ANTHROPIC_MODEL",
	},
	{
		id: "openai-high",
		label: "OpenAI High",
		model: "openai/gpt-5",
		envVar: "THERMO_COUNCIL_OPENAI_MODEL",
	},
	{
		id: "gemini-high",
		label: "Gemini High",
		model: "google/gemini-2.5-pro",
		envVar: "THERMO_COUNCIL_GEMINI_MODEL",
	},
] as const satisfies readonly DefaultSeat[];

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
