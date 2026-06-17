import type { PrCloseResult, PrLookupResult, PrState, PrSummary, SlotPrGateway } from "../pr.ts";

export type FakeSlotPrOperation =
	| { type: "get-pr-for-branch"; branch: string }
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
	closeFailures?: Readonly<Record<number, string>> | undefined;
}

export class FakeSlotPrGateway implements SlotPrGateway {
	private readonly prsByBranch: Map<string, PrSummary>;
	private readonly lookupFailures: Readonly<Record<string, string>>;
	private readonly closeFailures: Readonly<Record<number, string>>;
	private readonly log: FakeSlotPrOperation[] = [];

	constructor(options: FakeSlotPrGatewayOptions = {}) {
		this.prsByBranch = new Map(Object.entries(options.prsByBranch ?? {}).map(([branch, pr]) => [branch, prSummary(branch, pr)]));
		this.lookupFailures = options.lookupFailures ?? {};
		this.closeFailures = options.closeFailures ?? {};
	}

	async getPrForBranch(branch: string): Promise<PrLookupResult> {
		this.log.push({ type: "get-pr-for-branch", branch });
		const failure = this.lookupFailures[branch];
		if (failure !== undefined) return { type: "failure", failure: { stdout: "", stderr: failure, returnCode: 1, message: failure } };
		const pr = this.prsByBranch.get(branch);
		if (pr === undefined) return { type: "miss" };
		return { type: "found", pr: { ...pr } };
	}

	async closePr(number: number): Promise<PrCloseResult> {
		this.log.push({ type: "close-pr", number });
		const failure = this.closeFailures[number];
		if (failure !== undefined) return { type: "failure", failure: { stdout: "", stderr: failure, returnCode: 1, message: failure } };
		for (const [branch, pr] of this.prsByBranch.entries()) {
			if (pr.number === number) this.prsByBranch.set(branch, { ...pr, state: "CLOSED" });
		}
		return { type: "ok" };
	}

	operations(): readonly FakeSlotPrOperation[] {
		return this.log.map((operation) => ({ ...operation }));
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
