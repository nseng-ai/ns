import { MAX_BRANCH_SLUG_LENGTH, trimBranchSlugToLength } from "@nseng-ai/foundation/branch-slug";

import {
	DISPATCH_ANCHOR_BRANCH_MAX_CHARS,
	DISPATCH_ANCHOR_BRANCH_PREFIX,
	isValidDispatchAnchorBranch,
} from "../dispatch/dispatch-run.ts";

export const DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT = 50;

export interface DispatchAnchorNameCandidate {
	readonly name: string;
	readonly hasCollisionSuffix: boolean;
}

export function formatDispatchAnchorTimestamp(nowMs: number, timeZone: string): string {
	const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	});
	const parts = formatter.formatToParts(new Date(nowMs));
	const valueByType = new Map(parts.map((part) => [part.type, part.value]));
	const year = requiredDatePart(valueByType, "year");
	const month = requiredDatePart(valueByType, "month");
	const day = requiredDatePart(valueByType, "day");
	const hour = requiredDatePart(valueByType, "hour");
	const minute = requiredDatePart(valueByType, "minute");
	const second = requiredDatePart(valueByType, "second");
	return `${year}${month}${day}-${hour}${minute}${second}`;
}

export function buildDispatchAnchorNameCandidates(
	semanticSlug: string,
	timestamp: string,
): readonly DispatchAnchorNameCandidate[] {
	return Array.from({ length: DISPATCH_ANCHOR_NAME_CANDIDATE_LIMIT }, (_unused, index) => {
		const collisionSuffix = index === 0 ? "" : `-${index + 1}`;
		const fixedLength =
			DISPATCH_ANCHOR_BRANCH_PREFIX.length + 1 + timestamp.length + collisionSuffix.length;
		const semanticMaxLength = Math.min(
			MAX_BRANCH_SLUG_LENGTH,
			DISPATCH_ANCHOR_BRANCH_MAX_CHARS - fixedLength,
		);
		const trimmedSlug = trimBranchSlugToLength(semanticSlug, semanticMaxLength);
		const name = `${DISPATCH_ANCHOR_BRANCH_PREFIX}${trimmedSlug}-${timestamp}${collisionSuffix}`;
		if (!isValidDispatchAnchorBranch(name)) {
			throw new Error(`Built an invalid semantic dispatch anchor branch: ${JSON.stringify(name)}`);
		}
		return { name, hasCollisionSuffix: index > 0 };
	});
}

function requiredDatePart(parts: ReadonlyMap<string, string>, type: string): string {
	const value = parts.get(type);
	if (value === undefined) {
		throw new Error(`Intl.DateTimeFormat omitted required ${type} part.`);
	}
	return value;
}
