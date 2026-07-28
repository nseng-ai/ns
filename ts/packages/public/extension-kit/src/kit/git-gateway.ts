import {
	RealGitGateway,
	type GitErrorInfo,
	type GitGateway,
	type RealGitGatewayOptions,
} from "@nseng-ai/foundation/git";
import type { Result } from "@nseng-ai/foundation/result";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import {
	getProjectConfigSetting,
	nodeProjectConfigGateway,
	parseProjectConfigToml,
	type ProjectConfigDiagnostic,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

import { NsCommandExecApi } from "./command-runner.ts";

export interface NsGitPolicy {
	readonly remote: string;
	readonly trunk?: string;
}

export type NsGitPolicyErrorCode = "invalid-toml" | "invalid-git-policy" | "ns-toml-read-failed";

export interface NsGitPolicyError {
	readonly code: NsGitPolicyErrorCode;
	readonly message: string;
	readonly diagnostics?: readonly ProjectConfigDiagnostic[];
}

export type NsGitPolicyResult = Result<NsGitPolicy, NsGitPolicyError>;

export type NsGitGatewayConfigurationResult =
	| { ok: true; value: GitGateway; repoRoot: string; policy: NsGitPolicy }
	| { ok: false; error: NsGitPolicyError | GitErrorInfo };

export interface ConfigureNsGitGatewayOptions {
	readonly projectConfigGateway?: ProjectConfigGateway;
}

const gitPolicyValueSchema = z.strictObject({
	remote: z.string().trim().min(1).optional(),
	trunk: z.string().trim().min(1).optional(),
});
type GitPolicySettings = z.infer<typeof gitPolicyValueSchema>;
const gitPolicySettingsSchema = {
	path: ["git"] as const,
	schema: gitPolicyValueSchema,
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel}: [git] must be a table containing only non-empty remote and trunk strings.`,
} satisfies SettingsSchema<GitPolicySettings>;

/** Kit-owned ctx -> gateway adapter over foundation's neutral git seam (ADR 0032). */
export function createNsGitGateway(ctx: NsExtensionApi): GitGateway {
	return new RealGitGateway(new NsCommandExecApi(ctx));
}

export function parseNsGitPolicyToml(source: string, pathLabel?: string): NsGitPolicyResult {
	const result = parseProjectConfigToml(source, {
		...(pathLabel === undefined ? {} : { pathLabel }),
		pointsTable: { mode: "skip" },
		settingsSchemas: [gitPolicySettingsSchema],
	});
	if (!result.ok) return gitPolicyErrorFromDiagnostics(result.diagnostics);
	return {
		ok: true,
		value: gitPolicyFromSettings(getProjectConfigSetting(result.config, gitPolicySettingsSchema)),
	};
}

export function loadNsGitPolicy(request: {
	repoRoot: string;
	gateway?: ProjectConfigGateway;
}): NsGitPolicyResult {
	const readResult = (request.gateway ?? nodeProjectConfigGateway).readTextFile({
		repoRoot: request.repoRoot,
		relativePath: "ns.toml",
	});
	if (readResult.type === "missing") return { ok: true, value: { remote: "origin" } };
	if (readResult.type === "error") {
		return {
			ok: false,
			error: {
				code: "ns-toml-read-failed",
				message: `Failed to read ns.toml: ${readResult.message}`,
			},
		};
	}
	return parseNsGitPolicyToml(readResult.text, "ns.toml");
}

/** Discovers the repository before loading its repository-scoped ns.toml Git policy. */
export async function configureNsGitGateway(
	ctx: NsExtensionApi,
	options: ConfigureNsGitGatewayOptions = {},
): Promise<NsGitGatewayConfigurationResult> {
	const execApi = new NsCommandExecApi(ctx);
	const unconfiguredGit = new RealGitGateway(execApi);
	const repoRoot = await unconfiguredGit.repoRoot({ cwd: ctx.cwd });
	if (!repoRoot.ok) return repoRoot;

	const policy = loadNsGitPolicy({
		repoRoot: repoRoot.value,
		...(options.projectConfigGateway === undefined
			? {}
			: { gateway: options.projectConfigGateway }),
	});
	if (!policy.ok) return policy;

	return {
		ok: true,
		value: new RealGitGateway(execApi, gitGatewayOptionsFromPolicy(policy.value)),
		repoRoot: repoRoot.value,
		policy: policy.value,
	};
}

function gitPolicyFromSettings(settings: GitPolicySettings | undefined): NsGitPolicy {
	return {
		remote: settings?.remote ?? "origin",
		...(settings?.trunk === undefined ? {} : { trunk: settings.trunk }),
	};
}

function gitGatewayOptionsFromPolicy(policy: NsGitPolicy): RealGitGatewayOptions {
	return {
		selectedRemote: policy.remote,
		...(policy.trunk === undefined ? {} : { configuredTrunkBranch: policy.trunk }),
	};
}

function gitPolicyErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
): NsGitPolicyResult {
	const diagnostic =
		diagnostics.find((candidate) => candidate.severity === "error") ?? diagnostics[0];
	return {
		ok: false,
		error: {
			code: diagnostic?.code === "ns_toml_invalid" ? "invalid-toml" : "invalid-git-policy",
			message: diagnostic?.message ?? "Invalid [git] configuration.",
			diagnostics,
		},
	};
}
