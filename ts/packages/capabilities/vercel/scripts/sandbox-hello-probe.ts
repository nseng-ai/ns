import { readFile } from "node:fs/promises";

import { z } from "zod";

import { parseDispatchProjectConfigToml } from "../src/api/project-config.ts";
import { parseGitHubRepository } from "../src/mint/contracts.ts";
import type { CloneTokenMintGateway } from "../src/sandbox/hello-probe.ts";
import { runSandboxHelloProbe } from "../src/sandbox/hello-probe.ts";
import { createRealVercelSandboxGateway } from "../src/sandbox/real-sandbox-gateway.ts";

const cloneMintResponseSchema = z.strictObject({
	token: z.string().min(1),
	expiresAt: z.string(),
	repository: z.string(),
	purpose: z.literal("clone"),
});

async function main(): Promise<boolean> {
	const inputs = readInputs(process.argv.slice(2), process.env);
	if (!inputs.ok) {
		console.error(inputs.message);
		return false;
	}

	let configSource: string;
	try {
		configSource = await readFile(new URL("../../../../../ns.toml", import.meta.url), "utf8");
	} catch {
		console.error("Could not read the repo-root ns.toml.");
		return false;
	}
	const configResult = parseDispatchProjectConfigToml(configSource, "ns.toml");
	if (!configResult.ok) {
		console.error("The repo-root ns.toml has invalid dispatch configuration.");
		return false;
	}

	console.log(`Starting fixed Sandbox hello probe for ${inputs.repository} at ${inputs.revision}.`);
	const result = await runSandboxHelloProbe(
		{
			repository: inputs.repository,
			revision: inputs.revision,
			vercelOidcToken: inputs.oidcToken,
			vercelProjectId: configResult.value.vercelProjectId,
			vercelTeamId: configResult.value.vercelTeamId,
		},
		{
			cloneTokens: createHttpsCloneTokenMintGateway({
				mintUrl: inputs.mintUrl,
				oidcToken: inputs.oidcToken,
			}),
			sandboxes: createRealVercelSandboxGateway(),
		},
	);
	if (!result.ok) {
		console.error(`Sandbox hello probe failed: ${result.message}`);
		return false;
	}

	console.log(`${result.markerOutput}\nHEAD ${result.observedSha}`);
	return true;
}

interface ScriptInputs {
	readonly mintUrl: string;
	readonly revision: string;
	readonly repository: string;
	readonly oidcToken: string;
}

function readInputs(
	args: readonly string[],
	environment: NodeJS.ProcessEnv,
): ({ readonly ok: true } & ScriptInputs) | { readonly ok: false; readonly message: string } {
	const mintUrl = args[0];
	const revision = args[1];
	if (args.length !== 2 || mintUrl === undefined || revision === undefined) {
		return {
			ok: false,
			message: "Usage: pnpm dev:sandbox-hello-probe <https-mint-url> <40-character-commit-sha>",
		};
	}
	if (!isSafeHttpsUrl(mintUrl)) {
		return { ok: false, message: "The mint URL must be an explicit HTTPS URL." };
	}
	if (!/^[0-9a-fA-F]{40}$/.test(revision)) {
		return { ok: false, message: "The revision must be a 40-character commit SHA." };
	}

	const repositoryResult = parseGitHubRepository(environment.NS_DISPATCH_GITHUB_REPOSITORY);
	if (!repositoryResult.ok) {
		return {
			ok: false,
			message: "NS_DISPATCH_GITHUB_REPOSITORY is missing or invalid in pulled env.",
		};
	}
	const oidcToken = environment.VERCEL_OIDC_TOKEN;
	if (oidcToken === undefined || oidcToken.length === 0) {
		return { ok: false, message: "VERCEL_OIDC_TOKEN is missing from package-root .env.local." };
	}
	return { ok: true, mintUrl, revision, repository: repositoryResult.value, oidcToken };
}

function isSafeHttpsUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.username === "" && url.password === "";
	} catch {
		return false;
	}
}

function createHttpsCloneTokenMintGateway(options: {
	readonly mintUrl: string;
	readonly oidcToken: string;
}): CloneTokenMintGateway {
	return {
		async mintCloneToken({ repository }) {
			try {
				const response = await fetch(options.mintUrl, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-ns-dispatch-oidc-token": options.oidcToken,
					},
					body: JSON.stringify({ repository, purpose: "clone" }),
				});
				if (!response.ok) return { ok: false };
				const parsed = cloneMintResponseSchema.safeParse(await response.json());
				if (!parsed.success || parsed.data.repository !== repository) return { ok: false };
				return { ok: true, token: parsed.data.token };
			} catch {
				return { ok: false };
			}
		},
	};
}

if (import.meta.main) {
	const succeeded = await main();
	if (!succeeded) process.exitCode = 1;
}
