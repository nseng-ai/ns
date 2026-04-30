import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const UI_KEY = "current-objective";

type ObjectiveState =
	| { kind: "objective"; slug: string }
	| { kind: "none" }
	| { kind: "unavailable" };

type CurrentObjectiveEnvelope = {
	exit_code?: number;
	data?: {
		prompt?: unknown;
	};
};

export default function currentObjectiveExtension(pi: ExtensionAPI) {
	let refreshSequence = 0;

	async function refresh(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) return;

		const sequence = ++refreshSequence;
		const state = await loadCurrentObjective(pi, ctx);
		if (sequence !== refreshSequence) return;

		renderObjective(ctx, state);
	}

	pi.on("session_start", async (_event, ctx) => {
		await refresh(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		await refresh(ctx);
	});
}

async function loadCurrentObjective(pi: ExtensionAPI, ctx: ExtensionContext): Promise<ObjectiveState> {
	try {
		const result = await pi.exec("objective", ["exec", "current", "--format", "json"], {
			cwd: ctx.cwd,
			timeout: 5000,
		});

		if (result.code !== 0) return { kind: "unavailable" };

		const parsed = JSON.parse(result.stdout) as CurrentObjectiveEnvelope;
		const prompt = parsed.data?.prompt;
		if (typeof prompt !== "string") return { kind: "unavailable" };

		const branch = parseCurrentBranch(prompt);
		const trunk = await resolveTrunk(pi, ctx);
		if (branch !== undefined && trunk !== undefined && branch === trunk) {
			return { kind: "none" };
		}

		const objectiveMatch = /^\*\*Objective:\*\* `([^`]+)`$/m.exec(prompt);
		if (objectiveMatch) return { kind: "objective", slug: objectiveMatch[1] ?? "" };

		if (/^\*\*Objective:\*\* _none claimed_$/m.test(prompt)) {
			return { kind: "none" };
		}

		return { kind: "unavailable" };
	} catch {
		return { kind: "unavailable" };
	}
}

function parseCurrentBranch(prompt: string): string | undefined {
	return /^# On `([^`]+)`$/m.exec(prompt)?.[1];
}

async function resolveTrunk(pi: ExtensionAPI, ctx: ExtensionContext): Promise<string | undefined> {
	const originHead = await pi.exec("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
		cwd: ctx.cwd,
		timeout: 5000,
	});
	if (originHead.code === 0) {
		const trunk = originHead.stdout.trim().replace(/^origin\//, "");
		if (trunk.length > 0) return trunk;
	}

	for (const candidate of ["main", "master"]) {
		const result = await pi.exec("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`], {
			cwd: ctx.cwd,
			timeout: 5000,
		});
		if (result.code === 0) return candidate;
	}

	return undefined;
}

function renderObjective(ctx: ExtensionContext, state: ObjectiveState): void {
	if (state.kind === "objective") {
		ctx.ui.setStatus(UI_KEY, ctx.ui.theme.fg("dim", `obj: ${state.slug}`));
		ctx.ui.setWidget(UI_KEY, [`Objective: ${state.slug}`]);
		return;
	}

	if (state.kind === "none") {
		ctx.ui.setStatus(UI_KEY, undefined);
		ctx.ui.setWidget(UI_KEY, undefined);
		return;
	}

	ctx.ui.setStatus(UI_KEY, ctx.ui.theme.fg("dim", "obj: unavailable"));
	ctx.ui.setWidget(UI_KEY, undefined);
}
