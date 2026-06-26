import type {
	PrBatchLookupResult,
	PrCloseResult,
	PrGatewayFailure,
	PrLookupResult,
	PrState,
	PrSummary,
	SlotPrGateway,
} from "../pr.ts";

export type FakeSlotPrOperation =
	| { type: "get-pr-for-branch"; branch: string }
	| { type: "get-prs-for-branches"; branches: readonly string[] }
	| { type: "close-pr"; number: number };

export interface FakePrSummaryOptions {
	number: number;
	state?: PrState | undefined;
	url?: string | undefined;
	headRefName?: string | undefined;
}

export interface FakeSlotPrGatewayOptions {
	prsByBranch?: Readonly<Record<string, FakePrSummaryOptions>> | undefined;
	lookupFailures?: Readonly<Record<string, string>> | undefined;
	batchLookupFailure?: string | undefined;
	closeFailures?: Readonly<Record<number, string>> | undefined;
}

export class FakeSlotPrGateway implements SlotPrGateway {
	private readonly prsByBranch: Map<string, PrSummary>;
	private readonly lookupFailures: Readonly<Record<string, string>>;
	private readonly batchLookupFailure: string | undefined;
	private readonly closeFailures: Readonly<Record<number, string>>;
	private readonly log: FakeSlotPrOperation[] = [];

	constructor(options: FakeSlotPrGatewayOptions = {}) {
		this.prsByBranch = new Map(
			Object.entries(options.prsByBranch ?? {}).map(([branch, pr]) => [
				branch,
				prSummary(branch, pr),
			]),
		);
		this.lookupFailures = options.lookupFailures ?? {};
		this.batchLookupFailure = options.batchLookupFailure;
		this.closeFailures = options.closeFailures ?? {};
	}

	async getPrForBranch(branch: string): Promise<PrLookupResult> {
		this.log.push({ type: "get-pr-for-branch", branch });
		return this.lookupBranch(branch);
	}

	async getPrsForBranches(branches: readonly string[]): Promise<PrBatchLookupResult> {
		this.log.push({ type: "get-prs-for-branches", branches: [...branches] });
		if (this.batchLookupFailure !== undefined)
			return { type: "failure", failure: failure(this.batchLookupFailure) };
		const results = new Map<string, PrLookupResult>();
		for (const branch of branches) {
			results.set(branch, this.lookupBranch(branch));
		}
		return { type: "ok", resultsByBranch: results };
	}

	async closePr(number: number): Promise<PrCloseResult> {
		this.log.push({ type: "close-pr", number });
		const failureMessage = this.closeFailures[number];
		if (failureMessage !== undefined) return { type: "failure", failure: failure(failureMessage) };
		for (const [branch, pr] of this.prsByBranch.entries()) {
			if (pr.number === number) this.prsByBranch.set(branch, { ...pr, state: "CLOSED" });
		}
		return { type: "ok" };
	}

	operations(): readonly FakeSlotPrOperation[] {
		return this.log.map((operation) =>
			operation.type === "get-prs-for-branches"
				? { type: operation.type, branches: [...operation.branches] }
				: { ...operation },
		);
	}

	private lookupBranch(branch: string): PrLookupResult {
		const failureMessage = this.lookupFailures[branch];
		if (failureMessage !== undefined) return { type: "failure", failure: failure(failureMessage) };
		const pr = this.prsByBranch.get(branch);
		if (pr === undefined) return { type: "miss" };
		return { type: "found", pr: { ...pr } };
	}
}

function prSummary(branch: string, options: FakePrSummaryOptions): PrSummary {
	return {
		number: options.number,
		state: options.state ?? "OPEN",
		url: options.url ?? `https://github.example/pr/${options.number}`,
		headRefName: options.headRefName ?? branch,
	};
}

function failure(message: string): PrGatewayFailure {
	return { stdout: "", stderr: message, returnCode: 1, message };
}
