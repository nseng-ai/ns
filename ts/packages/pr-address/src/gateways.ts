import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import type {
	CurrentBranchResult,
	GatewayOptions,
	PrAddressGitGateway,
	RepoContextResult,
} from "./core/gateways.ts";

export type {
	CurrentBranchResult,
	GatewayFailure,
	GatewayOptions,
	PrAddressGitGateway,
	RepoContextResult,
} from "./core/gateways.ts";

export class RealPrAddressGitGateway implements PrAddressGitGateway {
	private readonly git: GitGateway;

	constructor(options: { git?: GitGateway | undefined } = {}) {
		this.git = options.git ?? new RealGitGateway(new NodeCommandExecApi());
	}

	async getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult> {
		return await this.git.currentBranch({ cwd: options.cwd, env: options.env });
	}

	async isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult> {
		const result = await this.git.isInsideWorkTree({ cwd: options.cwd, env: options.env });
		if (result.ok) return result.value ? { type: "inside" } : { type: "outside" };
		return { type: "failure", failure: result.error };
	}
}
