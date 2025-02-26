import { benchmarkAidanbench, benchmarkGame } from "./benchmarkGame.ts";
import { adversarialGameLoop, multiplayerGameLoop } from "./gameLoop.ts";
import { connect4Game } from "./games/connectFour.ts";
import {
	equationGeneratorGame,
	equationSolverGame,
} from "./games/equationGame.ts";
import { texasHoldEm } from "./games/poker.ts";
import { snakeGame } from "./games/snake.ts";
import { ticTacToeGame } from "./games/ticTacToe.ts";
import { wordleGame } from "./games/wordle.ts";
import {
	getOpenAIModels,
	LanguageModel,
	LanguageModelName,
	models,
} from "./models.ts";
import { logMultiplayerGameResult } from "./statistics.ts";

if (false) {
	const m = await getOpenAIModels();
	console.log(m.map((model) => model.id).join("\n"));
}

if (false) {
	const generatorModel = models[LanguageModelName["o3 mini high"]];
	const solverModel = models[LanguageModelName["o3 mini high"]];

	const result = await adversarialGameLoop(
		equationGeneratorGame,
		equationSolverGame,
		generatorModel,
		solverModel,
		null,
	);

	console.log(result);
}

if (false) {
	const r = await multiplayerGameLoop(snakeGame, [
		models[LanguageModelName["o3 mini"]],
		models[LanguageModelName["o3 mini"]],
	], 2);

	console.log(r.state);
}

if (false) {
	const r = await benchmarkAidanbench([
		models[LanguageModelName["GPT-4o mini"]],
		models[LanguageModelName["GPT-4o"]],
		models[LanguageModelName["o3 mini low"]],
	]);

	await Deno.writeTextFile(
		"out/aidanbench_j2_results.json",
		JSON.stringify(r, null, "\t"),
	);
}

if (true) {
	// Select the models you want to test.
	const testModels: LanguageModel[] = [
		models[LanguageModelName["Claude 3.7 Sonnet"]],
		models[LanguageModelName["Claude 3.7 Sonnet"]],
		models[LanguageModelName["Claude 3.7 Sonnet"]],
	];

	// Number of iterations per model.
	const iterations = 10;

	// For Wordle, the state generator selects a random word.
	const words = (await Deno.readTextFile("data/words.txt")).split("\n")
		.filter(
			Boolean,
		);
	const stateGenerator = () => {
		const randomWord = words[Math.floor(Math.random() * words.length)];
		return randomWord;
	};

	// Run the benchmark with different max_tokens settings for each model
	const benchmarkResults = await benchmarkGame(
		wordleGame,
		testModels,
		stateGenerator,
		iterations,
		{
			modelOptions: {
				0: { max_tokens: 128 },  // First model with limited tokens
				1: { max_tokens: 1024 }, // Second model with more tokens
				2: { max_tokens: 3000 }, // Second model with more tokens
			}
		}
	);

	// Output the results.
	console.log("Benchmark Results:");
	benchmarkResults.forEach(({ model, wins, total, winRate }, index) => {
		const tokenLimit = index === 0 ? "64" : "1024";
		console.log(
			`${model.name} (max_tokens: ${tokenLimit}): ${wins}/${total} wins (${winRate.toFixed(2)}%)`,
		);
	});
}

if (false) {
	const run = await multiplayerGameLoop(
		texasHoldEm,
		[
			models[LanguageModelName["o3 mini"]],
			models[LanguageModelName["o3 mini"]],
			models[LanguageModelName["o3 mini"]],
			models[LanguageModelName["o3 mini"]],
		],
		null,
	);

	console.log(run.state);
	console.log(run.winner);
}

if (false) {
	const run = await multiplayerGameLoop(
		connect4Game,
		[
			models[LanguageModelName["o3 mini high"]],
			models[LanguageModelName["o3 mini high"]],
		],
		null,
	);
}

if (false) {
	for (let i = 0; i < 3; i++) {
		const competitors: LanguageModel[] = [
			models[LanguageModelName["o3 mini"]],
			models[LanguageModelName["o3 mini"]],
		];
		const run = await multiplayerGameLoop(ticTacToeGame, competitors, null);

		await logMultiplayerGameResult(
			run.status,
			ticTacToeGame,
			competitors,
			run.winner,
		);
	}
}
