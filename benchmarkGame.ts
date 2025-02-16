// benchmarkSinglePlayerGame.ts

import { gameLoop } from "./gameLoop.ts";
import { Game, GameStatus } from "./types.ts";
import { LanguageModel, LanguageModelName, models } from "./models.ts";
import { aidanbenchGame } from "./games/aidanbench.ts";
import aidanbenchQuestions from "./data/aidanbenchJQuestions.json" with {
	type: "json",
};

type BenchmarkOutput = {
	model: LanguageModel;
	wins: number;
	total: number;
	winRate: number;
}[];

/**
 * Benchmarks a single-player game for multiple LLMs.
 *
 * @param game - The single-player game (e.g., Wordle, Guess the Number)
 * @param models - A list of LLMs to benchmark
 * @param iterations - How many times to play the game for each model
 * @param stateGenerator - A function that returns a fresh game state for each run
 * @param options - (Optional) Additional game loop options
 * @returns An array of results, each containing the LLM instance, win count, total games played, and win rate.
 */
export async function benchmarkGame<GameState extends object, GameParams extends unknown>(
	game: Game<GameState, GameParams>,
	models: LanguageModel[],
	gameParams: GameParams|(() => GameParams),
	iterations: number,
	options?: Parameters<typeof gameLoop>[3], // Using gameLoop options type
): Promise<BenchmarkOutput> {
	// Create a score tracker for each model.
	const results = models.map((model) => ({
		model,
		wins: 0,
		total: 0,
		winRate: 0,
	}));

	const isFunction = (value: GameParams | (() => GameParams)): value is (() => GameParams) => {
		return typeof value === 'function' && !('prototype' in value);
	};

	// Loop for the specified number of iterations.
	for (let i = 0; i < iterations; i++) {
		// For each model, run the game with a fresh state.
		for (let j = 0; j < models.length; j++) {
			const model = models[j];
			console.log(
				"Benchmarking: " + model.name + "\n\tIteration: " + (i + 1),
			);

			try {
				const currentGameParams = isFunction(gameParams) 
				? gameParams() 
				: gameParams;

				// Run the game loop for this model.
				const { status } = await gameLoop(
					game,
					model,
					currentGameParams,
					options,
				);
				results[j].total++;
				if (status === GameStatus.Win) {
					results[j].wins++;
				}
			} catch (err) {
				console.error(
					`Error for model ${model.name} on iteration ${i + 1}:`,
					err,
				);
			}
		}
	}

	// Calculate win rates.
	results.forEach((result) => {
		result.winRate = result.total > 0
			? (result.wins / result.total) * 100
			: 0;
	});

	return results;
}

export async function benchmarkAidanbench(models: LanguageModel[]) {
	const results = [];

	for (const question of aidanbenchQuestions) {
		for (const model of models) {
			console.log(question);
			console.log(model.name);

			const r = await gameLoop(
				aidanbenchGame,
				model,
				question,
			);

			results.push(
				{
					name: model.name,
					question,
					answers: {
						count: r.state.responses.length,
						content: r.state.responses,
					},
				},
			);
		}
	}

	const totals: Record<string, number> = {};

	results.forEach((result) => {
		if (totals[result.name]) {
			totals[result.name] += result.answers.count;
		} else {
			totals[result.name] = result.answers.count;
		}
	});

	const resultsWithTotals = {
		totals,
		results,
	};

	return resultsWithTotals;
}
