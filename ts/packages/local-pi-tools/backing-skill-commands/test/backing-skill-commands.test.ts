import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { genericCommandStyleSkillNames } from "@sdl/pi/commands";

import {
	derivePiReplacementCommand,
	genericBackingSkillCommandSpecs,
	registerBackingSkillCommands,
	SPECIALIZED_PI_COMMAND_SURFACES,
	type BackingSkillCommandContext,
} from "../src/extension.ts";

type RegisteredCommand = Parameters<typeof registerCommand>[1];

function registerCommand(
	_name: string,
	_command: { handler(args: string, ctx: BackingSkillCommandContext): Promise<void> | void },
): void {}

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

function commandContext(cwd: string): BackingSkillCommandContext & {
	notifications: Array<{ message: string; level: string | undefined }>;
} {
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
		["branch-context-from-plan", "sdl:branch-context:from-plan"],
		["branch-context-impl", "sdl:branch-context:impl-attached-plan"],
		["enriched-plan-save", "sdl:plan:save"],
		["pi-grill-with-docs-ui", "pi:grill-with-docs"],
		["foo-bar-baz", "foo:bar-baz"],
	])("derives %s as /%s", (skillName, surface) => {
		expect(derivePiReplacementCommand(skillName)?.surface).toBe(surface);
	});

	test("parses specialized and derived command metadata from the command surface", () => {
		expect(derivePiReplacementCommand("branch-context-from-plan")).toEqual({
			surface: "sdl:branch-context:from-plan",
			skillName: "branch-context-from-plan",
			namespace: "sdl",
			command: "branch-context:from-plan",
		});
		expect(derivePiReplacementCommand("objective-stack-impl")).toEqual({
			surface: "objective:stack-impl",
			skillName: "objective-stack-impl",
			namespace: "objective",
			command: "stack-impl",
		});
	});
});

describe("genericBackingSkillCommandSpecs", () => {
	test("skips specialized surfaces but keeps ordinary derived commands", () => {
		const surfaces = genericBackingSkillCommandSpecs().map((spec) => spec.surface);

		expect(surfaces).toContain("pr:address");
		expect(surfaces).toContain("code:workflows");
		expect(surfaces).not.toContain("grill:me");
		expect(surfaces).not.toContain("grill:with-docs");
		expect(surfaces).not.toContain("objective:close");
		expect(surfaces).not.toContain("objective:create");
		expect(surfaces).not.toContain("objective:current");
		expect(surfaces).not.toContain("code:gt-restack-resolve");
		expect(genericBackingSkillCommandSpecs().map((spec) => spec.skillName)).toEqual(
			genericCommandStyleSkillNames(),
		);
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
			await writeFile(
				join(skillDir, "SKILL.md"),
				"---\nname: pr-address\n---\n\n# PR Address\n",
				"utf8",
			);

			const host = new FakeBackingSkillHost();
			registerBackingSkillCommands(host);
			const command = host.commands.get("pr:address");
			expect(command).toBeDefined();

			await command?.handler("fix ```this``` please", commandContext(repo));

			expect(host.sentMessages).toHaveLength(1);
			expect(host.sentMessages[0]).toContain(
				`<skill name="pr-address" location="${join(skillDir, "SKILL.md")}">`,
			);
			expect(host.sentMessages[0]).toContain("# PR Address");
			expect(host.sentMessages[0]).toContain("````text\nfix ```this``` please\n````");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
