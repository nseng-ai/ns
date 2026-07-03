#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

import { renderCliShim } from "./render-cli-shim-core.ts";

const REQUIRED_ENV_VARS = [
	"NS_TEMPLATE",
	"NS_OUTPUT",
	"NS_TOOL",
	"NS_CANONICAL_CHECKOUT",
	"NS_CLI_REL_PATH",
	"NS_INSTALL_HINT",
];

function envValue(name) {
	const value = process.env[name];
	if (value === undefined) throw new Error(`missing env var after preflight: ${name}`);
	return value;
}

async function main() {
	const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => process.env[name] === undefined);
	if (missingEnvVars.length > 0) {
		console.error(
			`render-cli-shim.mjs: missing required environment variables: ${missingEnvVars.join(", ")}`,
		);
		return 2;
	}

	const templatePath = envValue("NS_TEMPLATE");
	const result = renderCliShim({
		template: await readFile(templatePath, "utf8"),
		tool: envValue("NS_TOOL"),
		canonicalCheckout: envValue("NS_CANONICAL_CHECKOUT"),
		cliRelPath: envValue("NS_CLI_REL_PATH"),
		installHint: envValue("NS_INSTALL_HINT"),
		fallbackMode: process.env.NS_FALLBACK_MODE,
		templateLabel: templatePath,
	});
	if (result.type === "failure") {
		console.error(`render-cli-shim.mjs: ${result.message}`);
		return result.exitCode;
	}

	await writeFile(envValue("NS_OUTPUT"), result.rendered, "utf8");
	return 0;
}

process.exitCode = await main();
