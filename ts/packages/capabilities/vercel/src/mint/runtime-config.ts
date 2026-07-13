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
	NS_DISPATCH_GITHUB_APP_ID: positiveIntegerIdSchema,
	NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: positiveIntegerIdSchema,
	NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: privateKeySchema,
	NS_DISPATCH_SANDBOX_MINT_SECRET: z.string().min(1),
	NS_DISPATCH_GITHUB_REPOSITORY: repositorySchema,
	NS_DISPATCH_VERCEL_TEAM_ID: vercelTeamIdSchema,
	NS_DISPATCH_VERCEL_PROJECT_ID: vercelProjectIdSchema,
	NS_DISPATCH_VERCEL_OIDC_ISSUER: urlSchema,
	NS_DISPATCH_VERCEL_OIDC_AUDIENCE: urlSchema,
});

const runtimeEnvironmentNames = [
	"NS_DISPATCH_GITHUB_APP_ID",
	"NS_DISPATCH_GITHUB_APP_INSTALLATION_ID",
	"NS_DISPATCH_GITHUB_APP_PRIVATE_KEY",
	"NS_DISPATCH_SANDBOX_MINT_SECRET",
	"NS_DISPATCH_GITHUB_REPOSITORY",
	"NS_DISPATCH_VERCEL_TEAM_ID",
	"NS_DISPATCH_VERCEL_PROJECT_ID",
	"NS_DISPATCH_VERCEL_OIDC_ISSUER",
	"NS_DISPATCH_VERCEL_OIDC_AUDIENCE",
] as const;

export function parseMintRuntimeConfig(environment: MintEnvironment): MintRuntimeConfigParseResult {
	const rawEnvironment = {
		NS_DISPATCH_GITHUB_APP_ID: environment.NS_DISPATCH_GITHUB_APP_ID,
		NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: environment.NS_DISPATCH_GITHUB_APP_INSTALLATION_ID,
		NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: environment.NS_DISPATCH_GITHUB_APP_PRIVATE_KEY,
		NS_DISPATCH_SANDBOX_MINT_SECRET: environment.NS_DISPATCH_SANDBOX_MINT_SECRET,
		NS_DISPATCH_GITHUB_REPOSITORY: environment.NS_DISPATCH_GITHUB_REPOSITORY,
		NS_DISPATCH_VERCEL_TEAM_ID: environment.NS_DISPATCH_VERCEL_TEAM_ID,
		NS_DISPATCH_VERCEL_PROJECT_ID: environment.NS_DISPATCH_VERCEL_PROJECT_ID,
		NS_DISPATCH_VERCEL_OIDC_ISSUER: environment.NS_DISPATCH_VERCEL_OIDC_ISSUER,
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: environment.NS_DISPATCH_VERCEL_OIDC_AUDIENCE,
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
			githubAppId: result.data.NS_DISPATCH_GITHUB_APP_ID,
			githubAppInstallationId: result.data.NS_DISPATCH_GITHUB_APP_INSTALLATION_ID,
			githubAppPrivateKey: result.data.NS_DISPATCH_GITHUB_APP_PRIVATE_KEY,
			sandboxMintSecret: result.data.NS_DISPATCH_SANDBOX_MINT_SECRET,
			githubRepository: result.data.NS_DISPATCH_GITHUB_REPOSITORY,
			vercelTeamId: result.data.NS_DISPATCH_VERCEL_TEAM_ID,
			vercelProjectId: result.data.NS_DISPATCH_VERCEL_PROJECT_ID,
			vercelOidcIssuer: result.data.NS_DISPATCH_VERCEL_OIDC_ISSUER,
			vercelOidcAudience: result.data.NS_DISPATCH_VERCEL_OIDC_AUDIENCE,
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
