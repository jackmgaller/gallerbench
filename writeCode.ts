import { parse } from "https://deno.land/std@0.182.0/path/mod.ts";
import { readLines } from "https://deno.land/std@0.182.0/io/mod.ts";

export async function writeCode(modelOutput: string) {
	const fileRegex = /<(\+?)(.+?)>\n([\s\S]*?)<\/\2>/g;
	let match;

	while ((match = fileRegex.exec(modelOutput)) !== null) {
		const [, isNew, filename, content] = match;
		const fullPath = isNew ? filename : `./${filename}`;
		const { dir } = parse(fullPath);

		console.log(`File: ${fullPath}`);
		console.log("Content:");
		console.log(content);
		console.log();

		const prompt = `Do you want to ${isNew ? "create" : "update"} this file? (y/n): `;
		const answer = await getUserInput(prompt);

		if (answer.toLowerCase() === "y") {
			try {
				if (dir) {
					await Deno.mkdir(dir, { recursive: true });
				}
				await Deno.writeTextFile(fullPath, content);
				console.log(
					`File ${isNew ? "created" : "updated"}: ${fullPath}`,
				);
			} catch (error) {
				console.error(`Error writing file ${fullPath}:`, error);
			}
		} else {
			console.log(
				`Skipped ${isNew ? "creating" : "updating"} file: ${fullPath}`,
			);
		}
		console.log();
	}
}

async function getUserInput(prompt: string): Promise<string> {
	const reader = readLines(Deno.stdin);
	console.log(prompt);
	const line = await reader.next();
	return line.value || "";
}
