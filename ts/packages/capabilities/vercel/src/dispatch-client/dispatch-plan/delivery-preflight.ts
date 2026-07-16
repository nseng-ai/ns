import { buildGitSetupPlan, type BrmemOptionalResult, type GitRemoteConfig } from "@nseng-ai/brmem";

export const DEFAULT_DISPATCH_BRMEM_REMOTE = "origin";

export interface DispatchBrmemSetupGateway {
	getRemoteConfig(remote: string): Promise<BrmemOptionalResult<GitRemoteConfig>>;
}

export type DispatchBrmemSetupPreflight =
	| { readonly status: "ready"; readonly remote: string }
	| {
			readonly status: "setup-required";
			readonly remote: string;
			readonly message: string;
			readonly setupCommand: string;
	  }
	| {
			readonly status: "brmem-preflight-failed";
			readonly remote: string;
			readonly message: string;
	  };

export async function preflightDispatchBrmemSetup(
	gateway: DispatchBrmemSetupGateway,
	remote = DEFAULT_DISPATCH_BRMEM_REMOTE,
): Promise<DispatchBrmemSetupPreflight> {
	const config = await gateway.getRemoteConfig(remote);
	if (config.type === "error") {
		return {
			status: "brmem-preflight-failed",
			remote,
			message: `Could not inspect Branch Memory synchronization for Git remote ${JSON.stringify(remote)}: ${config.error.message}`,
		};
	}

	const setupCommand = formatSetupCommand(remote);
	if (config.type === "missing") {
		return {
			status: "setup-required",
			remote,
			setupCommand,
			message: [
				`Git remote ${JSON.stringify(remote)} was not found, so Branch Memory synchronization cannot be verified.`,
				`Configure the intended remote, then run \`${setupCommand}\` and dispatch again.`,
			].join("\n"),
		};
	}

	const plan = buildGitSetupPlan({ remote, existing: config.value });
	if (plan.additions.length > 0) {
		return {
			status: "setup-required",
			remote,
			setupCommand,
			message: [
				`Git remote ${JSON.stringify(remote)} is not configured to synchronize Branch Memory Snapshot Refs.`,
				`Run \`${setupCommand}\`, then dispatch again.`,
			].join("\n"),
		};
	}

	return { status: "ready", remote };
}

function formatSetupCommand(remote: string): string {
	return remote === DEFAULT_DISPATCH_BRMEM_REMOTE
		? "brmem setup-git"
		: `brmem setup-git --remote ${remote}`;
}
