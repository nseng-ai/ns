import path from "node:path";

import { describe, expect, test } from "vitest";

import {
	defineCommand,
	defineExtension,
	defineRawCommand,
	failure,
	negative,
	ok,
	usageError,
	validateExtensionDescriptor,
	z,
	type NsRawCommandDefinition,
	type NsRawCommandOptions,
} from "@nseng-ai/sdk";

describe("modern ns extension author API", () => {
	test("accepts absolute filesystem command directories", () => {
		const commandDirectory = path.join(import.meta.dirname, "fixtures", "commands");
		const descriptor = defineExtension({
			description: "Filesystem commands.",
			commandDirectory,
		});

		expect(validateExtensionDescriptor(descriptor)).toEqual({
			ok: true,
			descriptor: { description: "Filesystem commands.", commandDirectory },
		});
	});

	test("accepts commandless descriptors and rejects relative command directories", () => {
		expect(validateExtensionDescriptor({ description: "Activation only." })).toEqual({
			ok: true,
			descriptor: { description: "Activation only." },
		});
		expect(
			validateExtensionDescriptor({ description: "Bad.", commandDirectory: "commands" }),
		).toEqual({ ok: false, message: expect.stringContaining("commandDirectory") });
	});

	test("does not expose recursive entries, routes, or direct command definitions", () => {
		for (const staleField of ["entries", "routes", "commands"] as const) {
			expect(validateExtensionDescriptor({ description: "Bad.", [staleField]: [] })).toEqual({
				ok: false,
				message: expect.stringContaining(staleField),
			});
		}
	});

	test("preserves activation, points, and bundled artifacts", () => {
		const descriptor = {
			description: "Complete metadata.",
			points: [{ id: "submit.pre", accepts: "hook", cardinality: "many" }],
			activation: {
				instructions: "## Example\n\nFollow this instruction.",
				consumerDirs: [".ns/example"],
			},
			bundledArtifacts: [{ kind: "skill", name: "example", path: "./skills/example" }],
		} as const;
		expect(validateExtensionDescriptor(descriptor)).toEqual({ ok: true, descriptor });
	});

	test("defineCommand returns a modern structured definition", async () => {
		const command = defineCommand({
			schema: z.object({ name: z.string() }),
			resultSchema: z.object({ greeting: z.string() }),
			handler: async (_context, request) => ok({ greeting: `hello ${request.name}` }),
		});

		expect(command.requiresContext).toBe(true);
		await expect(command.handler({} as never, { name: "ns" })).resolves.toEqual({
			status: "success",
			data: { greeting: "hello ns" },
		});
	});

	test("defineRawCommand keeps truthful raw options and definition names", () => {
		const outputBytes: Uint8Array[] = [];
		const output = {
			writeStdout: (bytes: Uint8Array) => outputBytes.push(bytes),
			writeStderr: () => {},
		};
		const options: Omit<NsRawCommandOptions, "requiresContext"> = {
			run: ({ context, argv, output: invocationOutput }) => {
				invocationOutput.writeStdout(new TextEncoder().encode("raw"));
				return context.cwd === "/repo" && argv[0] === "tail" ? 0 : 1;
			},
		};
		const command: NsRawCommandDefinition = defineRawCommand(options);
		expect(command).toMatchObject({ type: "raw", requiresContext: true });
		expect(command.run({ context: { cwd: "/repo" } as never, argv: ["tail"], output })).toBe(0);
		expect(new TextDecoder().decode(outputBytes[0])).toBe("raw");
	});

	test("exports modern outcomes", () => {
		expect(ok("done")).toEqual({ status: "success", data: "done" });
		expect(negative("not found")).toEqual({ status: "negative", message: "not found" });
		expect(failure("failed", "nope")).toEqual({
			status: "failure",
			errorType: "failed",
			message: "nope",
		});
		expect(usageError("bad input")).toEqual({
			status: "usage-error",
			errorType: "usage-error",
			message: "bad input",
		});
	});
});
