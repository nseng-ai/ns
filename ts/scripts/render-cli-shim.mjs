#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const TOKEN_PREFIX = "@@ASDL_";
const VALID_FALLBACK_MODES = new Set(["literal", "script-checkout"]);
const REQUIRED_ENV_VARS = [
	"ASDL_TEMPLATE",
	"ASDL_OUTPUT",
	"ASDL_TOOL",
	"ASDL_CANONICAL_CHECKOUT",
	"ASDL_CLI_REL_PATH",
	"ASDL_INSTALL_HINT",
];

function shellQuote(value) {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

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

	const fallbackMode = process.env.ASDL_FALLBACK_MODE ?? "literal";
	if (!VALID_FALLBACK_MODES.has(fallbackMode)) {
		console.error(
			`render-cli-shim.mjs: invalid ASDL_FALLBACK_MODE '${fallbackMode}'; expected one of: literal, script-checkout`,
		);
		return 2;
	}

	const replacements = new Map([
		["@@ASDL_TOOL@@", shellQuote(envValue("ASDL_TOOL"))],
		["@@ASDL_CANONICAL_CHECKOUT@@", shellQuote(envValue("ASDL_CANONICAL_CHECKOUT"))],
		["@@ASDL_CLI_REL_PATH@@", shellQuote(envValue("ASDL_CLI_REL_PATH"))],
		["@@ASDL_INSTALL_HINT@@", shellQuote(envValue("ASDL_INSTALL_HINT"))],
		["@@ASDL_FALLBACK_MODE@@", shellQuote(fallbackMode)],
	]);

	let rendered = await readFile(envValue("ASDL_TEMPLATE"), "utf8");
	for (const [token, value] of replacements) rendered = rendered.replaceAll(token, value);

	if (rendered.includes(TOKEN_PREFIX)) {
		console.error(`render-cli-shim.mjs: unrendered shim token remains in ${envValue("ASDL_TEMPLATE")}`);
		return 2;
	}

	await writeFile(envValue("ASDL_OUTPUT"), rendered, "utf8");
	return 0;
}

process.exitCode = await main();
