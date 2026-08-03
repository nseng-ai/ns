import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	projectConfigErrorFromDiagnostics,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

export type RepositoryWorkflowTarget = { type: "branch" } | { type: "stack"; provider: "graphite" };

export interface RepositoryWorkflowTargetError {
	code: "invalid-toml" | "invalid-workflow" | "invalid-stack-provider" | "config-read-failed";
	message: string;
}

export type RepositoryWorkflowTargetResult =
	| { ok: true; value: RepositoryWorkflowTarget }
	| { ok: false; error: RepositoryWorkflowTargetError };

const workflowSettingsSchema = {
	path: ["workflow"] as const,
	schema: z.record(z.string(), z.unknown()),
	invalidMessage: ({ pathLabel }) => `${pathLabel}: [workflow] must be a TOML table.`,
} satisfies SettingsSchema<Record<string, unknown>>;

export function loadRepositoryWorkflowTarget(options: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
}): RepositoryWorkflowTargetResult {
	const read = options.gateway.readTextFile({
		repoRoot: options.repoRoot,
		relativePath: "ns.toml",
	});
	if (read.type === "missing") return { ok: true, value: { type: "branch" } };
	if (read.type === "error") {
		return {
			ok: false,
			error: {
				code: "config-read-failed",
				message: `Failed to read ns.toml: ${read.message}`,
			},
		};
	}
	const loaded = parseProjectConfigToml(read.text, {
		pathLabel: "ns.toml",
		pointsTable: { mode: "skip" },
		settingsSchemas: [workflowSettingsSchema],
	});
	if (!loaded.ok) {
		const mapped = projectConfigErrorFromDiagnostics(loaded.diagnostics, {
			invalidToml: "invalid-toml",
			invalidSettingsByPath: { workflow: "invalid-workflow" },
			defaultCode: "config-read-failed",
			pathLabel: "ns.toml",
		});
		return { ok: false, error: mapped };
	}

	const workflow = getProjectConfigSetting(loaded.config, workflowSettingsSchema);
	const value = workflow?.["stack-provider"];
	if (value === undefined) return { ok: true, value: { type: "branch" } };
	if (value === "graphite") {
		return { ok: true, value: { type: "stack", provider: "graphite" } };
	}
	return {
		ok: false,
		error: {
			code: "invalid-stack-provider",
			message: 'ns.toml: [workflow].stack-provider must be "graphite" when set.',
		},
	};
}
