import { describe, expect, test } from "vitest";

import { checkPackageName } from "../../src/check.ts";
import { availableResult, type RegistryCheckResult } from "../../src/models.ts";
import type { PackageRegistryGateway } from "../../src/registry-gateways.ts";

const SAMPLE = "sample-name";

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	if (resolve === undefined) throw new Error("deferred resolver was not initialized");
	return { promise, resolve };
}

describe("checkPackageName", () => {
	test("starts registry checks concurrently and preserves requested result order", async () => {
		const events: string[] = [];
		const pypi = createDeferred<RegistryCheckResult>();
		const npm = createDeferred<RegistryCheckResult>();
		const brew = createDeferred<RegistryCheckResult>();
		const gateway: PackageRegistryGateway = {
			checkPypi: (packageName) => {
				events.push(`pypi:start:${packageName}`);
				return pypi.promise;
			},
			checkNpm: (packageName) => {
				events.push(`npm:start:${packageName}`);
				return npm.promise;
			},
			checkBrew: (packageName) => {
				events.push(`brew:start:${packageName}`);
				return brew.promise;
			},
		};

		const reportPromise = checkPackageName({
			packageName: SAMPLE,
			registries: ["pypi", "npm", "brew"],
			registryGateway: gateway,
		});
		await Promise.resolve();

		expect(events).toEqual([`pypi:start:${SAMPLE}`, `npm:start:${SAMPLE}`, `brew:start:${SAMPLE}`]);

		npm.resolve(availableResult("npm", { inputName: SAMPLE, lookupName: SAMPLE }));
		brew.resolve(availableResult("brew", { inputName: SAMPLE, lookupName: SAMPLE }));
		pypi.resolve(availableResult("pypi", { inputName: SAMPLE, lookupName: SAMPLE }));

		const report = await reportPromise;
		expect(report.results.map((result) => result.registry)).toEqual(["pypi", "npm", "brew"]);
	});
});
