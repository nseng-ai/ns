import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const HOME_ROOT = homedir();
const SCOPED_HOME_DIRECTORY = join(HOME_ROOT, "code", "sdl-tools");
const UNRELATED_USER_ROOT = HOME_ROOT.startsWith("/Users/")
	? "/Users/unrelated-home-directory-guard-user"
	: "/home/unrelated-home-directory-guard-user";

type ToolCallResult = { block: true; reason?: string } | undefined | void;
type ToolCallHandler = (event: ToolCallEvent) => ToolCallResult;
type UserBashResult =
	| {
			result?: {
				output: string;
				exitCode: number;
				cancelled: boolean;
				truncated: boolean;
			};
	  }
	| undefined
	| void;
type UserBashHandler = (event: UserBashEvent) => UserBashResult;
type HomeDirectoryGuardExtension = (pi: FakePi) => void;

interface ToolCallEvent {
	toolName: string;
	input: unknown;
}

interface UserBashEvent {
	command: string;
	excludeFromContext: boolean;
	cwd: string;
}

class FakePi {
	toolCallHandler: ToolCallHandler | undefined;
	userBashHandler: UserBashHandler | undefined;

	on(event: "tool_call", handler: ToolCallHandler): void;
	on(event: "user_bash", handler: UserBashHandler): void;
	on(event: "tool_call" | "user_bash", handler: ToolCallHandler | UserBashHandler): void {
		if (event === "tool_call") this.toolCallHandler = handler as ToolCallHandler;
		else this.userBashHandler = handler as UserBashHandler;
	}

	emitToolCall(event: ToolCallEvent): ToolCallResult {
		if (this.toolCallHandler === undefined) throw new Error("tool_call handler was not registered");
		return this.toolCallHandler(event);
	}

	emitUserBash(event: UserBashEvent): UserBashResult {
		if (this.userBashHandler === undefined) throw new Error("user_bash handler was not registered");
		return this.userBashHandler(event);
	}
}

async function loadHomeDirectoryGuardExtension(): Promise<HomeDirectoryGuardExtension> {
	const module = (await import(
		new URL(
			"../../../../../../../../.pi/installable-extensions/home-directory-guard.ts",
			import.meta.url,
		).href
	)) as {
		default: HomeDirectoryGuardExtension;
	};
	return module.default;
}

async function createGuard(): Promise<FakePi> {
	const extension = await loadHomeDirectoryGuardExtension();
	const pi = new FakePi();
	extension(pi);
	return pi;
}

function bashEvent(command: string): ToolCallEvent {
	return { toolName: "bash", input: { command } };
}

function expectBlocked(result: ToolCallResult): void {
	expect(result).toEqual({
		block: true,
		reason:
			"Blocked by home-directory-guard extension: home-directory root target is forbidden. Scope to a repo or explicit subfolder.",
	});
}

describe("home-directory guard extension", () => {
	test("registers tool_call and user_bash handlers", async () => {
		const pi = await createGuard();

		expect(pi.toolCallHandler).toBeDefined();
		expect(pi.userBashHandler).toBeDefined();
	});

	test("blocks bash commands that target the home root", async () => {
		const pi = await createGuard();

		expectBlocked(pi.emitToolCall(bashEvent(`find ${HOME_ROOT} -name foo`)));
		expectBlocked(pi.emitToolCall(bashEvent(`rm -rf ${HOME_ROOT}`)));
		expectBlocked(pi.emitToolCall(bashEvent("rm ~")));
		expectBlocked(pi.emitToolCall(bashEvent('rm "$HOME"')));
		expectBlocked(pi.emitToolCall(bashEvent("rm '${HOME}'")));
		expectBlocked(pi.emitToolCall(bashEvent(`tool --root=${HOME_ROOT}`)));
	});

	test("allows bash commands that target scoped home descendants", async () => {
		const pi = await createGuard();

		expect(pi.emitToolCall(bashEvent(`find ${SCOPED_HOME_DIRECTORY} -name foo`))).toBeUndefined();
		expect(
			pi.emitToolCall(bashEvent(`rm ${join(SCOPED_HOME_DIRECTORY, "tmp-file")}`)),
		).toBeUndefined();
		expect(pi.emitToolCall(bashEvent("grep -R foo ~/code/sdl-tools"))).toBeUndefined();
		expect(pi.emitToolCall(bashEvent(`HOME_COPY=${HOME_ROOT} echo ok`))).toBeUndefined();
		expect(pi.emitToolCall(bashEvent(`find ${UNRELATED_USER_ROOT} -name foo`))).toBeUndefined();
	});

	test("blocks direct user bash with a complete Pi bash result", async () => {
		const pi = await createGuard();

		expect(pi.emitUserBash({ command: "ls ~/", cwd: "/tmp", excludeFromContext: false })).toEqual({
			result: {
				output:
					"Blocked by home-directory-guard extension: home-directory root target is forbidden. Scope to a repo or explicit subfolder.",
				exitCode: 1,
				cancelled: false,
				truncated: false,
			},
		});
	});

	test("allows direct user bash that targets scoped home descendants", async () => {
		const pi = await createGuard();

		expect(
			pi.emitUserBash({ command: "ls ~/code/sdl-tools", cwd: "/tmp", excludeFromContext: false }),
		).toBeUndefined();
	});

	test("blocks path-like non-bash tool inputs that target the home root", async () => {
		const pi = await createGuard();

		expectBlocked(pi.emitToolCall({ toolName: "read", input: { path: HOME_ROOT } }));
		expectBlocked(pi.emitToolCall({ toolName: "read", input: { path: `${HOME_ROOT}/` } }));
		expectBlocked(pi.emitToolCall({ toolName: "ls", input: { path: "~" } }));
		expectBlocked(pi.emitToolCall({ toolName: "find", input: { paths: ["${HOME}"] } }));
	});

	test("allows path-like non-bash tool inputs that target scoped descendants", async () => {
		const pi = await createGuard();

		expect(
			pi.emitToolCall({
				toolName: "read",
				input: { path: join(SCOPED_HOME_DIRECTORY, "README.md") },
			}),
		).toBeUndefined();
		expect(
			pi.emitToolCall({ toolName: "ls", input: { path: "~/code/sdl-tools" } }),
		).toBeUndefined();
		expect(
			pi.emitToolCall({ toolName: "find", input: { paths: ["$HOME/code/sdl-tools"] } }),
		).toBeUndefined();
	});

	test("does not scan non-path content fields", async () => {
		const pi = await createGuard();

		expect(
			pi.emitToolCall({
				toolName: "write",
				input: {
					path: join(SCOPED_HOME_DIRECTORY, "notes.md"),
					content: `Document that ${HOME_ROOT} is the home directory.`,
				},
			}),
		).toBeUndefined();
	});
});
