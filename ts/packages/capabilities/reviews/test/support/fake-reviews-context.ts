import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";
import type { ReviewsContext } from "../../src/core/context.ts";
import {
	FakeReviewRunnerGateway,
	type ReviewRunnerGateway,
} from "../../src/gateways/review-runner.ts";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/testing";
import type { ReviewsGithubPrFeedbackGateway } from "../../src/core/context.ts";
import { FakeLocalDiffGateway, type LocalDiffGateway } from "../../src/gateways/local-diff.ts";
import {
	FakeReviewCatalogGateway,
	type ReviewCatalogGateway,
} from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway, type ReviewLogGateway } from "../../src/gateways/review-log.ts";

export interface FakeReviewsContextOptions {
	readonly execApi?: CommandExecApi;
	readonly gitGateway?: GitGateway;
	readonly localDiff?: LocalDiffGateway;
	readonly reviewCatalog?: ReviewCatalogGateway;
	readonly reviewLog?: ReviewLogGateway;
	readonly github?: ReviewsGithubPrFeedbackGateway;
	readonly reviewRunner?: ReviewRunnerGateway;
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal;
	readonly stdin?: () => Promise<string>;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
}

const DEFAULT_REPO_ROOT = mkdtempSync(join(tmpdir(), "reviews-context-"));
writeFileSync(
	join(DEFAULT_REPO_ROOT, "ns.toml"),
	'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
);

export function fakeReviewsContext(options: FakeReviewsContextOptions = {}): ReviewsContext {
	const execApi = options.execApi ?? new ScriptedCommandExecApi();
	const gitGateway =
		options.gitGateway ??
		new InMemoryGitGateway({
			repoRoot: DEFAULT_REPO_ROOT,
			optionalRepoRoot: DEFAULT_REPO_ROOT,
			currentBranch: "feature",
			trunkBranch: "main",
			originUrl: "git@example.com:repo.git\n",
			headCommit: "abc123",
			existingBranches: ["feature", "main"],
		});
	return {
		execApi,
		gitGateway,
		localDiff: options.localDiff ?? new FakeLocalDiffGateway(),
		reviewCatalog: options.reviewCatalog ?? new FakeReviewCatalogGateway(),
		reviewLog: options.reviewLog ?? new FakeReviewLogGateway(),
		github: options.github ?? new FakeGithubPrFeedbackGateway(),
		reviewRunner: options.reviewRunner ?? new FakeReviewRunnerGateway(),
		cwd: options.cwd ?? DEFAULT_REPO_ROOT,
		env: options.env ?? {},
		...(options.signal === undefined ? {} : { signal: options.signal }),
		stdin: options.stdin ?? (async () => ""),
		stdout: options.stdout ?? (() => undefined),
		stderr: options.stderr ?? (() => undefined),
	};
}
