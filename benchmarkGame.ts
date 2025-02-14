// benchmarkSinglePlayerGame.ts

import { gameLoop } from "./gameLoop.ts";
import { Game, GameStatus } from "./types.ts";
import { LanguageModel } from "./models.ts";

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
export async function benchmarkGame<GameState extends object>(
	game: Game<GameState>,
	models: LanguageModel[],
	iterations: number,
	stateGenerator: () => GameState,
	options?: Parameters<typeof gameLoop>[3], // Using gameLoop options type
): Promise<BenchmarkOutput> {
	// Create a score tracker for each model.
	const results = models.map((model) => ({
		model,
		wins: 0,
		total: 0,
		winRate: 0,
	}));

	// Loop for the specified number of iterations.
	for (let i = 0; i < iterations; i++) {
		// For each model, run the game with a fresh state.
		for (let j = 0; j < models.length; j++) {
			const model = models[j];
			console.log(
				"Benchmarking: " + model.name + "\n\tIteration: " + (i + 1),
			);

			try {
				// Create a fresh game state for this run.
				const initialState = stateGenerator();
				// Run the game loop for this model.
				const { status } = await gameLoop(
					game,
					model,
					initialState,
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
