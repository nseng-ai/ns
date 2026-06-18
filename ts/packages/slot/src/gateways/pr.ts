import { NodeCommandExecApi, type CommandExecApi, type ExecResult } from "@asdl/core/exec";
import { runGitHubCliAsExecResult } from "@asdl/core/github-cli";
import { z } from "zod";

import { createDiagnosticCommandRunner, createSlotDiagnosticSinkFromEnv, type SlotDiagnosticSink } from "../diagnostics.ts";

const SLOT_PR_TIMEOUT_MS = 10_000;
const PR_BATCH_PAGE_SIZE = 20;

export type PrState = "OPEN" | "CLOSED" | "MERGED";

export interface PrSummary {
	number: number;
	state: PrState;
	url: string;
	headRefName: string;
}

export interface PrGatewayFailure {
	stdout: string;
	stderr: string;
	returnCode: number | null;
	message: string;
}

export type PrLookupResult =
	| { type: "found"; pr: PrSummary }
	| { type: "miss" }
	| { type: "failure"; failure: PrGatewayFailure };

export type PrBatchLookupResult =
	| { type: "ok"; resultsByBranch: ReadonlyMap<string, PrLookupResult> }
	| { type: "failure"; failure: PrGatewayFailure };

export type PrCloseResult = { type: "ok" } | { type: "failure"; failure: PrGatewayFailure };

export interface SlotPrGateway {
	getPrForBranch(branch: string): Promise<PrLookupResult>;
	getPrsForBranches(branches: readonly string[]): Promise<PrBatchLookupResult>;
	closePr(number: number): Promise<PrCloseResult>;
}

const prSummarySchema = z.object({
	number: z.number().int(),
	state: z.union([z.literal("OPEN"), z.literal("CLOSED"), z.literal("MERGED")]),
	url: z.string(),
	headRefName: z.string().default(""),
});

const ghRepoViewSchema = z.object({
	nameWithOwner: z.string(),
});

const graphQlPullRequestsSchema = z.object({
	nodes: z.array(prSummarySchema),
});

const graphQlBatchSchema = z.object({
	data: z.object({ repository: z.record(z.string(), graphQlPullRequestsSchema).nullable() }).optional(),
	errors: z.unknown().optional(),
});

export class RealSlotPrGateway implements SlotPrGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly diagnosticSink: SlotDiagnosticSink | undefined;

	constructor(options: { cwd: string; env?: NodeJS.ProcessEnv | undefined; execApi?: CommandExecApi | undefined; diagnosticSink?: SlotDiagnosticSink | undefined }) {
		this.cwd = options.cwd;
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.diagnosticSink = options.diagnosticSink ?? createSlotDiagnosticSinkFromEnv(this.env);
	}

	async getPrForBranch(branch: string): Promise<PrLookupResult> {
		const result = await this.runGh(["pr", "view", branch, "--json", "number,state,url,headRefName"], "slot.pr.view_branch");
		if (result.code !== 0 || result.killed) {
			if (isPrLookupMiss(result.stdout, result.stderr)) return { type: "miss" };
			return { type: "failure", failure: failureFromExec(result.stdout, result.stderr, result.code) };
		}
		const parsedJson = parseJsonObject(result.stdout);
		if (parsedJson.type === "failure") return { type: "failure", failure: failureFromExec(result.stdout, parsedJson.message, result.code) };
		const parsed = prSummarySchema.safeParse(parsedJson.value);
		if (!parsed.success) return { type: "failure", failure: failureFromExec(result.stdout, parsed.error.message, result.code) };
		return { type: "found", pr: parsed.data };
	}

	async getPrsForBranches(branches: readonly string[]): Promise<PrBatchLookupResult> {
		const uniqueBranches = uniqueStrings(branches);
		if (uniqueBranches.length === 0) return { type: "ok", resultsByBranch: new Map() };
		const repo = await this.resolveRepository();
		if (repo.type === "failure") return { type: "failure", failure: repo.failure };
		const aliases = uniqueBranches.map((branch, index) => ({ alias: `b${index}`, branch }));
		const query = buildPrBatchQuery({ owner: repo.owner, name: repo.name, aliases });
		const result = await this.runGh(["api", "graphql", "-F", `query=${query}`], "slot.pr.batch_lookup");
		if (result.code !== 0 || result.killed) return { type: "failure", failure: failureFromExec(result.stdout, result.stderr, result.code) };
		const parsedJson = parseJsonObject(result.stdout);
		if (parsedJson.type === "failure") return { type: "failure", failure: failureFromExec(result.stdout, parsedJson.message, result.code) };
		const parsed = graphQlBatchSchema.safeParse(parsedJson.value);
		if (!parsed.success) return { type: "failure", failure: failureFromExec(result.stdout, parsed.error.message, result.code) };
		if (parsed.data.errors !== undefined) return { type: "failure", failure: failureFromExec(result.stdout, graphQlErrorsMessage(parsed.data.errors), result.code) };
		const repository = parsed.data.data?.repository;
		if (repository === undefined || repository === null) return { type: "failure", failure: failureFromExec(result.stdout, "GitHub GraphQL response did not include repository data", result.code) };
		const results = new Map<string, PrLookupResult>();
		for (const { alias, branch } of aliases) {
			const connection = repository[alias];
			if (connection === undefined) return { type: "failure", failure: failureFromExec(result.stdout, `GitHub GraphQL response did not include alias ${alias} for ${branch}`, result.code) };
			const resultForBranch = prLookupResultFromNodes(branch, connection.nodes);
			if (resultForBranch.type === "failure") return { type: "failure", failure: failureFromExec(result.stdout, resultForBranch.message, result.code) };
			results.set(branch, resultForBranch.result);
		}
		return { type: "ok", resultsByBranch: results };
	}

	async closePr(number: number): Promise<PrCloseResult> {
		const result = await this.runGh(["pr", "close", String(number)], "slot.pr.close");
		if (result.code === 0 && !result.killed) return { type: "ok" };
		return { type: "failure", failure: failureFromExec(result.stdout, result.stderr, result.code) };
	}

	private async resolveRepository(): Promise<{ type: "ok"; owner: string; name: string } | { type: "failure"; failure: PrGatewayFailure }> {
		const result = await this.runGh(["repo", "view", "--json", "nameWithOwner"], "slot.pr.resolve_repository");
		if (result.code !== 0 || result.killed) return { type: "failure", failure: failureFromExec(result.stdout, result.stderr, result.code) };
		const parsedJson = parseJsonObject(result.stdout);
		if (parsedJson.type === "failure") return { type: "failure", failure: failureFromExec(result.stdout, parsedJson.message, result.code) };
		const parsed = ghRepoViewSchema.safeParse(parsedJson.value);
		if (!parsed.success) return { type: "failure", failure: failureFromExec(result.stdout, parsed.error.message, result.code) };
		const [owner, ...nameParts] = parsed.data.nameWithOwner.split("/");
		const name = nameParts.join("/");
		if (owner === undefined || owner.length === 0 || name.length === 0 || nameParts.length !== 1) {
			return { type: "failure", failure: failureFromExec(result.stdout, `Unexpected gh repo view nameWithOwner: ${parsed.data.nameWithOwner}`, result.code) };
		}
		return { type: "ok", owner, name };
	}

	private async runGh(args: readonly string[], operation: string): Promise<ExecResult> {
		return await runGitHubCliAsExecResult({
			runner: createDiagnosticCommandRunner({ execApi: this.execApi, operation, diagnosticSink: this.diagnosticSink }),
			args,
			cwd: this.cwd,
			env: this.env,
			timeoutMs: SLOT_PR_TIMEOUT_MS,
		});
	}
}

interface PrBatchAlias {
	alias: string;
	branch: string;
}

function buildPrBatchQuery(options: { owner: string; name: string; aliases: readonly PrBatchAlias[] }): string {
	const fields = options.aliases.map(({ alias, branch }) => `${alias}: pullRequests(headRefName: ${JSON.stringify(branch)}, first: ${PR_BATCH_PAGE_SIZE}, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number state url headRefName } }`).join("\n");
	return `query { repository(owner: ${JSON.stringify(options.owner)}, name: ${JSON.stringify(options.name)}) {\n${fields}\n} }`;
}

function prLookupResultFromNodes(branch: string, nodes: readonly PrSummary[]): { type: "ok"; result: PrLookupResult } | { type: "failure"; message: string } {
	if (nodes.length === 0) return { type: "ok", result: { type: "miss" } };
	const exact = nodes.filter((node) => node.headRefName === branch);
	if (exact.length === 0) return { type: "failure", message: `GitHub GraphQL returned PR nodes for ${branch} without an exact headRefName match` };
	const pr = exact[0];
	if (pr === undefined) return { type: "failure", message: `GitHub GraphQL returned no exact PR match for ${branch}` };
	// The query orders by UPDATED_AT descending, so the first exact match is deterministic when historical PRs share a branch name.
	return { type: "ok", result: { type: "found", pr } };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
	return [...new Set(values)];
}

function parseJsonObject(text: string): { type: "ok"; value: unknown } | { type: "failure"; message: string } {
	try {
		return { type: "ok", value: JSON.parse(text) };
	} catch (error) {
		return { type: "failure", message: error instanceof Error ? error.message : String(error) };
	}
}

function isPrLookupMiss(stdout: string, stderr: string): boolean {
	const text = `${stderr}\n${stdout}`.toLowerCase();
	return text.includes("no pull requests found") || text.includes("could not find any pull requests") || text.includes("not found");
}

function graphQlErrorsMessage(errors: unknown): string {
	if (Array.isArray(errors) && errors.length === 0) return "GitHub GraphQL returned an empty errors list";
	return `GitHub GraphQL returned errors: ${JSON.stringify(errors)}`;
}

export function prFailureMessage(failure: PrGatewayFailure, fallbackPrefix = "gh exited"): string {
	return failure.stderr.trim() || failure.stdout.trim() || `${fallbackPrefix} ${failure.returnCode ?? "unknown"}`;
}

function failureFromExec(stdout: string, stderr: string, returnCode: number | null): PrGatewayFailure {
	const message = stderr.trim() || stdout.trim() || `gh exited ${returnCode ?? "unknown"}`;
	return { stdout, stderr, returnCode, message };
}
