#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

import { formatShellArg } from "../packages/sdl-core/src/exec.ts";

const TOKEN_PREFIX = "@@SDL_";
const VALID_FALLBACK_MODES = new Set(["literal", "script-checkout"]);
const REQUIRED_ENV_VARS = [
	"SDL_TEMPLATE",
	"SDL_OUTPUT",
	"SDL_TOOL",
	"SDL_CANONICAL_CHECKOUT",
	"SDL_CLI_REL_PATH",
	"SDL_INSTALL_HINT",
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

	const fallbackMode = process.env.SDL_FALLBACK_MODE ?? "literal";
	if (!VALID_FALLBACK_MODES.has(fallbackMode)) {
		console.error(
			`render-cli-shim.mjs: invalid SDL_FALLBACK_MODE '${fallbackMode}'; expected one of: literal, script-checkout`,
		);
		return 2;
	}

	const replacements = new Map([
		["@@SDL_TOOL@@", formatShellArg(envValue("SDL_TOOL"))],
		["@@SDL_CANONICAL_CHECKOUT@@", formatShellArg(envValue("SDL_CANONICAL_CHECKOUT"))],
		["@@SDL_CLI_REL_PATH@@", formatShellArg(envValue("SDL_CLI_REL_PATH"))],
		["@@SDL_INSTALL_HINT@@", formatShellArg(envValue("SDL_INSTALL_HINT"))],
		["@@SDL_FALLBACK_MODE@@", formatShellArg(fallbackMode)],
	]);

	let rendered = await readFile(envValue("SDL_TEMPLATE"), "utf8");
	for (const [token, value] of replacements) rendered = rendered.replaceAll(token, value);

	if (rendered.includes(TOKEN_PREFIX)) {
		console.error(`render-cli-shim.mjs: unrendered shim token remains in ${envValue("SDL_TEMPLATE")}`);
		return 2;
	}

	await writeFile(envValue("SDL_OUTPUT"), rendered, "utf8");
	return 0;
}

process.exitCode = await main();
