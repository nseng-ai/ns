import type { DispatchReportGateway } from "../../../src/dispatch/anchor-pr-report.ts";
import type { DispatchRunFailureCode } from "../../../src/dispatch/dispatch-run.ts";
import type { DispatchFailureDiagnostic } from "../../../src/dispatch/failure-diagnostic.ts";
import type { DispatchTokenMinter, DispatchTokenMintResult } from "../../../src/mint/mint-core.ts";

/** Records before returning a configured mint failure. */
export class RecordingDispatchTokenMinter implements DispatchTokenMinter {
	readonly calls: Array<{ repository: string; purpose: string }> = [];
	readonly #failPurposes: ReadonlySet<string>;
	readonly #failureMessage: string;

	constructor(failPurposes: readonly string[] = [], failureMessage = "token mint diagnostic") {
		this.#failPurposes = new Set(failPurposes);
		this.#failureMessage = failureMessage;
	}

	async mintDispatchToken(options: {
		readonly repository: string;
		readonly purpose: "clone" | "landing";
	}): Promise<DispatchTokenMintResult> {
		this.calls.push({ ...options });
		if (this.#failPurposes.has(options.purpose)) {
			return {
				ok: false,
				error: { code: "github-token-mint-failed", message: this.#failureMessage },
			};
		}
		return {
			ok: true,
			value: {
				token: `token-${options.purpose}-fixture`,
				expiresAt: "2026-07-13T00:00:00Z",
				repository: options.repository,
				purpose: options.purpose,
			},
		};
	}
}

/** Records report attempts before configured failures or throws. */
export class RecordingDispatchReportGateway implements DispatchReportGateway {
	readonly publishCalls: Array<{ anchorPrNumber: number; decisionLog: string | null }> = [];
	readonly failureCalls: Array<{
		anchorPrNumber: number;
		anchorBranch: string;
		code: string;
		message: string;
		diagnostic?: DispatchFailureDiagnostic;
		workflowRunId?: string;
	}> = [];
	readonly #fails: boolean;
	readonly #throws: boolean;
	readonly #failureMessage: string;

	constructor(
		options: {
			readonly fails?: boolean;
			readonly throws?: boolean;
			readonly failureMessage?: string;
		} = {},
	) {
		this.#fails = options.fails ?? false;
		this.#throws = options.throws ?? false;
		this.#failureMessage = options.failureMessage ?? "report returned diagnostic";
	}

	async publishAnchorPrDecisionLog(options: {
		readonly anchorPrNumber: number;
		readonly decisionLog: string | null;
	}) {
		this.publishCalls.push({ ...options });
		if (this.#throws) throw new Error("report operation exploded");
		return this.#fails
			? ({ ok: false, message: this.#failureMessage } as const)
			: ({ ok: true } as const);
	}

	async ensureAnchorPrFailureComment(options: {
		readonly anchorPrNumber: number;
		readonly anchorBranch: string;
		readonly code: DispatchRunFailureCode;
		readonly message: string;
		readonly diagnostic?: DispatchFailureDiagnostic;
		readonly workflowRunId?: string;
	}) {
		this.failureCalls.push({ ...options });
		if (this.#throws) throw new Error("report operation exploded");
		return this.#fails
			? ({ ok: false, message: this.#failureMessage } as const)
			: ({ ok: true } as const);
	}
}
