import { assertEquals } from "./test_deps.ts";
import { initializeWordleState, wordleGame } from "../games/wordle.ts";
import { GameStatus } from "../types.ts";

Deno.test("initializeWordleState creates empty game state", () => {
  const state = initializeWordleState("cider");
  assertEquals(state, { guesses: [], solution: "cider" });
});

Deno.test("wordleGame evaluates win after correct guess", async () => {
  const state = initializeWordleState("flame");
  wordleGame.updateState(state, "flame");
  const status = await wordleGame.evaluateStatus(state);
  assertEquals(status, GameStatus.Win);
});

Deno.test("wordleGame evaluates loss after six wrong guesses", async () => {
  const state = initializeWordleState("apple");
  for (let i = 0; i < 6; i++) {
    wordleGame.updateState(state, "wrong");
  }
  const status = await wordleGame.evaluateStatus(state);
  assertEquals(status, GameStatus.Loss);
});
