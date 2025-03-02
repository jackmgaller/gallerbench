// statistics.ts

import { LanguageModel, OpenAIReasoningModel } from "./models.ts";
import { Game, GameStatus, MultiplayerGame } from "./types.ts";

// Shared type for model information.
export type ModelEntry = {
	name?: string;
	reasoningEffort?: "low" | "medium" | "high";
};

// Legacy log entry – all properties are optional.
export type LegacyLogEntry = {
	name?: string;
	version?: number;
	result?: GameStatus;
	timestamp?: string;
	model?: string;
	reasoningEffort?: "low" | "medium" | "high";
};

// New single-player log entry.
export type SinglePlayerLog = {
	type: "single";
	name: string;
	version: number;
	model: ModelEntry;
	result: GameStatus;
	timestamp: string;
};

// New multiplayer log entry.
export type MultiplayerLog = {
	type: "multiplayer";
	name: string;
	version: number;
	models: ModelEntry[];
	winner: number;
	result: GameStatus;
	timestamp: string;
};

// The overall log entry type supports both legacy and new logs.
export type LogObject = LegacyLogEntry | SinglePlayerLog | MultiplayerLog;

const STATISTICS_FILE = "out/results.json";

async function readStatisticsFile(): Promise<LogObject[]> {
	try {
		const fileContents = await Deno.readTextFile(STATISTICS_FILE);
		return JSON.parse(fileContents) as LogObject[];
	} catch (error) {
		throw new Error("Error reading statistics file:" + error);
	}
}

async function writeStatisticsFile(data: LogObject[]) {
	try {
		await Deno.writeTextFile(
			STATISTICS_FILE,
			JSON.stringify(data, null, "\t"),
		);
	} catch (error) {
		throw new Error("Error writing to statistics file:" + error);
	}
}

export async function logGameResult(
	gameResult: GameStatus,
	game: Game<any>,
	model: LanguageModel,
) {
	const data = await readStatisticsFile();

	// Build the model entry using the shared type.
	const modelEntry: ModelEntry = model instanceof OpenAIReasoningModel
		? { name: model.name, reasoningEffort: model.defaultReasoningEffort }
		: { name: model.name };

	const logEntry: SinglePlayerLog = {
		type: "single",
		name: game.name,
		version: game.version,
		result: gameResult,
		timestamp: new Date().toISOString(),
		model: modelEntry,
	};

	data.push(logEntry);
	await writeStatisticsFile(data);
}

export async function logMultiplayerGameResult(
	gameResult: GameStatus,
	game: MultiplayerGame<any>,
	models: LanguageModel[],
	winner: number,
) {
	const data = await readStatisticsFile();

	// Create an array of model entries.
	const modelEntries: ModelEntry[] = models.map((m) =>
		m instanceof OpenAIReasoningModel ? { name: m.name, reasoningEffort: m.defaultReasoningEffort } : { name: m.name }
	);

	const logEntry: MultiplayerLog = {
		type: "multiplayer",
		name: game.name,
		version: game.version,
		models: modelEntries,
		winner,
		result: gameResult,
		timestamp: new Date().toISOString(),
	};

	data.push(logEntry);
	await writeStatisticsFile(data);
}

export async function calculateWinRate(
	criteria: { models?: string[]; games?: string[]; versions?: number[] },
) {
	const data = await readStatisticsFile();

	let filteredData = data;

	if (criteria.models) {
		filteredData = filteredData.filter((log) => {
			// For new logs, check against model entries.
			if ("type" in log && log.type === "single") {
				return criteria.models?.includes(log.model.name || "");
			} else if ("type" in log && log.type === "multiplayer") {
				return log.models.some((entry) => criteria.models?.includes(entry.name || ""));
			}
			// Legacy log entry:
			return criteria.models?.includes(log.model || "");
		});
	}

	if (criteria.games) {
		filteredData = filteredData.filter((log) => criteria.games?.includes(log.name || ""));
	}

	if (criteria.versions) {
		filteredData = filteredData.filter((log) => criteria.versions?.includes(log.version || 0));
	}

	const totalGames = filteredData.length;
	const totalWins = filteredData.reduce((count, log) => {
		if (log.result === GameStatus.Win) {
			return count + 1;
		}
		return count;
	}, 0);

	const winRate = totalGames === 0 ? 0 : (totalWins / totalGames) * 100;
	return { n: totalGames, winRate, wins: totalWins };
}
