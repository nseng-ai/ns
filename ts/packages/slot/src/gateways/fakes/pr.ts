import type { PRGatewayFailure, PRLookupResult, PRState, PRSummary, SlotPRGateway } from "../pr.ts";

export interface FakePRSummaryOptions {
	number: number;
	title?: string | undefined;
	url?: string | undefined;
	head_ref_name?: string | undefined;
	base_ref_name?: string | undefined;
	state?: PRState | undefined;
}

export interface FakeSlotPRGatewayOptions {
	prsByBranch?: Readonly<Record<string, FakePRSummaryOptions>> | undefined;
	lookupFailures?: Readonly<Record<string, PRGatewayFailure>> | undefined;
	closeFailures?: Readonly<Record<number, PRGatewayFailure>> | undefined;
}

export class FakeSlotPRGateway implements SlotPRGateway {
	private readonly prsByBranch: Map<string, PRSummary>;
	private readonly lookupFailures: Readonly<Record<string, PRGatewayFailure>>;
	private readonly closeFailures: Readonly<Record<number, PRGatewayFailure>>;
	private readonly closes: number[] = [];

	constructor(options: FakeSlotPRGatewayOptions = {}) {
		this.prsByBranch = new Map(Object.entries(options.prsByBranch ?? {}).map(([branch, pr]) => [branch, normalizePr(branch, pr)]));
		this.lookupFailures = options.lookupFailures ?? {};
		this.closeFailures = options.closeFailures ?? {};
	}

	async getPrForBranch(branch: string): Promise<PRLookupResult> {
		const failure = this.lookupFailures[branch];
		if (failure !== undefined) return { type: "failure", failure: { ...failure } };
		const pr = this.prsByBranch.get(branch);
		if (pr === undefined) return { type: "missing", message: "no matching PR", returncode: 1 };
		return { type: "found", pr: { ...pr } };
	}

	async closePr(number: number): Promise<PRGatewayFailure | null> {
		this.closes.push(number);
		const failure = this.closeFailures[number];
		if (failure !== undefined) return { ...failure };
		for (const [branch, pr] of this.prsByBranch.entries()) {
			if (pr.number === number) this.prsByBranch.set(branch, { ...pr, state: "CLOSED" });
		}
		return null;
	}

	closeCalls(): readonly number[] {
		return [...this.closes];
	}
}

function normalizePr(branch: string, pr: FakePRSummaryOptions): PRSummary {
	return {
		number: pr.number,
		title: pr.title ?? `PR for ${branch}`,
		url: pr.url ?? `https://github.test/repo/pull/${pr.number}`,
		head_ref_name: pr.head_ref_name ?? branch,
		base_ref_name: pr.base_ref_name ?? "master",
		state: pr.state ?? "OPEN",
	};
}
