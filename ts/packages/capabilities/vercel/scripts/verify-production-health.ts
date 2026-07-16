import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDispatchProjectConfigToml } from "../src/api/project-config.ts";
import { verifyPublicProductionHealth } from "../src/deployability/real-production-deployment-gateways.ts";
import {
	DISPATCH_PROTECTION_BYPASS_ENV_NAME,
	parseEnvFileValue,
} from "../src/ns/dispatch-prompt/real-local-token-gateway.ts";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

async function readProtectionBypassToken(): Promise<string | undefined> {
	const fromEnv = process.env[DISPATCH_PROTECTION_BYPASS_ENV_NAME];
	if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
	const envLocalPath = join(packageRoot, ".env.local");
	if (!existsSync(envLocalPath)) return undefined;
	const token = parseEnvFileValue(
		await readFile(envLocalPath, "utf8"),
		DISPATCH_PROTECTION_BYPASS_ENV_NAME,
	);
	return token === null || token.length === 0 ? undefined : token;
}
const config = parseDispatchProjectConfigToml(
	await readFile(join(repositoryRoot, "ns.toml"), "utf8"),
	"ns.toml",
);
if (config.ok === false || config.value.deploymentUrl === undefined) {
	console.error(config.ok ? "ns.toml: dispatch deployment_url is required." : config.error.message);
	process.exitCode = 1;
} else {
	const bypassToken = await readProtectionBypassToken();
	const result = await verifyPublicProductionHealth(
		config.value.deploymentUrl,
		bypassToken === undefined ? {} : { protectionBypassToken: bypassToken },
	);
	if (result.ok) {
		process.stdout.write(
			`${JSON.stringify({ status: "ok", service: "ns-dispatch", url: result.url })}\n`,
		);
	} else {
		console.error(result.message);
		process.exitCode = 1;
	}
}
