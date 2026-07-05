import { describe, expect, test } from "vitest";

import type {
	AutocompleteItem,
	AutocompleteProvider,
	AutocompleteSuggestions,
	SessionStartContext,
} from "@ns/pi/runtime/types";

import slashCommandRerankExtension, {
	createSlashCommandRerankProvider,
	type SlashCommandRerankExtensionAPI,
	rerankSlashCommandItems,
	slashCommandRerankQuery,
} from "../../src/slash-command-rerank/index.ts";

function items(...values: string[]): AutocompleteItem[] {
	return values.map((value) => ({ value }));
}

function values(list: readonly AutocompleteItem[]): string[] {
	return list.map((item) => item.value);
}

describe("rerankSlashCommandItems", () => {
	test("promotes the suffix-segment match ahead of greedy fuzzy matches (bug scenario)", () => {
		const fuzzyOrder = items(
			"context:bundle-analysis",
			"ns:branch-context:from-plan",
			"ns:objective:next",
			"ns:objective:update",
		);
		expect(values(rerankSlashCommandItems(fuzzyOrder, "next"))[0]).toBe("ns:objective:next");
	});

	test("treats a whole segment after a '-' boundary as tier 0", () => {
		const list = items("ns:objective:next", "context:bundle-analysis");
		expect(values(rerankSlashCommandItems(list, "bundle"))[0]).toBe("context:bundle-analysis");
	});

	test("segment-prefix query boosts the namespaced command over fuzzy-only matches", () => {
		const list = items("code:jobs", "ns:objective:next");
		expect(values(rerankSlashCommandItems(list, "obj"))[0]).toBe("ns:objective:next");
	});

	test("multi-segment prefix query boosts the namespaced command", () => {
		const list = items("code:jobs", "ns:objective:next");
		expect(values(rerankSlashCommandItems(list, "objective:ne"))[0]).toBe("ns:objective:next");
	});

	test("matches case-insensitively", () => {
		const list = items("context:bundle-analysis", "ns:objective:next");
		expect(values(rerankSlashCommandItems(list, "NEXT"))[0]).toBe("ns:objective:next");
	});

	test("is stable: tier-0 ties keep incoming order", () => {
		const list = items("ns:objective:next", "shortcut:next");
		expect(values(rerankSlashCommandItems(list, "next"))).toEqual([
			"ns:objective:next",
			"shortcut:next",
		]);
	});

	test("is stable: an all-tier-2 query returns the original order", () => {
		const list = items("context:bundle-analysis", "ns:objective:next", "ns:objective:update");
		expect(values(rerankSlashCommandItems(list, "zzz"))).toEqual(values(list));
	});

	test("does not mutate the input array", () => {
		const list = items("context:bundle-analysis", "ns:objective:next");
		const snapshot = values(list);
		rerankSlashCommandItems(list, "next");
		expect(values(list)).toEqual(snapshot);
	});
});

describe("slashCommandRerankQuery", () => {
	function suggestions(prefix: string, ...names: string[]): AutocompleteSuggestions {
		return { items: items(...names), prefix };
	}

	test("returns the query for slash-command-NAME completion", () => {
		expect(
			slashCommandRerankQuery(["/next"], 0, 5, suggestions("/next", "ns:objective:next")),
		).toBe("next");
	});

	test("returns null for a bare slash", () => {
		expect(slashCommandRerankQuery(["/"], 0, 1, suggestions("/", "ns:objective:next"))).toBeNull();
	});

	test("returns null when the text before the cursor contains a space (argument completion)", () => {
		expect(
			slashCommandRerankQuery(["/ns:objective:next foo"], 0, 22, suggestions("foo", "bar")),
		).toBeNull();
	});

	test("returns null when the prefix does not equal the text before the cursor", () => {
		expect(
			slashCommandRerankQuery(["/next"], 0, 5, suggestions("/nex", "ns:objective:next")),
		).toBeNull();
	});

	test("returns null when any item value contains a slash (path completion)", () => {
		expect(
			slashCommandRerankQuery(["/next"], 0, 5, suggestions("/next", "src/main.ts")),
		).toBeNull();
	});

	test("returns null when the line does not start with a slash", () => {
		expect(
			slashCommandRerankQuery(["next"], 0, 4, suggestions("next", "ns:objective:next")),
		).toBeNull();
	});
});

interface GetSuggestionsCall {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
	options: { signal: AbortSignal };
}

interface ApplyCompletionCall {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
	item: AutocompleteItem;
	prefix: string;
}

interface ShouldTriggerCall {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
}

interface FakeCurrentProviderConfig {
	suggestions?: AutocompleteSuggestions | null;
	applyCompletionResult?: unknown;
	shouldTriggerFileCompletion?: boolean;
}

interface FakeCurrentProvider {
	provider: AutocompleteProvider;
	getSuggestionsCalls: GetSuggestionsCall[];
	applyCompletionCalls: ApplyCompletionCall[];
	shouldTriggerCalls: ShouldTriggerCall[];
}

function createFakeCurrentProvider(config: FakeCurrentProviderConfig = {}): FakeCurrentProvider {
	const getSuggestionsCalls: GetSuggestionsCall[] = [];
	const applyCompletionCalls: ApplyCompletionCall[] = [];
	const shouldTriggerCalls: ShouldTriggerCall[] = [];
	const cannedSuggestions =
		config.suggestions === undefined
			? { items: items("ns:objective:next"), prefix: "/next" }
			: config.suggestions;
	const provider: AutocompleteProvider = {
		getSuggestions(lines, cursorLine, cursorCol, options) {
			getSuggestionsCalls.push({ lines, cursorLine, cursorCol, options });
			return cannedSuggestions;
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			applyCompletionCalls.push({ lines, cursorLine, cursorCol, item, prefix });
			return config.applyCompletionResult ?? { lines, cursorLine, cursorCol };
		},
		...(config.shouldTriggerFileCompletion === undefined
			? {}
			: {
					shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number) {
						shouldTriggerCalls.push({ lines, cursorLine, cursorCol });
						return config.shouldTriggerFileCompletion ?? false;
					},
				}),
	};
	return { provider, getSuggestionsCalls, applyCompletionCalls, shouldTriggerCalls };
}

function anOptions(): { signal: AbortSignal } {
	return { signal: new AbortController().signal };
}

describe("createSlashCommandRerankProvider", () => {
	test("forwards exact getSuggestions args and re-ranks command-name completion", async () => {
		const fake = createFakeCurrentProvider({
			suggestions: {
				items: items("context:bundle-analysis", "ns:objective:next"),
				prefix: "/next",
			},
		});
		const wrapped = createSlashCommandRerankProvider(fake.provider);
		const lines = ["/next"];
		const options = anOptions();

		const result = await wrapped.getSuggestions(lines, 0, 5, options);

		expect(fake.getSuggestionsCalls).toEqual([{ lines, cursorLine: 0, cursorCol: 5, options }]);
		expect(fake.getSuggestionsCalls[0]?.lines).toBe(lines);
		expect(fake.getSuggestionsCalls[0]?.options).toBe(options);
		expect(result).not.toBeNull();
		expect(values(result?.items ?? [])[0]).toBe("ns:objective:next");
		expect(result?.prefix).toBe("/next");
	});

	test("passes through unchanged (same identity) when current returns null", async () => {
		const fake = createFakeCurrentProvider({ suggestions: null });
		const wrapped = createSlashCommandRerankProvider(fake.provider);
		expect(await wrapped.getSuggestions(["/next"], 0, 5, anOptions())).toBeNull();
	});

	test("passes through the same object for argument completion", async () => {
		const suggestions: AutocompleteSuggestions = { items: items("bar"), prefix: "foo" };
		const fake = createFakeCurrentProvider({ suggestions });
		const wrapped = createSlashCommandRerankProvider(fake.provider);
		const result = await wrapped.getSuggestions(["/ns:objective:next foo"], 0, 22, anOptions());
		expect(result).toBe(suggestions);
	});

	test("passes through the same object for a bare slash", async () => {
		const suggestions: AutocompleteSuggestions = { items: items("ns:objective:next"), prefix: "/" };
		const fake = createFakeCurrentProvider({ suggestions });
		const wrapped = createSlashCommandRerankProvider(fake.provider);
		expect(await wrapped.getSuggestions(["/"], 0, 1, anOptions())).toBe(suggestions);
	});

	test("passes through the same object when the prefix does not match", async () => {
		const suggestions: AutocompleteSuggestions = {
			items: items("ns:objective:next"),
			prefix: "/nex",
		};
		const fake = createFakeCurrentProvider({ suggestions });
		const wrapped = createSlashCommandRerankProvider(fake.provider);
		expect(await wrapped.getSuggestions(["/next"], 0, 5, anOptions())).toBe(suggestions);
	});

	test("passes through the same object when an item value contains a slash", async () => {
		const suggestions: AutocompleteSuggestions = { items: items("src/main.ts"), prefix: "/next" };
		const fake = createFakeCurrentProvider({ suggestions });
		const wrapped = createSlashCommandRerankProvider(fake.provider);
		expect(await wrapped.getSuggestions(["/next"], 0, 5, anOptions())).toBe(suggestions);
	});

	test("delegates applyCompletion args and return value", () => {
		const applyResult = { lines: ["/ns:objective:next"], cursorLine: 0, cursorCol: 18 };
		const fake = createFakeCurrentProvider({ applyCompletionResult: applyResult });
		const wrapped = createSlashCommandRerankProvider(fake.provider);
		const lines = ["/nex"];
		const item: AutocompleteItem = { value: "ns:objective:next" };

		const result = wrapped.applyCompletion(lines, 0, 4, item, "/nex");

		expect(fake.applyCompletionCalls).toEqual([
			{ lines, cursorLine: 0, cursorCol: 4, item, prefix: "/nex" },
		]);
		expect(result).toBe(applyResult);
	});

	test("exposes shouldTriggerFileCompletion only when current has it", () => {
		const withMethod = createSlashCommandRerankProvider(
			createFakeCurrentProvider({ shouldTriggerFileCompletion: true }).provider,
		);
		expect(typeof withMethod.shouldTriggerFileCompletion).toBe("function");
		expect(withMethod.shouldTriggerFileCompletion?.(["/x"], 0, 2)).toBe(true);

		const withoutMethod = createSlashCommandRerankProvider(createFakeCurrentProvider().provider);
		expect(withoutMethod.shouldTriggerFileCompletion).toBeUndefined();
	});
});

type AddAutocompleteFactory = (current: AutocompleteProvider) => AutocompleteProvider;

class FakeSessionStartPi implements SlashCommandRerankExtensionAPI {
	private handler: ((event: unknown, ctx: SessionStartContext) => Promise<void> | void) | null =
		null;

	on(
		_event: "session_start",
		handler: (event: unknown, ctx: SessionStartContext) => Promise<void> | void,
	): void {
		this.handler = handler;
	}

	async emitSessionStart(ctx: SessionStartContext): Promise<void> {
		if (this.handler === null) throw new Error("session_start handler was not registered");
		await this.handler(undefined, ctx);
	}
}

function createSessionCtx(options: { withAddAutocomplete?: boolean } = {}): {
	ctx: SessionStartContext;
	registeredFactories: AddAutocompleteFactory[];
} {
	const withAdd = options.withAddAutocomplete ?? true;
	const registeredFactories: AddAutocompleteFactory[] = [];
	const ctx: SessionStartContext = {
		cwd: "/repo",
		ui: {
			notify() {},
			...(withAdd
				? {
						addAutocompleteProvider(factory: AddAutocompleteFactory) {
							registeredFactories.push(factory);
						},
					}
				: {}),
		},
	};
	return { ctx, registeredFactories };
}

describe("slashCommandRerankExtension", () => {
	test("registers exactly one provider factory on session_start", async () => {
		const pi = new FakeSessionStartPi();
		slashCommandRerankExtension(pi);
		const session = createSessionCtx();

		await pi.emitSessionStart(session.ctx);

		expect(session.registeredFactories).toHaveLength(1);
		expect(session.registeredFactories[0]).toBe(createSlashCommandRerankProvider);
	});

	test("does not register a second factory if session_start re-fires", async () => {
		const pi = new FakeSessionStartPi();
		slashCommandRerankExtension(pi);
		const session = createSessionCtx();

		await pi.emitSessionStart(session.ctx);
		await pi.emitSessionStart(session.ctx);

		expect(session.registeredFactories).toHaveLength(1);
	});

	test("does not throw when the host ui has no addAutocompleteProvider", async () => {
		const pi = new FakeSessionStartPi();
		slashCommandRerankExtension(pi);
		const session = createSessionCtx({ withAddAutocomplete: false });

		await expect(pi.emitSessionStart(session.ctx)).resolves.toBeUndefined();
	});
});
