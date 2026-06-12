import { createHash } from "node:crypto";
import type { BuildSystemPromptOptions, ContextUsage } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import type { DelegationClaim, EpisodeAnnotation } from "./model.ts";
import type { EpisodeAnalysisStatus } from "./segmentation.ts";

export const BUNDLE_MANIFEST_VERSION = 1;
export const MESSAGES_FILE_NAME = "messages.jsonl";
export const MANIFEST_FILE_NAME = "manifest.json";
export const SYSTEM_PROMPT_FILE_NAME = "system-prompt.md";
export const EPISODES_FILE_NAME = "episodes.json";

export interface BundleManifest {
	version: typeof BUNDLE_MANIFEST_VERSION;
	sessionId: string;
	cwd: string;
	model: string;
	usage: ContextUsage | null;
	liveSource: string;
	capturedAt: string;
	contentHash: string;
	turnCount: number;
	promptOptions: BuildSystemPromptOptions | null;
}

export interface BundleSnapshot {
	messagesJsonl: string;
	systemPrompt: string;
	manifest: BundleManifest;
}

export type BuildBundleSnapshotResult =
	| { ok: true; value: BundleSnapshot }
	| { ok: false; error: { code: "no-provider-context" | "unserializable-message"; message: string } };

export interface BuildBundleSnapshotOptions {
	messages: readonly unknown[] | null;
	systemPrompt: string | null;
	promptOptions: BuildSystemPromptOptions | null;
	sessionId: string;
	cwd: string;
	model: string;
	usage: ContextUsage | undefined;
	liveSource: string;
	capturedAt?: Date;
}

export function buildBundleSnapshot(options: BuildBundleSnapshotOptions): BuildBundleSnapshotResult {
	if (options.messages === null) {
		return { ok: false, error: { code: "no-provider-context", message: "no provider context has been captured yet" } };
	}
	const lines: string[] = [];
	for (const [index, message] of options.messages.entries()) {
		try {
			const json = JSON.stringify(message);
			if (json === undefined) {
				return unserializable(index + 1, "message serialized to undefined");
			}
			lines.push(json);
		} catch (error) {
			return unserializable(index + 1, error instanceof Error ? error.message : String(error));
		}
	}
	const messagesJsonl = `${lines.join("\n")}${lines.length === 0 ? "" : "\n"}`;
	const contentHash = computeBundleContentHash(messagesJsonl);
	return {
		ok: true,
		value: {
			messagesJsonl,
			systemPrompt: options.systemPrompt ?? "",
			manifest: {
				version: BUNDLE_MANIFEST_VERSION,
				sessionId: options.sessionId,
				cwd: options.cwd,
				model: options.model,
				usage: options.usage ?? null,
				liveSource: options.liveSource,
				capturedAt: (options.capturedAt ?? new Date()).toISOString(),
				contentHash,
				turnCount: options.messages.length,
				promptOptions: options.promptOptions,
			},
		},
	};
}

function unserializable(turn: number, reason: string): BuildBundleSnapshotResult {
	return { ok: false, error: { code: "unserializable-message", message: `message ${turn} could not be serialized: ${reason}` } };
}

export function computeBundleContentHash(messagesJsonl: string): string {
	return createHash("sha256").update(messagesJsonl).digest("hex");
}

export const bundleManifestReadSchema = z.object({
	version: z.literal(BUNDLE_MANIFEST_VERSION),
	contentHash: z.string(),
});

export type BundlePersistenceState =
	| { type: "pending" }
	| { type: "skipped"; reason: "no-provider-context"; message: string }
	| {
		type: "persisted";
		ordinal: number;
		dir: string;
		contentHash: string;
		byteSize: number;
		sessionTotalBytes: number;
		reused: boolean;
		sessionId: string;
		model: string;
		turnCount: number;
		capturedAt: string;
	}
	| { type: "failed"; message: string };

export interface EpisodesFileEpisode extends EpisodeAnnotation {
	status: "ready" | { type: "error"; message: string };
}

export type EpisodesFileSegmentation =
	| { type: "ready"; summary: string | null; delegations: DelegationClaim[] }
	| { type: "segmentation-error"; message: string }
	| { type: "skipped"; reason: "too-few-turns" };

export interface EpisodesFile {
	version: 1;
	contentHash: string;
	analysisModel: string;
	generatedAt: string;
	segmentation: EpisodesFileSegmentation;
	episodes: EpisodesFileEpisode[];
}

export type EpisodesFileOutcome =
	| { type: "ready"; episodes: readonly EpisodeAnnotation[]; summary: string | null; delegations: readonly DelegationClaim[]; analysis: readonly EpisodeAnalysisStatus[] }
	| { type: "segmentation-error"; message: string }
	| { type: "skipped"; reason: "too-few-turns" };

export function buildEpisodesFileJson(options: {
	outcome: EpisodesFileOutcome;
	contentHash: string;
	analysisModel: string;
	generatedAt?: Date;
}): string {
	const generatedAt = (options.generatedAt ?? new Date()).toISOString();
	const file: EpisodesFile = {
		version: 1,
		contentHash: options.contentHash,
		analysisModel: options.analysisModel,
		generatedAt,
		segmentation: segmentationForOutcome(options.outcome),
		episodes: episodesForOutcome(options.outcome),
	};
	return `${JSON.stringify(file, null, 2)}\n`;
}

function segmentationForOutcome(outcome: EpisodesFileOutcome): EpisodesFileSegmentation {
	switch (outcome.type) {
		case "ready":
			return { type: "ready", summary: outcome.summary, delegations: [...outcome.delegations] };
		case "segmentation-error":
			return { type: "segmentation-error", message: outcome.message };
		case "skipped":
			return { type: "skipped", reason: outcome.reason };
	}
}

function episodesForOutcome(outcome: EpisodesFileOutcome): EpisodesFileEpisode[] {
	if (outcome.type !== "ready") return [];
	return outcome.episodes.map((episode, index): EpisodesFileEpisode => {
		const status = outcome.analysis[index] ?? "ready";
		return { ...episode, status: status === "loading" ? { type: "error", message: "analysis did not finish" } : status };
	});
}
