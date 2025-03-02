import { GameStatus, MultiplayerGame } from "../types.ts";

//
// Define the Connect 4 game state and helper functions
//

export type Connect4State = {
	board: (number | null)[][]; // The board is a 6×7 grid; cells hold 1 (Player 1), 2 (Player 2), or null.
	turn: number; // Turn counter (starting at 1). Determines whose move it is.
};

const ROWS = 6;
const COLS = 7;

// Create an empty board (6 rows × 7 columns) filled with nulls.
const createEmptyBoard = (): (number | null)[][] => {
	const board: (number | null)[][] = [];
	for (let i = 0; i < ROWS; i++) {
		board.push(new Array(COLS).fill(null));
	}
	return board;
};

// Convert the board to a string for display. We'll show empty cells as "."; player 1 as "X" and player 2 as "O".
// (Rows are printed top-to-bottom; note that the bottom row is where pieces “land”.)
export const connect4BoardToString = (board: (number | null)[][]): string => {
	let display = "";
	for (let r = 0; r < ROWS; r++) {
		const rowStr = board[r]
			.map((cell) => {
				if (cell === 1) return "X";
				if (cell === 2) return "O";
				return ".";
			})
			.join(" | ");
		display += rowStr + "\n";
	}
	display += "1   2   3   4   5   6   7\n";
	return display;
};

// Helper to check if there is a winning line on the board.
// Returns 1 if player 1 wins, 2 if player 2 wins, or null if no winner.
const checkWinner = (board: (number | null)[][]): number | null => {
	// Directions to check: horizontal, vertical, diagonal, and anti-diagonal.
	const directions = [
		{ dr: 0, dc: 1 }, // Horizontal right
		{ dr: 1, dc: 0 }, // Vertical down
		{ dr: 1, dc: 1 }, // Diagonal down-right
		{ dr: 1, dc: -1 }, // Diagonal down-left
	];

	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const player = board[r][c];
			if (player === null) continue;

			for (const { dr, dc } of directions) {
				let count = 1;
				let nr = r + dr;
				let nc = c + dc;
				while (
					nr >= 0 &&
					nr < ROWS &&
					nc >= 0 &&
					nc < COLS &&
					board[nr][nc] === player
				) {
					count++;
					if (count === 4) {
						return player;
					}
					nr += dr;
					nc += dc;
				}
			}
		}
	}
	return null;
};

// Helper to check if the board is completely filled.
const isBoardFull = (board: (number | null)[][]): boolean => {
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			if (board[r][c] === null) {
				return false;
			}
		}
	}
	return true;
};

//
// Define the MultiplayerGame for Connect 4
//

export const connect4Game: MultiplayerGame<Connect4State> = {
	name: "Connect 4",
	version: 1.0,
	players: 2,
	prompts: {
		// The first prompt for a player shows the current board and asks for the move.
		first: (state: Connect4State, currentPlayer: number) => {
			// Player indices: 0 → Player 1 (X); 1 → Player 2 (O)
			const playerSymbol = currentPlayer === 0 ? "X" : "O";
			const boardStr = connect4BoardToString(state.board);
			return `You are playing Connect 4 as "${playerSymbol}".\n` +
				`The board is currently:\n\n${boardStr}\n` +
				`Please enter the column number (1-7) where you would like to drop your piece:`;
		},
		// On subsequent turns, show the updated board.
		turn: (state: Connect4State, currentPlayer: number) => {
			const playerSymbol = currentPlayer === 0 ? "X" : "O";
			const boardStr = connect4BoardToString(state.board);
			return `Your opponent has made a move.\n` +
				`The board is now:\n\n${boardStr}\n` +
				`It is your turn as "${playerSymbol}".\n` +
				`Please enter the column number (1-7) where you would like to drop your piece:`;
		},
	},
	// The answer parser should extract a column number between 1 and 7.
	answerParserPrompt: "You are analyzing a move in Connect 4. Extract the column number from the player's response. " +
		"The column number must be an integer between 1 and 7 (inclusive). Return only the number with no extra characters.",
	initializeState: (): Connect4State => {
		return {
			board: createEmptyBoard(),
			turn: 1, // Player 1 (represented as 1) goes first.
		};
	},
	// Update the state based on the move.
	updateState: (
		state: Connect4State,
		parsedAnswer: string,
		currentPlayer?: number,
	): Connect4State => {
		if (currentPlayer === undefined) {
			throw new Error("Current player is not specified in updateState.");
		}
		// Convert the answer into a 0-indexed column.
		const column = parseInt(parsedAnswer.trim(), 10) - 1;
		if (isNaN(column) || column < 0 || column >= COLS) {
			throw new Error(
				"Invalid column number. Please choose a number between 1 and 7.",
			);
		}
		// Drop the piece into the column (find the lowest available row).
		let placed = false;
		for (let r = ROWS - 1; r >= 0; r--) {
			if (state.board[r][column] === null) {
				// Place the piece: Player 1 is represented as 1; Player 2 as 2.
				state.board[r][column] = currentPlayer === 0 ? 1 : 2;
				placed = true;
				break;
			}
		}
		if (!placed) {
			throw new Error(
				"That column is full. Please choose a different column.",
			);
		}
		// Increment the turn counter.
		state.turn += 1;
		return state;
	},
	// Evaluate the game status: win if a player has four in a row; draw if the board is full; otherwise, ongoing.
	evaluateStatus: (state: Connect4State): GameStatus => {
		const winner = checkWinner(state.board);
		if (winner !== null) {
			return GameStatus.Win;
		} else if (isBoardFull(state.board)) {
			return GameStatus.Draw;
		} else {
			return GameStatus.Ongoing;
		}
	},
	// Determine the winning player: returns 1 for Player 1, 2 for Player 2, or 0 if none.
	winner: (state: Connect4State): number => {
		const win = checkWinner(state.board);
		if (win === 1) {
			return 1;
		} else if (win === 2) {
			return 2;
		} else {
			return 0; // Should not be called if the game isn't won.
		}
	},
};
