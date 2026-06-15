import { commandTargetsHomeRoot, tokenizeShellLikeCommand, pathValueTargetsHomeRoot } from "./.pi/extensions/home-directory-guard.js";

console.log(commandTargetsHomeRoot("ls /Users/schrockn/"));
console.log(tokenizeShellLikeCommand("ls /Users/schrockn/"));
console.log(pathValueTargetsHomeRoot("/Users/schrockn/"));
