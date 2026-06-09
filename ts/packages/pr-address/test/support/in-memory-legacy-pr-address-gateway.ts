import type { LegacyPrAddressGateway, LegacyRunOptions } from "../../src/legacy-python.ts";

export interface LegacyRunCall {
	args: string[];
	options: LegacyRunOptions;
}

export class InMemoryLegacyPrAddressGateway implements LegacyPrAddressGateway {
	readonly calls: LegacyRunCall[] = [];
	private readonly exitCodes: number[];

	constructor(exitCodes: readonly number[] = [0]) {
		this.exitCodes = [...exitCodes];
	}

	async run(args: readonly string[], options: LegacyRunOptions): Promise<number> {
		this.calls.push({ args: [...args], options });
		return this.exitCodes.shift() ?? 0;
	}
}
