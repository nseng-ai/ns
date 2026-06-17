import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { z } from "zod";

const SLOT_PR_TIMEOUT_MS = 10_000;

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

export type PrCloseResult = { type: "ok" } | { type: "failure"; failure: PrGatewayFailure };

export interface SlotPrGateway {
	getPrForBranch(branch: string): Promise<PrLookupResult>;
	closePr(number: number): Promise<PrCloseResult>;
}

const ghPrViewSchema = z.object({
	number: z.number().int(),
	state: z.union([z.literal("OPEN"), z.literal("CLOSED"), z.literal("MERGED")]),
	url: z.string(),
	headRefName: z.string().default(""),
});

export class RealSlotPrGateway implements SlotPrGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;

	constructor(options: { cwd: string; env?: NodeJS.ProcessEnv | undefined; execApi?: CommandExecApi | undefined }) {
		this.cwd = options.cwd;
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
	}

	async getPrForBranch(branch: string): Promise<PrLookupResult> {
		const result = await this.execApi.exec("gh", ["pr", "view", branch, "--json", "number,state,url,headRefName"], { cwd: this.cwd, env: this.env, timeout: SLOT_PR_TIMEOUT_MS });
		if (result.code !== 0 || result.killed) {
			if (isPrLookupMiss(result.stdout, result.stderr)) return { type: "miss" };
			return { type: "failure", failure: failureFromExec(result.stdout, result.stderr, result.code) };
		}
		const parsedJson = parseJsonObject(result.stdout);
		if (parsedJson.type === "failure") return { type: "failure", failure: failureFromExec(result.stdout, parsedJson.message, result.code) };
		const parsed = ghPrViewSchema.safeParse(parsedJson.value);
		if (!parsed.success) return { type: "failure", failure: failureFromExec(result.stdout, parsed.error.message, result.code) };
		return { type: "found", pr: parsed.data };
	}

	async closePr(number: number): Promise<PrCloseResult> {
		const result = await this.execApi.exec("gh", ["pr", "close", String(number)], { cwd: this.cwd, env: this.env, timeout: SLOT_PR_TIMEOUT_MS });
		if (result.code === 0 && !result.killed) return { type: "ok" };
		return { type: "failure", failure: failureFromExec(result.stdout, result.stderr, result.code) };
	}
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

export function prFailureMessage(failure: PrGatewayFailure, fallbackPrefix = "gh exited"): string {
	return failure.stderr.trim() || failure.stdout.trim() || `${fallbackPrefix} ${failure.returnCode ?? "unknown"}`;
}

function failureFromExec(stdout: string, stderr: string, returnCode: number | null): PrGatewayFailure {
	const message = stderr.trim() || stdout.trim() || `gh exited ${returnCode ?? "unknown"}`;
	return { stdout, stderr, returnCode, message };
}
