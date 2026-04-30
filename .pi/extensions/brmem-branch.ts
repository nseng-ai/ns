import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const PLUGIN_NAME = "brmem-branch-create";

type JsonEnvelope<T> = {
	exit_code?: number;
	message?: string;
	data?: T;
};

type ResolvePromptData = {
	path?: string;
	tier?: string;
};

type BrmemEntry = {
	namespace: string | null;
	key: string;
	branch: string;
	ref_name: string;
};

type BrmemListData = {
	entries?: BrmemEntry[];
};

type BrmemGetData = {
	content?: string;
};

type BrmemPutData = {
	namespace: string | null;
	key: string;
	branch: string;
	ref_name: string;
	commit: string;
	source_file: string;
};

type CreateArgs = {
	planPath?: string;
	slug?: string;
};

export default function brmemBranchExtension(pi: ExtensionAPI) {
	pi.registerCommand("brmem-branch-create", {
		description: "Create a branch and stash a plan with brmem (fast Pi port)",
		handler: async (args, ctx) => {
			await createBranchWithBrmem(pi, ctx, parseCreateArgs(args));
		},
	});

	pi.registerCommand("brmem-branch-impl", {
		description: "Load brmem branch context and begin implementation (fast Pi port)",
		handler: async (_args, ctx) => {
			await loadBrmemAndBeginImplementation(pi, ctx);
		},
	});
}

async function createBranchWithBrmem(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: CreateArgs,
): Promise<void> {
	if (!args.planPath) {
		publish(ctx, pi, "Usage: /brmem-branch-create <plan.md> [--slug suggested-slug]");
		return;
	}

	const sourcePath = resolve(ctx.cwd, stripAtPrefix(args.planPath));
	let sourceContent: string;
	try {
		sourceContent = await readFile(sourcePath, "utf8");
	} catch (error) {
		publish(ctx, pi, `Could not read plan file ${sourcePath}: ${errorMessage(error)}`);
		return;
	}

	const resolved = await resolveCreatePlugin(pi, ctx);
	if (!resolved.ok) {
		publish(ctx, pi, resolved.message);
		return;
	}

	let pluginContent: string;
	try {
		pluginContent = await readFile(resolved.path, "utf8");
	} catch (error) {
		publish(ctx, pi, `Could not read branch plugin ${resolved.path}: ${errorMessage(error)}`);
		return;
	}

	if (!isSupportedNoCheckoutGraphitePlugin(pluginContent)) {
		publish(
			ctx,
			pi,
			[
				`Resolved ${PLUGIN_NAME} plugin at ${resolved.path}, but this Pi extension only automates the repo-local no-checkout Graphite policy.`,
				"Use the existing brmem-branch-create skill for custom natural-language branch policies.",
			].join("\n"),
		);
		return;
	}

	const slug = args.slug ?? deriveSlug(sourceContent, sourcePath);
	const finalBranch = slug;
	const key = `plans/${slug}.md`;

	const originalBranch = await runText(pi, ctx, "git", ["rev-parse", "--abbrev-ref", "HEAD"]);
	if (!originalBranch.ok) {
		publish(ctx, pi, `Could not resolve current branch: ${originalBranch.message}`);
		return;
	}

	const startPoint = await runText(pi, ctx, "git", ["rev-parse", "HEAD"]);
	if (!startPoint.ok) {
		publish(ctx, pi, `Could not resolve HEAD: ${startPoint.message}`);
		return;
	}

	const existingBranch = await pi.exec("git", ["rev-parse", "--verify", `refs/heads/${finalBranch}`], {
		cwd: ctx.cwd,
		timeout: 5000,
	});
	if (existingBranch.code === 0) {
		publish(ctx, pi, `Branch already exists: ${finalBranch}`);
		return;
	}

	const check = await pi.exec("brmem", ["check", key, "--branch", finalBranch, "--format", "json"], {
		cwd: ctx.cwd,
		timeout: 5000,
	});
	if (check.code === 0) {
		publish(ctx, pi, `brmem entry already exists for ${finalBranch}: base/${key}`);
		return;
	}
	if (check.code !== 1) {
		publish(ctx, pi, `brmem check failed for ${finalBranch}: ${check.stderr || check.stdout}`);
		return;
	}

	const branch = await runText(pi, ctx, "git", ["branch", finalBranch, "HEAD"]);
	if (!branch.ok) {
		publish(ctx, pi, `Failed to create branch ${finalBranch}: ${branch.message}`);
		return;
	}

	const track = await runText(pi, ctx, "gt", ["track", finalBranch, "--parent", originalBranch.text]);
	if (!track.ok) {
		publish(
			ctx,
			pi,
			[
				`Created git branch ${finalBranch}, but Graphite tracking failed:`,
				track.message,
				"No brmem entries were written.",
			].join("\n"),
		);
		return;
	}

	const put = await pi.exec(
		"brmem",
		["put", key, "--branch", finalBranch, "--file", sourcePath, "--format", "json"],
		{ cwd: ctx.cwd, timeout: 30000 },
	);
	if (put.code !== 0) {
		publish(ctx, pi, `Branch ${finalBranch} was created, but brmem put failed: ${put.stderr || put.stdout}`);
		return;
	}

	const putEnvelope = parseJson<JsonEnvelope<BrmemPutData>>(put.stdout);
	const putData = putEnvelope.data;
	publish(
		ctx,
		pi,
		[
			`Branch: ${finalBranch}`,
			`Start point: ${startPoint.text}`,
			`Worktree stayed on: ${originalBranch.text}`,
			`Source: ${sourcePath}`,
			`Suggested slug: ${slug}`,
			`Stashed: base/${key}`,
			putData ? `Ref: ${putData.ref_name}` : undefined,
			putData ? `Commit: ${putData.commit}` : undefined,
			`Plugin: ${resolved.path} (${resolved.tier})`,
			"",
			"Inspect the attached context with `brmem list --base` and `brmem get <key>`.",
		]
			.filter((line): line is string => line !== undefined)
			.join("\n"),
	);
}

async function loadBrmemAndBeginImplementation(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const root = await runText(pi, ctx, "git", ["rev-parse", "--show-toplevel"]);
	if (!root.ok) {
		publish(ctx, pi, `Not inside a git repository: ${root.message}`);
		return;
	}

	const branch = await runText(pi, ctx, "git", ["symbolic-ref", "--short", "HEAD"]);
	if (!branch.ok) {
		publish(ctx, pi, "Detached HEAD: check out a feature branch before running /brmem-branch-impl.");
		return;
	}

	const trunkNames = new Set(["main", "master"]);
	const originHead = await runText(pi, ctx, "git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
	if (originHead.ok) {
		trunkNames.add(originHead.text.replace(/^origin\//, ""));
	}
	if (trunkNames.has(branch.text)) {
		publish(ctx, pi, `Refusing to implement directly on trunk (${branch.text}). Check out a feature branch first.`);
		return;
	}

	const list = await pi.exec("brmem", ["list", "--branch", branch.text, "--format", "json"], {
		cwd: ctx.cwd,
		timeout: 10000,
	});
	if (list.code !== 0) {
		publish(ctx, pi, `brmem list failed for ${branch.text}: ${list.stderr || list.stdout}`);
		return;
	}

	const entries = parseJson<JsonEnvelope<BrmemListData>>(list.stdout).data?.entries ?? [];
	if (entries.length === 0) {
		publish(
			ctx,
			pi,
			[
				`No brmem entries on branch ${branch.text}.`,
				"",
				"If you meant to stash a plan here first, use /brmem-branch-create to park context on a new branch, then re-run this command on that branch.",
			].join("\n"),
		);
		return;
	}

	const loaded: Array<BrmemEntry & { content: string; bytes: number }> = [];
	for (const entry of entries) {
		const getArgs = ["get", entry.key, "--branch", branch.text, "--format", "json"];
		if (entry.namespace !== null) getArgs.splice(2, 0, "--namespace", entry.namespace);
		const get = await pi.exec("brmem", getArgs, { cwd: ctx.cwd, timeout: 10000 });
		if (get.code !== 0) {
			publish(ctx, pi, `brmem get failed for ${namespaceLabel(entry)}/${entry.key}: ${get.stderr || get.stdout}`);
			return;
		}
		const content = parseJson<JsonEnvelope<BrmemGetData>>(get.stdout).data?.content ?? "";
		loaded.push({ ...entry, content, bytes: Buffer.byteLength(content, "utf8") });
	}

	const primary = choosePrimaryEntry(loaded);
	const report = [
		`Branch: ${branch.text}`,
		`Loaded ${loaded.length} brmem entries:`,
		...loaded.map((entry) => `  - ${namespaceLabel(entry)}/${entry.key} (${entry.bytes} bytes, ref ${entry.ref_name})`),
		"",
		"Primary plan content and all secondary entries are included below verbatim. Summarize the primary plan in 3-5 bullets, create an implementation TODO list from it, then begin implementation. Do not mutate brmem unless the user explicitly authorizes it.",
		"",
		...loaded.map((entry) => formatLoadedEntry(entry, entry === primary)),
	].join("\n");

	pi.sendUserMessage(report);
}

async function resolveCreatePlugin(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<{ ok: true; path: string; tier: string } | { ok: false; message: string }> {
	const result = await pi.exec("brmem", ["exec", "resolve-prompt", PLUGIN_NAME, "--format", "json"], {
		cwd: ctx.cwd,
		timeout: 10000,
	});
	const envelope = parseJson<JsonEnvelope<ResolvePromptData>>(result.stdout);
	if (result.code === 0 && envelope.data?.path) {
		return { ok: true, path: envelope.data.path, tier: envelope.data.tier ?? "unknown" };
	}
	return { ok: false, message: envelope.message ?? (result.stderr || `Could not resolve ${PLUGIN_NAME} plugin.`) };
}

function parseCreateArgs(raw: string): CreateArgs {
	const tokens = splitShell(raw);
	const parsed: CreateArgs = {};
	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i];
		if (token === "--slug") {
			parsed.slug = tokens[i + 1];
			i += 1;
		} else if (token.startsWith("--slug=")) {
			parsed.slug = token.slice("--slug=".length);
		} else if (!parsed.planPath) {
			parsed.planPath = token;
		}
	}
	if (parsed.slug) parsed.slug = slugify(parsed.slug);
	return parsed;
}

function splitShell(input: string): string[] {
	const matches = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
	return matches.map((value) => value.replace(/^(["'])(.*)\1$/, "$2"));
}

function deriveSlug(content: string, sourcePath: string): string {
	const title =
		content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0 && !line.startsWith("<!--")) ?? basename(sourcePath, ".md");
	return slugify(title.replace(/^#+\s*/, "").replace(/\bplan\b/gi, ""));
}

function slugify(value: string): string {
	const slug = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50)
		.replace(/-+$/g, "");
	return slug || "branch-context";
}

function isSupportedNoCheckoutGraphitePlugin(content: string): boolean {
	return (
		content.includes("git branch <final-branch> HEAD") &&
		content.includes("gt track <final-branch> --parent <original-branch>") &&
		content.includes("do NOT check out")
	);
}

async function runText(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	command: string,
	args: string[],
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
	const result = await pi.exec(command, args, { cwd: ctx.cwd, timeout: 10000 });
	if (result.code !== 0) return { ok: false, message: result.stderr || result.stdout };
	return { ok: true, text: result.stdout.trim() };
}

function parseJson<T>(text: string): T {
	return JSON.parse(text) as T;
}

function namespaceLabel(entry: { namespace: string | null }): string {
	return entry.namespace ?? "base";
}

function choosePrimaryEntry<T extends BrmemEntry>(entries: T[]): T {
	return entries.find((entry) => entry.key.startsWith("plans/") && entry.key.endsWith(".md")) ?? entries[0];
}

function formatLoadedEntry(entry: BrmemEntry & { content: string }, primary: boolean): string {
	return [
		`--- ${primary ? "PRIMARY " : ""}BRMEM ENTRY ${namespaceLabel(entry)}/${entry.key} ---`,
		entry.content,
		`--- END BRMEM ENTRY ${namespaceLabel(entry)}/${entry.key} ---`,
	].join("\n");
}

function stripAtPrefix(path: string): string {
	return path.startsWith("@") ? path.slice(1) : path;
}

function publish(ctx: ExtensionCommandContext, pi: ExtensionAPI, content: string): void {
	if (ctx.hasUI) {
		ctx.ui.notify(content.split("\n")[0] ?? content, "info");
	} else {
		console.log(content);
	}
	pi.sendMessage({ customType: "brmem-branch", content, display: true });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
