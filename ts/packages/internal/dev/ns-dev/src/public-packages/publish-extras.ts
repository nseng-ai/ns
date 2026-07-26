import { isAbsolute, relative, resolve, sep } from "node:path";

import { isNodeErrorCode, isRecord } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { realFileSystemGateway, type FileSystemGateway } from "../context.ts";
import { copyTree } from "./files.ts";

const canonicalNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const publishExtraSchema = z.strictObject({
	kind: z.literal("skill"),
	name: z.string().regex(canonicalNamePattern),
	sourcePath: z.string(),
	publishPath: z.string(),
});

export type PublishExtraManifestEntry = z.output<typeof publishExtraSchema>;
export interface ValidatedPublishExtra extends PublishExtraManifestEntry {
	readonly sourceAbsolutePath: string;
	readonly publishAbsolutePath: string;
}

export async function validatePublishExtras(
	options: {
		readonly manifest: unknown;
		readonly sourceRoot: string;
		readonly publishRoot: string;
	},
	fs: FileSystemGateway = realFileSystemGateway,
): Promise<ValidatedPublishExtra[]> {
	const rawExtras =
		isRecord(options.manifest) && isRecord(options.manifest.ns)
			? options.manifest.ns.publishExtras
			: undefined;
	if (rawExtras === undefined) return [];
	if (!Array.isArray(rawExtras)) throw new Error("ns.publishExtras must be an array.");

	const canonicalSourceRoot = await fs.realpath(options.sourceRoot);
	const destinations = new Set<string>();
	const names = new Set<string>();
	const extras: ValidatedPublishExtra[] = [];
	for (const [index, value] of rawExtras.entries()) {
		const label = `ns.publishExtras[${index}]`;
		if (!isRecord(value)) throw new Error(`${label} must be an object.`);
		if (value.kind !== "skill")
			throw new Error(`${label}.kind must be the supported kind "skill".`);
		if (typeof value.name !== "string" || !canonicalNamePattern.test(value.name))
			throw new Error(`${label}.name must be a nonempty canonical kebab-case name.`);
		const decoded = publishExtraSchema.safeParse(value);
		if (!decoded.success)
			throw new Error(
				`${label} is invalid: ${decoded.error.issues[0]?.message ?? "invalid value"}.`,
			);
		const rawExtra = decoded.data;
		const sourcePath = validateRelativePath(rawExtra.sourcePath, `${label}.sourcePath`);
		const publishPath = validateRelativePath(rawExtra.publishPath, `${label}.publishPath`);
		if (names.has(rawExtra.name))
			throw new Error(`Duplicate publish extra name ${JSON.stringify(rawExtra.name)}.`);
		if (destinations.has(publishPath))
			throw new Error(`Duplicate publish extra destination ${JSON.stringify(publishPath)}.`);
		names.add(rawExtra.name);
		destinations.add(publishPath);

		const sourceAbsolutePath = resolve(canonicalSourceRoot, sourcePath);
		assertContained(canonicalSourceRoot, sourceAbsolutePath, `${label}.sourcePath`);
		let canonicalSourcePath: string;
		try {
			canonicalSourcePath = await fs.realpath(sourceAbsolutePath);
		} catch (error: unknown) {
			if (isNodeErrorCode(error, "ENOENT"))
				throw new Error(`${label} source does not exist: ${sourcePath}.`);
			throw error;
		}
		assertContained(canonicalSourceRoot, canonicalSourcePath, `${label}.sourcePath`);
		if (!(await fs.isDirectory(canonicalSourcePath)))
			throw new Error(`${label} skill source must be a directory: ${sourcePath}.`);
		await assertNoSymlinks(fs, canonicalSourcePath, label);
		const sourceName = await readSkillName(fs, canonicalSourcePath, label);
		if (sourceName !== rawExtra.name)
			throw new Error(
				`${label} SKILL.md frontmatter name ${JSON.stringify(sourceName)} does not equal declared name ${JSON.stringify(rawExtra.name)}.`,
			);

		const publishAbsolutePath = resolve(options.publishRoot, publishPath);
		assertContained(resolve(options.publishRoot), publishAbsolutePath, `${label}.publishPath`);
		extras.push({
			...rawExtra,
			sourcePath,
			publishPath,
			sourceAbsolutePath: canonicalSourcePath,
			publishAbsolutePath,
		});
	}
	return extras;
}

export async function copyPublishExtras(
	extras: readonly ValidatedPublishExtra[],
	fs: FileSystemGateway = realFileSystemGateway,
): Promise<void> {
	for (const extra of extras)
		await copyTree(fs, extra.sourceAbsolutePath, extra.publishAbsolutePath);
	const declaredNames = extras.map((extra) => extra.name).sort();
	const sourceNames = await Promise.all(
		extras.map((extra) =>
			readSkillName(fs, extra.sourceAbsolutePath, `source ${extra.sourcePath}`),
		),
	);
	const generatedNames = await Promise.all(
		extras.map((extra) =>
			readSkillName(fs, extra.publishAbsolutePath, `generated ${extra.publishPath}`),
		),
	);
	assertExactSet(sourceNames, declaredNames, "source");
	assertExactSet(generatedNames, declaredNames, "generated");
}

export function filesWithPublishExtras(
	files: readonly string[],
	extras: readonly ValidatedPublishExtra[],
): string[] {
	const result = [...files];
	const seen = new Set(result);
	for (const extra of extras) {
		const topLevelPath = extra.publishPath.split("/")[0];
		if (topLevelPath !== undefined && !seen.has(topLevelPath)) {
			seen.add(topLevelPath);
			result.push(topLevelPath);
		}
	}
	return result;
}

export function publishExtrasManifestMetadata(extras: readonly ValidatedPublishExtra[]): {
	readonly ns?: { readonly publishExtras: readonly PublishExtraManifestEntry[] };
} {
	if (extras.length === 0) return {};
	return {
		ns: {
			publishExtras: extras.map(({ kind, name, sourcePath, publishPath }) => ({
				kind,
				name,
				sourcePath,
				publishPath,
			})),
		},
	};
}

function validateRelativePath(value: string, label: string): string {
	if (value === "" || value.includes("\\") || isAbsolute(value) || /^[A-Za-z]:/u.test(value))
		throw new Error(`${label} must be a nonempty portable relative path.`);
	if (value.split("/").some((segment) => segment === "" || segment === "." || segment === ".."))
		throw new Error(`${label} must not contain empty, dot, or traversal segments.`);
	return value;
}

function assertContained(root: string, candidate: string, label: string): void {
	const pathFromRoot = relative(root, candidate);
	if (
		pathFromRoot === "" ||
		(!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
	)
		return;
	throw new Error(`${label} resolves outside its allowed root.`);
}

async function assertNoSymlinks(fs: FileSystemGateway, root: string, label: string): Promise<void> {
	for (const entry of await fs.readDir(root)) {
		const path = resolve(root, entry.name);
		if (entry.isSymbolicLink)
			throw new Error(`${label} skill source must not contain symbolic links.`);
		if (entry.isDirectory) await assertNoSymlinks(fs, path, label);
	}
}

async function readSkillName(fs: FileSystemGateway, root: string, label: string): Promise<string> {
	let source: string;
	try {
		source = await fs.readText(resolve(root, "SKILL.md"));
	} catch (error: unknown) {
		if (isNodeErrorCode(error, "ENOENT"))
			throw new Error(`${label} skill source is missing SKILL.md.`);
		throw error;
	}
	const lines = source.split(/\r?\n/u);
	if (lines[0] !== "---") throw new Error(`${label} SKILL.md must start with frontmatter.`);
	const closingIndex = lines.indexOf("---", 1);
	if (closingIndex < 0) throw new Error(`${label} SKILL.md frontmatter is not closed.`);
	const names = lines
		.slice(1, closingIndex)
		.flatMap((line) => /^name:\s*(.*?)\s*$/u.exec(line)?.[1] ?? []);
	if (names.length !== 1 || !canonicalNamePattern.test(names[0] ?? ""))
		throw new Error(`${label} SKILL.md must contain one canonical frontmatter name.`);
	return names[0] ?? "";
}

function assertExactSet(
	actual: readonly string[],
	expected: readonly string[],
	label: string,
): void {
	if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort()))
		throw new Error(
			`${label} publish extra set mismatch. Expected ${expected.join(", ")}; got ${actual.join(", ")}.`,
		);
}
