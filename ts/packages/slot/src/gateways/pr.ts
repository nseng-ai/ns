import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { z } from "zod";

const GH_TIMEOUT_MS = 30_000;

export const prStates = ["OPEN", "CLOSED", "MERGED"] as const;
export type PRState = (typeof prStates)[number];

export interface PRSummary {
	number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
	state: PRState;
}

export interface PRGatewayFailure {
	stderr: string;
	stdout: string;
	returncode: number | null;
}

export type PRLookupResult =
	| { type: "found"; pr: PRSummary }
	| { type: "missing"; message: string; returncode: number | null }
	| { type: "failure"; failure: PRGatewayFailure };

export interface SlotPRGateway {
	getPrForBranch(branch: string): Promise<PRLookupResult>;
	closePr(number: number): Promise<PRGatewayFailure | null>;
}

const ghPrViewSchema = z.object({
	number: z.number().int(),
	title: z.string().default(""),
	url: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	state: z.enum(prStates),
});

export class RealSlotPRGateway implements SlotPRGateway {
	private readonly cwd: string;
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;

	constructor(options: { cwd: string; env?: NodeJS.ProcessEnv | undefined; execApi?: CommandExecApi | undefined }) {
		this.cwd = options.cwd;
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
	}

	async getPrForBranch(branch: string): Promise<PRLookupResult> {
		const result = await this.execApi.exec("gh", ["pr", "view", branch, "--json", "number,title,url,headRefName,baseRefName,state"], { cwd: this.cwd, env: this.env, timeout: GH_TIMEOUT_MS });
		if (result.code !== 0 || result.killed) {
			const message = `${result.stderr}\n${result.stdout}`.trim();
			if (/no pull requests?/i.test(message)) return { type: "missing", message, returncode: result.code };
			return { type: "failure", failure: failureFromExec(result) };
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(result.stdout);
		} catch {
			return { type: "failure", failure: { stderr: "gh pr view returned invalid JSON", stdout: result.stdout, returncode: result.code } };
		}
		const view = ghPrViewSchema.safeParse(parsed);
		if (!view.success) {
			return { type: "failure", failure: { stderr: `gh pr view JSON had unexpected shape: ${view.error.message}`, stdout: result.stdout, returncode: result.code } };
		}
		return {
			type: "found",
			pr: {
				number: view.data.number,
				title: view.data.title,
				url: view.data.url,
				head_ref_name: view.data.headRefName,
				base_ref_name: view.data.baseRefName,
				state: view.data.state,
			},
		};
	}

	async closePr(number: number): Promise<PRGatewayFailure | null> {
		const result = await this.execApi.exec("gh", ["pr", "close", String(number)], { cwd: this.cwd, env: this.env, timeout: GH_TIMEOUT_MS });
		return result.code === 0 && !result.killed ? null : failureFromExec(result);
	}
}

function failureFromExec(result: { stdout: string; stderr: string; code: number | null; killed: boolean }): PRGatewayFailure {
	const stderr = result.stderr.trim() || (result.killed ? "gh command was killed" : "");
	return { stderr, stdout: result.stdout, returncode: result.code };
}

export function prFailureMessage(failure: PRGatewayFailure, fallback: string): string {
	return failure.stderr.trim() || failure.stdout.trim() || (failure.returncode === null ? fallback : `${fallback} exited ${failure.returncode}`);
}
