import { readFile, stat } from "node:fs/promises";

import { systemClock } from "@sdl/core/clock";
import { systemTimerScheduler } from "@sdl/core/timers";
import {
	DroppingOptionsCommandExecApi,
	brmemCheckJson,
	copyExecOptionsWithout,
	createDeferred,
	createManualClock,
	createManualTimerScheduler,
	createTempDirTracker,
	githubCheckRun,
	createTempGitRepo,
	describeNodeRuntimeCliEntrypoint,
	ScriptedCommandExecApi,
	ScriptedCommandRunner,
	ScriptedQueue,
	ScriptedTextGenerator,
	step,
	withTempRepoSkill,
} from "@sdl/core/testing";
import { expect, test } from "vitest";

test("exports testing helpers through the package testing subpath", () => {
	expect(typeof describeNodeRuntimeCliEntrypoint).toBe("function");
	expect(typeof createTempDirTracker).toBe("function");
	expect(typeof createTempGitRepo).toBe("function");
	expect(typeof copyExecOptionsWithout).toBe("function");
	expect(typeof DroppingOptionsCommandExecApi).toBe("function");
	expect(typeof createDeferred).toBe("function");
	expect(typeof createManualClock).toBe("function");
	expect(typeof createManualTimerScheduler).toBe("function");
	expect(typeof withTempRepoSkill).toBe("function");
	expect(typeof githubCheckRun).toBe("function");
	expect(typeof ScriptedCommandRunner).toBe("function");
	expect(typeof ScriptedCommandExecApi).toBe("function");
	expect(typeof ScriptedQueue).toBe("function");
	expect(typeof ScriptedTextGenerator).toBe("function");
	expect(typeof step).toBe("function");
	expect(brmemCheckJson(true)).toBe(JSON.stringify({ exitCode: 0, data: { present: true } }));
});

test("exports clock and timer seams through package subpaths", () => {
	expect(typeof systemClock.nowMs()).toBe("number");
	const timer = systemTimerScheduler.setTimeout(() => {}, 1_000);
	timer.cancel();
});

test("deferred helper exposes an externally-resolvable promise", async () => {
	const deferred = createDeferred<string>();
	deferred.resolve("done");
	await expect(deferred.promise).resolves.toBe("done");
});

test("scripted helpers record calls and validate expected steps", async () => {
	const runner = new ScriptedCommandRunner([step("node", ["--version"], { stdout: "v1\n" })]);
	const result = await runner.runner("node", ["--version"], { cwd: "/repo" });

	expect(result).toEqual({ stdout: "v1\n", stderr: "", code: 0, killed: false });
	expect(runner.calls).toEqual([{ command: "node", args: ["--version"], cwd: "/repo" }]);
	runner.assertDone();

	const execApi = new ScriptedCommandExecApi([{ stdout: "ok" }]);
	expect(await execApi.exec("gh", ["pr", "view"], { cwd: "/repo", stdin: "payload" })).toEqual({
		stdout: "ok",
		stderr: "",
		code: 0,
		killed: false,
	});
	expect(execApi.calls()).toEqual([
		{ command: "gh", args: ["pr", "view"], options: { cwd: "/repo", stdin: "payload" } },
	]);

	const textGeneration = new ScriptedTextGenerator([{ ok: true, text: "generated" }]);
	await expect(
		textGeneration.generateText({
			modelRef: "model",
			system: "system",
			prompt: "prompt",
			operation: "pr-description",
		}),
	).resolves.toEqual({ ok: true, text: "generated" });
	expect(textGeneration.requests).toEqual([
		{ modelRef: "model", system: "system", prompt: "prompt", operation: "pr-description" },
	]);
	textGeneration.assertDone();
});

test("temp dir tracker removes tracked directories", async () => {
	const tempDirs = createTempDirTracker();
	const dir = await tempDirs.makeTempDir("sdl-core-testing-");
	const homeDir = await tempDirs.makeHomeTempDir(".sdl-core-testing-");

	await expect(stat(dir)).resolves.toBeDefined();
	await expect(stat(homeDir)).resolves.toBeDefined();

	await tempDirs.cleanup();
	await tempDirs.cleanup();

	await expect(stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
	await expect(stat(homeDir)).rejects.toMatchObject({ code: "ENOENT" });
});

test("temp repo skill helper writes and removes a repo-local skill", async () => {
	let repoDir = "";
	await withTempRepoSkill({ skillName: "demo-skill", markdown: "# Demo\n" }, async (skill) => {
		repoDir = skill.repoDir;

		expect(await readFile(skill.skillPath, "utf8")).toBe("# Demo\n");
		expect(skill.skillDir).toBe(`${skill.repoDir}/skills/demo-skill`);
	});

	await expect(stat(repoDir)).rejects.toMatchObject({ code: "ENOENT" });
});

test("exec option copying can drop selected fields", async () => {
	const copied = copyExecOptionsWithout(
		{
			cwd: "/repo",
			env: { KEEP: "no" },
			timeout: 1_000,
			stdin: "payload",
		},
		{ shouldDropEnv: true, shouldDropStdin: true },
	);
	expect(copied).toEqual({ cwd: "/repo", timeout: 1_000 });

	const delegate = new ScriptedCommandExecApi([{ stdout: "ok" }]);
	const dropping = new DroppingOptionsCommandExecApi({ delegate, shouldDropStdin: true });
	await expect(dropping.exec("git", ["mktree"], { stdin: "tree", cwd: "/repo" })).resolves.toEqual({
		stdout: "ok",
		stderr: "",
		code: 0,
		killed: false,
	});
	expect(delegate.calls()).toEqual([
		{ command: "git", args: ["mktree"], options: { cwd: "/repo" } },
	]);
});
