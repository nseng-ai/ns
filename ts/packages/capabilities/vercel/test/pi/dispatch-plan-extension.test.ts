import { describe, expect, test } from "vitest";

import registerDispatchPlanPiExtension, {
	DISPATCH_PLAN_PI_COMMAND_NAME,
	DISPATCH_PLAN_PI_USAGE,
	type DispatchPlanPiCommandContext,
	type DispatchPlanPiExtensionApi,
} from "../../src/pi/extension.ts";

const PLAN_PATH = "/state/ns/enriched-plan/ns/main/add-cache.md";

type CommandHandler = (args: string, ctx: DispatchPlanPiCommandContext) => Promise<void> | void;

class FakeDispatchPlanPiHost implements DispatchPlanPiExtensionApi {
	readonly commands = new Map<string, CommandHandler>();
	readonly execCalls: Array<{ command: string; args: string[]; cwd?: string }> = [];
	readonly notifications: Array<{ message: string; level?: "info" | "warning" | "error" }> = [];
	private readonly execResult: { stdout?: string; stderr?: string; code: number };

	constructor(
		execResult: { stdout?: string; stderr?: string; code: number } = {
			stdout: "Dispatched Saved Plan.",
			code: 0,
		},
	) {
		this.execResult = execResult;
	}

	registerCommand(
		name: string,
		definition: { handler(args: string, ctx: DispatchPlanPiCommandContext): Promise<void> | void },
	): void {
		this.commands.set(name, definition.handler);
	}

	async exec(command: string, args: string[], options?: { readonly cwd?: string }) {
		this.execCalls.push({
			command,
			args: [...args],
			...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
		});
		return this.execResult;
	}

	context(entries: readonly unknown[] = []): DispatchPlanPiCommandContext {
		return {
			cwd: "/repo",
			sessionManager: { getBranch: () => [...entries] },
			ui: {
				notify: (message, level) =>
					this.notifications.push({ message, ...(level === undefined ? {} : { level }) }),
			},
		};
	}
}

function savedPlanEntry() {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName: "write_saved_plan_file",
			details: {
				slug: "add-cache",
				repoRoot: "/repo",
				repoKey: "nseng-ai--ns",
				repoIdentitySource: "repo-root",
				sourceBranch: "main",
				branchKey: "main",
				filePath: PLAN_PATH,
			},
		},
	};
}

async function invoke(
	host: FakeDispatchPlanPiHost,
	args: string,
	entries: readonly unknown[] = [],
) {
	registerDispatchPlanPiExtension(host, {
		resolveSavedPlan: async (_pi, options) => {
			if (options.explicitPath !== undefined) {
				return {
					type: "explicit",
					filePath: options.explicitPath,
					fileName: "add-cache.md",
					savedPlanFileStem: "add-cache",
				};
			}
			if ((options.sessionEntries?.length ?? 0) === 0) {
				throw new Error("No usable saved plan was found in the current session branch.");
			}
			return {
				type: "session",
				savedPlanFileStem: "add-cache",
				plan: {
					slug: "add-cache",
					repoRoot: "/repo",
					repoKey: "nseng-ai--ns",
					repoIdentitySource: "repo-root",
					repoDirectoryPath: "/state/ns/enriched-plan/ns",
					sourceBranch: "main",
					branchKey: "main",
					directoryPath: "/state/ns/enriched-plan/ns/main",
					filePath: PLAN_PATH,
					fileName: "add-cache.md",
					modifiedTimeMs: 1,
				},
			};
		},
	});
	const handler = host.commands.get(DISPATCH_PLAN_PI_COMMAND_NAME);
	if (handler === undefined) throw new Error("dispatch plan command was not registered");
	await handler(args, host.context(entries));
}

describe("dispatch plan Pi extension", () => {
	test("passes an explicit Saved Plan path to the kernel without transporting content", async () => {
		const host = new FakeDispatchPlanPiHost();
		await invoke(host, PLAN_PATH);

		expect(host.execCalls).toEqual([
			{ command: "ns", args: ["dispatch", "plan", PLAN_PATH], cwd: "/repo" },
		]);
		expect(host.notifications).toEqual([{ message: "Dispatched Saved Plan.", level: "info" }]);
	});

	test("uses the latest current-session Saved Plan as no-argument Pi sugar", async () => {
		const host = new FakeDispatchPlanPiHost();
		await invoke(host, "", [savedPlanEntry()]);

		expect(host.execCalls).toEqual([
			{ command: "ns", args: ["dispatch", "plan", PLAN_PATH], cwd: "/repo" },
		]);
	});

	test("does not dispatch when the current session has no Saved Plan", async () => {
		const host = new FakeDispatchPlanPiHost();
		await invoke(host, "");

		expect(host.execCalls).toEqual([]);
		expect(host.notifications[0]).toMatchObject({ level: "error" });
		expect(host.notifications[0]?.message).toContain("No usable saved plan");
	});

	test("shows help without invoking the kernel", async () => {
		const host = new FakeDispatchPlanPiHost();
		await invoke(host, "-h");

		expect(host.execCalls).toEqual([]);
		expect(host.notifications).toEqual([{ message: DISPATCH_PLAN_PI_USAGE, level: "info" }]);
	});

	test("surfaces kernel failures without performing recovery transport", async () => {
		const host = new FakeDispatchPlanPiHost({
			stderr: "Run `brmem setup-git`, then dispatch again.",
			code: 2,
		});
		await invoke(host, PLAN_PATH);

		expect(host.execCalls).toHaveLength(1);
		expect(host.notifications).toEqual([
			{
				message: "Saved Plan dispatch failed: Run `brmem setup-git`, then dispatch again.",
				level: "error",
			},
		]);
	});
});
