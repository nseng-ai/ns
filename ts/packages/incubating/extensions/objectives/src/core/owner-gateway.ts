import { commandSucceeded, type CommandExecApi } from "@nseng-ai/foundation/exec";

import { isValidObjectiveOwner } from "./identity.ts";

/**
 * Objective-owned Consumer Gateway for resolving the current Objective Owner.
 * The current owner is the authenticated GitHub login; a future per-user
 * configuration system may replace or precede this source without rewriting
 * storage or command semantics. Failures are domain-shaped ("unavailable"),
 * never raw subprocess vocabulary.
 */

export type ObjectiveOwnerResolution =
	| { type: "ok"; owner: string }
	| { type: "unavailable"; message: string };

export interface ObjectiveOwnerGateway {
	resolveAuthenticatedOwner(): Promise<ObjectiveOwnerResolution>;
}

export interface FakeObjectiveOwnerGatewayOptions {
	owner?: string;
	unavailableMessage?: string;
}

export class FakeObjectiveOwnerGateway implements ObjectiveOwnerGateway {
	private readonly resolution: ObjectiveOwnerResolution;
	callCount = 0;

	constructor(options: FakeObjectiveOwnerGatewayOptions = {}) {
		this.resolution =
			options.owner !== undefined
				? { type: "ok", owner: options.owner }
				: {
						type: "unavailable",
						message: options.unavailableMessage ?? "No authenticated GitHub login is available.",
					};
	}

	async resolveAuthenticatedOwner(): Promise<ObjectiveOwnerResolution> {
		this.callCount += 1;
		return { ...this.resolution };
	}
}

/**
 * Real adapter over the smallest non-mutating `gh` operation that reports the
 * authenticated login. Bound only at composition roots; resolution is cached
 * per instance because the login cannot change mid-command.
 */
export class RealObjectiveOwnerGateway implements ObjectiveOwnerGateway {
	private readonly execApi: CommandExecApi;
	private readonly cwd: string;
	private cached: Promise<ObjectiveOwnerResolution> | null = null;

	constructor(execApi: CommandExecApi, options: { cwd: string }) {
		this.execApi = execApi;
		this.cwd = options.cwd;
	}

	async resolveAuthenticatedOwner(): Promise<ObjectiveOwnerResolution> {
		this.cached ??= this.resolveUncached();
		return await this.cached;
	}

	private async resolveUncached(): Promise<ObjectiveOwnerResolution> {
		const result = await this.execApi.exec("gh", ["api", "user", "--jq", ".login"], {
			cwd: this.cwd,
			timeout: 15_000,
		});
		if (!commandSucceeded(result)) {
			return {
				type: "unavailable",
				message:
					"Could not resolve the authenticated GitHub login (`gh api user`). Authenticate with `gh auth login` or address the record with a full <owner>/<slug> locator.",
			};
		}
		const login = result.stdout.trim().toLowerCase();
		if (!isValidObjectiveOwner(login)) {
			return {
				type: "unavailable",
				message: `Authenticated GitHub login ${JSON.stringify(login)} is not a valid Objective owner handle.`,
			};
		}
		return { type: "ok", owner: login };
	}
}
