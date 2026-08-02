import { expect, test, vi } from "vitest";
import { z } from "zod";

import {
	cliOption,
	cliPositional,
	createClinkrApp,
	defineCommand,
	ok,
	type ClinkrCompletionProviderRequest,
} from "@nseng-ai/clinkr/app";
import { defineRawCommand } from "@nseng-ai/clinkr/raw";

function command(options: {
	readonly provider?: (request: ClinkrCompletionProviderRequest) => readonly {
		readonly value: string;
		readonly type: "positional-value";
	}[];
	readonly handler?: () => void;
}) {
	return defineCommand({
		schema: z.object({
			mode: cliOption(z.enum(["fast", "slow"]).optional(), { short: "-m" }),
			name: cliPositional(z.enum(["one", "two"]).optional(), { position: 0 }),
		}),
		...(options.provider === undefined ? {} : { completionProvider: options.provider }),
		handler: () => {
			options.handler?.();
			return ok();
		},
	});
}

function completionApp(
	options: {
		readonly provider?: (request: ClinkrCompletionProviderRequest) => readonly {
			readonly value: string;
			readonly type: "positional-value";
		}[];
		readonly onProviderError?: (failure: {
			readonly error: unknown;
			readonly commandPath: readonly string[];
			readonly request: ClinkrCompletionProviderRequest;
		}) => void;
		readonly handler?: () => void;
	} = {},
) {
	return createClinkrApp(
		{
			name: "probe",
			version: "1.0.0",
			runtimeInfo: () => "runtime\n",
			completion:
				options.onProviderError === undefined ? {} : { onProviderError: options.onProviderError },
		},
		(composition) => {
			composition.source({ label: "test" }, (scope) => {
				scope.command("choose", { description: "Choose.", aliases: ["pick"] }, async () =>
					command(options),
				);
				scope.command("secret", { description: "Secret.", hidden: true }, async () => command({}));
				scope.command("raw", { description: "Raw." }, async () =>
					defineRawCommand({ run: () => 0 }),
				);
				scope.group("nested", { description: "Nested." }, (nested) => {
					nested.command("inside", { description: "Inside." }, async () => command({}));
				});
			});
		},
	);
}

test("app completion incrementally traverses aliases and uses only selected definitions", async () => {
	let handlers = 0;
	const requests: ClinkrCompletionProviderRequest[] = [];
	const app = completionApp({
		handler: () => (handlers += 1),
		provider: (request) => {
			requests.push(request);
			return [{ value: "three", type: "positional-value" }];
		},
	});

	expect(await app.complete({ words: [""] })).toEqual({
		candidates: [
			{ value: "choose", type: "command", description: "Choose." },
			{ value: "pick", type: "command", description: "Choose." },
			{ value: "raw", type: "command", description: "Raw." },
			{ value: "nested", type: "command", description: "Nested." },
		],
	});
	expect(
		(await app.complete({ words: ["secret", ""] })).candidates.map((entry) => entry.value),
	).toEqual(["one", "two"]);
	expect(
		(await app.complete({ words: ["pick", ""] })).candidates.map((entry) => entry.value),
	).toEqual(["one", "two", "three"]);
	expect(requests[0]).toEqual({
		words: ["pick", ""],
		current: "",
		previous: ["pick"],
		args: [],
		positionalIndex: 0,
		commandPath: ["choose"],
	});
	expect(handlers).toBe(0);
});

test("name completion stays definition-lazy while selected option, value, and provider completion load only selected commands", async () => {
	const loads = { alpha: 0, beta: 0 };
	let providers = 0;
	const app = createClinkrApp({ name: "probe", completion: {} }, (composition) => {
		composition.source({ label: "lazy" }, (root) => {
			for (const name of ["alpha", "beta"] as const) {
				root.command(name, { description: name }, () => {
					loads[name] += 1;
					return command({
						provider: () => {
							providers += 1;
							return [{ value: "one", type: "positional-value" }];
						},
					});
				});
			}
		});
	});

	expect((await app.complete({ words: [""] })).candidates.map(({ value }) => value)).toEqual([
		"alpha",
		"beta",
	]);
	expect(loads).toEqual({ alpha: 0, beta: 0 });
	expect((await app.complete({ words: ["alpha", "--"] })).candidates).toContainEqual({
		value: "--mode",
		type: "option",
	});
	expect(loads).toEqual({ alpha: 1, beta: 0 });
	expect(providers).toBe(0);
	// The provider duplicates a static value; deterministic first-wins dedupe preserves the static candidate.
	expect(await app.complete({ words: ["alpha", ""] })).toMatchObject({
		candidates: [
			{ value: "one", type: "positional-value" },
			{ value: "two", type: "positional-value" },
		],
	});
	expect(loads).toEqual({ alpha: 1, beta: 0 });
	expect(providers).toBe(1);
});

test("providers complete pending schema-derived option values with truthful request fields", async () => {
	let handlers = 0;
	const requests: ClinkrCompletionProviderRequest[] = [];
	const app = createClinkrApp({ name: "probe", completion: {} }, (composition) => {
		composition.source({ label: "option-provider" }, (root) => {
			root.command("checkout", { description: "Checkout." }, () =>
				defineCommand({
					schema: z.object({ branch: z.string() }),
					completionProvider: (request) => {
						requests.push(request);
						return [{ value: "main", type: "option-value" }];
					},
					handler: () => {
						handlers += 1;
						return ok();
					},
				}),
			);
		});
	});

	expect(await app.complete({ words: ["checkout", "--branch", "mai"] })).toEqual({
		candidates: [{ value: "main", type: "option-value" }],
	});
	expect(requests).toEqual([
		{
			words: ["checkout", "--branch", "mai"],
			current: "mai",
			previous: ["checkout", "--branch"],
			args: ["--branch"],
			positionalIndex: 0,
			commandPath: ["checkout"],
		},
	]);
	expect(handlers).toBe(0);
});

test("dedupe identity preserves the same value with different candidate types", async () => {
	const app = createClinkrApp({ name: "probe", completion: {} }, (composition) => {
		composition.source({ label: "types" }, (root) => {
			root.command("choose", { description: "Choose." }, () =>
				defineCommand({
					schema: z.object({
						name: cliPositional(z.enum(["same"]).optional(), { position: 0 }),
					}),
					completionProvider: () => [{ value: "same", type: "option-value" }],
					handler: () => ok(),
				}),
			);
		});
	});

	expect(await app.complete({ words: ["choose", ""] })).toEqual({
		candidates: [
			{ value: "same", type: "positional-value" },
			{ value: "same", type: "option-value" },
		],
	});
});

test("scope defaults augment children with schema and framework candidates", async () => {
	let defaultLoads = 0;
	let childLoads = 0;
	const app = createClinkrApp({ name: "probe", version: "1", completion: {} }, (composition) => {
		composition.source({ label: "defaults" }, (root) => {
			root.defaultCommand({ description: "Default." }, () => {
				defaultLoads += 1;
				return command({});
			});
			root.command("one", { description: "Child one." }, () => {
				childLoads += 1;
				return command({});
			});
		});
	});

	expect((await app.complete({ words: [""] })).candidates).toEqual([
		{ value: "one", type: "command", description: "Child one." },
		{ value: "one", type: "positional-value" },
		{ value: "two", type: "positional-value" },
	]);
	expect(defaultLoads).toBe(1);
	expect(childLoads).toBe(0);
	expect((await app.complete({ words: ["--"] })).candidates.map(({ value }) => value)).toEqual(
		expect.arrayContaining(["--mode", "--format", "--version"]),
	);
	expect(childLoads).toBe(0);
});

test("contextful completion validates context before providers and reports truthful call shapes", async () => {
	const context = { prefix: "ctx" };
	const provider = vi.fn((received: typeof context, request: ClinkrCompletionProviderRequest) => {
		expect(received).toBe(context);
		expect(request.commandPath).toEqual(["choose"]);
		throw new Error("provider boom");
	});
	const observer = vi.fn(
		(
			received: typeof context,
			failure: {
				readonly commandPath: readonly string[];
				readonly request: ClinkrCompletionProviderRequest;
			},
		) => {
			expect(received).toBe(context);
			expect(failure.commandPath).toEqual(["choose"]);
			expect(failure.request).toMatchObject({ current: "", commandPath: ["choose"] });
			throw new Error("observer boom");
		},
	);
	const app = createClinkrApp<typeof context>(
		{
			name: "probe",
			requiresContext: true,
			completion: { onProviderError: observer },
		},
		(composition) => {
			composition.source({ label: "context" }, (root) => {
				root.command("choose", { description: "Choose." }, () =>
					defineCommand({
						requiresContext: true,
						schema: z.object({
							name: cliPositional(z.enum(["one", "two"]).optional(), { position: 0 }),
						}),
						completionProvider: provider,
						handler: () => ok(),
					}),
				);
			});
		},
	);

	await expect(
		(app.complete as (request: unknown, options?: unknown) => unknown)({ words: ["choose", ""] }),
	).rejects.toThrow("requires run options with context");
	await expect(
		(app.complete as (request: unknown, options?: unknown) => unknown)(
			{ words: ["choose", ""] },
			{ context: undefined },
		),
	).rejects.toThrow("requires run options with context");
	expect(provider).not.toHaveBeenCalled();
	expect(observer).not.toHaveBeenCalled();
	const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	const result = await app.complete({ words: ["choose", ""] }, { context });
	expect(result.candidates.map(({ value }) => value)).toEqual(["one", "two"]);
	expect(provider).toHaveBeenCalledOnce();
	expect(observer).toHaveBeenCalledOnce();
	expect(stdout).not.toHaveBeenCalled();
	expect(stderr).not.toHaveBeenCalled();
});

test("completion rejects command and app context mode mismatches", async () => {
	const contextfulCommand = createClinkrApp({ name: "probe", completion: {} }, (composition) => {
		composition.source({ label: "mismatch" }, (root) => {
			root.command("choose", { description: "Choose." }, () =>
				defineCommand({
					requiresContext: true,
					schema: z.object({}),
					completionProvider: (_context: { readonly value: string }) => [],
					handler: () => ok(),
				}),
			);
		});
	});
	await expect(contextfulCommand.complete({ words: ["choose", ""] })).rejects.toThrow(
		"context mode does not match",
	);

	const contextFreeCommand = createClinkrApp<{ readonly value: string }>(
		{ name: "probe", requiresContext: true, completion: {} },
		(composition) => {
			composition.source({ label: "mismatch" }, (root) => {
				root.command("choose", { description: "Choose." }, () =>
					defineCommand({
						schema: z.object({}),
						completionProvider: () => [],
						handler: () => ok(),
					}),
				);
			});
		},
	);
	await expect(
		contextFreeCommand.complete({ words: ["choose", ""] }, { context: { value: "context" } }),
	).rejects.toThrow("context mode does not match");
});

test("structured flags and exact formats are completed, while raw tails have no flags", async () => {
	const app = completionApp();
	const flags = (await app.complete({ words: ["choose", "--"] })).candidates.map(
		(entry) => entry.value,
	);
	expect(flags).toEqual(
		expect.arrayContaining(["--mode", "--format", "--json-schema", "--input-json", "--help"]),
	);
	expect(
		(await app.complete({ words: ["choose", "--format", ""] })).candidates.map(
			(entry) => entry.value,
		),
	).toEqual(["human", "json", "markdown", "md"]);
	expect((await app.complete({ words: ["raw", "--"] })).candidates).toEqual([]);
});

test("provider failures preserve static candidates, notify once, and swallow observer failures", async () => {
	const failures: unknown[] = [];
	const app = completionApp({
		provider: () => {
			throw new Error("provider boom");
		},
		onProviderError: (failure) => {
			failures.push(failure);
			throw new Error("observer boom");
		},
	});
	const result = await app.complete({ words: ["choose", ""] });
	expect(result.candidates.map((entry) => entry.value)).toEqual(["one", "two"]);
	expect(failures).toHaveLength(1);
	expect(failures[0]).toMatchObject({ commandPath: ["choose"], request: { current: "" } });
});
