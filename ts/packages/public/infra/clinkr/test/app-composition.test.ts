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
	const [first, second] = await Promise.all([app.execute({}), app.execute({})]);
	expect(first.outcome).toEqual({ status: "success", data: { value: "ready" } });
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
			const error = await app.run([]).then(
				() => undefined,
				(failure: unknown) => failure as Error,
			);
			expect(error?.message).toMatch(
				new RegExp(`${collisionClass} collision at shared.*source-a.*source-b`),
			);
			for (const owner of canonicalOwners) {
				expect(error?.message).toContain(`alias of ${owner}`);
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
	await expect(app.run([])).rejects.toThrow(/shared.*first.*second/);
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

test("programmatic metadata rejects invalid semantics at declaration time", () => {
	expect(() =>
		createClinkrApp({ name: "invalid" }, (composition) => {
			composition.source({ label: "invalid-source" }, (scope) => {
				scope.command("bad_name", { description: " " }, async () => definition("x"));
			});
		}),
	).toThrow(/invalid canonical route name|description must be non-empty/);
});
