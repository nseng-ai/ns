#!/usr/bin/env bun
import { defaultPlanStoreRoot } from "@asdl/planned-branch";
import { TS_PLAN_RECIPE_TRUST_NOTICE } from "@asdl/ts-plans/host";

import { createTsPlanViewerRequestHandler } from "./server.ts";
import type { TsPlanViewerOptions } from "./plan-store.ts";

interface ServeConfig extends TsPlanViewerOptions {
	host: string;
	port: number;
}

type ParseCliResult =
	| { type: "serve"; config: ServeConfig }
	| { type: "help" }
	| { type: "failure"; message: string };

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;

export async function runCli(args: readonly string[]): Promise<number> {
	const parsed = parseCliArgs(args);
	if (parsed.type === "help") {
		console.log(usage());
		return 0;
	}
	if (parsed.type === "failure") {
		console.error(parsed.message);
		console.error(usage());
		return 2;
	}

	const server = Bun.serve({
		hostname: parsed.config.host,
		port: parsed.config.port,
		fetch: createTsPlanViewerRequestHandler(parsed.config),
	});

	console.log(`TypeScript plan viewer: http://${server.hostname}:${server.port}/`);
	console.log(`Plan store root: ${parsed.config.planStoreRoot}`);
	console.log(`Recipe cwd: ${parsed.config.cwd}`);
	console.log(TS_PLAN_RECIPE_TRUST_NOTICE);
	return 0;
}

export function parseCliArgs(args: readonly string[]): ParseCliResult {
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		return { type: "help" };
	}

	const [command, ...rest] = args;
	if (command !== "serve") {
		return { type: "failure", message: "Usage error: expected the serve command." };
	}

	let host = DEFAULT_HOST;
	let port = DEFAULT_PORT;
	let planStoreRoot = defaultPlanStoreRoot();
	let cwd = process.cwd();

	for (let index = 0; index < rest.length; index += 1) {
		const arg = rest[index];
		if (arg === "--host") {
			const value = rest[index + 1];
			if (value === undefined) return { type: "failure", message: "Usage error: --host requires a value." };
			host = value;
			index += 1;
			continue;
		}
		if (arg === "--port") {
			const value = rest[index + 1];
			if (value === undefined) return { type: "failure", message: "Usage error: --port requires a value." };
			const parsedPort = Number(value);
			if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
				return { type: "failure", message: "Usage error: --port must be an integer from 0 to 65535." };
			}
			port = parsedPort;
			index += 1;
			continue;
		}
		if (arg === "--plan-store-root") {
			const value = rest[index + 1];
			if (value === undefined) return { type: "failure", message: "Usage error: --plan-store-root requires a value." };
			planStoreRoot = value;
			index += 1;
			continue;
		}
		if (arg === "--cwd") {
			const value = rest[index + 1];
			if (value === undefined) return { type: "failure", message: "Usage error: --cwd requires a value." };
			cwd = value;
			index += 1;
			continue;
		}
		return { type: "failure", message: `Usage error: unsupported argument ${arg ?? ""}.` };
	}

	return { type: "serve", config: { host, port, planStoreRoot, cwd } };
}

export function usage(): string {
	return `Usage:
  ts-plan-viewer serve [--host 127.0.0.1] [--port 0] [--plan-store-root <path>] [--cwd <path>]
  ts-plan-viewer --help

Runs a local web viewer for saved trusted TypeScript planned-branch recipe plans (.plan.ts).

Trust boundary: selecting a plan evaluates trusted local .plan.ts code server-side with local system permissions. The browser only receives rendered JSON/text/source and must not evaluate plan code.`;
}

if (import.meta.main) {
	const exitCode = await runCli(process.argv.slice(2));
	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}
