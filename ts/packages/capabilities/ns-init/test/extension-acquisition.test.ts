import { describe, expect, test } from "vitest";

import { npmPackageRoot } from "@nseng-ai/kernel/extensions/acquisition";
import { FakeExtensionAcquisitionGateway } from "@nseng-ai/kernel/testing";

import { RealExtensionInstallAcquisitionGateway } from "../src/extension-acquisition.ts";

describe("extension install acquisition", () => {
	test("ensure does not refresh an installed floating npm source", async () => {
		const packageRoot = npmPackageRoot("/repo", "@acme/tools");
		const acquisition = new FakeExtensionAcquisitionGateway({
			installedPackageRoots: [packageRoot],
		});
		const gateway = new RealExtensionInstallAcquisitionGateway(acquisition);

		const result = await gateway.ensure({
			repoRoot: "/repo",
			sourceSpec: "npm:@acme/tools",
		});

		expect(result).toEqual({ ok: true, sourceKind: "npm", moduleRoot: packageRoot });
		expect(acquisition.installs).toEqual([]);
	});
});
