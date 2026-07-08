import { describe, expect, test } from "vitest";
import { z as zod } from "zod";

import {
	bundledArtifactDefinitionSchema,
	defineCommand,
	defineExtension,
	defineRawCommand,
	extensionDescriptorSchema,
	extensionPointDefinitionSchema,
	failure,
	machineEnvelopeSchema,
	negative,
	noopNsCommandIo,
	noopNsProgress,
	normalizeTextOutput,
	ok,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	usageError,
	validateExtensionDescriptor,
	validateLoadedCommandName,
	z,
} from "@nseng-ai/kernel/sdk";

const runtimeExports = {
	bundledArtifactDefinitionSchema,
	defineCommand,
	defineExtension,
	defineRawCommand,
	extensionDescriptorSchema,
	extensionPointDefinitionSchema,
	failure,
	machineEnvelopeSchema,
	negative,
	noopNsCommandIo,
	noopNsProgress,
	normalizeTextOutput,
	ok,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	usageError,
	validateExtensionDescriptor,
	validateLoadedCommandName,
	z,
} satisfies Record<string, unknown>;

const EXPECTED_RUNTIME_EXPORTS = [
	"bundledArtifactDefinitionSchema",
	"defineCommand",
	"defineExtension",
	"defineRawCommand",
	"extensionDescriptorSchema",
	"extensionPointDefinitionSchema",
	"failure",
	"machineEnvelopeSchema",
	"negative",
	"noopNsCommandIo",
	"noopNsProgress",
	"normalizeTextOutput",
	"ok",
	"stripOuterCodeFence",
	"trimOuterBlankLines",
	"truncateTextHead",
	"truncateTextHeadTail",
	"usageError",
	"validateExtensionDescriptor",
	"validateLoadedCommandName",
	"z",
] as const;

describe("@nseng-ai/kernel/sdk runtime exports", () => {
	test("exposes the intended runtime author surface", () => {
		expect(Object.keys(runtimeExports).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
	});

	test("provides result helpers, noop services, and the shared schema builder", () => {
		expect(ok("done")).toEqual({ type: "ok", data: "done", human: "done" });
		expect(ok({ done: true })).toEqual({ type: "ok", data: { done: true } });
		expect(failure("test-failed", "nope")).toEqual({
			type: "failure",
			errorType: "test-failed",
			message: "nope",
		});
		expect(() => noopNsCommandIo.phase("working")).not.toThrow();
		expect(() => noopNsProgress.phase({ type: "phase-started", phaseKey: "test" })).not.toThrow();
		expect(z).toBe(zod);
	});

	test("defineExtension preserves the extension object at runtime", () => {
		const extension = {};
		expect(defineExtension(extension)).toBe(extension);
	});
});
