import { optionalEntries } from "@nseng-ai/foundation/primitives";
import {
	getProjectConfigSetting,
	loadEffectiveProjectConfig,
	loadProjectConfig,
	NS_LOCAL_TOML_FILE_NAME,
	projectConfigErrorFromDiagnostics,
	type ProjectConfigDiagnostic,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

import {
	DISPATCH_PACKAGE_MANAGER_FIELD,
	DISPATCH_PACKAGE_MANIFEST_PATH,
	DISPATCH_SETTINGS_PATH,
	parseDispatchPackageManagerSource,
} from "../dispatch/harness-registry.ts";
import {
	parseDispatchProjectConfigSettings,
	type DispatchProjectConfig,
} from "../config/project-config.ts";

import type { DispatchPromptGateways, DispatchTriggerConnection } from "./contracts.ts";

/** One credentials-preflight check: named, actionable, value-free. */
export interface DispatchPreflightCheck {
	readonly id:
		| "dispatch-config"
		| "package-manager"
		| "development-oidc-token"
		| "trigger-identity";
	readonly status: "ok" | "failed";
	readonly detail: string;
}

export interface DispatchPreflightFailure {
	readonly ok: false;
	readonly checks: readonly DispatchPreflightCheck[];
}

export interface DispatchPreflightSuccess {
	readonly ok: true;
	readonly checks: readonly DispatchPreflightCheck[];
	readonly deploymentUrl: string;
	readonly workflowDashboardUrl: string;
	readonly anchorTimeZone: string;
	readonly triggerConnection: DispatchTriggerConnection;
}

export type DispatchPreflightResult = DispatchPreflightSuccess | DispatchPreflightFailure;

/** Validate repository dispatch configuration, package manager, and caller identity. */
export async function runDispatchPreflight(
	options: { readonly repoRoot: string },
	gateways: Pick<DispatchPromptGateways, "config" | "tokens" | "trigger">,
): Promise<DispatchPreflightResult> {
	const checks: DispatchPreflightCheck[] = [];

	const configCheck = await readDispatchConfig(options.repoRoot, gateways);
	checks.push(configCheck.check);

	const packageManagerCheck = await readPackageManagerConfig(options.repoRoot, gateways);
	checks.push(packageManagerCheck);

	const tokenResult = await gateways.tokens.readDevelopmentOidcToken({
		repoRoot: options.repoRoot,
	});
	const tokenCheck: DispatchPreflightCheck =
		tokenResult.type === "found"
			? {
					id: "development-oidc-token",
					status: "ok",
					detail: "VERCEL_OIDC_TOKEN is available to the dispatch CLI.",
				}
			: {
					id: "development-oidc-token",
					status: "failed",
					detail:
						tokenResult.type === "missing"
							? tokenResult.detail
							: `Reading the local Development OIDC token failed: ${tokenResult.message}`,
				};
	checks.push(tokenCheck);

	if (
		configCheck.config === undefined ||
		packageManagerCheck.status === "failed" ||
		tokenResult.type !== "found"
	) {
		checks.push({
			id: "trigger-identity",
			status: "failed",
			detail:
				"Skipped: requires supported repository configuration and the Development OIDC token.",
		});
		return { ok: false, checks };
	}

	const { deploymentUrl, workflowDashboardUrl } = configCheck.config;
	const triggerConnection: DispatchTriggerConnection = {
		deploymentUrl,
		oidcToken: tokenResult.token,
		...optionalEntries({ protectionBypass: tokenResult.protectionBypass }),
	};
	const identity = await gateways.trigger.checkTriggerIdentity({ connection: triggerConnection });
	const identityCheck = triggerIdentityCheck(identity);
	checks.push(identityCheck);
	if (identityCheck.status === "failed") return { ok: false, checks };

	return {
		ok: true,
		checks,
		deploymentUrl,
		workflowDashboardUrl,
		anchorTimeZone: configCheck.config.anchorTimeZone,
		triggerConnection,
	};
}

type ValidDispatchProjectConfig = Omit<
	DispatchProjectConfig,
	"deploymentUrl" | "workflowDashboardUrl"
> & {
	readonly deploymentUrl: string;
	readonly workflowDashboardUrl: string;
};

type DispatchSettingsRecord = Record<string, unknown>;

const dispatchSettingsSchema = {
	path: ["dispatch"] as const,
	schema: z.record(z.string(), z.unknown()),
	invalidMessage: ({ pathLabel }) => `${pathLabel}: [dispatch] must be a TOML table.`,
} satisfies SettingsSchema<DispatchSettingsRecord>;

async function readDispatchConfig(
	repoRoot: string,
	gateways: Pick<DispatchPromptGateways, "config">,
): Promise<{
	readonly check: DispatchPreflightCheck;
	readonly config?: ValidDispatchProjectConfig;
}> {
	const effective = loadEffectiveProjectConfig({
		repoRoot,
		gateway: gateways.config,
		pointDefinitions: [],
		settingsSchemas: [dispatchSettingsSchema],
	});
	const configDiagnostics = effective.diagnostics.filter(
		(diagnostic) => !diagnostic.code.startsWith("point"),
	);
	if (configDiagnostics.length > 0 || effective.config === undefined) {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: dispatchConfigDiagnosticMessage(configDiagnostics),
			},
		};
	}
	const effectiveSettings = getProjectConfigSetting(effective.config, dispatchSettingsSchema);
	if (effectiveSettings === undefined) {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `No ${DISPATCH_SETTINGS_PATH} [dispatch] table at the repository root; dispatch needs it (see the dispatch README's Setup section).`,
			},
		};
	}
	const divergence = unsupportedRemoteDispatchDivergence(repoRoot, gateways, effectiveSettings);
	if (divergence !== undefined) {
		return {
			check: { id: "dispatch-config", status: "failed", detail: divergence },
		};
	}
	const parsed = parseDispatchProjectConfigSettings(
		effectiveSettings,
		`${DISPATCH_SETTINGS_PATH} + ${NS_LOCAL_TOML_FILE_NAME}`,
	);
	if (parsed.ok === false) {
		return {
			check: { id: "dispatch-config", status: "failed", detail: parsed.error.message },
		};
	}
	if (parsed.value.deploymentUrl === undefined) {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `${DISPATCH_SETTINGS_PATH}: [dispatch] has no deployment_url; set it to the dispatch deployable's stable HTTPS URL (see the dispatch README's Setup section).`,
			},
		};
	}
	if (parsed.value.workflowDashboardUrl === undefined) {
		return {
			check: {
				id: "dispatch-config",
				status: "failed",
				detail: `${DISPATCH_SETTINGS_PATH}: [dispatch] has no workflow_dashboard_url; set it to the Vercel project's Workflows dashboard URL (see the dispatch README's Setup section).`,
			},
		};
	}
	return {
		check: {
			id: "dispatch-config",
			status: "ok",
			detail: "[dispatch] configuration is present and valid.",
		},
		config: {
			...parsed.value,
			deploymentUrl: parsed.value.deploymentUrl,
			workflowDashboardUrl: parsed.value.workflowDashboardUrl,
		},
	};
}

function unsupportedRemoteDispatchDivergence(
	repoRoot: string,
	gateways: Pick<DispatchPromptGateways, "config">,
	effectiveSettings: DispatchSettingsRecord,
): string | undefined {
	const base = loadProjectConfig({
		repoRoot,
		gateway: gateways.config,
		pointDefinitions: [],
		settingsSchemas: [dispatchSettingsSchema],
	});
	if (!base.ok) return undefined;
	const baseSettings = getProjectConfigSetting(base.config, dispatchSettingsSchema);
	const remoteRequiredKeys = ["harness", "vercel_project_id", "vercel_team_id"] as const;
	const divergentKeys = remoteRequiredKeys.filter(
		(key) => baseSettings?.[key] !== effectiveSettings[key],
	);
	if (divergentKeys.length === 0) return undefined;
	const paths = divergentKeys.map((key) => `[dispatch].${key}`).join(", ");
	return `${NS_LOCAL_TOML_FILE_NAME}: ${paths} differs from ${DISPATCH_SETTINGS_PATH}, but remote dispatch and deployment readers use only ${DISPATCH_SETTINGS_PATH}; move the remote-required value to ${DISPATCH_SETTINGS_PATH}.`;
}

function dispatchConfigDiagnosticMessage(diagnostics: readonly ProjectConfigDiagnostic[]): string {
	const sourcePath = diagnostics.find((diagnostic) => diagnostic.severity === "error")?.path;
	return projectConfigErrorFromDiagnostics(diagnostics, {
		invalidToml: "dispatch-config",
		defaultCode: "dispatch-config",
		defaultMessage: "Unable to load effective dispatch configuration.",
		...(sourcePath === undefined ? {} : { pathLabel: sourcePath }),
	}).message;
}

async function readPackageManagerConfig(
	repoRoot: string,
	gateways: Pick<DispatchPromptGateways, "config">,
): Promise<DispatchPreflightCheck> {
	const source = await gateways.config.readPackageManagerSource({ repoRoot });
	if (source.type === "error") {
		return {
			id: "package-manager",
			status: "failed",
			detail: `Reading ${DISPATCH_PACKAGE_MANIFEST_PATH} for ${DISPATCH_PACKAGE_MANAGER_FIELD} failed: ${source.message}`,
		};
	}

	const parsed = parseDispatchPackageManagerSource(
		source.type === "missing" ? null : source.source,
	);
	if (parsed.ok === false) {
		return {
			id: "package-manager",
			status: "failed",
			detail: parsed.error.message,
		};
	}
	return {
		id: "package-manager",
		status: "ok",
		detail: `${DISPATCH_PACKAGE_MANAGER_FIELD} declares a supported exact pnpm version.`,
	};
}

function triggerIdentityCheck(
	identity: Awaited<ReturnType<DispatchPromptGateways["trigger"]["checkTriggerIdentity"]>>,
): DispatchPreflightCheck {
	switch (identity.type) {
		case "authorized":
			return {
				id: "trigger-identity",
				status: "ok",
				detail: "The dispatch deployment accepted the caller's Development identity.",
			};
		case "unauthorized":
			return {
				id: "trigger-identity",
				status: "failed",
				detail:
					"The dispatch deployment rejected the caller's Development OIDC token (401). Refresh it with `vercel env pull .env.local --environment=development` from the repository root.",
			};
		case "forbidden":
			return {
				id: "trigger-identity",
				status: "failed",
				detail:
					"The dispatch deployment refused the caller's identity (403): wrong team, project, or environment for the configured OIDC trust.",
			};
		case "endpoint-misconfigured":
			return {
				id: "trigger-identity",
				status: "failed",
				detail:
					"The dispatch deployment reports its own configuration invalid (500); fix the deployable's NS_DISPATCH_* environment before dispatching.",
			};
		case "unreachable":
			return {
				id: "trigger-identity",
				status: "failed",
				detail: `The dispatch deployment is unreachable: ${identity.message}`,
			};
		case "unexpected-response":
			return {
				id: "trigger-identity",
				status: "failed",
				detail: `The dispatch deployment answered the identity preflight with unexpected status ${identity.status}.`,
			};
	}
}
