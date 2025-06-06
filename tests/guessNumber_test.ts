import { assertEquals } from "./test_deps.ts";
import { guessNumberGame } from "../games/guessNumber.ts";
import { GameStatus } from "../types.ts";

Deno.test("guessNumberGame initializes with empty guesses", () => {
  const state = guessNumberGame.initializeState(50) as any;
  assertEquals(state, { guesses: [], target: 50 });
});

Deno.test("guessNumberGame evaluates win when guess matches target", () => {
  const state = guessNumberGame.initializeState(42) as any;
  guessNumberGame.updateState(state, "42");
  const status = guessNumberGame.evaluateStatus(state as any);
  assertEquals(status, GameStatus.Win);
});

Deno.test("guessNumberGame evaluates loss after eight guesses", () => {
  const state = guessNumberGame.initializeState(10) as any;
  for (let i = 0; i < 8; i++) {
    guessNumberGame.updateState(state, String(i));
  }
  const status = guessNumberGame.evaluateStatus(state as any);
  assertEquals(status, GameStatus.Loss);
});
