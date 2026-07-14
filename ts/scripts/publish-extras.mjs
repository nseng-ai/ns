import { cp, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const canonicalNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Decode and validate the package-owned publish extras before any generated-root writes occur.
 */
export async function validatePublishExtras({ manifest, sourceRoot, publishRoot }) {
	const rawExtras = manifest.ns?.publishExtras;
	if (rawExtras === undefined) return [];
	if (!Array.isArray(rawExtras)) throw new Error("ns.publishExtras must be an array.");

	const canonicalSourceRoot = await realpath(sourceRoot);
	const destinations = new Set();
	const names = new Set();
	const extras = [];

	for (const [index, rawExtra] of rawExtras.entries()) {
		const label = `ns.publishExtras[${index}]`;
		if (rawExtra === null || typeof rawExtra !== "object" || Array.isArray(rawExtra)) {
			throw new Error(`${label} must be an object.`);
		}
		const keys = Object.keys(rawExtra);
		for (const key of keys) {
			if (!["kind", "name", "sourcePath", "publishPath"].includes(key)) {
				throw new Error(`${label} contains unsupported property ${JSON.stringify(key)}.`);
			}
		}
		if (rawExtra.kind !== "skill") {
			throw new Error(`${label}.kind must be the supported kind "skill".`);
		}
		if (typeof rawExtra.name !== "string" || !canonicalNamePattern.test(rawExtra.name)) {
			throw new Error(`${label}.name must be a nonempty canonical kebab-case name.`);
		}
		const sourcePath = validateRelativePath(rawExtra.sourcePath, `${label}.sourcePath`);
		const publishPath = validateRelativePath(rawExtra.publishPath, `${label}.publishPath`);
		if (names.has(rawExtra.name)) throw new Error(`Duplicate publish extra name ${JSON.stringify(rawExtra.name)}.`);
		if (destinations.has(publishPath)) throw new Error(`Duplicate publish extra destination ${JSON.stringify(publishPath)}.`);
		names.add(rawExtra.name);
		destinations.add(publishPath);

		const sourceAbsolutePath = resolve(canonicalSourceRoot, sourcePath);
		assertContained(canonicalSourceRoot, sourceAbsolutePath, `${label}.sourcePath`);
		let canonicalSourcePath;
		try {
			canonicalSourcePath = await realpath(sourceAbsolutePath);
		} catch (error) {
			if (error?.code === "ENOENT") throw new Error(`${label} source does not exist: ${sourcePath}.`);
			throw error;
		}
		assertContained(canonicalSourceRoot, canonicalSourcePath, `${label}.sourcePath`);
		const sourceStat = await lstat(canonicalSourcePath);
		if (!sourceStat.isDirectory()) throw new Error(`${label} skill source must be a directory: ${sourcePath}.`);
		await assertNoSymlinks(canonicalSourcePath, label);
		const sourceName = await readSkillName(canonicalSourcePath, label);
		if (sourceName !== rawExtra.name) {
			throw new Error(`${label} SKILL.md frontmatter name ${JSON.stringify(sourceName)} does not equal declared name ${JSON.stringify(rawExtra.name)}.`);
		}

		const publishAbsolutePath = resolve(publishRoot, publishPath);
		assertContained(resolve(publishRoot), publishAbsolutePath, `${label}.publishPath`);
		extras.push({
			kind: "skill",
			name: rawExtra.name,
			sourcePath,
			publishPath,
			sourceAbsolutePath: canonicalSourcePath,
			publishAbsolutePath,
		});
	}
	return extras;
}

export async function copyPublishExtras(extras) {
	for (const extra of extras) {
		await cp(extra.sourceAbsolutePath, extra.publishAbsolutePath, { recursive: true });
	}
	const declaredNames = extras.map((extra) => extra.name).sort();
	const sourceNames = [];
	const generatedNames = [];
	for (const extra of extras) {
		sourceNames.push(await readSkillName(extra.sourceAbsolutePath, `source ${extra.sourcePath}`));
		generatedNames.push(await readSkillName(extra.publishAbsolutePath, `generated ${extra.publishPath}`));
	}
	assertExactSet(sourceNames, declaredNames, "source");
	assertExactSet(generatedNames, declaredNames, "generated");
}

export function filesWithPublishExtras(files, extras) {
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

export function publishExtrasManifestMetadata(extras) {
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

function validateRelativePath(value, label) {
	if (
		typeof value !== "string" ||
		value === "" ||
		value.includes("\\") ||
		isAbsolute(value) ||
		/^[A-Za-z]:/u.test(value)
	) {
		throw new Error(`${label} must be a nonempty portable relative path.`);
	}
	const segments = value.split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
		throw new Error(`${label} must not contain empty, dot, or traversal segments.`);
	}
	return value;
}

function assertContained(root, candidate, label) {
	const pathFromRoot = relative(root, candidate);
	if (pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))) return;
	throw new Error(`${label} resolves outside its allowed root.`);
}

async function assertNoSymlinks(root, label) {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = resolve(root, entry.name);
		if (entry.isSymbolicLink()) throw new Error(`${label} skill source must not contain symbolic links.`);
		if (entry.isDirectory()) await assertNoSymlinks(path, label);
	}
}

async function readSkillName(root, label) {
	let source;
	try {
		source = await readFile(resolve(root, "SKILL.md"), "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") throw new Error(`${label} skill source is missing SKILL.md.`);
		throw error;
	}
	const lines = source.split(/\r?\n/u);
	if (lines[0] !== "---") throw new Error(`${label} SKILL.md must start with frontmatter.`);
	const closingIndex = lines.indexOf("---", 1);
	if (closingIndex < 0) throw new Error(`${label} SKILL.md frontmatter is not closed.`);
	const names = lines.slice(1, closingIndex).flatMap((line) => {
		const match = /^name:\s*(.*?)\s*$/u.exec(line);
		return match?.[1] === undefined ? [] : [match[1]];
	});
	if (names.length !== 1 || !canonicalNamePattern.test(names[0] ?? "")) {
		throw new Error(`${label} SKILL.md must contain one canonical frontmatter name.`);
	}
	return names[0];
}

function assertExactSet(actual, expected, label) {
	const sorted = [...actual].sort();
	if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
		throw new Error(`${label} publish extra set mismatch. Expected ${expected.join(", ")}; got ${sorted.join(", ")}.`);
	}
}
