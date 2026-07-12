import { expect, test } from "vitest";

import { createNsJiti } from "../../src/runtime/module-loader.ts";

function sortedKeys(value: object): string[] {
	return Object.keys(value).sort();
}

test("virtual SDK module mirrors SDK runtime value exports", async () => {
	const sdkModule = await import("@nseng-ai/sdk");
	const virtualModule = await createNsJiti().import<typeof sdkModule>("@nseng-ai/sdk");
	const sdkKeys = sortedKeys(sdkModule);

	expect(sortedKeys(virtualModule)).toEqual(sdkKeys);
	for (const key of sdkKeys) {
		const sdkKey = key as keyof typeof sdkModule;
		expect(virtualModule[sdkKey]).toBe(sdkModule[sdkKey]);
	}
});
