import { GameStatus, MultiplayerGame } from "../types.ts";

export enum PokemonType {
        Normal,
        Fire,
        Water,
        Grass,
        Electric,
        Psychic,
        Ghost,
        Steel,
        Rock,
        Ground,
        Dragon,
        Poison,
        Ice,
}

export enum MoveCategory {
        Physical,
        Special,
        Status,
}

export enum StatusCondition {
        Burn,
        Paralyze,
        Poison,
}

export type Stats = {
        hp: number;
        attack: number;
        defense: number;
        speed: number;
};

export type StatStages = {
        attack: number;
        defense: number;
        speed: number;
};

export type MoveEffect = {
        status?: StatusCondition;
        targetStat?: keyof StatStages;
        stageChange?: number;
        selfStat?: keyof StatStages;
        selfStageChange?: number;
};

export type Move = {
        name: string;
        type: PokemonType;
        power: number; // 0 for status moves
        accuracy: number; // 0-1
        category: MoveCategory;
        effect?: MoveEffect;
};

export type Pokemon = {
        name: string;
        types: PokemonType[];
        stats: Stats;
        moves: Move[];
        currentHP: number;
        statStages: StatStages;
        status?: StatusCondition;
};

const typeChart: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
        [PokemonType.Normal]: {},
        [PokemonType.Fire]: {
                [PokemonType.Grass]: 2,
                [PokemonType.Water]: 0.5,
                [PokemonType.Steel]: 2,
                [PokemonType.Ice]: 2,
        },
        [PokemonType.Water]: {
                [PokemonType.Fire]: 2,
                [PokemonType.Grass]: 0.5,
                [PokemonType.Rock]: 2,
        },
        [PokemonType.Grass]: {
                [PokemonType.Water]: 2,
                [PokemonType.Fire]: 0.5,
        },
        [PokemonType.Electric]: {
                [PokemonType.Water]: 2,
        },
        [PokemonType.Ground]: {
                [PokemonType.Electric]: 2,
                [PokemonType.Fire]: 2,
        },
        [PokemonType.Rock]: {
                [PokemonType.Fire]: 2,
                [PokemonType.Ice]: 2,
        },
        [PokemonType.Psychic]: {},
        [PokemonType.Ghost]: {},
        [PokemonType.Steel]: {},
        [PokemonType.Dragon]: {},
        [PokemonType.Poison]: {},
        [PokemonType.Ice]: {},
};

const stageMultiplier = (stage: number): number => {
        if (stage >= 0) return (2 + stage) / 2;
        return 2 / (2 - stage);
};

const typeMultiplier = (
        moveType: PokemonType,
        targetTypes: PokemonType[],
): number => {
        return targetTypes.reduce((mult, t) => {
                const m = typeChart[moveType][t];
                return mult * (m ?? 1);
        }, 1);
};

const applyStatusDamage = (p: Pokemon) => {
        if (p.status === StatusCondition.Burn || p.status === StatusCondition.Poison) {
                p.currentHP = Math.max(0, p.currentHP - Math.floor(p.stats.hp / 8));
        }
};

const calculateDamage = (attacker: Pokemon, defender: Pokemon, move: Move): number => {
        if (move.power <= 0) return 0;
        const attackStat = attacker.stats.attack * stageMultiplier(attacker.statStages.attack) * (attacker.status === StatusCondition.Burn ? 0.5 : 1);
        const defenseStat = defender.stats.defense * stageMultiplier(defender.statStages.defense);
        const base = (move.power * attackStat) / defenseStat;
        const multiplier = typeMultiplier(move.type, defender.types);
        return Math.floor(base * multiplier);
};

export type PlayerTeamState = {
        team: Pokemon[];
        active: number;
};

export type PokemonBattleState = {
        players: [PlayerTeamState, PlayerTeamState];
};

export const initializePokemonBattleState = (
        team1: Pokemon[],
        team2: Pokemon[],
): PokemonBattleState => {
        const clone = (p: Pokemon): Pokemon => ({
                name: p.name,
                types: [...p.types],
                stats: { ...p.stats },
                moves: [...p.moves],
                currentHP: p.stats.hp,
                statStages: { attack: 0, defense: 0, speed: 0 },
                status: undefined,
        });
        return {
                players: [
                        { team: team1.map(clone), active: 0 },
                        { team: team2.map(clone), active: 0 },
                ],
        };
};

export const pokemonBattleGame: MultiplayerGame<PokemonBattleState, { teamSize?: number }> = {
        name: "Pokemon Battle",
        version: 1.0,
        players: 2,
        prompts: {
                first: (state: PokemonBattleState, currentPlayer: number) => {
                        const meTeam = state.players[currentPlayer];
                        const oppTeam = state.players[1 - currentPlayer];
                        const me = meTeam.team[meTeam.active];
                        const opp = oppTeam.team[oppTeam.active];
                        const teamList = meTeam.team
                                .map((p, i) => `${i === meTeam.active ? "*" : ""}${p.name}${p.currentHP <= 0 ? "(fnt)" : ""}`)
                                .join(", ");
                        return `Your team: ${teamList}. Opponent active Pokemon is ${opp.name} (${opp.currentHP}/${opp.stats.hp}). Your active Pokemon is ${me.name} (${me.currentHP}/${me.stats.hp}). Choose a move: ${me.moves.map((m) => m.name).join(", ")} or type 'Switch <Pokemon>'`;
                },
                turn: (state: PokemonBattleState, currentPlayer: number) => {
                        const meTeam = state.players[currentPlayer];
                        const oppTeam = state.players[1 - currentPlayer];
                        const me = meTeam.team[meTeam.active];
                        const opp = oppTeam.team[oppTeam.active];
                        const teamList = meTeam.team
                                .map((p, i) => `${i === meTeam.active ? "*" : ""}${p.name}${p.currentHP <= 0 ? "(fnt)" : ""}`)
                                .join(", ");
                        return `Your team: ${teamList}. Opponent ${opp.name} (${opp.currentHP}/${opp.stats.hp}). Your ${me.name} (${me.currentHP}/${me.stats.hp}). Choose move: ${me.moves.map((m) => m.name).join(", ")} or 'Switch <Pokemon>'`;
                },
        },
        answerParserPrompt: "Return the name of the move or 'Switch <Pokemon>' to change.",
        initializeState: ({ teamSize = 3 } = {}) => initializeRandomBattleState(teamSize),
        updateState: (state, parsedAnswer, currentPlayer) => {
                if (currentPlayer === undefined) return state;

                const meTeam = state.players[currentPlayer];
                const oppTeam = state.players[1 - currentPlayer];
                let attacker = meTeam.team[meTeam.active];
                let defender = oppTeam.team[oppTeam.active];

                applyStatusDamage(attacker);
                if (attacker.currentHP <= 0) {
                        // Require a switch if attacker fainted
                        const lower = parsedAnswer.trim().toLowerCase();
                        if (lower.startsWith("switch ")) {
                                const name = parsedAnswer.slice(7).trim().toLowerCase();
                                const idx = meTeam.team.findIndex((p) => p.name.toLowerCase() === name);
                                if (idx >= 0 && meTeam.team[idx].currentHP > 0) {
                                        meTeam.active = idx;
                                }
                        }
                        return state;
                }

                const lower = parsedAnswer.trim().toLowerCase();

                if (lower.startsWith("switch ")) {
                        const name = parsedAnswer.slice(7).trim().toLowerCase();
                        const idx = meTeam.team.findIndex((p) => p.name.toLowerCase() === name);
                        if (idx >= 0 && meTeam.team[idx].currentHP > 0) {
                                meTeam.active = idx;
                        } else {
                                throw new Error("Invalid switch");
                        }
                        return state;
                }

                const move = attacker.moves.find((m: Move) => m.name.toLowerCase() === lower);
                if (!move) throw new Error("Invalid move");

                if (attacker.status === StatusCondition.Paralyze && Math.random() < 0.25) {
                        return state; // Can't move
                }

                if (Math.random() <= move.accuracy) {
                        if (move.category !== MoveCategory.Status) {
                                const dmg = calculateDamage(attacker, defender, move);
                                defender.currentHP = Math.max(0, defender.currentHP - dmg);
                        }
                        if (move.effect) {
                                if (move.effect.status && !defender.status) {
                                        defender.status = move.effect.status;
                                }
                                if (move.effect.targetStat) {
                                        (defender.statStages as any)[move.effect.targetStat] += move.effect.stageChange ?? 0;
                                }
                                if (move.effect.selfStat) {
                                        (attacker.statStages as any)[move.effect.selfStat] += move.effect.selfStageChange ?? 0;
                                }
                        }
                }

                return state;
        },
        evaluateStatus: (state) => {
                const p1Down = state.players[0].team.every((p) => p.currentHP <= 0);
                const p2Down = state.players[1].team.every((p) => p.currentHP <= 0);
                if (p1Down && p2Down) return GameStatus.Draw;
                if (p1Down || p2Down) return GameStatus.Win;
                return GameStatus.Ongoing;
        },
        winner: (state) => {
                if (state.players[0].team.every((p) => p.currentHP <= 0) && state.players[1].team.some((p) => p.currentHP > 0)) return 2;
                if (state.players[1].team.every((p) => p.currentHP <= 0) && state.players[0].team.some((p) => p.currentHP > 0)) return 1;
                return 0;
        },
};

// Example Pokemon for quick testing
type RawPokemon = {
        name: string;
        types: (keyof typeof PokemonType)[];
        stats: Stats;
        moves: {
                name: string;
                type: keyof typeof PokemonType;
                power: number;
                accuracy: number;
                category: keyof typeof MoveCategory;
                effect?: {
                        status?: keyof typeof StatusCondition;
                        targetStat?: keyof StatStages;
                        stageChange?: number;
                        selfStat?: keyof StatStages;
                        selfStageChange?: number;
                };
        }[];
};

const pokemonDataText = Deno.readTextFileSync(
        new URL("./pokemonData.json", import.meta.url),
);
const rawPokemon: RawPokemon[] = JSON.parse(pokemonDataText);

const makePokemon = (r: RawPokemon): Pokemon => ({
        name: r.name,
        types: r.types.map((t) => PokemonType[t]),
        stats: r.stats,
        moves: r.moves.map((m) => ({
                name: m.name,
                type: PokemonType[m.type],
                power: m.power,
                accuracy: m.accuracy,
                category: MoveCategory[m.category],
                effect: m.effect
                        ? {
                                  status: m.effect.status
                                          ? StatusCondition[m.effect.status]
                                          : undefined,
                                  targetStat: m.effect.targetStat,
                                  stageChange: m.effect.stageChange,
                                  selfStat: m.effect.selfStat,
                                  selfStageChange: m.effect.selfStageChange,
                          }
                        : undefined,
        })),
        currentHP: r.stats.hp,
        statStages: { attack: 0, defense: 0, speed: 0 },
});

const pokemonLibrary: Pokemon[] = rawPokemon.map(makePokemon);

export const charmander = pokemonLibrary.find((p) => p.name === "Charmander")!;
export const squirtle = pokemonLibrary.find((p) => p.name === "Squirtle")!;
export const garchomp = pokemonLibrary.find((p) => p.name === "Garchomp")!;
export const ferrothorn = pokemonLibrary.find((p) => p.name === "Ferrothorn")!;
export const tyranitar = pokemonLibrary.find((p) => p.name === "Tyranitar")!;
export const starmie = pokemonLibrary.find((p) => p.name === "Starmie")!;
export const gengar = pokemonLibrary.find((p) => p.name === "Gengar")!;
export const blissey = pokemonLibrary.find((p) => p.name === "Blissey")!;
export const pikachu = pokemonLibrary.find((p) => p.name === "Pikachu")!;
export const bulbasaur = pokemonLibrary.find((p) => p.name === "Bulbasaur")!;
export const snorlax = pokemonLibrary.find((p) => p.name === "Snorlax")!;
export const mewtwo = pokemonLibrary.find((p) => p.name === "Mewtwo")!;

export const competitivePokemon: Pokemon[] = [...pokemonLibrary];

const randomTeamFromPool = (pool: Pokemon[], size: number): Pokemon[] => {
        const shuffled = [...pool];
        for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, size);
};

export const initializeRandomBattleState = (teamSize: number): PokemonBattleState => {
        return initializePokemonBattleState(
                randomTeamFromPool(competitivePokemon, teamSize),
                randomTeamFromPool(competitivePokemon, teamSize),
        );
};

