import { defaultCommandResolver, runCommand, type CommandResolver, type CommandRunner } from "@asdl/core/exec";

import { err, ok, type ErrorInfo, type GatewayResult } from "../result.ts";
import { commandFailure } from "./command-failure.ts";
import { resolveVercelCommandPrefix } from "./vercel-command.ts";

export interface DeploymentCandidate {
	url: string;
	state: string;
	createdAt: number;
	readyAt?: number;
	meta: Record<string, string>;
}

export interface InspectedDeployment {
	id: string;
	url: string;
	aliases: string[];
}

export interface VercelDeploymentGateway {
	listReadyPreviewDeployments(params: {
		project: string;
		scope: string;
		branch: string;
		cwd: string;
	}): Promise<GatewayResult<DeploymentCandidate[]>>;

	inspectDeployment(params: {
		url: string;
		scope: string;
		cwd: string;
	}): Promise<GatewayResult<InspectedDeployment>>;
}

export class RealVercelDeploymentGateway implements VercelDeploymentGateway {
	private readonly runner: CommandRunner;
	private readonly resolveCommand: CommandResolver;

	constructor(params: { runner?: CommandRunner; resolveCommand?: CommandResolver } = {}) {
		this.runner = params.runner ?? runCommand;
		this.resolveCommand = params.resolveCommand ?? defaultCommandResolver;
	}

	async listReadyPreviewDeployments(params: {
		project: string;
		scope: string;
		branch: string;
		cwd: string;
	}): Promise<GatewayResult<DeploymentCandidate[]>> {
		const prefix = resolveVercelCommandPrefix(this.resolveCommand);
		if (prefix === undefined) {
			return err(vercelUnavailableError());
		}

		const args = [
			...prefix.args,
			"ls",
			params.project,
			"--scope",
			params.scope,
			"--format=json",
			"--status",
			"READY",
			"--environment",
			"preview",
			"-m",
			`githubCommitRef=${params.branch}`,
			"--non-interactive",
		];
		const result = await this.runner(prefix.command, args, { cwd: params.cwd });
		const commandError = commandFailure(
			prefix.command,
			args,
			result,
			"vercel_list_failed",
			`Vercel deployment list command failed for githubCommitRef=${params.branch}.`,
		);
		if (commandError !== undefined) {
			return err(commandError);
		}

		return parseDeploymentList(result.stdout);
	}

	async inspectDeployment(params: { url: string; scope: string; cwd: string }): Promise<GatewayResult<InspectedDeployment>> {
		const prefix = resolveVercelCommandPrefix(this.resolveCommand);
		if (prefix === undefined) {
			return err(vercelUnavailableError());
		}

		const inspectedUrl = toHttpsUrl(params.url);
		const args = [...prefix.args, "inspect", inspectedUrl, "--scope", params.scope, "--format=json", "--non-interactive"];
		const result = await this.runner(prefix.command, args, { cwd: params.cwd });
		const commandError = commandFailure(
			prefix.command,
			args,
			result,
			"vercel_inspect_failed",
			`Vercel inspect command failed for deployment ${params.url}.`,
		);
		if (commandError !== undefined) {
			return err(commandError);
		}

		return parseInspectDeployment(result.stdout);
	}
}

function vercelUnavailableError(): ErrorInfo {
	return {
		code: "vercel_cli_unavailable",
		message: "Neither vercel nor pnpm was found on PATH; cannot query Vercel deployments.",
	};
}

function parseDeploymentList(stdout: string): GatewayResult<DeploymentCandidate[]> {
	const parsed = parseJson(stdout, "Vercel deployment list");
	if (!parsed.ok) return parsed;

	const root = asRecord(parsed.value);
	if (root === undefined || !Array.isArray(root.deployments)) {
		return err({
			code: "vercel_deployment_list_shape_error",
			message: "Vercel deployment list JSON did not contain a deployments array.",
		});
	}

	const deployments: DeploymentCandidate[] = [];
	for (const item of root.deployments) {
		const record = asRecord(item);
		if (record === undefined) continue;

		const url = stringField(record, "url");
		const state = stringField(record, "state");
		const createdAt = numberField(record, "createdAt");
		if (url === undefined || state === undefined || createdAt === undefined) continue;

		const readyAt = numberField(record, "ready");
		const deployment: DeploymentCandidate = {
			url,
			state,
			createdAt,
			meta: stringRecordField(record, "meta"),
		};
		if (readyAt !== undefined) {
			deployment.readyAt = readyAt;
		}
		deployments.push(deployment);
	}

	return ok(deployments);
}

function parseInspectDeployment(stdout: string): GatewayResult<InspectedDeployment> {
	const parsed = parseJson(stdout, "Vercel inspect");
	if (!parsed.ok) return parsed;

	const root = asRecord(parsed.value);
	if (root === undefined) {
		return err({ code: "vercel_inspect_shape_error", message: "Vercel inspect JSON was not an object." });
	}

	const id = stringField(root, "id");
	const url = stringField(root, "url");
	if (id === undefined || url === undefined) {
		return err({ code: "vercel_inspect_shape_error", message: "Vercel inspect JSON was missing required id or url fields." });
	}

	return ok({
		id,
		url,
		aliases: stringArrayField(root, "aliases"),
	});
}

function parseJson(stdout: string, description: string): GatewayResult<unknown> {
	try {
		return ok(JSON.parse(stdout) as unknown);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return err({
			code: "vercel_json_parse_error",
			message: `${description} output was not valid JSON.`,
			details: { parse_error: message },
		});
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim() !== "") {
		const numericValue = Number(value);
		if (Number.isFinite(numericValue)) {
			return numericValue;
		}
	}
	return undefined;
}

function stringRecordField(record: Record<string, unknown>, key: string): Record<string, string> {
	const value = asRecord(record[key]);
	if (value === undefined) return {};

	const output: Record<string, string> = {};
	for (const [entryKey, entryValue] of Object.entries(value)) {
		if (typeof entryValue === "string") {
			output[entryKey] = entryValue;
		}
	}
	return output;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
	const value = record[key];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function toHttpsUrl(value: string): string {
	if (/^https?:\/\//.test(value)) {
		return value;
	}
	return `https://${value}`;
}
