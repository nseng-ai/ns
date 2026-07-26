import { runGitHubCliAsExecResult } from "@nseng-ai/extension-kit/github/cli";
import { parseJsonUnknown } from "@nseng-ai/extension-kit/github/graphql-json";
import {
	commandSucceeded,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import {
	formatErrorMessage,
	optionalEntry,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	createDiagnosticCommandRunner,
	createSlotDiagnosticSinkFromEnv,
	type SlotDiagnosticSink,
} from "../diagnostics.ts";

const SLOT_PR_TIMEOUT_MS = 10_000;
const PR_BATCH_PAGE_SIZE = 20;

export type PrState = "OPEN" | "CLOSED" | "MERGED";

export interface PrSummary {
	number: number;
	title: string;
	state: PrState;
	url: string;
	headRefName: string;
	baseRefName: string;
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
	title: z.string(),
	url: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
});

const ghRepoViewSchema = z.object({
	nameWithOwner: z.string(),
});

const graphQlPullRequestsSchema = z.object({
	nodes: z.array(prSummarySchema),
});

const graphQlBatchSchema = z.object({
	data: z
		.object({ repository: z.record(z.string(), graphQlPullRequestsSchema).nullable() })
		.optional(),
	errors: z.unknown().optional(),
});

export class RealSlotPrGateway implements SlotPrGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly diagnosticSink: SlotDiagnosticSink | undefined;

	constructor(options: {
		cwd: string;
		env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
		execApi?: CommandExecApi;
		diagnosticSink?: ExplicitUndefined<"di-seam", SlotDiagnosticSink>;
	}) {
		this.cwd = options.cwd;
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.diagnosticSink = options.diagnosticSink ?? createSlotDiagnosticSinkFromEnv(this.env);
	}

	async getPrForBranch(branch: string): Promise<PrLookupResult> {
		const result = await this.runGh(
			["pr", "view", branch, "--json", "number,title,state,url,headRefName,baseRefName"],
			"slot.pr.view_branch",
		);
		if (!commandSucceeded(result)) {
			if (isPrLookupMiss(result.stdout, result.stderr)) return { type: "miss" };
			return {
				type: "failure",
				failure: failureFromExec(result),
			};
		}
		const parsedJson = parseJsonUnknown(result.stdout);
		if (parsedJson.type === "error")
			return { type: "failure", failure: failureFromJsonParse(result, parsedJson.error) };
		const parsed = prSummarySchema.safeParse(parsedJson.value);
		if (!parsed.success)
			return {
				type: "failure",
				failure: failureFromExec(result, parsed.error.message),
			};
		return { type: "found", pr: parsed.data };
	}

	async getPrsForBranches(branches: readonly string[]): Promise<PrBatchLookupResult> {
		const uniqueBranches = uniqueStrings(branches);
		if (uniqueBranches.length === 0) return { type: "ok", resultsByBranch: new Map() };
		const repo = await this.resolveRepository();
		if (repo.type === "failure") return { type: "failure", failure: repo.failure };
		const aliases = uniqueBranches.map((branch, index) => ({ alias: `b${index}`, branch }));
		const query = buildPrBatchQuery({ owner: repo.owner, name: repo.name, aliases });
		const result = await this.runGh(
			["api", "graphql", "-F", `query=${query}`],
			"slot.pr.batch_lookup",
		);
		if (!commandSucceeded(result))
			return {
				type: "failure",
				failure: failureFromExec(result),
			};
		const parsedJson = parseJsonUnknown(result.stdout);
		if (parsedJson.type === "error")
			return { type: "failure", failure: failureFromJsonParse(result, parsedJson.error) };
		const parsed = graphQlBatchSchema.safeParse(parsedJson.value);
		if (!parsed.success)
			return {
				type: "failure",
				failure: failureFromExec(result, parsed.error.message),
			};
		if (parsed.data.errors !== undefined)
			return {
				type: "failure",
				failure: failureFromExec(result, graphQlErrorsMessage(parsed.data.errors)),
			};
		const repository = parsed.data.data?.repository;
		if (repository === undefined || repository === null)
			return {
				type: "failure",
				failure: failureFromExec(result, "GitHub GraphQL response did not include repository data"),
			};
		const results = new Map<string, PrLookupResult>();
		for (const { alias, branch } of aliases) {
			const connection = repository[alias];
			if (connection === undefined)
				return {
					type: "failure",
					failure: failureFromExec(
						result,
						`GitHub GraphQL response did not include alias ${alias} for ${branch}`,
					),
				};
			const resultForBranch = prLookupResultFromNodes(branch, connection.nodes);
			if (resultForBranch.type === "failure")
				return {
					type: "failure",
					failure: failureFromExec(result, resultForBranch.message),
				};
			results.set(branch, resultForBranch.result);
		}
		return { type: "ok", resultsByBranch: results };
	}

	async closePr(number: number): Promise<PrCloseResult> {
		const result = await this.runGh(["pr", "close", String(number)], "slot.pr.close");
		if (commandSucceeded(result)) return { type: "ok" };
		return { type: "failure", failure: failureFromExec(result) };
	}

	private async resolveRepository(): Promise<
		{ type: "ok"; owner: string; name: string } | { type: "failure"; failure: PrGatewayFailure }
	> {
		const result = await this.runGh(
			["repo", "view", "--json", "nameWithOwner"],
			"slot.pr.resolve_repository",
		);
		if (!commandSucceeded(result))
			return {
				type: "failure",
				failure: failureFromExec(result),
			};
		const parsedJson = parseJsonUnknown(result.stdout);
		if (parsedJson.type === "error")
			return { type: "failure", failure: failureFromJsonParse(result, parsedJson.error) };
		const parsed = ghRepoViewSchema.safeParse(parsedJson.value);
		if (!parsed.success)
			return {
				type: "failure",
				failure: failureFromExec(result, parsed.error.message),
			};
		const [owner, ...nameParts] = parsed.data.nameWithOwner.split("/");
		const name = nameParts.join("/");
		if (owner === undefined || owner.length === 0 || name.length === 0 || nameParts.length !== 1) {
			return {
				type: "failure",
				failure: failureFromExec(
					result,
					`Unexpected gh repo view nameWithOwner: ${parsed.data.nameWithOwner}`,
				),
			};
		}
		return { type: "ok", owner, name };
	}

	private async runGh(args: readonly string[], operation: string): Promise<ExecResult> {
		return await runGitHubCliAsExecResult({
			runner: createDiagnosticCommandRunner({
				execApi: this.execApi,
				operation,
				...optionalEntry("diagnosticSink", this.diagnosticSink),
			}),
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

function buildPrBatchQuery(options: {
	owner: string;
	name: string;
	aliases: readonly PrBatchAlias[];
}): string {
	const fields = options.aliases
		.map(
			({ alias, branch }) =>
				`${alias}: pullRequests(headRefName: ${JSON.stringify(branch)}, first: ${PR_BATCH_PAGE_SIZE}, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title state url headRefName baseRefName } }`,
		)
		.join("\n");
	return `query { repository(owner: ${JSON.stringify(options.owner)}, name: ${JSON.stringify(options.name)}) {\n${fields}\n} }`;
}

function prLookupResultFromNodes(
	branch: string,
	nodes: readonly PrSummary[],
): { type: "ok"; result: PrLookupResult } | { type: "failure"; message: string } {
	if (nodes.length === 0) return { type: "ok", result: { type: "miss" } };
	const exact = nodes.filter((node) => node.headRefName === branch);
	if (exact.length === 0)
		return {
			type: "failure",
			message: `GitHub GraphQL returned PR nodes for ${branch} without an exact headRefName match`,
		};
	const pr = exact[0];
	if (pr === undefined)
		return { type: "failure", message: `GitHub GraphQL returned no exact PR match for ${branch}` };
	// The query orders by UPDATED_AT descending, so the first exact match is deterministic when historical PRs share a branch name.
	return { type: "ok", result: { type: "found", pr } };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
	return [...new Set(values)];
}

function isPrLookupMiss(stdout: string, stderr: string): boolean {
	const text = `${stderr}\n${stdout}`.toLowerCase();
	return (
		text.includes("no pull requests found") ||
		text.includes("could not find any pull requests") ||
		text.includes("not found")
	);
}

function graphQlErrorsMessage(errors: unknown): string {
	if (Array.isArray(errors) && errors.length === 0)
		return "GitHub GraphQL returned an empty errors list";
	return `GitHub GraphQL returned errors: ${JSON.stringify(errors)}`;
}

export function prFailureMessage(failure: PrGatewayFailure, fallbackPrefix = "gh exited"): string {
	return (
		failure.stderr.trim() ||
		failure.stdout.trim() ||
		`${fallbackPrefix} ${failure.returnCode ?? "unknown"}`
	);
}

function failureFromJsonParse(result: ExecResult, error: unknown): PrGatewayFailure {
	return failureFromExec(result, formatErrorMessage(error));
}

function failureFromExec(result: ExecResult, stderrOverride?: string): PrGatewayFailure {
	const stderr = stderrOverride ?? result.stderr;
	const returnCode = result.type === "spawn-failed" ? null : result.code;
	const evidence = commandFailureEvidence(result);
	const trimmedStderr = stderr.trim();
	const trimmedStdout = result.stdout.trim();
	const message =
		trimmedStderr !== "" ? trimmedStderr : trimmedStdout !== "" ? trimmedStdout : evidence;
	return { stdout: result.stdout, stderr, returnCode, message };
}

function commandFailureEvidence(result: ExecResult): string {
	switch (result.type) {
		case "spawn-failed":
			return `gh failed to start: ${result.error}`;
		case "cancelled":
			return "gh was cancelled";
		case "timed-out":
			return "gh timed out";
		case "exited":
			return result.signal === null
				? `gh exited ${result.code ?? "unknown"}`
				: `gh exited after signal ${result.signal} (status ${result.code ?? "unknown"})`;
	}
}
