import { withTempGitRepo, withTempRepoSkill } from "@nseng-ai/foundation/test-kit";
import { describe, expect, test } from "vitest";

import objectiveExtension, {
	type CommandContext,
	type RawPiExecResult,
	type ObjectiveExtensionAPI,
	type NotifyLevel,
} from "../src/extension.ts";
import { createTestSessionReader } from "./test-session-reader.ts";

const ROOT = "/repo";

const CREATE_SKILL_MARKDOWN = `---
name: objective-create
hidden-frontmatter-token: do-not-include
---

# Test Objective Create Skill

Create one Objective.
`;

type RegisteredCommand = Parameters<ObjectiveExtensionAPI["registerCommand"]>[1];

interface EffectiveSkillInfo {
	name: string;
	filePath: string;
	baseDir: string;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

class FakePi implements ObjectiveExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentUserMessages: string[] = [];
	readonly execCalls: Array<{ command: string; args: string[]; options: unknown }> = [];

	on(): { dispose(): void } {
		return { dispose(): void {} };
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: unknown): Promise<RawPiExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		return { stdout: "", stderr: "", code: 0, killed: false };
	}

	sendMessage(): void {}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function createContext(
	cwd = ROOT,
	skills: readonly EffectiveSkillInfo[] = [],
): {
	ctx: CommandContext;
	notifications: Notification[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	let waits = 0;
	const ctx: CommandContext = {
		cwd,
		hasUI: true,
		modelRegistry: {
			find: () => undefined,
		},
		sessionManager: createTestSessionReader(),
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async select(): Promise<string | undefined> {
				return undefined;
			},
			setStatus(): void {},
		},
		getSystemPromptOptions() {
			return { skills };
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};
	return { ctx, notifications, waitForIdleCalls: () => waits };
}

interface RunObjectiveCreateOptions {
	args: string;
	skills?: EffectiveSkillInfo[];
	cwd?: string;
}

async function runObjectiveCreate({
	args,
	skills = [],
	cwd = ROOT,
}: RunObjectiveCreateOptions): Promise<{
	pi: FakePi;
	notifications: Notification[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi();
	objectiveExtension(pi);
	const command = pi.commands.get("ns:objective:create");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("ns:objective:create was not registered");
	}

	const context = createContext(cwd, skills);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

describe("ns:objective:create command", () => {
	test("registers a typeahead-friendly wrapper for objective-create", () => {
		const pi = new FakePi();

		objectiveExtension(pi);

		const command = pi.commands.get("ns:objective:create");
		expect(command).toBeDefined();
		expect(command?.argumentHint).toBe("[objective-slug-title-or-context]");
		expect(command?.description).toContain("objective-create");
	});

	test("uses the exact effective project winner and preserves initial user request", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: CREATE_SKILL_MARKDOWN,
			},
			async ({ repoDir, skillPath, skillDir }) => {
				const result = await runObjectiveCreate({
					args: "  create slug alpha for typeahead-friendly Objective creation  ",
					cwd: repoDir,
					skills: [{ name: "objective-create", filePath: skillPath, baseDir: skillDir }],
				});

				expect(result.waitForIdleCalls()).toBe(1);
				expect(result.pi.execCalls).toEqual([]);
				expect(result.pi.sentUserMessages).toHaveLength(1);
				expect(result.pi.sentUserMessages[0]).toContain(
					`<skill name="objective-create" location="${skillPath}">`,
				);
				expect(result.pi.sentUserMessages[0]).toContain(`References are relative to ${skillDir}.`);
				expect(result.pi.sentUserMessages[0]).toContain(
					"# Test Objective Create Skill\n\nCreate one Objective.",
				);
				expect(result.pi.sentUserMessages[0]).not.toContain("hidden-frontmatter-token");
				expect(result.pi.sentUserMessages[0]).toContain(
					"Run objective-create with this initial user request:",
				);
				expect(result.pi.sentUserMessages[0]).toContain(
					"```text\ncreate slug alpha for typeahead-friendly Objective creation\n```",
				);
				expect(result.notifications).toContainEqual({
					message: "Invoking objective-create with initial context.",
					level: "info",
				});
			},
		);
	});

	test("accepts an effective user skill outside a foreign cwd", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: CREATE_SKILL_MARKDOWN.replace("Create one Objective.", "Exact user winner."),
			},
			async ({ skillPath, skillDir }) => {
				const result = await runObjectiveCreate({
					args: "create from another checkout",
					cwd: "/foreign/project",
					skills: [{ name: "objective-create", filePath: skillPath, baseDir: skillDir }],
				});

				expect(result.pi.execCalls).toEqual([]);
				expect(result.pi.sentUserMessages[0]).toContain("Exact user winner.");
				expect(result.pi.sentUserMessages[0]).toContain(`location="${skillPath}"`);
				expect(result.pi.sentUserMessages[0]).toContain(`References are relative to ${skillDir}.`);
			},
		);
	});

	test("empty args still invokes the objective-create interview from backing skill", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: CREATE_SKILL_MARKDOWN,
			},
			async ({ repoDir, skillPath, skillDir }) => {
				const result = await runObjectiveCreate({
					args: "",
					cwd: repoDir,
					skills: [{ name: "objective-create", filePath: skillPath, baseDir: skillDir }],
				});

				expect(result.waitForIdleCalls()).toBe(1);
				expect(result.pi.sentUserMessages).toHaveLength(1);
				expect(result.pi.sentUserMessages[0]).toContain(
					`<skill name="objective-create" location="${skillPath}">`,
				);
				expect(result.pi.sentUserMessages[0]).toContain(
					"No initial Objective creation request was provided. Start the objective-create interview",
				);
				expect(result.notifications).toContainEqual({
					message: "Invoking objective-create.",
					level: "info",
				});
			},
		);
	});

	test("missing objective-create backing skill notifies an error and sends no prompt", async () => {
		await withTempGitRepo({ prefix: "objective-create-missing-repo-" }, async ({ repoDir }) => {
			const result = await runObjectiveCreate({ args: "create alpha", cwd: repoDir });

			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toEqual([]);
			expect(result.notifications).toHaveLength(1);
			expect(result.notifications[0]?.level).toBe("error");
			expect(result.notifications[0]?.message).toContain(
				'Could not load required skill "objective-create"',
			);
			expect(result.notifications[0]?.message).toContain(
				"Pi did not include the skill in its effective skill inventory.",
			);
		});
	});

	test("objective-create initial request fence grows beyond embedded backticks", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-create",
				markdown: CREATE_SKILL_MARKDOWN,
			},
			async ({ repoDir, skillPath, skillDir }) => {
				const result = await runObjectiveCreate({
					args: "make `code` and ```nested``` safe",
					cwd: repoDir,
					skills: [{ name: "objective-create", filePath: skillPath, baseDir: skillDir }],
				});

				expect(result.pi.sentUserMessages[0]).toContain(
					"````text\nmake `code` and ```nested``` safe\n````",
				);
			},
		);
	});
});
