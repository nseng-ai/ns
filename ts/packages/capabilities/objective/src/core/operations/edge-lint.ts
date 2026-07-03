import type { ObjectiveRecordDocument, ObjectiveRecordFrontmatter } from "../record-frontmatter.ts";
import {
	activeRecordRelativePath,
	archivedRecordRelativePath,
	isValidObjectiveSlug,
	type ObjectiveStorage,
	type ObjectiveStorageResult,
} from "../storage.ts";
import {
	objectiveMdExistsCheck,
	objectiveMdReadableCheck,
	type ObjectiveCheckItem,
} from "./check-items.ts";

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
	const frontmatterState = classifyRecordFrontmatter(options.document);
	if (frontmatterState.type === "absent") return { ok: true, value: [] };
	if (frontmatterState.type === "malformed") {
		return {
			ok: true,
			value: [violation(path, "objective.md Record Frontmatter parses", frontmatterState.message)],
		};
	}

	const violations: ObjectiveCheckItem[] = [];
	const frontmatter = frontmatterState.frontmatter;
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

		const mirror = await mirrorViolation({
			storage: options.storage,
			slug: options.slug,
			path,
			endpoint,
		});
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
		const path = `${target.recordRelativePath}/objective.md`;
		if (read.type === "missing") {
			violations.push(
				objectiveMdExistsCheck({ recordRelativePath: target.recordRelativePath, isPresent: false }),
			);
			continue;
		}
		if (read.type === "unreadable") {
			violations.push(objectiveMdReadableCheck({ path, read }));
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

interface MirrorViolationOptions {
	storage: ObjectiveStorage;
	slug: string;
	path: string;
	endpoint: string;
}

async function mirrorViolation(
	options: MirrorViolationOptions,
): Promise<ObjectiveStorageResult<ObjectiveCheckItem | null>> {
	const { storage, slug, path, endpoint } = options;
	const counterpartPath = await storage.resolveRecordRelativePath(endpoint);
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
	const counterpartFrontmatter = classifyRecordFrontmatter(counterpart.document);
	if (counterpartFrontmatter.type === "absent") {
		return {
			ok: true,
			value: violation(path, label, "counterpart has no Record Frontmatter"),
		};
	}
	if (counterpartFrontmatter.type === "malformed") {
		return {
			ok: true,
			value: violation(path, label, "counterpart Record Frontmatter is malformed"),
		};
	}
	const hasMirror = counterpartFrontmatter.frontmatter.edges.some(
		(edge) => edge.objective === slug,
	);
	if (!hasMirror) {
		return {
			ok: true,
			value: violation(path, label, "counterpart does not declare the mirror edge"),
		};
	}
	return { ok: true, value: null };
}

type RecordFrontmatterClassification =
	| { type: "absent" }
	| { type: "malformed"; message: string }
	| { type: "parsed"; frontmatter: ObjectiveRecordFrontmatter };

function classifyRecordFrontmatter(
	document: ObjectiveRecordDocument,
): RecordFrontmatterClassification {
	const parse = document.frontmatter;
	if (parse === undefined) return { type: "absent" };
	if (parse.type === "malformed") return { type: "malformed", message: parse.message };
	return { type: "parsed", frontmatter: parse.frontmatter };
}

function violation(path: string, label: string, detail: string): ObjectiveCheckItem {
	return { path, label, isPassed: false, severity: "error", detail };
}
