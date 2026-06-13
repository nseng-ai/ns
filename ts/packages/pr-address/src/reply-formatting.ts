export const VALID_RESOLUTION_MODES = ["fixed", "pre_existing", "explained", "planned"] as const;
export type ResolutionReplyMode = (typeof VALID_RESOLUTION_MODES)[number];

export const RESOLUTION_MARKER = "<!-- pr-address:resolved -->";
export const PRE_EXISTING_REPLY = "Pre-existing issue - this code was moved/restructured, not newly introduced.";

export function validResolutionModesText(): string {
	return VALID_RESOLUTION_MODES.join(", ");
}

export type ResolutionProvenance = LocalBranchResolutionProvenance | PrResolutionProvenance;

export interface LocalBranchResolutionProvenance {
	kind: "local_branch";
	branch: string;
	branch_head_oid: string;
}

export interface PrResolutionProvenance {
	kind: "pr";
	pr_number: number;
	pr_url: string;
	pr_state: string;
	pr_head_ref_name: string;
	pr_head_ref_oid?: string | null | undefined;
}

export interface FormatResolutionReplyOptions {
	mode: ResolutionReplyMode;
	message: string | null;
	commitSha: string | null;
	provenance?: ResolutionProvenance | null | undefined;
	timestamp?: string | undefined;
}

export interface FormatReviewReplyOptions {
	reviewAuthor: string;
	summaryMarkdown: string;
	timestamp?: string | undefined;
}

export interface FormatDiscussionReplyOptions {
	commentAuthor: string;
	originalBody: string;
	response: string;
	timestamp?: string | undefined;
}

export function formatResolutionReply(options: FormatResolutionReplyOptions): string {
	const summary = resolutionSummary(options);
	return [summary, "", `Addressed via _pr-address_ at ${options.timestamp ?? utcTimestamp()}`, RESOLUTION_MARKER].join("\n");
}

export function formatReviewReply(options: FormatReviewReplyOptions): string {
	return [`Addressed review feedback from @${options.reviewAuthor}:`, options.summaryMarkdown, "", `_Addressed via pr-address at ${options.timestamp ?? utcTimestamp()}_`].join("\n");
}

export function formatDiscussionReply(options: FormatDiscussionReplyOptions): string {
	const quoteBlock = quoteLines(options.originalBody).join("\n");
	return [`> @${options.commentAuthor} wrote:`, quoteBlock, "", options.response, "", `_Addressed via pr-address at ${options.timestamp ?? utcTimestamp()}_`].join("\n");
}

export function resolutionSummary(options: FormatResolutionReplyOptions): string {
	switch (options.mode) {
		case "pre_existing":
			return PRE_EXISTING_REPLY;
		case "fixed":
			return `Fixed in commit ${options.commitSha}: ${options.message}`;
		case "explained":
			return `${options.message}`;
		case "planned":
			if (options.provenance === null || options.provenance === undefined) throw new Error("mode='planned' requires validated provenance");
			return plannedResolutionSummary({ message: options.message, provenance: options.provenance });
	}
}

function plannedResolutionSummary(options: { message: string | null; provenance: ResolutionProvenance }): string {
	if (options.message === null) throw new Error("mode='planned' requires a non-empty message");
	const lines = [`Planned follow-up: ${options.message}`, "", "Provenance:"];
	if (options.provenance.kind === "local_branch") {
		lines.push(`- Local branch: \`${options.provenance.branch}\``);
		lines.push(`- Branch HEAD snapshot: \`${options.provenance.branch_head_oid}\``);
		return lines.join("\n");
	}
	lines.push(`- PR: #${options.provenance.pr_number} ${options.provenance.pr_url}`);
	lines.push(`- PR state snapshot: ${options.provenance.pr_state}`);
	if (options.provenance.pr_head_ref_oid !== null && options.provenance.pr_head_ref_oid !== undefined) {
		lines.push(`- PR head snapshot: \`${options.provenance.pr_head_ref_name}\` at \`${options.provenance.pr_head_ref_oid}\``);
	} else {
		lines.push(`- PR head snapshot: \`${options.provenance.pr_head_ref_name}\``);
	}
	return lines.join("\n");
}

function quoteLines(text: string): readonly string[] {
	const lines = splitLines(text);
	if (lines.length === 0) return [">"];
	return lines.map((line) => (line === "" ? "> " : `> ${line}`));
}

function splitLines(text: string): string[] {
	if (text === "") return [];
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const lines = normalized.split("\n");
	if (normalized.endsWith("\n")) lines.pop();
	return lines;
}

function utcTimestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
