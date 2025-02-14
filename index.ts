import { benchmarkGame } from "./benchmarkGame.ts";
import { gameLoop, multiplayerGameLoop } from "./gameLoop.ts";
import {
	aidanbenchGame,
	initializeAidanBenchState,
} from "./games/aidanbench.ts";
import { connect4Game, initializeConnect4State } from "./games/connectFour.ts";
import { initializeGame, texasHoldEm } from "./games/poker.ts";
import { ticTacToeGame } from "./games/ticTacToe.ts";
import { initializeWordleState, wordleGame } from "./games/wordle.ts";
import {
	getOpenAIModels,
	HumanPlayer,
	LanguageModel,
	LanguageModelName,
	models,
} from "./models.ts";
import {
	calculateWinRate,
	logGameResult,
	logMultiplayerGameResult,
} from "./statistics.ts";
import aidanbenchQuestions from "./data/aidanbenchQuestions.json" with { type: "json" };

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
		models[LanguageModelName["o1"]],
		initializeAidanBenchState(
			randomQ,
		),
	);

	await gameLoop(
		aidanbenchGame,
		models[LanguageModelName["Claude 3.5 Sonnet"]],
		initializeAidanBenchState(
			"Propose an alternative to democracy for successfully and fairly governing a country.",
		),
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
		],
		initializeGame(4),
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
		initializeConnect4State(),
	);
}

if (false) {
	for (let i = 0; i < 3; i++) {
		const competitors: LanguageModel[] = [
			models[LanguageModelName["o3 mini"]],
			models[LanguageModelName["o3 mini"]],
		];
		const run = await multiplayerGameLoop(ticTacToeGame, competitors, {
			board: [
				[null, null, null],
				[null, null, null],
				[null, null, null],
			],
			turn: 1,
		});

		await logMultiplayerGameResult(
			run.status,
			ticTacToeGame,
			competitors,
			run.winner,
		);
	}
}
