import { formatErrorMessage, isRecord } from "@sdl/core/primitives";
import { err, type Result } from "@sdl/core/result";
import { parse } from "smol-toml";

import type { AregTextFileState } from "../gateways.ts";
import { rejectTextState } from "./file-state.ts";

export const DEFAULT_AGENTS = ["codex", "claude-code"] as const;

export function resolveProjectAgents(input: {
	explicitAgents: readonly string[];
	sdlToml: AregTextFileState;
	aregJson: AregTextFileState;
}): Result<string[]> {
	if (input.explicitAgents.length > 0) return { ok: true, value: [...input.explicitAgents] };
	const sdlAgents = parseSdlAregAgentsFromState(input.sdlToml);
	if (!sdlAgents.ok) return sdlAgents;
	if (sdlAgents.value.length > 0) return sdlAgents;
	const legacyAgents = parseLegacyAregJsonAgentsFromState(input.aregJson);
	if (!legacyAgents.ok) return legacyAgents;
	if (legacyAgents.value.length > 0) return legacyAgents;
	return { ok: true, value: [...DEFAULT_AGENTS] };
}

export function parseSdlAregAgents(text: string, pathLabel = "sdl.toml"): Result<string[]> {
	let data: unknown;
	try {
		data = parse(text);
	} catch (error) {
		return err({
			code: "sdl_toml_invalid",
			message: `Invalid TOML in ${pathLabel}: ${formatErrorMessage(error)}`,
		});
	}
	if (!isRecord(data)) return { ok: true, value: [] };
	const areg = data.areg;
	if (areg === undefined) return { ok: true, value: [] };
	if (!isRecord(areg))
		return err({
			code: "sdl_toml_invalid",
			message: `[areg] in ${pathLabel} must be a TOML table.`,
		});
	const agents = areg.agents;
	if (agents === undefined) return { ok: true, value: [] };
	if (!Array.isArray(agents))
		return err({
			code: "sdl_toml_invalid",
			message: `${pathLabel} [areg].agents must be a string array.`,
		});
	if (agents.length === 0) return { ok: true, value: [] };
	const result: string[] = [];
	for (const agent of agents) {
		if (typeof agent !== "string" || agent.trim().length === 0)
			return err({
				code: "sdl_toml_invalid",
				message: `${pathLabel} [areg].agents must be a non-empty string list.`,
			});
		result.push(agent);
	}
	return { ok: true, value: result };
}

export function parseLegacyAregJsonAgents(text: string): Result<string[]> {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		return err({
			code: "areg_json_invalid",
			message: `Invalid JSON in areg.json: ${formatErrorMessage(error)}`,
		});
	}
	if (!isRecord(data))
		return err({ code: "areg_json_invalid", message: "areg.json must contain a JSON object." });
	const agents = data.agents;
	if (!Array.isArray(agents) || agents.length === 0)
		return err({
			code: "areg_agents_invalid",
			message: "areg.json field `agents` must be a non-empty string list.",
		});
	const result: string[] = [];
	for (const agent of agents) {
		if (typeof agent !== "string" || agent.trim().length === 0)
			return err({
				code: "areg_agents_invalid",
				message: "areg.json field `agents` must be a non-empty string list.",
			});
		result.push(agent);
	}
	return { ok: true, value: result };
}

function parseSdlAregAgentsFromState(state: AregTextFileState): Result<string[]> {
	if (state.type === "missing") return { ok: true, value: [] };
	if (state.type !== "file")
		return rejectTextState({
			pathLabel: "sdl.toml",
			state,
			description: "sdl.toml",
			action: "manage it",
		});
	return parseSdlAregAgents(state.text, "sdl.toml");
}

function parseLegacyAregJsonAgentsFromState(state: AregTextFileState): Result<string[]> {
	if (state.type === "missing") return { ok: true, value: [] };
	if (state.type !== "file")
		return rejectTextState({
			pathLabel: "areg.json",
			state,
			description: "areg.json",
			action: "manage it",
		});
	return parseLegacyAregJsonAgents(state.text);
}
