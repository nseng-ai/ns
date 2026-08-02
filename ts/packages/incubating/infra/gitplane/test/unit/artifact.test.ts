import { describe, expect, test } from "vitest";
import {
	parseArtifactId,
	parseArtifactMarker,
	validateClassificationTransition,
} from "@nseng-ai/gitplane";
const ID = "01jxyz8y3jqazj7jrx53w9b3dn";
describe("artifact marker", () => {
	test("accepts canonical IDs and rejects non-canonical forms", () => {
		expect(parseArtifactId(ID).ok).toBe(true);
		for (const value of [ID.toUpperCase(), `81${ID.slice(2)}`, ID.replace("j", "i"), ID.slice(1)])
			expect(parseArtifactId(value).ok).toBe(false);
	});
	test("parses generic and classified markers", () => {
		expect(parseArtifactMarker({ gpId: ID })).toMatchObject({
			ok: true,
			marker: { classification: { state: "generic" } },
		});
		expect(
			parseArtifactMarker({ gpId: ID, gpApiVersion: "a/v1", gpKind: "K", gpSchemaVersion: 1 }),
		).toMatchObject({ ok: true, marker: { classification: { state: "classified" } } });
	});
	test("rejects every partial classification", () => {
		for (const value of [
			{ gpId: ID, gpKind: "K" },
			{ gpId: ID, gpApiVersion: "a" },
			{ gpId: ID, gpSchemaVersion: 1 },
			{ gpId: ID, gpKind: "K", gpApiVersion: "a" },
		])
			expect(parseArtifactMarker(value).ok).toBe(false);
	});
	test("enforces one-way immutable classification", () => {
		const generic = { state: "generic" } as const;
		const classified = {
			state: "classified",
			apiVersion: "a",
			kind: "K",
			schemaVersion: 1,
		} as const;
		expect(validateClassificationTransition(generic, classified)).toEqual({ ok: true });
		expect(validateClassificationTransition(classified, generic)).toEqual({
			ok: false,
			code: "classification-removed",
		});
		expect(validateClassificationTransition(classified, { ...classified, kind: "Other" })).toEqual({
			ok: false,
			code: "classification-changed",
		});
	});
});
