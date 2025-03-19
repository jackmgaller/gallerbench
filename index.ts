import { benchmarkAidanbench } from "./benchmarkGame.ts";
import { adversarialGameLoop, gameLoop, multiplayerGameLoop } from "./gameLoop.ts";
import { connect4Game } from "./games/connectFour.ts";
import { equationGeneratorGame, equationSolverGame } from "./games/equationGame.ts";
import { benchmarkPoliticalCompass } from "./games/politicalCompass.ts";
import { wordleGame } from "./games/wordle.ts";
import { getOpenAIModels, LanguageModelName, models, streamToConsole } from "./models.ts";

if (false) {
	const m = await getOpenAIModels();
	console.log(m.map((model) => model.id).join("\n"));
}

if (false) {
	const gpt45 = models[LanguageModelName["GPT-4.5 preview"]];

	const r = await gameLoop(wordleGame, gpt45, "jelly");

	console.log(r);
}

if (false) {
	const model = models[LanguageModelName["GPT-4.5 preview"]];

	console.log("Waiting for " + model.name + " response...");
	const resp = await model.complete([
		{
			content: "How are hotel star ratings determined in Japan? Answer concisely.",
			role: "user",
		},
	]);

	console.log(resp.content);
}

if (false) {
	const model = models[LanguageModelName["GPT-4.5 preview"]];

	console.log("Streaming " + model.name + " response...");
	const prompt = "Tell me about the TV show Eyewitness from the 90's. What's up with the museum?";
	const content = await streamToConsole(model, [
		{
			content: prompt,
			role: "user",
		},
	]);

	await Deno.writeTextFile(
		"data/" + model.name + "-conversation.json",
		JSON.stringify(
			[
				{
					role: "user",
					content: prompt,
				},
				{
					role: "assistant",
					content,
				},
			],
			null,
			"\t",
		),
	);
}

if (true) {
	const model = models[LanguageModelName["GPT-4.5 preview"]];

	console.log("Streaming " + model.name + " response...");

	const content = await streamToConsole(
		model,
		JSON.parse(
			await Deno.readTextFile("data/" + model.name + "-conversation.json"),
		),
	);
}

if (false) {
	const model = models[LanguageModelName["Claude 3.7 Sonnet"]];

	console.log("Waiting for " + model.name + " response...");
	const resp = await model.complete([
		{
			content:
				"My girlfriend and I just started watching Twin Peaks. I like pretentious movies and TV shows. What's some stuff I should look for to enhance my viewing experience, you can give very light spoilers if you need to.",
			role: "user",
		},
	], {
		thinking: {
			type: "enabled",
			budget_tokens: 2048,
		},
	});

	console.log(resp.content);
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
	// Pass false to use cache, true to skip cache
	const skipCache = false;

	await benchmarkPoliticalCompass(
		[
			models[LanguageModelName["Claude 3.5 Haiku"]],
			models[LanguageModelName["Claude 3.7 Sonnet"]],
			models[LanguageModelName["o3 mini low"]],
		],
		"data/Political Compass/your_political_beliefs_transcript.txt",
		"data/Political Compass/Jack.json",
		skipCache,
	);
}
