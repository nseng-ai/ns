import { formatErrorMessage, isRecord } from "@ns/core/primitives";
import { err, type Result } from "@ns/core/result";
import { parse } from "smol-toml";

import type { AregTextFileState } from "../gateways.ts";
import { rejectTextState } from "./file-state.ts";

export const DEFAULT_AGENTS = ["codex", "claude-code"] as const;

export function resolveProjectAgents(input: {
	explicitAgents: readonly string[];
	nsToml: AregTextFileState;
	aregJson: AregTextFileState;
}): Result<string[]> {
	if (input.explicitAgents.length > 0) return { ok: true, value: [...input.explicitAgents] };
	const nsAgents = parseNsAregAgentsFromState(input.nsToml);
	if (!nsAgents.ok) return nsAgents;
	if (nsAgents.value.length > 0) return nsAgents;
	const legacyAgents = parseLegacyAregJsonAgentsFromState(input.aregJson);
	if (!legacyAgents.ok) return legacyAgents;
	if (legacyAgents.value.length > 0) return legacyAgents;
	return { ok: true, value: [...DEFAULT_AGENTS] };
}

export function parseNsAregAgents(text: string, pathLabel = "ns.toml"): Result<string[]> {
	let data: unknown;
	try {
		data = parse(text);
	} catch (error) {
		return err({
			code: "ns_toml_invalid",
			message: `Invalid TOML in ${pathLabel}: ${formatErrorMessage(error)}`,
		});
	}
	if (!isRecord(data)) return { ok: true, value: [] };
	const areg = data.areg;
	if (areg === undefined) return { ok: true, value: [] };
	if (!isRecord(areg))
		return err({
			code: "ns_toml_invalid",
			message: `[areg] in ${pathLabel} must be a TOML table.`,
		});
	const agents = areg.agents;
	if (agents === undefined) return { ok: true, value: [] };
	if (!Array.isArray(agents))
		return err({
			code: "ns_toml_invalid",
			message: `${pathLabel} [areg].agents must be a string array.`,
		});
	if (agents.length === 0) return { ok: true, value: [] };
	return validateNonEmptyStringList(agents, {
		code: "ns_toml_invalid",
		message: `${pathLabel} [areg].agents must be a non-empty string list.`,
	});
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
	return validateNonEmptyStringList(agents, {
		code: "areg_agents_invalid",
		message: "areg.json field `agents` must be a non-empty string list.",
	});
}

function validateNonEmptyStringList(
	agents: readonly unknown[],
	invalid: { code: string; message: string },
): Result<string[]> {
	const result: string[] = [];
	for (const agent of agents) {
		if (typeof agent !== "string" || agent.trim().length === 0) return err(invalid);
		result.push(agent);
	}
	return { ok: true, value: result };
}

function parseNsAregAgentsFromState(state: AregTextFileState): Result<string[]> {
	if (state.type === "missing") return { ok: true, value: [] };
	if (state.type !== "file")
		return rejectTextState({
			pathLabel: "ns.toml",
			state,
			description: "ns.toml",
			action: "manage it",
		});
	return parseNsAregAgents(state.text, "ns.toml");
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
