// File: games/snake.ts

import { GameStatus, MultiplayerGame } from "../types.ts";

//
// Types & Interfaces
//

export interface Position {
	x: number;
	y: number;
}

export interface Snake {
	// The head is the first element of the body array.
	body: Position[];
	alive: boolean;
	// The move (one of "up", "down", "left", or "right") submitted this turn.
	pendingMove?: string;
}

export interface SnakeGameState {
	boardWidth: number;
	boardHeight: number;
	apples: Position[];
	snakes: Snake[];
	turn: number;
}

//
// Helper Functions
//

// Generate a random integer in [0, max)
function randInt(max: number): number {
	return Math.floor(Math.random() * max);
}

// Returns true if two positions are equal.
function posEquals(a: Position, b: Position): boolean {
	return a.x === b.x && a.y === b.y;
}

/**
 * Converts the current game state into a visual map.
 * Empty cells are shown as ".", apples as "A",
 * and snake segments as follows: the head is the player's number,
 * and the rest of the body is "~".
 */
function boardToString(state: SnakeGameState): string {
	// Initialize grid with empty cells.
	const grid: string[][] = [];
	for (let y = 0; y < state.boardHeight; y++) {
		const row: string[] = [];
		for (let x = 0; x < state.boardWidth; x++) {
			row.push(".");
		}
		grid.push(row);
	}
	// Place apples.
	for (const apple of state.apples) {
		grid[apple.y][apple.x] = "A";
	}
	// Place snakes.
	state.snakes.forEach((snake, idx) => {
		snake.body.forEach((pos, segmentIndex) => {
			// Head is the player's number; body segments are "~".
			if (segmentIndex === 0) {
				grid[pos.y][pos.x] = String(idx + 1);
			} else {
				grid[pos.y][pos.x] = "~";
			}
		});
	});
	return grid.map((row) => row.join(" ")).join("\n");
}

//
// MultiplayerGame Definition
//

export const snakeGame: MultiplayerGame<SnakeGameState, number> = {
	name: "Competitive Snake",
	version: 1.0,
	// The number of players will be determined at runtime.
	players: "dynamic",
	prompts: {
		first: (state: SnakeGameState, currentPlayer: number) => {
			const snake = state.snakes[currentPlayer];
			if (!snake.alive) {
				return "You are dead. You cannot move.";
			}
			return `You are controlling a snake on a ${state.boardWidth}×${state.boardHeight} board.
Here is the current map:
${boardToString(state)}

Your snake’s head is at (${snake.body[0].x}, ${snake.body[0].y}).
Please provide your next move: up, down, left, or right.`;
		},
		turn: (state: SnakeGameState, currentPlayer: number) => {
			const snake = state.snakes[currentPlayer];
			if (!snake.alive) {
				return "You are dead. You cannot move.";
			}
			return `It's your turn.
Here is the current map:
${boardToString(state)}

Your snake’s head is at (${snake.body[0].x}, ${snake.body[0].y}).
Enter your move (up, down, left, or right):`;
		},
	},
	answerParserPrompt:
		"Extract the move from the response. Return exactly one of: up, down, left, or right, with no extra characters.",
	initializeState: (playersCount: number) => {
		const boardWidth = 10;
		const boardHeight = 10;
		const snakes: Snake[] = [];
		// For simplicity, position each snake on the upper part of the board.
		for (let i = 0; i < playersCount; i++) {
			snakes.push({
				body: [{ x: 2 + i * 3, y: 2 }],
				alive: true,
			});
		}
		// Spawn 5 apples at random positions (ensuring they do not start on a snake)
		const apples: Position[] = [];
		while (apples.length < 3) {
			const pos: Position = {
				x: randInt(boardWidth),
				y: randInt(boardHeight),
			};
			let conflict = false;
			for (const snake of snakes) {
				if (snake.body.some((cell) => posEquals(cell, pos))) {
					conflict = true;
					break;
				}
			}
			if (!conflict && !apples.some((a) => posEquals(a, pos))) {
				apples.push(pos);
			}
		}
		return {
			boardWidth,
			boardHeight,
			apples,
			snakes,
			turn: 0,
		};
	},
	updateState: (
		state: SnakeGameState,
		parsedAnswer: string,
		currentPlayer?: number,
	) => {
		if (currentPlayer === undefined) {
			throw new Error("Current player is not specified.");
		}
		const snake = state.snakes[currentPlayer];
		if (!snake.alive) return state; // Skip if dead.
		// Normalize the move.
		const move = parsedAnswer.trim().toLowerCase();
		if (!["up", "down", "left", "right"].includes(move)) {
			throw new Error("Invalid move. Must be up, down, left, or right.");
		}
		snake.pendingMove = move;

		// Check if all alive snakes have submitted their move.
		const allMovesCollected = state.snakes.every((s) =>
			!s.alive || s.pendingMove
		);
		if (allMovesCollected) {
			// --- Process simultaneous moves ---
			// Compute each snake's new head position based on its pending move.
			const newHeads: (Position | null)[] = state.snakes.map((s) => {
				if (!s.alive) return null;
				const currentHead = s.body[0];
				let newHead: Position;
				switch (s.pendingMove) {
					case "up":
						newHead = { x: currentHead.x, y: currentHead.y - 1 };
						break;
					case "down":
						newHead = { x: currentHead.x, y: currentHead.y + 1 };
						break;
					case "left":
						newHead = { x: currentHead.x - 1, y: currentHead.y };
						break;
					case "right":
						newHead = { x: currentHead.x + 1, y: currentHead.y };
						break;
					default:
						newHead = { x: currentHead.x, y: currentHead.y - 1 };
				}
				return newHead;
			});

			// Determine for each snake whether it is eating an apple.
			const isEating: boolean[] = state.snakes.map((s, i) => {
				if (!s.alive) return false;
				const nh = newHeads[i];
				if (!nh) return false;
				return state.apples.some((a) => posEquals(a, nh));
			});

			// For collision detection, define each snake’s effective body:
			// if not eating (and length > 1) the tail will be removed, so exclude it.
			const effectiveBodies: Position[][] = state.snakes.map((s, i) => {
				if (!s.alive) return [];
				return isEating[i] || s.body.length <= 1
					? s.body
					: s.body.slice(0, s.body.length - 1);
			});

			// Build a map of new head positions to detect head-to-head collisions.
			const headMap: Record<string, number[]> = {};
			newHeads.forEach((nh, i) => {
				if (nh === null) return;
				const key = `${nh.x},${nh.y}`;
				if (!headMap[key]) headMap[key] = [];
				headMap[key].push(i);
			});

			// Process collisions for each snake.
			state.snakes.forEach((s, i) => {
				if (!s.alive) return;
				const nh = newHeads[i];
				if (!nh) return;
				// Out-of-bounds check.
				if (
					nh.x < 0 || nh.x >= state.boardWidth || nh.y < 0 ||
					nh.y >= state.boardHeight
				) {
					s.alive = false;
					return;
				}
				// Head-to-head collision: if multiple snakes share the same new head, mark them dead.
				const key = `${nh.x},${nh.y}`;
				if (headMap[key].length > 1) {
					s.alive = false;
					return;
				}
				// Collision with any snake’s effective body.
				for (let j = 0; j < state.snakes.length; j++) {
					if (!state.snakes[j].alive) continue;
					const body = effectiveBodies[j];
					if (body.some((pos) => posEquals(pos, nh))) {
						s.alive = false;
						break;
					}
				}
			});

			// Update bodies for surviving snakes.
			state.snakes.forEach((s, i) => {
				if (!s.alive) return;
				const nh = newHeads[i];
				if (!nh) return;
				if (isEating[i]) {
					// Grow: add the new head to the front.
					s.body = [nh, ...s.body];
				} else {
					// Regular move: add new head and remove the tail.
					s.body = [nh, ...s.body.slice(0, s.body.length - 1)];
				}
				// Clear the pending move.
				s.pendingMove = undefined;
			});

			// Remove apples that have been eaten.
			state.apples = state.apples.filter((apple) => {
				return !state.snakes.some((s, i) => {
					if (!s.alive) return false;
					const nh = newHeads[i];
					return nh && posEquals(apple, nh);
				});
			});

			// Spawn new apples until there are 5 on the board.
			while (state.apples.length < 5) {
				const pos: Position = {
					x: randInt(state.boardWidth),
					y: randInt(state.boardHeight),
				};
				let conflict = false;
				for (const s of state.snakes) {
					if (
						s.alive && s.body.some((cell) => posEquals(cell, pos))
					) {
						conflict = true;
						break;
					}
				}
				if (!conflict && !state.apples.some((a) => posEquals(a, pos))) {
					state.apples.push(pos);
				}
			}
			// Increment the turn counter.
			state.turn += 1;
		}
		return state;
	},
	evaluateStatus: (state: SnakeGameState) => {
		const aliveCount = state.snakes.filter((s) => s.alive).length;
		if (aliveCount === 0) {
			return GameStatus.Draw;
		}
		if (aliveCount === 1) {
			return GameStatus.Win;
		}
		return GameStatus.Ongoing;
	},
	winner: (state: SnakeGameState) => {
		const aliveIndices = state.snakes
			.map((s, i) => (s.alive ? i : -1))
			.filter((i) => i !== -1);
		// Return a 1-indexed player number if one snake survives; otherwise 0 for tie.
		return aliveIndices.length === 1 ? aliveIndices[0] + 1 : 0;
	},
	shouldSkip: (state: SnakeGameState, currentPlayer: number) => {
		return !state.snakes[currentPlayer].alive;
	},
};
