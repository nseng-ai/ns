import { expect, test } from "vitest";
import { z } from "zod";

import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { ClinkrTopology, type SourceScope, type TopologySource } from "../src/app/topology.ts";

function emptyScope(): SourceScope<never> {
	return { commands: new Map(), groups: new Map() };
}

function source(label: string, open: TopologySource<never>["open"]): TopologySource<never> {
	return { label, open };
}

function fixtureCommand(description: string, aliases?: readonly string[]) {
	return {
		metadata: { description, ...(aliases === undefined ? {} : { aliases }) },
		load: async () => ({
			metadata: { description },
			selected: {
				kind: "structured" as const,
				definition: defineCommand({ schema: z.object({}), handler: async () => ok() }),
			},
		}),
	};
}

test("concurrent scope opens share work and successful scopes cache", async () => {
	let opens = 0;
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const topology = new ClinkrTopology({
		sources: [
			source("fixture", async () => {
				opens += 1;
				await gate;
				return emptyScope();
			}),
		],
	});
	const first = topology.open([]);
	const second = topology.open([]);
	release?.();
	await Promise.all([first, second]);
	await topology.open([]);
	expect(opens).toBe(1);
});

test("failed scope opens are retryable and never published", async () => {
	let opens = 0;
	const topology = new ClinkrTopology({
		sources: [
			source("fixture", async () => {
				opens += 1;
				if (opens === 1) throw new Error("temporary scope failure");
				return emptyScope();
			}),
		],
	});
	await expect(topology.open([])).rejects.toThrow("temporary scope failure");
	await expect(topology.open([])).resolves.toEqual({ commands: new Map(), groups: new Map() });
	expect(opens).toBe(2);
});

test("scope caching is transactional independently for each source and scope", async () => {
	let stableOpens = 0;
	let flakyOpens = 0;
	const topology = new ClinkrTopology({
		sources: [
			source("stable", async () => {
				stableOpens += 1;
				return emptyScope();
			}),
			source("flaky", async () => {
				flakyOpens += 1;
				if (flakyOpens === 1) throw new Error("temporary source failure");
				return emptyScope();
			}),
		],
	});
	await expect(topology.open([])).rejects.toThrow("temporary source failure");
	await expect(topology.open([])).resolves.toEqual({ commands: new Map(), groups: new Map() });
	expect(stableOpens).toBe(1);
	expect(flakyOpens).toBe(2);
});

test("opened routes carry the selected-command cache identity", async () => {
	let loads = 0;
	const command = {
		metadata: { description: "Shared loader." },
		load: async () => {
			loads += 1;
			return {
				metadata: { description: "Shared loader." },
				selected: {
					kind: "structured" as const,
					definition: defineCommand({ schema: z.object({}), handler: async () => ok() }),
				},
			};
		},
	};
	const topology = new ClinkrTopology({
		sources: [
			source("fixture", async () => ({
				commands: new Map([
					["first", command],
					["second", command],
				]),
				groups: new Map(),
			})),
		],
	});
	const root = await topology.open([]);
	const first = root.commands.get("first");
	const second = root.commands.get("second");
	if (first === undefined || second === undefined) throw new Error("Missing fixture routes");
	await Promise.all([topology.load(first), topology.load(first), topology.load(second)]);
	expect(loads).toBe(2);
});

test("failed selected loads are evicted and retryable", async () => {
	let loads = 0;
	const command = {
		metadata: { description: "Flaky loader." },
		load: async () => {
			loads += 1;
			if (loads === 1) throw new Error("temporary load failure");
			return fixtureCommand("Flaky loader.").load();
		},
	};
	const topology = new ClinkrTopology({
		sources: [
			source("fixture", async () => ({
				commands: new Map([["flaky", command]]),
				groups: new Map(),
			})),
		],
	});
	const root = await topology.open([]);
	const route = root.commands.get("flaky");
	if (route === undefined) throw new Error("Missing fixture route");
	await expect(topology.load(route)).rejects.toThrow("temporary load failure");
	await expect(topology.load(route)).resolves.toMatchObject({
		selected: { kind: "structured" },
	});
	expect(loads).toBe(2);
});

test("opening a descendant probes only the source that owns its group", async () => {
	const opened: string[] = [];
	const ownedGroup = { definition: { description: "Owned group." } };
	const topology = new ClinkrTopology({
		sources: [
			source("owner", async (path) => {
				opened.push(`owner:${path.join("/")}`);
				return path.length === 0
					? { commands: new Map(), groups: new Map([["owned", ownedGroup]]) }
					: emptyScope();
			}),
			source("unrelated", async (path) => {
				opened.push(`unrelated:${path.join("/")}`);
				if (path.length > 0) throw new Error("unrelated source was probed");
				return emptyScope();
			}),
		],
	});
	await topology.open(["owned"]);
	expect(opened).toEqual(["owner:", "unrelated:", "owner:owned"]);
});

test("configured reserved route names reject canonical names", async () => {
	const topology = new ClinkrTopology({
		reservedNames: new Set(["completion"]),
		sources: [
			source("fixture", async () => ({
				commands: new Map([["completion", fixtureCommand("Completion command.")]]),
				groups: new Map(),
			})),
		],
	});
	await expect(topology.open([])).rejects.toThrow(/completion.*reserved name/);
});

test("configured reserved route names reject aliases on differently named routes", async () => {
	const topology = new ClinkrTopology({
		reservedNames: new Set(["completion"]),
		sources: [
			source("fixture", async () => ({
				commands: new Map([["helper", fixtureCommand("Helper command.", ["completion"])]]),
				groups: new Map(),
			})),
		],
	});
	await expect(topology.open([])).rejects.toThrow(
		/alias "completion".*conflicts with configured reserved name/,
	);
});

test("configured reserved route names permit descendant canonical names and aliases", async () => {
	const topology = new ClinkrTopology({
		reservedNames: new Set(["completion"]),
		sources: [
			source("fixture", async (path) =>
				path.length === 0
					? {
							commands: new Map(),
							groups: new Map([["nested", { definition: { description: "Nested." } }]]),
						}
					: {
							commands: new Map([
								["completion", fixtureCommand("Completion command.")],
								["helper", fixtureCommand("Helper command.", ["complete"])],
							]),
							groups: new Map(),
						},
			),
		],
	});
	const nested = await topology.open(["nested"]);
	expect([...nested.commands.keys()]).toEqual(["completion", "helper"]);
	expect(nested.commands.get("helper")?.command.metadata.aliases).toEqual(["complete"]);
});

test("alias/name collisions identify the alias's canonical owner route", async () => {
	const aliased = source("alpha", async () => ({
		commands: new Map([["publish", fixtureCommand("Publisher.", ["shared"])]]),
		groups: new Map(),
	}));
	const named = source("beta", async () => ({
		commands: new Map([["shared", fixtureCommand("Named.")]]),
		groups: new Map(),
	}));
	for (const sources of [
		[aliased, named],
		[named, aliased],
	]) {
		const topology = new ClinkrTopology({ sources });
		await expect(topology.open([])).rejects.toThrow(
			'alias/name collision at shared between sources "alpha" (alias of publish) and "beta"',
		);
	}
});

test("alias/alias collisions identify both canonical owner routes", async () => {
	const first = source("alpha", async () => ({
		commands: new Map([["publish", fixtureCommand("Publisher.", ["shared"])]]),
		groups: new Map(),
	}));
	const second = source("beta", async () => ({
		commands: new Map([["release", fixtureCommand("Releaser.", ["shared"])]]),
		groups: new Map(),
	}));
	for (const sources of [
		[first, second],
		[second, first],
	]) {
		const topology = new ClinkrTopology({ sources });
		await expect(topology.open([])).rejects.toThrow(
			'alias/alias collision at shared between sources "alpha" (alias of publish) and "beta" (alias of release)',
		);
	}
});
