import { describe, expect, test } from "vitest";

type ToolCallResult = { block: true; reason?: string } | undefined | void;
type ToolCallHandler = (event: ToolCallEvent) => ToolCallResult;
type HomeDirectoryGuardExtension = (pi: FakePi) => void;

interface ToolCallEvent {
	toolName: string;
	input: unknown;
}

class FakePi {
	toolCallHandler: ToolCallHandler | undefined;

	on(event: "tool_call", handler: ToolCallHandler): void {
		this.toolCallHandler = handler;
	}

	emitToolCall(event: ToolCallEvent): ToolCallResult {
		if (this.toolCallHandler === undefined) throw new Error("tool_call handler was not registered");
		return this.toolCallHandler(event);
	}
}

async function loadHomeDirectoryGuardExtension(): Promise<HomeDirectoryGuardExtension> {
	const module = (await import(new URL("../../../../.pi/extensions/home-directory-guard.ts", import.meta.url).href)) as {
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
		reason: "Home-directory root target is forbidden. Scope to a repo or explicit subfolder.",
	});
}

describe("home-directory guard extension", () => {
	test("registers a tool_call handler", async () => {
		const pi = await createGuard();

		expect(pi.toolCallHandler).toBeDefined();
	});

	test("blocks bash commands that target the home root", async () => {
		const pi = await createGuard();

		expectBlocked(pi.emitToolCall(bashEvent("find /Users/schrockn -name foo")));
		expectBlocked(pi.emitToolCall(bashEvent("rm -rf /Users/schrockn")));
		expectBlocked(pi.emitToolCall(bashEvent("rm ~")));
		expectBlocked(pi.emitToolCall(bashEvent('rm "$HOME"')));
		expectBlocked(pi.emitToolCall(bashEvent("rm '${HOME}'")));
		expectBlocked(pi.emitToolCall(bashEvent("tool --root=/Users/schrockn")));
	});

	test("allows bash commands that target scoped home descendants", async () => {
		const pi = await createGuard();

		expect(pi.emitToolCall(bashEvent("find /Users/schrockn/code/asdl-tools -name foo"))).toBeUndefined();
		expect(pi.emitToolCall(bashEvent("rm /Users/schrockn/code/asdl-tools/tmp-file"))).toBeUndefined();
		expect(pi.emitToolCall(bashEvent("grep -R foo ~/code/asdl-tools"))).toBeUndefined();
		expect(pi.emitToolCall(bashEvent("HOME_COPY=/Users/schrockn echo ok"))).toBeUndefined();
	});

	test("blocks path-like non-bash tool inputs that target the home root", async () => {
		const pi = await createGuard();

		expectBlocked(pi.emitToolCall({ toolName: "read", input: { path: "/Users/schrockn" } }));
		expectBlocked(pi.emitToolCall({ toolName: "read", input: { path: "/Users/schrockn/" } }));
		expectBlocked(pi.emitToolCall({ toolName: "ls", input: { path: "~" } }));
		expectBlocked(pi.emitToolCall({ toolName: "find", input: { paths: ["${HOME}"] } }));
	});

	test("allows path-like non-bash tool inputs that target scoped descendants", async () => {
		const pi = await createGuard();

		expect(pi.emitToolCall({ toolName: "read", input: { path: "/Users/schrockn/code/asdl-tools/README.md" } })).toBeUndefined();
		expect(pi.emitToolCall({ toolName: "ls", input: { path: "~/code/asdl-tools" } })).toBeUndefined();
		expect(pi.emitToolCall({ toolName: "find", input: { paths: ["$HOME/code/asdl-tools"] } })).toBeUndefined();
	});

	test("does not scan non-path content fields", async () => {
		const pi = await createGuard();

		expect(
			pi.emitToolCall({
				toolName: "write",
				input: {
					path: "/Users/schrockn/code/asdl-tools/notes.md",
					content: "Document that /Users/schrockn is the home directory.",
				},
			}),
		).toBeUndefined();
	});
});
