import { describe, expect, test } from "vitest";

import { mergeManagedPublicationRegion } from "../../../src/publication/managed-publication-region.ts";

const FLOW_REGION = [
	"<!-- ns-pr-description:begin version=2 patch-id=a prompt=b generator=c -->",
	"Flow content",
	"<!-- ns-pr-description:end -->",
].join("\n");

function managedRegion(identity: string) {
	return {
		beginPrefix: "<!-- ns-consumer-publication:begin identity=",
		end: "<!-- ns-consumer-publication:end -->",
		identity,
	};
}

function region(identity: string, body: string): string {
	return [
		`<!-- ns-consumer-publication:begin identity=${identity} -->`,
		body,
		"<!-- ns-consumer-publication:end -->",
	].join("\n");
}

describe("mergeManagedPublicationRegion", () => {
	test("appends after existing prose and Flow's managed region without changing either", () => {
		const existingBody = `Human prose\n\n${FLOW_REGION}\n`;
		expect(
			mergeManagedPublicationRegion({
				existingBody,
				region: managedRegion("consumer-key/v1"),
				managedBody: "## Caller facts\n\nNew facts\n",
			}),
		).toEqual({
			type: "merged",
			body: `${existingBody}\n${region("consumer-key/v1", "## Caller facts\n\nNew facts")}`,
		});
	});

	test("replaces only the complete matching region idempotently", () => {
		const existingBody = `Before  \n${region("consumer-key/v1", "Old")}\n  After`;
		const once = mergeManagedPublicationRegion({
			existingBody,
			region: managedRegion("consumer-key/v1"),
			managedBody: "New",
		});
		expect(once).toEqual({
			type: "merged",
			body: `Before  \n${region("consumer-key/v1", "New")}\n  After`,
		});
		if (once.type !== "merged") throw new Error("expected merged region");
		expect(
			mergeManagedPublicationRegion({
				existingBody: once.body,
				region: managedRegion("consumer-key/v1"),
				managedBody: "New",
			}),
		).toEqual(once);
	});

	test("accepts opaque identities and refuses unsafe, malformed, and foreign regions", () => {
		expect(
			mergeManagedPublicationRegion({
				existingBody: "Human prose",
				region: managedRegion("demo -->\nInjected"),
				managedBody: "New",
			}),
		).toMatchObject({ type: "refused", reason: "invalid-managed-region" });
		expect(
			mergeManagedPublicationRegion({
				existingBody: "<!-- ns-consumer-publication:begin identity=consumer-key/v1 -->\nBody",
				region: managedRegion("consumer-key/v1"),
				managedBody: "New",
			}),
		).toMatchObject({ type: "refused", reason: "malformed-region" });
		expect(
			mergeManagedPublicationRegion({
				existingBody: region("other-objective", "Body"),
				region: managedRegion("consumer-key/v1"),
				managedBody: "New",
			}),
		).toMatchObject({ type: "refused", reason: "foreign-managed-region" });
	});
});
