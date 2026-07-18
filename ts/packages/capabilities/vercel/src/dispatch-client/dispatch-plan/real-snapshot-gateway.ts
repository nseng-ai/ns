import { commandSucceeded, formatCommand, type CommandExecApi } from "@nseng-ai/foundation/exec";

import type {
	DispatchRemoteSnapshotResult,
	DispatchSnapshotError,
	DispatchSnapshotGateway,
} from "../instruction-delivery.ts";

export class RealDispatchSnapshotGateway implements DispatchSnapshotGateway {
	private readonly commands: CommandExecApi;

	constructor(commands: CommandExecApi) {
		this.commands = commands;
	}

	async publishSnapshot(options: {
		readonly cwd: string;
		readonly remote: string;
		readonly snapshotRef: string;
		readonly commitSha: string;
	}) {
		const args = ["push", options.remote, `${options.commitSha}:${options.snapshotRef}`] as const;
		const result = await this.commands.exec("git", [...args], {
			cwd: options.cwd,
			env: process.env,
		});
		if (commandSucceeded(result)) return { ok: true } as const;
		return {
			ok: false,
			error: commandError(
				"git-push-snapshot-failed",
				`Could not publish exact Branch Memory Snapshot Ref ${JSON.stringify(options.snapshotRef)}`,
				args,
				result,
			),
		} as const;
	}

	async readRemoteSnapshotTip(options: {
		readonly cwd: string;
		readonly remote: string;
		readonly snapshotRef: string;
	}): Promise<DispatchRemoteSnapshotResult> {
		const args = ["ls-remote", "--refs", options.remote, options.snapshotRef] as const;
		const result = await this.commands.exec("git", [...args], {
			cwd: options.cwd,
			env: process.env,
		});
		if (!commandSucceeded(result)) {
			return {
				type: "error",
				error: commandError(
					"git-ls-remote-snapshot-failed",
					`Could not verify remote Branch Memory Snapshot Ref ${JSON.stringify(options.snapshotRef)}`,
					args,
					result,
				),
			};
		}
		const commitSha = parseExactRemoteRef(result.stdout, options.snapshotRef);
		return commitSha === null ? { type: "missing" } : { type: "found", commitSha };
	}
}

/** Compatibility name retained until existing plan context wiring cuts over. */
export class RealDispatchPlanSnapshotGateway extends RealDispatchSnapshotGateway {}

export function parseExactRemoteRef(stdout: string, expectedRef: string): string | null {
	for (const line of stdout.split("\n")) {
		const [sha, ref, extra] = line.trim().split("\t");
		if (extra !== undefined || ref !== expectedRef || sha === undefined) continue;
		if (/^[0-9a-fA-F]{40}$/u.test(sha)) return sha.toLowerCase();
	}
	return null;
}

function commandError(
	code: string,
	message: string,
	args: readonly string[],
	result: Awaited<ReturnType<CommandExecApi["exec"]>>,
): DispatchSnapshotError {
	const stderr = result.stderr.trim().split("\n")[0];
	const stdout = result.stdout.trim().split("\n")[0];
	const detail = stderr?.length ? stderr : stdout?.length ? stdout : undefined;
	return {
		code,
		message: detail === undefined ? message : `${message}: ${detail}`,
		displayCommand: formatCommand("git", args),
	};
}
