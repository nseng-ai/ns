import { z } from "zod";

import { parseGitHubRepository } from "./contracts.ts";

export interface MintRuntimeConfig {
	readonly githubAppId: string;
	readonly githubAppInstallationId: string;
	readonly githubAppPrivateKey: string;
	readonly sandboxMintSecret: string;
	readonly githubRepository: string;
	readonly vercelTeamId: string;
	readonly vercelProjectId: string;
	readonly vercelOidcIssuer: string;
	readonly vercelOidcAudience: string;
}

export interface MintRuntimeConfigError {
	readonly code: "mint-endpoint-misconfigured";
	readonly message: string;
	readonly variable: string;
}

export type MintRuntimeConfigParseResult =
	| { readonly ok: true; readonly value: MintRuntimeConfig }
	| { readonly ok: false; readonly error: MintRuntimeConfigError };

export type MintEnvironment = Readonly<Record<string, string | undefined>>;

const positiveIntegerIdSchema = z.string().regex(/^[1-9][0-9]*$/);
const privateKeySchema = z
	.string()
	.transform(normalizeEscapedPemNewlines)
	.refine((value) =>
		/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[\s\S]+\n-----END (?:RSA )?PRIVATE KEY-----\n?$/.test(
			value,
		),
	);
const urlSchema = z.url();
const vercelTeamIdSchema = z.string().regex(/^team_[A-Za-z0-9]+$/);
const vercelProjectIdSchema = z.string().regex(/^prj_[A-Za-z0-9]+$/);
const repositorySchema = z.string().transform((value, context) => {
	const result = parseGitHubRepository(value);
	if (!result.ok) {
		context.addIssue({ code: "custom", message: "invalid repository" });
		return z.NEVER;
	}
	return result.value;
});

const runtimeEnvironmentSchema = z.strictObject({
	DISPATCH_GITHUB_APP_ID: positiveIntegerIdSchema,
	DISPATCH_GITHUB_APP_INSTALLATION_ID: positiveIntegerIdSchema,
	DISPATCH_GITHUB_APP_PRIVATE_KEY: privateKeySchema,
	DISPATCH_SANDBOX_MINT_SECRET: z.string().min(1),
	DISPATCH_GITHUB_REPOSITORY: repositorySchema,
	DISPATCH_VERCEL_TEAM_ID: vercelTeamIdSchema,
	DISPATCH_VERCEL_PROJECT_ID: vercelProjectIdSchema,
	DISPATCH_VERCEL_OIDC_ISSUER: urlSchema,
	DISPATCH_VERCEL_OIDC_AUDIENCE: urlSchema,
});

const runtimeEnvironmentNames = [
	"DISPATCH_GITHUB_APP_ID",
	"DISPATCH_GITHUB_APP_INSTALLATION_ID",
	"DISPATCH_GITHUB_APP_PRIVATE_KEY",
	"DISPATCH_SANDBOX_MINT_SECRET",
	"DISPATCH_GITHUB_REPOSITORY",
	"DISPATCH_VERCEL_TEAM_ID",
	"DISPATCH_VERCEL_PROJECT_ID",
	"DISPATCH_VERCEL_OIDC_ISSUER",
	"DISPATCH_VERCEL_OIDC_AUDIENCE",
] as const;

export function parseMintRuntimeConfig(environment: MintEnvironment): MintRuntimeConfigParseResult {
	const rawEnvironment = {
		DISPATCH_GITHUB_APP_ID: environment.DISPATCH_GITHUB_APP_ID,
		DISPATCH_GITHUB_APP_INSTALLATION_ID: environment.DISPATCH_GITHUB_APP_INSTALLATION_ID,
		DISPATCH_GITHUB_APP_PRIVATE_KEY: environment.DISPATCH_GITHUB_APP_PRIVATE_KEY,
		DISPATCH_SANDBOX_MINT_SECRET: environment.DISPATCH_SANDBOX_MINT_SECRET,
		DISPATCH_GITHUB_REPOSITORY: environment.DISPATCH_GITHUB_REPOSITORY,
		DISPATCH_VERCEL_TEAM_ID: environment.DISPATCH_VERCEL_TEAM_ID,
		DISPATCH_VERCEL_PROJECT_ID: environment.DISPATCH_VERCEL_PROJECT_ID,
		DISPATCH_VERCEL_OIDC_ISSUER: environment.DISPATCH_VERCEL_OIDC_ISSUER,
		DISPATCH_VERCEL_OIDC_AUDIENCE: environment.DISPATCH_VERCEL_OIDC_AUDIENCE,
	};
	const result = runtimeEnvironmentSchema.safeParse(rawEnvironment);
	if (!result.success) {
		const issuePath = result.error.issues[0]?.path[0];
		const variable = isRuntimeEnvironmentName(issuePath) ? issuePath : "mint endpoint environment";
		return {
			ok: false,
			error: {
				code: "mint-endpoint-misconfigured",
				message: `Mint endpoint configuration is invalid: ${variable}.`,
				variable,
			},
		};
	}

	return {
		ok: true,
		value: {
			githubAppId: result.data.DISPATCH_GITHUB_APP_ID,
			githubAppInstallationId: result.data.DISPATCH_GITHUB_APP_INSTALLATION_ID,
			githubAppPrivateKey: result.data.DISPATCH_GITHUB_APP_PRIVATE_KEY,
			sandboxMintSecret: result.data.DISPATCH_SANDBOX_MINT_SECRET,
			githubRepository: result.data.DISPATCH_GITHUB_REPOSITORY,
			vercelTeamId: result.data.DISPATCH_VERCEL_TEAM_ID,
			vercelProjectId: result.data.DISPATCH_VERCEL_PROJECT_ID,
			vercelOidcIssuer: result.data.DISPATCH_VERCEL_OIDC_ISSUER,
			vercelOidcAudience: result.data.DISPATCH_VERCEL_OIDC_AUDIENCE,
		},
	};
}

export function normalizeEscapedPemNewlines(value: string): string {
	return value.replaceAll("\\n", "\n");
}

function isRuntimeEnvironmentName(
	value: PropertyKey | undefined,
): value is (typeof runtimeEnvironmentNames)[number] {
	return typeof value === "string" && runtimeEnvironmentNames.some((name) => name === value);
}
