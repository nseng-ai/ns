import { join } from "node:path";

import { z } from "zod";

import {
	isValidObjectiveOwner,
	isValidObjectiveSlug,
	renderObjectiveLocator,
	type ObjectiveLocator,
} from "./identity.ts";
import {
	splitObjectiveRecordDocument,
	type ObjectiveRecordDocument,
} from "./record-frontmatter.ts";

export const ACTIVE_OBJECTIVE_ROOT = ".ns/objectives";

export type ObjectiveRecordStatus = "open" | "closed";

/**
 * Storage layout of a discovered record. Canonical records are owner-nested
 * (`.ns/objectives/<owner>/<slug>/`); flat directories directly under the root
 * are tolerated only while closed (`legacy-flat-closed`), with their owner
 * read from Record Frontmatter.
 */
export type ObjectiveRecordLayout = "owner-nested" | "legacy-flat-closed";

export const objectiveRecordLayoutSchema = z.enum(["owner-nested", "legacy-flat-closed"]);

/** One discovered Objective record: identity plus concrete path facts. */
export interface ObjectiveRecordLocation {
	owner: string;
	slug: string;
	/** Canonical rendered locator `<owner>/<slug>`. */
	locator: string;
	recordRelativePath: string;
	layout: ObjectiveRecordLayout;
	status: ObjectiveRecordStatus;
}

export const objectiveRecordLocationSchema = z.object({
	owner: z.string(),
	slug: z.string(),
	locator: z.string(),
	recordRelativePath: z.string(),
	layout: objectiveRecordLayoutSchema,
	status: z.enum(["open", "closed"]),
});

/** A structural hygiene problem discovered under the Active Objective Root. */
export interface ObjectiveStructuralFinding {
	path: string;
	message: string;
}

export const objectiveStructuralFindingSchema = z.object({
	path: z.string(),
	message: z.string(),
});

export interface ObjectiveFiles {
	objectiveMd: boolean;
	roadmapMd: boolean;
	updatesDir: boolean;
	closedMd: boolean;
}

export const objectiveFilesSchema = z.object({
	objectiveMd: z.boolean(),
	roadmapMd: z.boolean(),
	updatesDir: z.boolean(),
	closedMd: z.boolean(),
});

export interface ObjectiveUpdateFile {
	name: string;
	path: string;
}

export const objectiveUpdateFileSchema = z.object({
	name: z.string(),
	path: z.string(),
});

export interface ObjectiveCheckoutInventory {
	records: readonly ObjectiveRecordLocation[];
	findings: readonly ObjectiveStructuralFinding[];
}

export type ObjectivePathKind = "missing" | "file" | "directory" | "other";

export interface ObjectiveDirectoryEntry {
	name: string;
	kind: ObjectivePathKind;
}

export interface ObjectiveStorageError {
	code: string;
	message: string;
}

export type ObjectiveStorageResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: ObjectiveStorageError };

export const objectiveMarkdownReadResultSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("missing") }),
	z.object({ type: z.literal("ok"), content: z.string() }),
	z.object({ type: z.literal("unreadable"), message: z.string() }),
]);

export type ObjectiveMarkdownReadResult = z.infer<typeof objectiveMarkdownReadResultSchema>;

type ObjectiveMarkdownNonOkReadResult = Exclude<ObjectiveMarkdownReadResult, { type: "ok" }>;
type ObjectiveMarkdownOkReadResult = Extract<ObjectiveMarkdownReadResult, { type: "ok" }>;

export type ObjectiveRecordDocumentReadResult =
	| ObjectiveMarkdownNonOkReadResult
	| (ObjectiveMarkdownOkReadResult & { document: ObjectiveRecordDocument });

export interface ObjectiveStorageGateway {
	pathKind(relativePath: string): Promise<ObjectiveStorageResult<ObjectivePathKind>>;
	listDirectory(
		relativePath: string,
	): Promise<ObjectiveStorageResult<readonly ObjectiveDirectoryEntry[]>>;
	readTextFile(relativePath: string): Promise<ObjectiveMarkdownReadResult>;
}

const RECORD_MARKER_ENTRIES = ["objective.md", "roadmap.md", "closed.md", "updates"] as const;

export class ObjectiveStorage {
	private readonly gateway: ObjectiveStorageGateway;

	constructor(gateway: ObjectiveStorageGateway) {
		this.gateway = gateway;
	}

	async pathKind(relativePath: string): Promise<ObjectiveStorageResult<ObjectivePathKind>> {
		return await this.gateway.pathKind(relativePath);
	}

	async activeRootExists(): Promise<ObjectiveStorageResult<boolean>> {
		const kind = await this.gateway.pathKind(activeRootRelativePath());
		if (!kind.ok) return kind;
		return { ok: true, value: kind.value !== "missing" };
	}

	/**
	 * Discover every Objective record under the Active Objective Root by
	 * structural inspection: canonical `owner/slug` directories plus tolerated
	 * legacy flat closed directories (owner read from Record Frontmatter).
	 * Malformed entries are never silently hidden; they surface as findings.
	 */
	async checkoutInventory(): Promise<ObjectiveStorageResult<ObjectiveCheckoutInventory>> {
		const rootKind = await this.gateway.pathKind(activeRootRelativePath());
		if (!rootKind.ok) return rootKind;
		if (rootKind.value !== "directory") return { ok: true, value: { records: [], findings: [] } };

		const listed = await this.gateway.listDirectory(activeRootRelativePath());
		if (!listed.ok) return listed;

		const records: ObjectiveRecordLocation[] = [];
		const findings: ObjectiveStructuralFinding[] = [];
		const rootEntries = [...listed.value].sort((left, right) =>
			left.name.localeCompare(right.name),
		);
		for (const entry of rootEntries) {
			// Dot-prefixed entries (for example `.gitkeep`) are repository
			// infrastructure, not records or hygiene violations.
			if (entry.name.startsWith(".")) continue;
			const entryPath = posixJoin(activeRootRelativePath(), entry.name);
			if (entry.kind !== "directory") {
				findings.push({
					path: entryPath,
					message: "unexpected non-directory entry directly under the Active Objective Root",
				});
				continue;
			}
			const classified = await this.classifyRootDirectory(entry.name, entryPath);
			if (!classified.ok) return classified;
			records.push(...classified.value.records);
			findings.push(...classified.value.findings);
		}

		return { ok: true, value: dedupeInventory(records, findings) };
	}

	private async classifyRootDirectory(
		name: string,
		entryPath: string,
	): Promise<ObjectiveStorageResult<ObjectiveCheckoutInventory>> {
		const closed = await this.gateway.pathKind(posixJoin(entryPath, "closed.md"));
		if (!closed.ok) return closed;
		if (closed.value === "file") {
			return await this.classifyLegacyFlatClosedRecord(name, entryPath);
		}

		const marker = await this.flatRecordMarker(entryPath);
		if (!marker.ok) return marker;
		if (marker.value !== null) {
			return findingsOnly({
				path: entryPath,
				message:
					"flat open Objective record; open records must live under .ns/objectives/<owner>/<slug>/",
			});
		}

		if (!isValidObjectiveOwner(name)) {
			return findingsOnly({
				path: entryPath,
				message: `invalid Objective owner directory name ${JSON.stringify(name)}`,
			});
		}
		return await this.classifyOwnerDirectory(name, entryPath);
	}

	private async classifyLegacyFlatClosedRecord(
		slug: string,
		entryPath: string,
	): Promise<ObjectiveStorageResult<ObjectiveCheckoutInventory>> {
		if (!isValidObjectiveSlug(slug)) {
			return findingsOnly({
				path: entryPath,
				message: `invalid Objective slug directory name ${JSON.stringify(slug)}`,
			});
		}
		const owner = await this.recordFrontmatterOwner(entryPath);
		if (!owner.ok) return owner;
		if (owner.value.type !== "ok") {
			return findingsOnly({
				path: entryPath,
				message: `legacy flat closed record has no valid owner frontmatter: ${owner.value.message}`,
			});
		}
		return {
			ok: true,
			value: {
				records: [
					{
						owner: owner.value.owner,
						slug,
						locator: renderObjectiveLocator({ owner: owner.value.owner, slug }),
						recordRelativePath: entryPath,
						layout: "legacy-flat-closed",
						status: "closed",
					},
				],
				findings: [],
			},
		};
	}

	private async classifyOwnerDirectory(
		owner: string,
		ownerPath: string,
	): Promise<ObjectiveStorageResult<ObjectiveCheckoutInventory>> {
		const listed = await this.gateway.listDirectory(ownerPath);
		if (!listed.ok) return listed;
		const entries = [...listed.value].sort((left, right) => left.name.localeCompare(right.name));
		if (entries.length === 0) {
			return findingsOnly({ path: ownerPath, message: "empty Objective owner directory" });
		}

		const records: ObjectiveRecordLocation[] = [];
		const findings: ObjectiveStructuralFinding[] = [];
		for (const entry of entries) {
			const entryPath = posixJoin(ownerPath, entry.name);
			if (entry.kind !== "directory") {
				findings.push({
					path: entryPath,
					message: "unexpected non-directory entry inside an Objective owner directory",
				});
				continue;
			}
			if (!isValidObjectiveSlug(entry.name)) {
				findings.push({
					path: entryPath,
					message: `invalid Objective slug directory name ${JSON.stringify(entry.name)}`,
				});
				continue;
			}
			const closed = await this.gateway.pathKind(posixJoin(entryPath, "closed.md"));
			if (!closed.ok) return closed;
			records.push({
				owner,
				slug: entry.name,
				locator: renderObjectiveLocator({ owner, slug: entry.name }),
				recordRelativePath: entryPath,
				layout: "owner-nested",
				status: closed.value === "file" ? "closed" : "open",
			});
		}
		return { ok: true, value: { records, findings } };
	}

	/** Non-null when the directory carries record marker files besides closed.md. */
	private async flatRecordMarker(
		entryPath: string,
	): Promise<ObjectiveStorageResult<string | null>> {
		for (const marker of RECORD_MARKER_ENTRIES) {
			if (marker === "closed.md") continue;
			const kind = await this.gateway.pathKind(posixJoin(entryPath, marker));
			if (!kind.ok) return kind;
			if (kind.value !== "missing") return { ok: true, value: marker };
		}
		return { ok: true, value: null };
	}

	private async recordFrontmatterOwner(
		recordRelativePath: string,
	): Promise<
		ObjectiveStorageResult<{ type: "ok"; owner: string } | { type: "invalid"; message: string }>
	> {
		const read = await this.readObjectiveRecordDocument(recordRelativePath);
		if (read.type === "missing") {
			return { ok: true, value: { type: "invalid", message: "objective.md is missing" } };
		}
		if (read.type === "unreadable") {
			return {
				ok: true,
				value: { type: "invalid", message: `objective.md is unreadable: ${read.message}` },
			};
		}
		const parse = read.document.frontmatter;
		if (parse === undefined) {
			return { ok: true, value: { type: "invalid", message: "record has no frontmatter" } };
		}
		if (parse.type === "malformed") {
			return { ok: true, value: { type: "invalid", message: parse.message } };
		}
		const owner = parse.frontmatter.owner;
		if (!isValidObjectiveOwner(owner)) {
			return {
				ok: true,
				value: { type: "invalid", message: `owner ${JSON.stringify(owner)} is not a valid handle` },
			};
		}
		return { ok: true, value: { type: "ok", owner } };
	}

	/** Resolve one locator through discovered inventory; null when absent. */
	async resolveRecordLocation(
		locator: ObjectiveLocator,
	): Promise<ObjectiveStorageResult<ObjectiveRecordLocation | null>> {
		const inventory = await this.checkoutInventory();
		if (!inventory.ok) return inventory;
		return {
			ok: true,
			value: findRecordLocation(inventory.value.records, locator),
		};
	}

	/**
	 * Deep structural findings beyond root classification: record-like
	 * directories nested deeper than `owner/slug`.
	 */
	async deepStructureFindings(
		inventory: ObjectiveCheckoutInventory,
	): Promise<ObjectiveStorageResult<readonly ObjectiveStructuralFinding[]>> {
		const findings: ObjectiveStructuralFinding[] = [];
		for (const record of inventory.records) {
			if (record.layout !== "owner-nested") continue;
			const listed = await this.gateway.listDirectory(record.recordRelativePath);
			if (!listed.ok) return listed;
			for (const entry of listed.value) {
				if (entry.kind !== "directory") continue;
				const childPath = posixJoin(record.recordRelativePath, entry.name);
				const nestedObjectiveMd = await this.gateway.pathKind(posixJoin(childPath, "objective.md"));
				if (!nestedObjectiveMd.ok) return nestedObjectiveMd;
				if (nestedObjectiveMd.value === "file") {
					findings.push({
						path: childPath,
						message: "record-like directory nested deeper than <owner>/<slug>",
					});
				}
			}
		}
		return { ok: true, value: findings };
	}

	async filePresence(recordRelativePath: string): Promise<ObjectiveStorageResult<ObjectiveFiles>> {
		const [objectiveMd, roadmapMd, updatesDir, closedMd] = await Promise.all([
			this.gateway.pathKind(posixJoin(recordRelativePath, "objective.md")),
			this.gateway.pathKind(posixJoin(recordRelativePath, "roadmap.md")),
			this.gateway.pathKind(posixJoin(recordRelativePath, "updates")),
			this.gateway.pathKind(posixJoin(recordRelativePath, "closed.md")),
		]);
		if (!objectiveMd.ok) return objectiveMd;
		if (!roadmapMd.ok) return roadmapMd;
		if (!updatesDir.ok) return updatesDir;
		if (!closedMd.ok) return closedMd;
		return {
			ok: true,
			value: {
				objectiveMd: objectiveMd.value === "file",
				roadmapMd: roadmapMd.value === "file",
				updatesDir: updatesDir.value === "directory",
				closedMd: closedMd.value === "file",
			},
		};
	}

	async listUpdateFiles(
		recordRelativePath: string,
	): Promise<ObjectiveStorageResult<readonly ObjectiveUpdateFile[]>> {
		const updatesRelativePath = posixJoin(recordRelativePath, "updates");
		const updatesKind = await this.gateway.pathKind(updatesRelativePath);
		if (!updatesKind.ok) return updatesKind;
		if (updatesKind.value !== "directory") return { ok: true, value: [] };

		const listed = await this.gateway.listDirectory(updatesRelativePath);
		if (!listed.ok) return listed;
		return {
			ok: true,
			value: listed.value
				.filter((entry) => entry.kind === "file" && entry.name.endsWith(".md"))
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((entry) => ({ name: entry.name, path: posixJoin(updatesRelativePath, entry.name) })),
		};
	}

	async readMarkdownFile(relativePath: string): Promise<ObjectiveMarkdownReadResult> {
		return await this.gateway.readTextFile(relativePath);
	}

	/**
	 * Read a record's `objective.md` through the shared Record Frontmatter reader.
	 * Every `objective.md` reader must consume this instead of the raw Markdown
	 * read so frontmatter is stripped or parsed identically everywhere:
	 * `content` is the verbatim file, `document.body` is the content with any
	 * well-delimited frontmatter block removed.
	 */
	async readObjectiveRecordDocument(
		recordRelativePath: string,
	): Promise<ObjectiveRecordDocumentReadResult> {
		const read = await this.gateway.readTextFile(posixJoin(recordRelativePath, "objective.md"));
		if (read.type !== "ok") return read;
		return {
			type: "ok",
			content: read.content,
			document: splitObjectiveRecordDocument(read.content),
		};
	}
}

function findingsOnly(
	finding: ObjectiveStructuralFinding,
): ObjectiveStorageResult<ObjectiveCheckoutInventory> {
	return { ok: true, value: { records: [], findings: [finding] } };
}

/** Duplicate locators are errors and never silently shadowed: exclude all claimants. */
function dedupeInventory(
	records: readonly ObjectiveRecordLocation[],
	findings: readonly ObjectiveStructuralFinding[],
): ObjectiveCheckoutInventory {
	const byLocator = new Map<string, ObjectiveRecordLocation[]>();
	for (const record of records) {
		const claimants = byLocator.get(record.locator) ?? [];
		claimants.push(record);
		byLocator.set(record.locator, claimants);
	}
	const dedupedRecords: ObjectiveRecordLocation[] = [];
	const duplicateFindings: ObjectiveStructuralFinding[] = [];
	for (const record of records) {
		const claimants = byLocator.get(record.locator) ?? [];
		if (claimants.length === 1) {
			dedupedRecords.push(record);
			continue;
		}
		duplicateFindings.push({
			path: record.recordRelativePath,
			message: `duplicate Objective locator ${record.locator} (${claimants.length} record directories claim it)`,
		});
	}
	dedupedRecords.sort((left, right) => left.locator.localeCompare(right.locator));
	return { records: dedupedRecords, findings: [...findings, ...duplicateFindings] };
}

export function findRecordLocation(
	records: readonly ObjectiveRecordLocation[],
	locator: ObjectiveLocator,
): ObjectiveRecordLocation | null {
	return (
		records.find((record) => record.owner === locator.owner && record.slug === locator.slug) ?? null
	);
}

export function activeRootRelativePath(): string {
	return ACTIVE_OBJECTIVE_ROOT;
}

/** Canonical owner-nested record path; the only place nested paths are constructed. */
export function ownerNestedRecordRelativePath(locator: ObjectiveLocator): string {
	return posixJoin(activeRootRelativePath(), locator.owner, locator.slug);
}

/** Legacy flat record path; valid only for tolerated flat closed records. */
export function legacyFlatRecordRelativePath(slug: string): string {
	return posixJoin(activeRootRelativePath(), slug);
}

export function emptyObjectiveFiles(): ObjectiveFiles {
	return { objectiveMd: false, roadmapMd: false, updatesDir: false, closedMd: false };
}

export function renderFilePresence(files: ObjectiveFiles): string {
	return [
		`objective.md:${yesNo(files.objectiveMd)}`,
		`roadmap.md:${yesNo(files.roadmapMd)}`,
		`updates/:${yesNo(files.updatesDir)}`,
		`closed.md:${yesNo(files.closedMd)}`,
	].join(", ");
}

/**
 * Possible record identities a changed path under the Active Objective Root
 * could belong to. Path shape alone cannot distinguish an owner-nested record
 * from a legacy flat record's subdirectory, so callers must intersect these
 * candidates with discovered inventory.
 */
export interface ObjectiveActivePathCandidates {
	/** `<owner>/<slug>` interpretation when the path is deep enough. */
	nested: ObjectiveLocator | null;
	/** Legacy flat `<slug>` interpretation. */
	flatSlug: string | null;
}

export function objectiveLocatorCandidatesFromActivePath(
	path: string,
): ObjectiveActivePathCandidates {
	const prefix = `${activeRootRelativePath()}/`;
	if (!path.startsWith(prefix)) return { nested: null, flatSlug: null };
	const segments = path.slice(prefix.length).split("/");
	const [first, second, third] = segments;
	const flatSlug =
		first !== undefined && second !== undefined && isValidObjectiveSlug(first) ? first : null;
	const nested =
		first !== undefined &&
		second !== undefined &&
		third !== undefined &&
		isValidObjectiveOwner(first) &&
		isValidObjectiveSlug(second)
			? { owner: first, slug: second }
			: null;
	return { nested, flatSlug };
}

/**
 * Resolve changed paths to discovered record locators by intersecting path
 * candidates with inventory.
 */
export function objectiveLocatorsFromChangedPaths(
	paths: readonly string[],
	records: readonly ObjectiveRecordLocation[],
): string[] {
	const nestedLocators = new Set(
		records.filter((record) => record.layout === "owner-nested").map((record) => record.locator),
	);
	const flatBySlug = new Map(
		records
			.filter((record) => record.layout === "legacy-flat-closed")
			.map((record) => [record.slug, record.locator]),
	);
	const touched = new Set<string>();
	for (const path of paths) {
		const candidates = objectiveLocatorCandidatesFromActivePath(path);
		if (candidates.nested !== null) {
			const locator = renderObjectiveLocator(candidates.nested);
			if (nestedLocators.has(locator)) {
				touched.add(locator);
				continue;
			}
		}
		if (candidates.flatSlug !== null) {
			const locator = flatBySlug.get(candidates.flatSlug);
			if (locator !== undefined) touched.add(locator);
		}
	}
	return [...touched].sort((left, right) => left.localeCompare(right));
}

function yesNo(value: boolean): "yes" | "no" {
	return value ? "yes" : "no";
}

function posixJoin(...parts: readonly string[]): string {
	return join(...parts).replaceAll("\\", "/");
}

export { isValidObjectiveSlug };
