import { gameLoop, multiplayerGameLoop } from "./gameLoop.ts";
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

const words = (await Deno.readTextFile("data/words.txt")).split("\n");

if (false) {
  const m = await getOpenAIModels();
  console.log(m.map((model) => model.id).join("\n"));
}

if (true) {
  const testingModels: LanguageModel[] = [
    models[LanguageModelName["o3 mini high"]],
    models[LanguageModelName["o3 mini low"]],
  ];

  console.log(`We have ${words.length} words to choose from`);

  for (let n = 0; n < 32; n++) {
    const randomWord = words[Math.floor(Math.random() * words.length)];
    for (let i = 0; i < testingModels.length; i++) {
      const m = testingModels[i];

      console.log(n, m.name, randomWord);
      try {
        const results = await gameLoop(
          wordleGame,
          m,
          initializeWordleState(randomWord),
        );

        logGameResult(results.status, wordleGame, m);

        console.log(
          await calculateWinRate({
            games: ["Wordle"],
            models: [m.name],
          }),
        );
      } catch (e) {
        console.error(e);
      }
    }
  }
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

if (true) {
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
