import { describe, expect, test } from "vitest";

import {
	parseExactRemoteRef,
	RealDispatchPlanSnapshotGateway,
} from "../../src/dispatch-client/dispatch-plan/real-snapshot-gateway.ts";
import {
	exited,
	ScriptedCommandRunner,
} from "../dispatch-client/support/scripted-command-runner.ts";

const SNAPSHOT_REF = "refs/brmem/ns/dispatch-context/feature---cache";
const SHA = "1111111111111111111111111111111111111111";

describe("real dispatch plan Snapshot gateway", () => {
	test("publishes one exact commit-to-Snapshot refspec", async () => {
		const commands = new ScriptedCommandRunner([exited()]);
		const gateway = new RealDispatchPlanSnapshotGateway(commands);

		await expect(
			gateway.publishSnapshot({
				cwd: "/repo",
				remote: "origin",
				snapshotRef: SNAPSHOT_REF,
				commitSha: SHA,
			}),
		).resolves.toEqual({ ok: true });
		expect(commands.calls[0]?.args).toEqual(["push", "origin", `${SHA}:${SNAPSHOT_REF}`]);
	});

	test("verifies only the requested exact remote ref", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ stdout: `${SHA.toUpperCase()}\t${SNAPSHOT_REF}\n` }),
		]);
		const gateway = new RealDispatchPlanSnapshotGateway(commands);

		await expect(
			gateway.readRemoteSnapshotTip({
				cwd: "/repo",
				remote: "origin",
				snapshotRef: SNAPSHOT_REF,
			}),
		).resolves.toEqual({ type: "found", commitSha: SHA });
		expect(commands.calls[0]?.args).toEqual(["ls-remote", "--refs", "origin", SNAPSHOT_REF]);
	});

	test("returns missing for empty or non-exact output", async () => {
		expect(parseExactRemoteRef("", SNAPSHOT_REF)).toBeNull();
		expect(parseExactRemoteRef(`${SHA}\t${SNAPSHOT_REF}/other\n`, SNAPSHOT_REF)).toBeNull();
	});

	test("returns typed command failures", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ code: 1, stderr: "fatal: remote unavailable\nmore" }),
		]);
		const gateway = new RealDispatchPlanSnapshotGateway(commands);

		await expect(
			gateway.publishSnapshot({
				cwd: "/repo",
				remote: "origin",
				snapshotRef: SNAPSHOT_REF,
				commitSha: SHA,
			}),
		).resolves.toEqual({
			ok: false,
			error: {
				code: "git-push-snapshot-failed",
				message: `Could not publish exact Branch Memory Snapshot Ref ${JSON.stringify(SNAPSHOT_REF)}: fatal: remote unavailable`,
				displayCommand: `git push origin ${SHA}:${SNAPSHOT_REF}`,
			},
		});
	});
});
