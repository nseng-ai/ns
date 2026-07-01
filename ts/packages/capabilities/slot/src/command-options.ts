import type { OptionSpec } from "@sdl/clinkr";

type CommandOptionSpecs = Partial<Record<string, OptionSpec>>;

export const checkoutOptionSpecs = {
	new: { short: "-b" },
	current: { short: "-c" },
	clipboard: { short: "-C" },
} satisfies CommandOptionSpecs;

export const gotoOptionSpecs = {
	num: { short: "-n" },
	wt: { short: "-w" },
	clipboard: { short: "-C" },
} satisfies CommandOptionSpecs;

export const freeOptionSpecs = {
	num: { short: "-n" },
	wt: { short: "-w" },
	branch: { short: "-b" },
	current: { short: "-c" },
	all: { short: "-a" },
	dryRun: { short: "-d" },
	yes: { short: "-y" },
} satisfies CommandOptionSpecs;

export const foreachOptionSpecs = {
	yes: { short: "-y" },
} satisfies CommandOptionSpecs;

export const gcOptionSpecs = {
	dryRun: { short: "-n" },
	force: { short: "-f" },
	deleteBranches: { short: "-D" },
} satisfies CommandOptionSpecs;

export const sizeOptionSpecs = {
	size: { short: "-s" },
} satisfies CommandOptionSpecs;

export const gtNavigationOptionSpecs = {
	clipboard: { short: "-C" },
} satisfies CommandOptionSpecs;

export const gtFreeStackOptionSpecs = {
	downstack: { short: "-d" },
} satisfies CommandOptionSpecs;

export const shellShowOptionSpecs = {
	shell: { short: "-s" },
} satisfies CommandOptionSpecs;

export const shellInstallOptionSpecs = {
	shell: { short: "-s" },
	yes: { short: "-y" },
} satisfies CommandOptionSpecs;
