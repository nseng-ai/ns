import {
	defineExtension,
	hiddenExecGroup,
	type ExtensionEntry,
	type NsCommand,
} from "@nseng-ai/sdk";

function slotCommandEntry(commandName: string): ExtensionEntry {
	return { name: commandName, load: () => loadSlotCommand(commandName) };
}

async function loadSlotCommand(commandName: string): Promise<{ readonly default: NsCommand }> {
	const { loadSlotNsCommand } = await import("./slot-ns-command.ts");
	return { default: loadSlotNsCommand(commandName) };
}

export default defineExtension({
	group: "slot",
	description: "Manage the NS worktree slot pool.",
	entries: [
		slotCommandEntry("list"),
		slotCommandEntry("ls"),
		slotCommandEntry("checkout"),
		slotCommandEntry("co"),
		slotCommandEntry("goto"),
		slotCommandEntry("claim"),
		slotCommandEntry("free"),
		slotCommandEntry("foreach"),
		slotCommandEntry("gc"),
		slotCommandEntry("init"),
		slotCommandEntry("resize"),
		{
			group: "gt",
			description: "Graphite-aware slot navigation and stack operations.",
			entries: [
				slotCommandEntry("up"),
				slotCommandEntry("down"),
				slotCommandEntry("free-stack"),
				hiddenExecGroup("Skill-invoked Slot Graphite operations.", [
					slotCommandEntry("stack-branches"),
					slotCommandEntry("stack-map-branches"),
					slotCommandEntry("quiescence"),
					slotCommandEntry("backup-refs"),
				]),
			],
		},
		{
			group: "shell",
			description: "Show or install parent-shell integration.",
			entries: [slotCommandEntry("show"), slotCommandEntry("install")],
		},
	],
});
