import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { parse as parseToml } from "smol-toml";

import type { AregInitTextFileState } from "../gateways.ts";
import { rejectTextState } from "./file-state.ts";
import type { OperationResult } from "./operation-result.ts";

export const DEFAULT_AGENTS = ["codex", "claude-code"] as const;

export function resolveProjectAgents(input: {
	explicitAgents: readonly string[];
	asdlToml: AregInitTextFileState;
	aregJson: AregInitTextFileState;
}): OperationResult<string[]> {
	if (input.explicitAgents.length > 0) return { type: "ok", value: [...input.explicitAgents] };
	const asdlAgents = parseAsdlAregAgentsFromState(input.asdlToml);
	if (asdlAgents.type === "error") return asdlAgents;
	if (asdlAgents.value.length > 0) return asdlAgents;
	const legacyAgents = parseLegacyAregJsonAgentsFromState(input.aregJson);
	if (legacyAgents.type === "error") return legacyAgents;
	if (legacyAgents.value.length > 0) return legacyAgents;
	return { type: "ok", value: [...DEFAULT_AGENTS] };
}

export function parseAsdlAregAgents(text: string, pathLabel = "asdl.toml"): OperationResult<string[]> {
	let data: unknown;
	try {
		data = parseToml(text);
	} catch (error) {
		return { type: "error", message: `Invalid TOML in ${pathLabel}: ${formatErrorMessage(error)}` };
	}
	if (!isRecord(data)) return { type: "ok", value: [] };
	const areg = data.areg;
	if (areg === undefined) return { type: "ok", value: [] };
	if (!isRecord(areg)) return { type: "error", message: `[areg] in ${pathLabel} must be a TOML table.` };
	const agents = areg.agents;
	if (agents === undefined) return { type: "ok", value: [] };
	if (!Array.isArray(agents)) return { type: "error", message: `${pathLabel} [areg].agents must be a string array.` };
	if (agents.length === 0) return { type: "ok", value: [] };
	const result: string[] = [];
	for (const agent of agents) {
		if (typeof agent !== "string" || agent.trim().length === 0) return { type: "error", message: `${pathLabel} [areg].agents must be a non-empty string list.` };
		result.push(agent);
	}
	return { type: "ok", value: result };
}

export function parseLegacyAregJsonAgents(text: string): OperationResult<string[]> {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		return { type: "error", message: `Invalid JSON in areg.json: ${formatErrorMessage(error)}` };
	}
	if (!isRecord(data)) return { type: "error", message: "areg.json must contain a JSON object." };
	const agents = data.agents;
	if (!Array.isArray(agents) || agents.length === 0) return { type: "error", message: "areg.json field `agents` must be a non-empty string list." };
	const result: string[] = [];
	for (const agent of agents) {
		if (typeof agent !== "string" || agent.trim().length === 0) return { type: "error", message: "areg.json field `agents` must be a non-empty string list." };
		result.push(agent);
	}
	return { type: "ok", value: result };
}

function parseAsdlAregAgentsFromState(state: AregInitTextFileState): OperationResult<string[]> {
	if (state.type === "missing") return { type: "ok", value: [] };
	if (state.type !== "file") return rejectTextState({ pathLabel: "asdl.toml", state, description: "asdl.toml", action: "manage it" });
	return parseAsdlAregAgents(state.text, "asdl.toml");
}

function parseLegacyAregJsonAgentsFromState(state: AregInitTextFileState): OperationResult<string[]> {
	if (state.type === "missing") return { type: "ok", value: [] };
	if (state.type !== "file") return rejectTextState({ pathLabel: "areg.json", state, description: "areg.json", action: "manage it" });
	return parseLegacyAregJsonAgents(state.text);
}

