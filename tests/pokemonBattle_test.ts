import { assertEquals } from "./test_deps.ts";
import { initializePokemonBattleState, pokemonBattleGame, charmander, squirtle, PokemonBattleState } from "../games/pokemonBattle.ts";
import { GameStatus } from "../types.ts";

Deno.test("initializePokemonBattleState sets HP", () => {
  const state = initializePokemonBattleState([charmander], [squirtle]);
  assertEquals(state.players[0].team[0].currentHP, charmander.stats.hp);
  assertEquals(state.players[1].team[0].currentHP, squirtle.stats.hp);
});

Deno.test("updateState reduces opponent HP", () => {
  const state: PokemonBattleState = initializePokemonBattleState([charmander], [squirtle]);
  pokemonBattleGame.updateState(state, "Scratch", 0);
  const hp = state.players[1].team[0].currentHP;
  if (hp >= squirtle.stats.hp) {
    throw new Error("HP did not decrease");
  }
});

Deno.test("evaluateStatus returns win when opponent faints", () => {
  const state: PokemonBattleState = initializePokemonBattleState([charmander], [squirtle]);
  state.players[1].team[0].currentHP = 0;
  const status = pokemonBattleGame.evaluateStatus(state);
  assertEquals(status, GameStatus.Win);
});

Deno.test("switching changes active pokemon", () => {
  const state: PokemonBattleState = initializePokemonBattleState([charmander, squirtle], [charmander]);
  pokemonBattleGame.updateState(state, "Switch Squirtle", 0);
  assertEquals(state.players[0].team[state.players[0].active].name, "Squirtle");
});
