import path from "node:path";

import { expect, test } from "vitest";
import { z } from "zod";

import {
	createClinkrApp,
	defineCommand,
	ok,
	type ClinkrComposition,
	type ClinkrScope,
} from "@nseng-ai/clinkr/app";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";
import { composeSources } from "../src/app/programmatic-source.ts";
import { ClinkrTopology } from "../src/app/topology.ts";

const FIXTURES_DIRECTORY = path.join(import.meta.dirname, "fixtures");

function definition(value: string) {
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		renderHuman: (result) => JSON.stringify(result, null, 2),
		handler: async () => ok({ value }),
	});
}

test("callback-only apps lazily load and cache a root default command", async () => {
	let loads = 0;
	const app = createClinkrApp({ name: "composed" }, (composition) => {
		composition.source({ label: "sdk:objectives" }, (scope) => {
			scope.defaultCommand({ description: "Composed command." }, async () => {
				loads += 1;
				return definition("ready");
			});
		});
	});
	expect(loads).toBe(0);
	const first = await runForCliTest(app, []);
	const second = await runForCliTest(app, []);
	expect(first).toMatchObject({ exitCode: 0, stdout: '{\n  "value": "ready"\n}\n' });
	expect(second.exitCode).toBe(0);
	expect(loads).toBe(1);
});

test("failed programmatic selected loads retry without publication", async () => {
	let loads = 0;
	const app = createClinkrApp({ name: "retry" }, (composition) => {
		composition.source({ label: "retry-source" }, (scope) => {
			scope.defaultCommand({ description: "Retry command." }, async () => {
				loads += 1;
				if (loads === 1) throw new Error("temporary definition failure");
				return definition("retried");
			});
		});
	});
	await expect(app.run([])).rejects.toThrow("temporary definition failure");
	expect((await runForCliTest(app, [])).exitCode).toBe(0);
	expect(loads).toBe(2);
});

test("composition.filesystem mounts a labeled lazy filesystem source", async () => {
	const app = createClinkrApp({ name: "filesystem" }, (composition) => {
		composition.filesystem({
			label: "explicit-filesystem",
			commandDirectory: path.join(FIXTURES_DIRECTORY, "counting"),
		});
	});
	expect((await runForCliTest(app, [])).exitCode).toBe(0);
});

test("nested scope.filesystem retains programmatic ownership and loads only when opened", async () => {
	const sources = composeSources<never>((composition) => {
		composition.source({ label: "nested-owner" }, (scope) => {
			scope.group("nested", { description: "Nested." }, (nested) => {
				nested.filesystem({ commandDirectory: path.join(FIXTURES_DIRECTORY, "counting") });
			});
		});
	});
	const topology = new ClinkrTopology({ sources });
	const root = await topology.open([]);
	expect(root.defaultCommand).toBeUndefined();
	expect(root.groups.get("nested")?.source.label).toBe("nested-owner");
	const nested = await topology.open(["nested"]);
	expect(nested.defaultCommand?.source.label).toBe("nested-owner");
	await expect(topology.load(nested.defaultCommand!)).resolves.toMatchObject({
		selected: { kind: "structured" },
	});
});

test("mixed construction preserves the implicit filesystem root default", async () => {
	const app = createClinkrApp(
		{
			name: "mixed",
			commandDirectory: path.join(FIXTURES_DIRECTORY, "counting"),
		},
		(composition) => {
			composition.source({ label: "sdk:extra" }, (scope) => {
				scope.command("extra", { description: "Extra command." }, async () => definition("extra"));
			});
		},
	);
	expect((await runForCliTest(app, [])).exitCode).toBe(0);
});

test("zero-source callback construction is rejected", () => {
	expect(() => createClinkrApp({ name: "empty" }, () => {})).toThrow(
		"app requires at least one mounted source",
	);
});

const collisionDeclarations = {
	command: (scope: ClinkrScope<never>) =>
		scope.command("shared", { description: "Shared." }, async () => definition("x")),
	group: (scope: ClinkrScope<never>) => scope.group("shared", { description: "Shared." }, () => {}),
	alias: (scope: ClinkrScope<never>) =>
		scope.command("other", { description: "Aliased.", aliases: ["shared"] }, async () =>
			definition("x"),
		),
	secondAlias: (scope: ClinkrScope<never>) =>
		scope.command(
			"different",
			{ description: "Aliased differently.", aliases: ["shared"] },
			async () => definition("x"),
		),
} satisfies Record<string, (scope: ClinkrScope<never>) => void>;

test.each([
	["command/command", collisionDeclarations.command, collisionDeclarations.command, []],
	["group/group", collisionDeclarations.group, collisionDeclarations.group, []],
	["command/group", collisionDeclarations.command, collisionDeclarations.group, []],
	["alias/name", collisionDeclarations.alias, collisionDeclarations.command, ["other"]],
	[
		"alias/alias",
		collisionDeclarations.alias,
		collisionDeclarations.secondAlias,
		["other", "different"],
	],
] as const)(
	"%s diagnostics are order-independent",
	async (collisionClass, first, second, canonicalOwners) => {
		for (const reverse of [false, true]) {
			const app = createClinkrApp({ name: "collision" }, (composition) => {
				const declarations = reverse ? ([second, first] as const) : ([first, second] as const);
				composition.source({ label: "source-b" }, declarations[0]);
				composition.source({ label: "source-a" }, declarations[1]);
			});
			const result = await runForCliTest(app, []);
			expect(result.exitCode).toBe(2);
			expect(result.stderr).toMatch(
				new RegExp(`${collisionClass} collision at shared.*source-a.*source-b`),
			);
			for (const owner of canonicalOwners) {
				expect(result.stderr).toContain(`alias of ${owner}`);
			}
		}
	},
);

test("every shared group path is rejected before probing disjoint descendants", async () => {
	let firstDescendantOpens = 0;
	let secondDescendantOpens = 0;
	const app = createClinkrApp({ name: "collision" }, (composition) => {
		composition.source({ label: "first" }, (scope) => {
			scope.group("shared", { description: "Shared." }, (group) => {
				firstDescendantOpens += 1;
				group.command("first-only", { description: "First." }, async () => definition("first"));
			});
		});
		composition.source({ label: "second" }, (scope) => {
			scope.group("shared", { description: "Shared." }, (group) => {
				secondDescendantOpens += 1;
				group.command("second-only", { description: "Second." }, async () => definition("second"));
			});
		});
	});
	const result = await runForCliTest(app, []);
	expect(result).toMatchObject({
		exitCode: 2,
		stderr: expect.stringMatching(/shared.*first.*second/),
	});
	expect(firstDescendantOpens).toBe(1);
	expect(secondDescendantOpens).toBe(1);
});

test("retained composition and scope builders cannot mutate the app after construction", () => {
	let retainedComposition: ClinkrComposition<never> | undefined;
	let retainedScope: ClinkrScope<never> | undefined;
	createClinkrApp({ name: "retained" }, (composition) => {
		retainedComposition = composition;
		composition.source({ label: "source" }, (scope) => {
			retainedScope = scope;
			scope.defaultCommand({ description: "Default." }, async () => definition("ready"));
		});
	});
	expect(() => retainedComposition?.source({ label: "late" }, () => {})).toThrow(
		"composition builder cannot be used after construction",
	);
	expect(() =>
		retainedScope?.command("late", { description: "Late." }, async () => definition("late")),
	).toThrow("scope builder cannot be used after construction");
});

test("programmatic declarations snapshot mutable metadata inputs", async () => {
	const metadata = { description: "Original." };
	const app = createClinkrApp({ name: "snapshot" }, (composition) => {
		composition.source({ label: "source" }, (scope) => {
			scope.defaultCommand(metadata, async () => definition("ready"));
		});
	});
	metadata.description = "Mutated.";
	const result = await runForCliTest(app, ["--help"]);
	expect(result.stdout).toContain("Original.");
	expect(result.stdout).not.toContain("Mutated.");
});

const invalidProgrammaticDeclarations = [
	[
		"blank command description",
		(scope: ClinkrScope<never>) =>
			scope.command("valid", { description: " \t" }, async () => definition("x")),
		/description must be non-empty at valid/,
	],
	[
		"blank group summary",
		(scope: ClinkrScope<never>) =>
			scope.group("valid", { description: "Valid.", summary: "\n" }, () => {}),
		/summary must be non-empty at valid/,
	],
	[
		"blank default helpGroup",
		(scope: ClinkrScope<never>) =>
			scope.defaultCommand({ description: "Valid.", helpGroup: " " }, async () => definition("x")),
		/helpGroup must be non-empty at <root>/,
	],
	[
		"invalid command name",
		(scope: ClinkrScope<never>) =>
			scope.command("bad_name", { description: "Valid." }, async () => definition("x")),
		/invalid canonical route name "bad_name" at bad_name/,
	],
	[
		"invalid group name",
		(scope: ClinkrScope<never>) => scope.group("Bad", { description: "Valid." }, () => {}),
		/invalid canonical route name "Bad" at Bad/,
	],
	[
		"invalid command alias",
		(scope: ClinkrScope<never>) =>
			scope.command("valid", { description: "Valid.", aliases: ["bad_name"] }, async () =>
				definition("x"),
			),
		/invalid canonical route name "bad_name" at valid/,
	],
	[
		"invalid group alias",
		(scope: ClinkrScope<never>) =>
			scope.group("valid", { description: "Valid.", aliases: ["Bad"] }, () => {}),
		/invalid canonical route name "Bad" at valid/,
	],
	[
		"self alias",
		(scope: ClinkrScope<never>) =>
			scope.command("valid", { description: "Valid.", aliases: ["valid"] }, async () =>
				definition("x"),
			),
		/alias "valid" equals its route name at valid/,
	],
	[
		"duplicate aliases",
		(scope: ClinkrScope<never>) =>
			scope.group("valid", { description: "Valid.", aliases: ["v", "v"] }, () => {}),
		/duplicate alias "v" at valid/,
	],
] as const;

test.each(invalidProgrammaticDeclarations)(
	"programmatic declarations reject %s synchronously",
	(_label, declare, expected) => {
		expect(() =>
			createClinkrApp({ name: "invalid" }, (composition) => {
				composition.source({ label: "invalid-source" }, declare);
			}),
		).toThrow(expected);
	},
);

test.each([
	[
		"blank",
		(composition: ClinkrComposition<never>) => composition.source({ label: " " }, () => {}),
	],
	[
		"duplicate",
		(composition: ClinkrComposition<never>) => {
			composition.source({ label: "same" }, () => {});
			composition.source({ label: "same" }, () => {});
		},
	],
] as const)("composition rejects %s source labels", (_label, configure) => {
	expect(() => composeSources(configure)).toThrow(
		/source label must be non-empty|duplicate source label/,
	);
});

test.each([
	["direct app option", () => createClinkrApp({ name: "relative", commandDirectory: "commands" })],
	[
		"composition.filesystem",
		() =>
			createClinkrApp({ name: "relative" }, (composition) => {
				composition.filesystem({ commandDirectory: "commands" });
			}),
	],
	[
		"nested scope.filesystem",
		() =>
			createClinkrApp({ name: "relative" }, (composition) => {
				composition.source({ label: "source" }, (scope) => {
					scope.filesystem({ commandDirectory: "commands" });
				});
			}),
	],
] as const)("%s rejects relative commandDirectory", (_label, construct) => {
	expect(construct).toThrow("clinkr: commandDirectory must be absolute");
});

test.each([
	[
		"duplicate commands",
		(scope: ClinkrScope<never>) => {
			scope.command("same", { description: "First." }, async () => definition("first"));
			scope.command("same", { description: "Second." }, async () => definition("second"));
		},
		/route collision at same in source "source"/,
	],
	[
		"duplicate groups",
		(scope: ClinkrScope<never>) => {
			scope.group("same", { description: "First." }, () => {});
			scope.group("same", { description: "Second." }, () => {});
		},
		/route collision at same in source "source"/,
	],
	[
		"command then group",
		(scope: ClinkrScope<never>) => {
			scope.command("same", { description: "Command." }, async () => definition("command"));
			scope.group("same", { description: "Group." }, () => {});
		},
		/route collision at same in source "source"/,
	],
	[
		"group then command",
		(scope: ClinkrScope<never>) => {
			scope.group("same", { description: "Group." }, () => {});
			scope.command("same", { description: "Command." }, async () => definition("command"));
		},
		/route collision at same in source "source"/,
	],
	[
		"default commands",
		(scope: ClinkrScope<never>) => {
			scope.defaultCommand({ description: "First." }, async () => definition("first"));
			scope.defaultCommand({ description: "Second." }, async () => definition("second"));
		},
		/duplicate command at <root> in source "source"/,
	],
	[
		"filesystem mounts",
		(scope: ClinkrScope<never>) => {
			scope.filesystem({ commandDirectory: FIXTURES_DIRECTORY });
			scope.filesystem({ commandDirectory: FIXTURES_DIRECTORY });
		},
		/duplicate filesystem mount at <root> in source "source"/,
	],
] as const)("one programmatic source rejects %s", (_label, declare, expected) => {
	expect(() =>
		composeSources((composition) => {
			composition.source({ label: "source" }, declare);
		}),
	).toThrow(expected);
});

test("cross-source root default collisions are stable across declaration order", async () => {
	for (const labels of [
		["source-b", "source-a"],
		["source-a", "source-b"],
	] as const) {
		const sources = composeSources<never>((composition) => {
			for (const label of labels) {
				composition.source({ label }, (scope) => {
					scope.defaultCommand({ description: `${label}.` }, async () => definition(label));
				});
			}
		});
		const scope = await new ClinkrTopology({ sources }).open([]);
		expect(scope.defaultCommand).toBeUndefined();
		expect(scope.defaultIssues.map((issue) => issue.type === "collision" && issue.kind)).toEqual([
			"default/default",
		]);
	}
});
