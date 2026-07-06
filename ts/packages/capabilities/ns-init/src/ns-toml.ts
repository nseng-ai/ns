import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	type ProjectConfigDiagnostic,
	type SettingsSchema,
} from "@nseng-ai/kernel/project-config/points";
import { z } from "zod";

import { ALL_HARNESS_IDS, type HarnessId } from "./skill-materializer.ts";

export type NsTomlHarnessesParseResult =
	| { type: "ok"; harnesses: readonly HarnessId[] }
	| { type: "missing" }
	| { type: "error"; error: NsTomlErrorInfo };

export type NsTomlWritePlanResult =
	| { type: "ok"; content: string; change: NsTomlChange }
	| { type: "error"; error: NsTomlErrorInfo };

export type NsTomlChange = "created" | "appended" | "replaced" | "unchanged";

export interface NsTomlErrorInfo {
	code: NsTomlErrorCode;
	message: string;
}

export type NsTomlErrorCode =
	| "invalid-toml"
	| "invalid-harnesses"
	| "ambiguous-harnesses-assignment";

const nsInitHarnessesSettingsSchema = {
	path: ["harnesses"] as const,
	schema: z.array(z.string()).nonempty(),
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel} top-level harnesses must be a non-empty string array.`,
} satisfies SettingsSchema<readonly string[]>;

export function parseNsTomlHarnesses(
	content: string,
	pathLabel = "ns.toml",
): NsTomlHarnessesParseResult {
	const result = parseProjectConfigToml(content, {
		pathLabel,
		settingsSchemas: [nsInitHarnessesSettingsSchema],
	});
	if (!result.ok) return nsTomlErrorFromDiagnostics(result.diagnostics, pathLabel);
	const harnesses = getProjectConfigSetting(result.config, nsInitHarnessesSettingsSchema);
	if (harnesses === undefined) return { type: "missing" };
	return parseHarnessesValue(harnesses, `${pathLabel} top-level harnesses`);
}

export function renderNsTomlHarnesses(harnesses: readonly HarnessId[]): string {
	return `harnesses = ${JSON.stringify([...harnesses])}\n`;
}

export function planNsTomlHarnessesWrite(options: {
	content: string | undefined;
	harnesses: readonly HarnessId[];
}): NsTomlWritePlanResult {
	const rendered = renderNsTomlHarnesses(options.harnesses);
	if (options.content === undefined) return { type: "ok", content: rendered, change: "created" };

	const existing = parseNsTomlHarnesses(options.content);
	if (existing.type === "error") return existing;
	if (existing.type === "ok" && sameHarnesses(existing.harnesses, options.harnesses)) {
		return { type: "ok", content: options.content, change: "unchanged" };
	}

	const replacement = replaceTopLevelHarnessesAssignment(options.content, rendered);
	if (replacement.type === "error") return replacement;
	return {
		type: "ok",
		content: replacement.content,
		change: existing.type === "ok" ? "replaced" : "appended",
	};
}

export function normalizeHarnessSelection(
	values: readonly string[],
): { type: "ok"; harnesses: readonly HarnessId[] } | { type: "error"; error: NsTomlErrorInfo } {
	const selected: HarnessId[] = [];
	for (const value of values) {
		if (!isHarnessId(value)) {
			return {
				type: "error",
				error: {
					code: "invalid-harnesses",
					message: `Unknown harness ${JSON.stringify(value)}. Expected one of ${ALL_HARNESS_IDS.join(", ")}.`,
				},
			};
		}
		if (!selected.includes(value)) selected.push(value);
	}
	if (selected.length === 0) {
		return {
			type: "error",
			error: { code: "invalid-harnesses", message: "At least one harness must be selected." },
		};
	}
	return { type: "ok", harnesses: selected };
}

function nsTomlErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pathLabel: string,
): NsTomlHarnessesParseResult {
	const diagnostic =
		diagnostics.find((candidate) => candidate.severity === "error") ?? diagnostics[0];
	if (diagnostic?.code === "ns_toml_invalid") {
		return {
			type: "error",
			error: {
				code: "invalid-toml",
				message: diagnostic.message.replace(
					`${pathLabel}: Invalid TOML.\n`,
					`Invalid TOML in ${pathLabel}: `,
				),
			},
		};
	}
	if (diagnostic?.code === "settings_table_invalid" && diagnostic.path === "harnesses") {
		return {
			type: "error",
			error: {
				code: "invalid-harnesses",
				message: diagnostic.message,
			},
		};
	}
	return {
		type: "error",
		error: {
			code: "invalid-toml",
			message: diagnostic?.message ?? `${pathLabel}: invalid ns.toml`,
		},
	};
}

function parseHarnessesValue(value: readonly string[], _label: string): NsTomlHarnessesParseResult {
	return normalizeHarnessSelection(value);
}

function replaceTopLevelHarnessesAssignment(
	content: string,
	renderedHarnesses: string,
): { type: "ok"; content: string } | { type: "error"; error: NsTomlErrorInfo } {
	const lines = splitLines(content);
	let tableStart = lines.findIndex((line) => tomlTableName(line) !== null);
	if (tableStart < 0) tableStart = lines.length;

	for (let index = 0; index < tableStart; index += 1) {
		const line = lines[index] ?? "";
		if (!/^\s*harnesses\s*=/u.test(line)) continue;
		if (!line.includes("]")) {
			return {
				type: "error",
				error: {
					code: "ambiguous-harnesses-assignment",
					message:
						"Top-level ns.toml harnesses assignment must be a single-line array before it can be replaced.",
				},
			};
		}
		lines.splice(index, 1, renderedHarnesses);
		return { type: "ok", content: lines.join("") };
	}

	if (tableStart < lines.length) {
		const beforeTables = lines.slice(0, tableStart).join("");
		const afterTables = lines.slice(tableStart).join("");
		const separator =
			beforeTables.length === 0 || beforeTables.endsWith("\n\n")
				? ""
				: beforeTables.endsWith("\n")
					? "\n"
					: "\n\n";
		return {
			type: "ok",
			content: `${beforeTables}${separator}${renderedHarnesses}\n${afterTables}`,
		};
	}

	return { type: "ok", content: appendTopLevelAssignment(content, renderedHarnesses) };
}

function appendTopLevelAssignment(content: string, assignment: string): string {
	if (content.length === 0) return assignment;
	if (content.endsWith("\n\n")) return `${content}${assignment}`;
	if (content.endsWith("\n")) return `${content}\n${assignment}`;
	return `${content}\n\n${assignment}`;
}

function splitLines(content: string): string[] {
	return content.match(/.*(?:\n|$)/gu)?.filter((line) => line.length > 0) ?? [];
}

function tomlTableName(line: string): string | null {
	const stripped = line.trim();
	if (stripped.startsWith("[[")) {
		const closingIndex = stripped.indexOf("]]", 2);
		if (closingIndex < 0) return null;
		return stripped.slice(2, closingIndex).trim();
	}
	if (!stripped.startsWith("[")) return null;
	const closingIndex = stripped.indexOf("]");
	if (closingIndex < 0) return null;
	return stripped.slice(1, closingIndex).trim();
}

function sameHarnesses(left: readonly HarnessId[], right: readonly HarnessId[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isHarnessId(value: string): value is HarnessId {
	return ALL_HARNESS_IDS.includes(value as HarnessId);
}
