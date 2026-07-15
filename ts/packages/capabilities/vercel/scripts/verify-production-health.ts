import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDispatchProjectConfigToml } from "../src/dispatch-client/project-config.ts";
import { verifyPublicProductionHealth } from "../src/deployability/real-production-deployment-gateways.ts";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const config = parseDispatchProjectConfigToml(
	await readFile(join(repositoryRoot, "ns.toml"), "utf8"),
	"ns.toml",
);
if (config.ok === false || config.value.deploymentUrl === undefined) {
	console.error(config.ok ? "ns.toml: dispatch deployment_url is required." : config.error.message);
	process.exitCode = 1;
} else {
	const result = await verifyPublicProductionHealth(config.value.deploymentUrl);
	if (result.ok) {
		process.stdout.write(
			`${JSON.stringify({ status: "ok", service: "ns-dispatch", url: result.url })}\n`,
		);
	} else {
		console.error(result.message);
		process.exitCode = 1;
	}
}
