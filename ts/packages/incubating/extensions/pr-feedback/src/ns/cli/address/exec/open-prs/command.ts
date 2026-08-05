import { findPrimitiveOperation } from "../../../../../primitive-commands.ts";
import { prAddressOperationNsCommand } from "../../../../command.ts";

export async function command() {
	return prAddressOperationNsCommand(findPrimitiveOperation("open-prs"));
}
