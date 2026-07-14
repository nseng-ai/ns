import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deployDispatchProduction } from "../src/deployability/production-deployment.ts";
import { createRealProductionDeploymentContext } from "../src/deployability/real-production-deployment-gateways.ts";

const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const derivedRepositoryRoot = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
const explicitRepositoryRoot = process.argv[2] === undefined ? undefined : resolve(process.argv[2]);

if (explicitRepositoryRoot !== undefined && explicitRepositoryRoot !== derivedRepositoryRoot) {
	console.error("Explicit repository root does not match the script's checkout.");
	process.exitCode = 1;
} else {
	try {
		const result = await deployDispatchProduction(
			createRealProductionDeploymentContext({
				repositoryRoot: derivedRepositoryRoot,
				packageRoot,
				writeDiagnostic: (message) => {
					if (message.length > 0) process.stderr.write(`${message}\n`);
				},
			}),
		);
		if (result.ok) process.stdout.write(`${JSON.stringify(result.value)}\n`);
		else {
			console.error(`${result.code}: ${result.message}`);
			process.exitCode = 1;
		}
	} catch (error) {
		console.error(
			`production-deployment-invariant: ${error instanceof Error ? error.message : "unknown error"}`,
		);
		process.exitCode = 1;
	}
}
