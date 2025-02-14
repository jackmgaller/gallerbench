import { GameStatus, MultiplayerGame } from "../types.ts";

// ─── TYPES AND UTILITY FUNCTIONS ───────────────────────────────────────────────

export type Card = {
	rank:
		| "2"
		| "3"
		| "4"
		| "5"
		| "6"
		| "7"
		| "8"
		| "9"
		| "10"
		| "J"
		| "Q"
		| "K"
		| "A";
	suit: "♣" | "♦" | "♥" | "♠";
};

function createShuffledDeck(): Card[] {
	const suits: Card["suit"][] = ["♣", "♦", "♥", "♠"];
	const values: Card["rank"][] = [
		"2",
		"3",
		"4",
		"5",
		"6",
		"7",
		"8",
		"9",
		"10",
		"J",
		"Q",
		"K",
		"A",
	];
	const deck: Card[] = suits.flatMap((suit) =>
		values.map((rank) => ({ suit, rank }))
	);
	// Shuffle (Fisher–Yates)
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

export function handToString(hand: Card[]): string {
	return hand.map((c) => c.rank + c.suit).join(" ");
}

// ─── STATE INTERFACES ───────────────────────────────────────────────────────────

interface PlayerState {
	hand: Card[];
	chips: number;
	bet: number;
	folded: boolean;
}

export type TexasHoldEmState = {
	deck: Card[];
	players: PlayerState[];
	communityCards: Card[];
	currentBet: number; // current bet that players must match
	pot: number;
	dealer: number; // index of the dealer
	phase: "pre-flop" | "flop" | "turn" | "river" | "showdown";
	currentPlayer: number; // index of the player whose turn it is
	// For the current betting round, tracks which players have already acted.
	playersActed: Set<number>;
};

// ─── PROMPT FUNCTIONS ───────────────────────────────────────────────────────────

const buildPrompt = (
	state: TexasHoldEmState,
	currentPlayer: number,
): string => {
	const player = state.players[currentPlayer];
	const community = state.communityCards.length > 0
		? handToString(state.communityCards)
		: "None";
	const prompt =
		`You are playing Texas Hold 'Em. You're trying to make as much money as possible.
Your chips: ${player.chips}
Your hand: ${handToString(player.hand)}
Community Cards: ${community}
Current bet to call: ${state.currentBet} (you have already bet ${player.bet})
Pot: ${state.pot}

It is your turn. Please enter your action in one of the following forms:
- fold
- check  (only allowed if you’ve already matched the current bet)
- call
- raise <amount>  (to add to the current bet)

Your move:`;
	return prompt;
};

const firstPrompt = (
	state: TexasHoldEmState,
	currentPlayer?: number,
): string => {
	if (currentPlayer === undefined) {
		throw new Error("Current player not defined for prompt.");
	}
	return buildPrompt(state, currentPlayer);
};

// ─── UPDATE STATE FUNCTION ──────────────────────────────────────────────────────

const updateState = (
	state: TexasHoldEmState,
	action: string,
	currentPlayer?: number,
): TexasHoldEmState => {
	if (currentPlayer === undefined) {
		throw new Error("Current player not specified in updateState.");
	}

	const player = state.players[currentPlayer];
	if (player.folded) {
		// If already folded, ignore any further action.
		return state;
	}

	// Parse the action.
	const parts = action.trim().toLowerCase().split(/\s+/);
	const command = parts[0];

	switch (command) {
		case "fold":
			player.folded = true;
			break;

		case "check":
			if (player.bet !== state.currentBet) {
				throw new Error(
					"Invalid action: You cannot check unless your bet matches the current bet.",
				);
			}
			// No chips exchanged.
			break;

		case "call": {
			const callAmount = state.currentBet - player.bet;
			if (player.chips < callAmount) {
				throw new Error("Insufficient chips to call.");
			}
			player.chips -= callAmount;
			player.bet = state.currentBet;
			state.pot += callAmount;
			break;
		}

		case "raise": {
			if (parts.length < 2) {
				throw new Error("Raise command must be followed by an amount.");
			}
			const raiseIncrement = parseInt(parts[1], 10);
			if (isNaN(raiseIncrement) || raiseIncrement <= 0) {
				throw new Error("Invalid raise amount.");
			}
			const newBet = state.currentBet + raiseIncrement;
			const additionalAmount = newBet - player.bet;
			if (player.chips < additionalAmount) {
				throw new Error("Insufficient chips to raise.");
			}
			player.chips -= additionalAmount;
			player.bet = newBet;
			state.pot += additionalAmount;
			state.currentBet = newBet;
			// When a raise occurs, reset the set of players who have acted.
			state.playersActed.clear();
			break;
		}

		default:
			throw new Error("Unknown action: " + command);
	}

	// Mark that this player has acted in the current betting round.
	state.playersActed.add(currentPlayer);

	// Check if the betting round is complete.
	const activePlayers = state.players.filter((p) => !p.folded);
	const allMatched = activePlayers.every((p) => p.bet === state.currentBet);
	if (allMatched && state.playersActed.size >= activePlayers.length) {
		// Reset bets for the next betting round.
		state.players.forEach((p) => (p.bet = 0));
		state.currentBet = 0;
		state.playersActed.clear();

		// Transition to the next phase.
		if (state.phase === "pre-flop") {
			state.phase = "flop";
			// Deal three community cards.
			state.communityCards.push(
				state.deck.pop()!,
				state.deck.pop()!,
				state.deck.pop()!,
			);
		} else if (state.phase === "flop") {
			state.phase = "turn";
			state.communityCards.push(state.deck.pop()!);
		} else if (state.phase === "turn") {
			state.phase = "river";
			state.communityCards.push(state.deck.pop()!);
		} else if (state.phase === "river") {
			state.phase = "showdown";
		}
	}

	// Determine the next active player.
	let nextPlayer = (currentPlayer + 1) % state.players.length;
	for (let i = 0; i < state.players.length; i++) {
		if (!state.players[nextPlayer].folded) break;
		nextPlayer = (nextPlayer + 1) % state.players.length;
	}
	state.currentPlayer = nextPlayer;

	return state;
};

// ─── EVALUATION AND WINNER DETERMINATION ───────────────────────────────────────

const evaluateStatus = (state: TexasHoldEmState): GameStatus => {
	const activePlayers = state.players.filter((p) => !p.folded);
	if (activePlayers.length <= 1) {
		return GameStatus.Win;
	}
	if (state.phase === "showdown") {
		return GameStatus.Win;
	}
	return GameStatus.Ongoing;
};

// ─── ANSWER PARSER PROMPT ─────────────────────────────────────────────────────────

const answerParserPrompt =
	"Extract the player's action from the following response. The valid actions are exactly one of the following (with no extra characters): 'fold', 'check', 'call', or 'raise <amount>' where <amount> is a positive integer.";

// ─── HAND EVALUATION FUNCTIONS FOR POKER ─────────────────────────────────────

// Mapping card rank strings to numerical values.
const rankToValue: Record<Card["rank"], number> = {
	"2": 2,
	"3": 3,
	"4": 4,
	"5": 5,
	"6": 6,
	"7": 7,
	"8": 8,
	"9": 9,
	"10": 10,
	"J": 11,
	"Q": 12,
	"K": 13,
	"A": 14,
};

// The evaluated hand includes a numerical ranking, tiebreaker values, a name, and the 5 cards.
type EvaluatedHand = {
	handRank: number; // Higher is better.
	tiebreakers: number[]; // In order of importance (e.g. for One Pair: [pair value, kicker1, kicker2, kicker3])
	handName: string; // e.g. "Full House", "Flush", etc.
	cards: Card[]; // The five cards that make up this hand.
};

// We assign numbers to each hand type (you can adjust these as long as higher numbers mean a stronger hand).
enum HandRankings {
	HighCard = 1,
	OnePair,
	TwoPair,
	ThreeOfAKind,
	Straight,
	Flush,
	FullHouse,
	FourOfAKind,
	StraightFlush,
}

// Evaluate a five‐card hand. (Note that a “Royal Flush” is simply a straight flush whose high card is an Ace.)
function evaluateFiveHand(cards: Card[]): EvaluatedHand {
	// Get card values (sorted high to low) and the suits.
	const values = cards.map((card) => rankToValue[card.rank]).sort((a, b) =>
		b - a
	);
	const suits = cards.map((card) => card.suit);

	// Check for a flush (all cards the same suit).
	const isFlush = suits.every((suit) => suit === suits[0]);

	// Check for a straight. We use the unique sorted values.
	const uniqueValues = Array.from(new Set(values)).sort((a, b) => b - a);
	let isStraight = false;
	let straightHigh = 0;
	if (uniqueValues.length === 5) {
		if (uniqueValues[0] - uniqueValues[4] === 4) {
			isStraight = true;
			straightHigh = uniqueValues[0];
		} else if (
			uniqueValues[0] === 14 &&
			uniqueValues[1] === 5 &&
			uniqueValues[2] === 4 &&
			uniqueValues[3] === 3 &&
			uniqueValues[4] === 2
		) {
			// Ace can be low: treat A,5,4,3,2 as a straight.
			isStraight = true;
			straightHigh = 5;
		}
	}

	// Count how many times each card value appears.
	const freq: Record<number, number> = {};
	for (const v of values) {
		freq[v] = (freq[v] || 0) + 1;
	}

	// Create groups for the counts and sort them (first by count, then by card value).
	const groups = Object.entries(freq)
		.map(([val, count]) => ({ value: parseInt(val), count }))
		.sort((a, b) => {
			if (b.count === a.count) {
				return b.value - a.value;
			}
			return b.count - a.count;
		});

	// Determine the hand type following the standard hierarchy.
	if (isStraight && isFlush) {
		return {
			handRank: HandRankings.StraightFlush,
			tiebreakers: [straightHigh],
			handName: "Straight Flush",
			cards,
		};
	}
	if (groups[0].count === 4) {
		// Four of a Kind: use the quad value and then the kicker.
		const kicker = groups.find((g) => g.count === 1)!.value;
		return {
			handRank: HandRankings.FourOfAKind,
			tiebreakers: [groups[0].value, kicker],
			handName: "Four of a Kind",
			cards,
		};
	}
	if (groups[0].count === 3 && groups.length > 1 && groups[1].count >= 2) {
		// Full House: triple value then pair value.
		return {
			handRank: HandRankings.FullHouse,
			tiebreakers: [groups[0].value, groups[1].value],
			handName: "Full House",
			cards,
		};
	}
	if (isFlush) {
		return {
			handRank: HandRankings.Flush,
			tiebreakers: values, // all five card values in descending order.
			handName: "Flush",
			cards,
		};
	}
	if (isStraight) {
		return {
			handRank: HandRankings.Straight,
			tiebreakers: [straightHigh],
			handName: "Straight",
			cards,
		};
	}
	if (groups[0].count === 3) {
		// Three of a Kind: triple value and then the two kickers.
		const kickers = groups.filter((g) => g.count === 1).map((g) => g.value)
			.sort((a, b) => b - a);
		return {
			handRank: HandRankings.ThreeOfAKind,
			tiebreakers: [groups[0].value, ...kickers],
			handName: "Three of a Kind",
			cards,
		};
	}
	if (groups[0].count === 2) {
		if (groups.length > 1 && groups[1].count === 2) {
			// Two Pair: higher pair, lower pair, then kicker.
			const pairValues = groups.filter((g) => g.count === 2).map((g) =>
				g.value
			)
				.sort((a, b) => b - a);
			const kicker = groups.find((g) => g.count === 1)!.value;
			return {
				handRank: HandRankings.TwoPair,
				tiebreakers: [pairValues[0], pairValues[1], kicker],
				handName: "Two Pair",
				cards,
			};
		} else {
			// One Pair: the pair and then three kickers.
			const kickers = groups.filter((g) => g.count === 1).map((g) =>
				g.value
			)
				.sort((a, b) => b - a);
			return {
				handRank: HandRankings.OnePair,
				tiebreakers: [groups[0].value, ...kickers],
				handName: "One Pair",
				cards,
			};
		}
	}
	// Otherwise, it is a High Card hand.
	return {
		handRank: HandRankings.HighCard,
		tiebreakers: values,
		handName: "High Card",
		cards,
	};
}

// Helper to generate all k-element combinations from an array.
function getCombinations<T>(array: T[], k: number): T[][] {
	const results: T[][] = [];
	function combine(start: number, combo: T[]) {
		if (combo.length === k) {
			results.push(combo);
			return;
		}
		for (let i = start; i < array.length; i++) {
			combine(i + 1, [...combo, array[i]]);
		}
	}
	combine(0, []);
	return results;
}

// Given 7 cards (2 hole cards + community cards), find the best 5-card hand.
function bestHandFromSeven(cards: Card[]): EvaluatedHand {
	const combinations = getCombinations(cards, 5);
	let best: EvaluatedHand | null = null;
	for (const combo of combinations) {
		const evaluated = evaluateFiveHand(combo);
		if (best === null || compareEvaluatedHands(evaluated, best) > 0) {
			best = evaluated;
		}
	}
	return best!;
}

// Compare two evaluated hands. Returns 1 if hand A wins, -1 if B wins, or 0 if they are equal.
function compareEvaluatedHands(a: EvaluatedHand, b: EvaluatedHand): number {
	if (a.handRank !== b.handRank) {
		return a.handRank > b.handRank ? 1 : -1;
	}
	for (
		let i = 0;
		i < Math.max(a.tiebreakers.length, b.tiebreakers.length);
		i++
	) {
		const ta = a.tiebreakers[i] || 0;
		const tb = b.tiebreakers[i] || 0;
		if (ta !== tb) {
			return ta > tb ? 1 : -1;
		}
	}
	return 0;
}

// ─── UPDATING THE POKER GAME'S DETERMINE WINNER FUNCTION ────────────────────

// In the original Texas Hold 'Em game (in games/poker.ts) the winner was chosen simply.
// Replace it with the following which evaluates each active player's best hand.
const determineWinner = (state: TexasHoldEmState): number => {
	const activePlayers = state.players
		.map((p, i) => ({ player: p, index: i }))
		.filter(({ player }) => !player.folded);

	if (activePlayers.length === 0) {
		throw new Error("No active players remaining.");
	}

	let bestPlayer = activePlayers[0];
	let bestHand = bestHandFromSeven([
		...activePlayers[0].player.hand,
		...state.communityCards,
	]);

	for (let i = 1; i < activePlayers.length; i++) {
		const currentPlayer = activePlayers[i];
		const currentHand = bestHandFromSeven([
			...currentPlayer.player.hand,
			...state.communityCards,
		]);
		if (compareEvaluatedHands(currentHand, bestHand) > 0) {
			bestHand = currentHand;
			bestPlayer = currentPlayer;
		}
	}

	console.log(
		`Best hand: ${bestHand.handName} with tiebreakers ${
			bestHand.tiebreakers.join(", ")
		}`,
	);

	// Return a 1-indexed player number.
	return bestPlayer.index + 1;
};

// ─── UPDATE THE TEXAS HOLD 'EM GAME OBJECT ─────────────────────────────────────
// In your exported texasHoldEm game object (in games/poker.ts), replace the old winner
// function with the updated one that uses hand evaluation:
export const texasHoldEm: MultiplayerGame<TexasHoldEmState> = {
	name: "Texas Hold 'Em",
	version: 1.1,
	players: "dynamic", // number of players specified at runtime
	prompts: {
		first: firstPrompt,
		turn: firstPrompt, // reusing the same prompt for each turn
	},
	initializeState: (playersCount: number): TexasHoldEmState => {
		const deck = createShuffledDeck();
		const players: PlayerState[] = [];
		for (let i = 0; i < playersCount; i++) {
			players.push({
				hand: [deck.pop()!, deck.pop()!],
				chips: 1000,
				bet: 0,
				folded: false,
			});
		}
		return {
			deck,
			players,
			communityCards: [],
			currentBet: 0,
			pot: 0,
			dealer: 0,
			phase: "pre-flop",
			// Typically, the first player to act is the one after the dealer.
			currentPlayer: (0 + 1) % playersCount,
			playersActed: new Set<number>(),
		};
	},
	updateState,
	answerParserPrompt,
	evaluateStatus,
	// Skip a turn if the current player has folded.
	shouldSkip: (state, currentPlayer) => state.players[currentPlayer].folded,
	// Use our new determineWinner function here.
	winner: determineWinner,
};
