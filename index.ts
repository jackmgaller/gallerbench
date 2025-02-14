import { benchmarkGame } from "./benchmarkGame.ts";
import aidanbenchQuestions from "./data/aidanbenchQuestions.json" with { type: "json" };
import { gameLoop, multiplayerGameLoop } from "./gameLoop.ts";
import {
  aidanbenchGame,
} from "./games/aidanbench.ts";
import { connect4Game } from "./games/connectFour.ts";
import { texasHoldEm } from "./games/poker.ts";
import { ticTacToeGame } from "./games/ticTacToe.ts";
import { initializeWordleState, wordleGame } from "./games/wordle.ts";
import {
  getOpenAIModels,
  LanguageModel,
  LanguageModelName,
  models
} from "./models.ts";
import {
  logMultiplayerGameResult
} from "./statistics.ts";

if (false) {
	const m = await getOpenAIModels();
	console.log(m.map((model) => model.id).join("\n"));
}
console.log([
	models[LanguageModelName["o3 mini high"]],
	models[LanguageModelName["o3 mini low"]],
]);

if (true) {
  const randomQ = aidanbenchQuestions[Math.floor(aidanbenchQuestions.length * Math.random())];

  console.log(randomQ);

  await gameLoop(
		aidanbenchGame,
		models[LanguageModelName["GPT-4o"]],	
    randomQ,
	);
}

if (false) {
	// Select the models you want to test.
	const testModels: LanguageModel[] = [
		models[LanguageModelName["o1 mini"]],
		models[LanguageModelName["o3 mini low"]],
	];

	// Number of iterations per model.
	const iterations = 5;

	// For Wordle, the state generator selects a random word.
	const words = (await Deno.readTextFile("data/words.txt")).split("\n")
		.filter(
			Boolean,
		);
	const stateGenerator = () => {
		const randomWord = words[Math.floor(Math.random() * words.length)];
		return initializeWordleState(randomWord);
	};

	// Run the benchmark.
	const benchmarkResults = await benchmarkGame(
		wordleGame,
		testModels,
		iterations,
		stateGenerator,
	);

	// Output the results.
	console.log("Benchmark Results:");
	benchmarkResults.forEach(({ model, wins, total, winRate }) => {
		console.log(
			`${model.name}: ${wins}/${total} wins (${winRate.toFixed(2)}%)`,
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
		]
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
	);
}

if (false) {
	for (let i = 0; i < 3; i++) {
		const competitors: LanguageModel[] = [
			models[LanguageModelName["o3 mini"]],
			models[LanguageModelName["o3 mini"]],
		];
		const run = await multiplayerGameLoop(ticTacToeGame, competitors);

		await logMultiplayerGameResult(
			run.status,
			ticTacToeGame,
			competitors,
			run.winner,
		);
	}
}
