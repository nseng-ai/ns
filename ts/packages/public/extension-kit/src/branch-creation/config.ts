import {
	getProjectConfigSetting,
	loadProjectConfig,
	projectConfigErrorFromDiagnostics,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

import { BUILT_IN_BRANCH_CREATION_MODES, type BuiltInBranchCreationMode } from "./contract.ts";

export interface WorkflowBranchCreationConfig {
	branchCreation: BuiltInBranchCreationMode;
}

export interface WorkflowBranchCreationConfigError {
	code: "invalid-toml" | "invalid-workflow" | "invalid-branch-creation" | "config-read-failed";
	message: string;
}

export type WorkflowBranchCreationConfigResult =
	| { ok: true; value: WorkflowBranchCreationConfig }
	| { ok: false; error: WorkflowBranchCreationConfigError };

const workflowSettingsSchema = {
	path: ["workflow"] as const,
	schema: z.record(z.string(), z.unknown()),
	invalidMessage: ({ pathLabel }) => `${pathLabel}: [workflow] must be a TOML table.`,
} satisfies SettingsSchema<Record<string, unknown>>;

export function loadWorkflowBranchCreationConfig(options: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
}): WorkflowBranchCreationConfigResult {
	const loaded = loadProjectConfig({
		repoRoot: options.repoRoot,
		gateway: options.gateway,
		pointDefinitions: [],
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
	const value = workflow?.["branch-creation"];
	if (value === undefined) return { ok: true, value: { branchCreation: "plain-git" } };
	const parsed = z.enum(BUILT_IN_BRANCH_CREATION_MODES).safeParse(value);
	if (!parsed.success) {
		return {
			ok: false,
			error: {
				code: "invalid-branch-creation",
				message: "ns.toml: [workflow].branch-creation must be one of: plain-git, graphite.",
			},
		};
	}
	return { ok: true, value: { branchCreation: parsed.data } };
}
