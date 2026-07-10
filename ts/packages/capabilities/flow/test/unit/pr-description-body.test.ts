import { describe, expect, test } from "vitest";

import {
	buildFingerprint,
	decidePrBodyUpdate,
	formatManagedGeneratedRegion,
	prewrittenMetadataMatches,
} from "../../src/submit/pr-description-body.ts";

const FINGERPRINT = buildFingerprint({ patchId: "patch-1", promptText: "prompt" });

describe("decidePrBodyUpdate", () => {
	test("skips a matching fingerprint under the skip-current policy", () => {
		expect(
			decidePrBodyUpdate({
				existingBody: formatManagedGeneratedRegion("Generated body", FINGERPRINT),
				fingerprint: FINGERPRINT,
				policy: "skip-current",
			}),
		).toEqual({ type: "skip" });
	});

	test("regenerates a missing fingerprint with the existing reason", () => {
		expect(
			decidePrBodyUpdate({
				existingBody: "Human body",
				fingerprint: FINGERPRINT,
				policy: "skip-current",
			}),
		).toEqual({ type: "regenerate", reason: "no generated fingerprint found" });
	});

	test("regenerates a malformed fingerprint with the existing reason", () => {
		expect(
			decidePrBodyUpdate({
				existingBody: "<!-- ns-pr-description:begin",
				fingerprint: FINGERPRINT,
				policy: "skip-current",
			}),
		).toEqual({ type: "regenerate", reason: "generated fingerprint is malformed" });
	});

	test("regenerates a changed fingerprint with the existing reason", () => {
		const previous = buildFingerprint({ patchId: "patch-0", promptText: "prompt" });

		expect(
			decidePrBodyUpdate({
				existingBody: formatManagedGeneratedRegion("Generated body", previous),
				fingerprint: FINGERPRINT,
				policy: "skip-current",
			}),
		).toEqual({ type: "regenerate", reason: "generated fingerprint changed" });
	});

	test("force-regenerates a matching fingerprint with the existing found-region reason", () => {
		expect(
			decidePrBodyUpdate({
				existingBody: formatManagedGeneratedRegion("Generated body", FINGERPRINT),
				fingerprint: FINGERPRINT,
				policy: "force",
			}),
		).toEqual({ type: "regenerate", reason: "generated fingerprint changed" });
	});
});

describe("prewrittenMetadataMatches", () => {
	test("matches prewritten metadata after trimming title and body", () => {
		expect(
			prewrittenMetadataMatches(" Prepared title ", "Prepared body\n", {
				title: "Prepared title",
				body: " Prepared body ",
			}),
		).toBe(true);
	});

	test("rejects mismatched prewritten metadata", () => {
		expect(
			prewrittenMetadataMatches("Different title", "Prepared body", {
				title: "Prepared title",
				body: "Prepared body",
			}),
		).toBe(false);
	});
});
