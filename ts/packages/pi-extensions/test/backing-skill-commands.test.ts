import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
	derivePiReplacementCommand,
	genericBackingSkillCommandSpecs,
	registerBackingSkillCommands,
	SPECIALIZED_PI_COMMAND_SURFACES,
	type BackingSkillCommandContext,
} from "../src/backing-skill-commands.ts";

type RegisteredCommand = Parameters<typeof registerCommand>[1];

function registerCommand(_name: string, _command: { handler(args: string, ctx: BackingSkillCommandContext): Promise<void> | void }): void {}

class FakeBackingSkillHost {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentMessages: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	sendUserMessage(content: string): void {
		this.sentMessages.push(content);
	}
}

function commandContext(cwd: string): BackingSkillCommandContext & { notifications: Array<{ message: string; level: string | undefined }> } {
	const notifications: Array<{ message: string; level: string | undefined }> = [];
	return {
		cwd,
		hasUI: true,
		notifications,
		ui: {
			notify(message: string, level?: "info" | "warning" | "error"): void {
				notifications.push({ message, level });
			},
		},
		async waitForIdle(): Promise<void> {},
	};
}

describe("derivePiReplacementCommand", () => {
	test.each([
		["objective-create", "objective:create"],
		["objective-stack-impl", "objective:stack-impl"],
		["branch-context-from-plan", "branch-context:from-plan"],
		["branch-context-impl", "branch-context:impl"],
		["enriched-plan-save", "enriched-plan:save"],
		["pi-grill-with-docs-ui", "pi:grill-with-docs-ui"],
		["foo-bar-baz", "foo:bar-baz"],
	])("derives %s as /%s", (skillName, surface) => {
		expect(derivePiReplacementCommand(skillName)?.surface).toBe(surface);
	});
});

describe("genericBackingSkillCommandSpecs", () => {
	test("skips specialized surfaces but keeps ordinary derived commands", () => {
		const surfaces = genericBackingSkillCommandSpecs().map((spec) => spec.surface);

		expect(surfaces).toContain("pr:address");
		expect(surfaces).toContain("code:workflows");
		expect(surfaces).not.toContain("objective:create");
		expect(surfaces).not.toContain("objective:current");
		expect(surfaces).not.toContain("code:gt-restack-resolve");
		for (const surface of surfaces) {
			expect(SPECIALIZED_PI_COMMAND_SURFACES.has(surface)).toBe(false);
		}
	});
});

describe("registerBackingSkillCommands", () => {
	test("registers generic commands that read repo-local backing skills", async () => {
		const repo = await mkdtemp(join(tmpdir(), "backing-skill-command-"));
		try {
			const skillDir = join(repo, "skills", "pr-address");
			await mkdir(skillDir, { recursive: true });
			await writeFile(join(skillDir, "SKILL.md"), "---\nname: pr-address\n---\n\n# PR Address\n", "utf8");

			const host = new FakeBackingSkillHost();
			registerBackingSkillCommands(host);
			const command = host.commands.get("pr:address");
			expect(command).toBeDefined();

			await command?.handler("fix ```this``` please", commandContext(repo));

			expect(host.sentMessages).toHaveLength(1);
			expect(host.sentMessages[0]).toContain(`<skill name="pr-address" location="${join(skillDir, "SKILL.md")}">`);
			expect(host.sentMessages[0]).toContain("# PR Address");
			expect(host.sentMessages[0]).toContain("````text\nfix ```this``` please\n````");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
