import type { ObjectiveRecordDocument } from "../record-frontmatter.ts";
import {
	activeRecordRelativePath,
	archivedRecordRelativePath,
	isValidObjectiveSlug,
	type ObjectiveStorage,
	type ObjectiveStorageResult,
} from "../storage.ts";
import type { ObjectiveCheckItem } from "./check-items.ts";

/**
 * Edge and Blocked Sentence structural linter (ADR 0025). Every violation is an
 * error: malformed frontmatter, empty blocked sentence, empty annotation,
 * invalid/dangling/self/duplicate edge slugs, and a missing mirror side. The
 * lint is frontmatter-cheap — record bodies are never interpreted — and only
 * violations are reported, so a record whose frontmatter is structurally valid
 * checks identically to one with no frontmatter at all.
 *
 * Mirror lookups resolve counterpart slugs in BOTH the active root and the
 * archive root: archiving an endpoint does not break an edge.
 */

export interface ObjectiveEdgeLintOptions {
	storage: ObjectiveStorage;
	slug: string;
	recordRelativePath: string;
	document: ObjectiveRecordDocument;
}

export async function objectiveEdgeLintChecks(
	options: ObjectiveEdgeLintOptions,
): Promise<ObjectiveStorageResult<readonly ObjectiveCheckItem[]>> {
	const path = `${options.recordRelativePath}/objective.md`;
	const parse = options.document.frontmatter;
	if (parse === undefined) return { ok: true, value: [] };
	if (parse.type === "malformed") {
		return {
			ok: true,
			value: [violation(path, "objective.md Record Frontmatter parses", parse.message)],
		};
	}

	const violations: ObjectiveCheckItem[] = [];
	const frontmatter = parse.frontmatter;
	if (frontmatter.blocked !== null && frontmatter.blocked.trim() === "") {
		violations.push(
			violation(
				path,
				"objective.md blocked sentence is non-empty",
				"blocked: is present but carries no sentence",
			),
		);
	}

	const seenEndpoints = new Set<string>();
	for (const edge of frontmatter.edges) {
		const endpoint = edge.objective;
		if (edge.annotation.trim() === "") {
			violations.push(
				violation(
					path,
					`objective.md edge ${endpoint} has annotation`,
					"annotation: is present but carries no sentence",
				),
			);
		}
		if (!isValidObjectiveSlug(endpoint)) {
			violations.push(
				violation(
					path,
					`objective.md edge ${endpoint} has a valid slug`,
					"objective: is not a single record slug",
				),
			);
			continue;
		}
		if (endpoint === options.slug) {
			violations.push(
				violation(
					path,
					`objective.md edge ${endpoint} links a distinct record`,
					"edge endpoint is the record itself",
				),
			);
			continue;
		}
		if (seenEndpoints.has(endpoint)) {
			violations.push(
				violation(
					path,
					`objective.md edge ${endpoint} appears once`,
					"duplicate entry for the same record pair",
				),
			);
			continue;
		}
		seenEndpoints.add(endpoint);

		const mirror = await mirrorViolation(options.storage, options.slug, path, endpoint);
		if (!mirror.ok) return mirror;
		if (mirror.value !== null) violations.push(mirror.value);
	}
	return { ok: true, value: violations };
}

export interface ObjectiveEdgeSweepReport {
	recordCount: number;
	violations: readonly ObjectiveCheckItem[];
}

/**
 * Repo-wide edge/blocked sweep: lints every record's Record Frontmatter across
 * the active root and the archive root, reporting only violations.
 */
export async function sweepObjectiveEdgeLint(
	storage: ObjectiveStorage,
): Promise<ObjectiveStorageResult<ObjectiveEdgeSweepReport>> {
	const inventory = await storage.checkoutInventory();
	if (!inventory.ok) return inventory;
	const archivedSlugs = await storage.archivedRecordSlugs();
	if (!archivedSlugs.ok) return archivedSlugs;

	const targets = [
		...inventory.value.records.map((record) => ({
			slug: record.slug,
			recordRelativePath: activeRecordRelativePath(record.slug),
		})),
		...archivedSlugs.value.map((slug) => ({
			slug,
			recordRelativePath: archivedRecordRelativePath(slug),
		})),
	];

	const violations: ObjectiveCheckItem[] = [];
	for (const target of targets) {
		const read = await storage.readObjectiveRecordDocument(target.recordRelativePath);
		if (read.type === "missing") {
			violations.push(
				violation(`${target.recordRelativePath}/objective.md`, "objective.md exists", "missing"),
			);
			continue;
		}
		if (read.type === "unreadable") {
			violations.push(
				violation(
					`${target.recordRelativePath}/objective.md`,
					"objective.md is readable Markdown",
					read.message,
				),
			);
			continue;
		}
		const lint = await objectiveEdgeLintChecks({
			storage,
			slug: target.slug,
			recordRelativePath: target.recordRelativePath,
			document: read.document,
		});
		if (!lint.ok) return lint;
		violations.push(...lint.value);
	}
	return { ok: true, value: { recordCount: targets.length, violations } };
}

async function mirrorViolation(
	storage: ObjectiveStorage,
	slug: string,
	path: string,
	endpoint: string,
): Promise<ObjectiveStorageResult<ObjectiveCheckItem | null>> {
	const counterpartPath = await resolveCounterpartRecordPath(storage, endpoint);
	if (!counterpartPath.ok) return counterpartPath;
	if (counterpartPath.value === null) {
		return {
			ok: true,
			value: violation(
				path,
				`objective.md edge ${endpoint} endpoint exists`,
				"no record in the active or archive root",
			),
		};
	}

	const label = `objective.md edge ${endpoint} is mirrored`;
	const counterpart = await storage.readObjectiveRecordDocument(counterpartPath.value);
	if (counterpart.type === "missing") {
		return { ok: true, value: violation(path, label, "counterpart objective.md is missing") };
	}
	if (counterpart.type === "unreadable") {
		return {
			ok: true,
			value: violation(
				path,
				label,
				`counterpart objective.md is unreadable: ${counterpart.message}`,
			),
		};
	}
	const counterpartParse = counterpart.document.frontmatter;
	if (counterpartParse === undefined) {
		return {
			ok: true,
			value: violation(path, label, "counterpart has no Record Frontmatter"),
		};
	}
	if (counterpartParse.type === "malformed") {
		return {
			ok: true,
			value: violation(path, label, "counterpart Record Frontmatter is malformed"),
		};
	}
	const hasMirror = counterpartParse.frontmatter.edges.some((edge) => edge.objective === slug);
	if (!hasMirror) {
		return {
			ok: true,
			value: violation(path, label, "counterpart does not declare the mirror edge"),
		};
	}
	return { ok: true, value: null };
}

async function resolveCounterpartRecordPath(
	storage: ObjectiveStorage,
	slug: string,
): Promise<ObjectiveStorageResult<string | null>> {
	const active = await storage.activeRecordExists(slug);
	if (!active.ok) return active;
	if (active.value) return { ok: true, value: activeRecordRelativePath(slug) };
	const archived = await storage.archivedRecordExists(slug);
	if (!archived.ok) return archived;
	if (archived.value) return { ok: true, value: archivedRecordRelativePath(slug) };
	return { ok: true, value: null };
}

function violation(path: string, label: string, detail: string): ObjectiveCheckItem {
	return { path, label, isPassed: false, severity: "error", detail };
}
