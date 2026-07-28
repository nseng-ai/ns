import type { Result } from "@nseng-ai/foundation/result";
import {
	getProjectConfigSetting,
	nodeProjectConfigGateway,
	parseProjectConfigToml,
	primaryProjectConfigDiagnostic,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

import type {
	RepositoryTrunkConfig,
	RepositoryTrunkConfigError,
	RepositoryTrunkConfigLoader,
} from "./repository-trunk.ts";

const repositoryTrunkConfigValueSchema = z.strictObject({
	remote: z.string().trim().min(1).optional(),
	trunk: z.string().trim().min(1).optional(),
});
type RepositoryTrunkConfigSettings = z.infer<typeof repositoryTrunkConfigValueSchema>;

const repositoryTrunkConfigSettingsSchema = {
	path: ["git"] as const,
	schema: repositoryTrunkConfigValueSchema,
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel}: [git] must be a table containing only non-empty remote and trunk strings.`,
} satisfies SettingsSchema<RepositoryTrunkConfigSettings>;

export function createRepositoryTrunkConfigLoader(
	gateway: ProjectConfigGateway,
): RepositoryTrunkConfigLoader {
	return {
		load(repoRoot) {
			const readResult = gateway.readTextFile({ repoRoot, relativePath: "ns.toml" });
			if (readResult.type === "missing") return { ok: true, value: { remote: "origin" } };
			if (readResult.type === "error") {
				return {
					ok: false,
					error: {
						code: "config-read-failed",
						message: `Failed to read ns.toml: ${readResult.message}`,
					},
				};
			}
			return parseRepositoryTrunkConfig(readResult.text);
		},
	};
}

export function createNodeRepositoryTrunkConfigLoader(): RepositoryTrunkConfigLoader {
	return createRepositoryTrunkConfigLoader(nodeProjectConfigGateway);
}

export const nodeRepositoryTrunkConfigLoader: RepositoryTrunkConfigLoader =
	createNodeRepositoryTrunkConfigLoader();

function parseRepositoryTrunkConfig(
	source: string,
): Result<RepositoryTrunkConfig, RepositoryTrunkConfigError> {
	const result = parseProjectConfigToml(source, {
		pathLabel: "ns.toml",
		pointsTable: { mode: "skip" },
		settingsSchemas: [repositoryTrunkConfigSettingsSchema],
	});
	if (!result.ok) {
		return {
			ok: false,
			error: {
				code: "config-invalid",
				message:
					primaryProjectConfigDiagnostic(result.diagnostics)?.message ??
					"Invalid [git] configuration in ns.toml.",
			},
		};
	}
	const settings = getProjectConfigSetting(result.config, repositoryTrunkConfigSettingsSchema);
	return {
		ok: true,
		value: {
			remote: settings?.remote ?? "origin",
			...(settings?.trunk === undefined ? {} : { trunk: settings.trunk }),
		},
	};
}
