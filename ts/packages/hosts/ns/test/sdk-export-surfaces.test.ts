import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const tsRoot = resolve(packageRoot, "../../..");

interface SdkExportSurface {
	readonly name: string;
	readonly host: string;
	readonly sdk: string;
}

async function sdkExportSurfaces(): Promise<readonly SdkExportSurface[]> {
	const content = await readFile(resolve(packageRoot, "scripts/sdk-export-entries.json"), "utf8");
	const parsed: unknown = JSON.parse(content);
	if (!isRecord(parsed)) {
		throw new Error("Expected sdk export entries to be an object.");
	}
	return Object.entries(parsed).map(([entry, spec]) => {
		if (!isRecord(spec)) {
			throw new Error(`Expected sdk export entry ${entry} to be an object.`);
		}
		const { host, sdk } = spec;
		if (typeof host !== "string" || typeof sdk !== "string") {
			throw new Error(`Expected sdk export entry ${entry} to declare host and sdk paths.`);
		}
		return { name: entry.replace(/^sdk\//, ""), host, sdk };
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exportedNames(path: string): Promise<readonly string[]> {
	const content = await readFile(path, "utf8");
	return [...declaredExportNames(content), ...namedReExportNames(content)].sort();
}

function declaredExportNames(content: string): string[] {
	return [
		...content.matchAll(
			/export\s+(?:async\s+)?(?:class|function|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
		),
	].map((match) => match[1] ?? "");
}

function namedReExportNames(content: string): string[] {
	return [
		...content.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["'][^"']+["']/g),
	].flatMap((match) => exportListNames(match[1] ?? ""));
}

function exportListNames(list: string): string[] {
	return list
		.replaceAll(/\/\*[\s\S]*?\*\//g, "")
		.split(",")
		.map((entry) => entry.replaceAll(/\/\/.*$/g, "").trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => entry.replace(/^type\s+/, "").split(/\s+as\s+/)[1] ?? entry);
}

describe("ns SDK export surfaces", () => {
	test("keeps checkout-free sdk barrels exhaustive with sdk export surfaces", async () => {
		for (const surface of await sdkExportSurfaces()) {
			const hostExports = await exportedNames(resolve(packageRoot, surface.host));
			const sdkExports = await exportedNames(resolve(tsRoot, "packages", surface.sdk));
			expect(hostExports, `${surface.name} host exports`).toEqual(sdkExports);
		}
	});
});
