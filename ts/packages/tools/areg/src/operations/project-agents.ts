import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	projectConfigErrorFromDiagnostics,
	type SettingsSchema,
} from "@nseng-ai/kernel/project-config/points";
import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import { err, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { AregTextFileState } from "../gateways.ts";
import { rejectTextState } from "./file-state.ts";

export const DEFAULT_AGENTS = ["codex", "claude-code"] as const;

const aregSettingsValueSchema = z.object({ agents: z.array(z.string().min(1)).optional() });

type AregSettings = z.output<typeof aregSettingsValueSchema>;

const aregSettingsSchema = {
	path: ["areg"] as const,
	schema: aregSettingsValueSchema,
	invalidMessage: ({ pathLabel }) => `${pathLabel} [areg].agents must be a non-empty string list.`,
} satisfies SettingsSchema<AregSettings>;

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
	const result = parseProjectConfigToml(text, {
		pathLabel,
		settingsSchemas: [aregSettingsSchema],
	});
	if (!result.ok) {
		const error = projectConfigErrorFromDiagnostics(result.diagnostics, {
			invalidToml: "ns_toml_invalid",
			invalidSettingsByPath: { areg: "ns_toml_invalid" },
			defaultCode: "ns_toml_invalid",
			defaultMessage: `${pathLabel}: invalid ns.toml`,
			pathLabel,
		});
		return err({ code: error.code, message: error.message });
	}
	const areg = getProjectConfigSetting(result.config, aregSettingsSchema);
	if (areg === undefined) return { ok: true, value: [] };
	return { ok: true, value: areg.agents ?? [] };
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
