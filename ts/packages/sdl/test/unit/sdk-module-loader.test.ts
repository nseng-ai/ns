import { expect, test } from "vitest";

import * as sdkModule from "../../src/sdk.ts";
import { createSdlJiti } from "../../src/sdk-module-loader.ts";

type SdkRuntimeModule = typeof sdkModule;

function sortedKeys(value: object): string[] {
	return Object.keys(value).sort();
}

test("virtual SDK module mirrors sdk.ts runtime value exports", async () => {
	const virtualModule = await createSdlJiti().import<SdkRuntimeModule>("@asdl/sdl/sdk");
	const sdkKeys = sortedKeys(sdkModule);

	expect(sortedKeys(virtualModule)).toEqual(sdkKeys);
	for (const key of sdkKeys) {
		const sdkKey = key as keyof SdkRuntimeModule;
		expect(virtualModule[sdkKey]).toBe(sdkModule[sdkKey]);
	}
});
