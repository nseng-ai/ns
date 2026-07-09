import { defineExtension, type ExtensionEntry, type NsCommand } from "@nseng-ai/kernel/sdk";

import slotExtension from "./extension.ts";

const slotCommands = slotExtension.commands ?? [];

function slotCommandEntry(commandName: string): ExtensionEntry {
	const command = findSlotCommand(commandName);
	return { name: command.name, load: () => ({ default: command }) };
}

function findSlotCommand(commandName: string): NsCommand {
	const command = slotCommands.find((candidate) => candidate.name === commandName);
	if (command === undefined) {
		throw new Error(`Missing Slot ns command ${commandName}.`);
	}
	return command;
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
				{
					group: "exec",
					description: "Skill-invoked Slot Graphite operations.",
					hidden: true,
					entries: [
						slotCommandEntry("stack-branches"),
						slotCommandEntry("stack-map-branches"),
						slotCommandEntry("quiescence"),
					],
				},
			],
		},
		{
			group: "shell",
			description: "Show or install parent-shell integration.",
			entries: [slotCommandEntry("show"), slotCommandEntry("install")],
		},
	],
});
