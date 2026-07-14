import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deployDispatchProduction } from "../src/deployability/production-deployment.ts";
import { createRealProductionDeploymentContext } from "../src/deployability/real-production-deployment-gateways.ts";

export function productionRepositoryRootArgument(args: readonly string[]): string | undefined {
	const positional = args[0] === "--" ? args.slice(1) : args;
	if (positional.length > 1) throw new Error("Production deployment accepts one repository root.");
	return positional[0];
}

async function main(): Promise<void> {
	const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
	const derivedRepositoryRoot = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));
	const repositoryRootArgument = productionRepositoryRootArgument(process.argv.slice(2));
	const explicitRepositoryRoot =
		repositoryRootArgument === undefined ? undefined : resolve(repositoryRootArgument);

	if (explicitRepositoryRoot !== undefined && explicitRepositoryRoot !== derivedRepositoryRoot) {
		console.error(
			`Explicit repository root ${explicitRepositoryRoot} does not match the script checkout ${derivedRepositoryRoot}.`,
		);
		process.exitCode = 1;
		return;
	}

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

if (import.meta.main) await main();
