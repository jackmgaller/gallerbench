import { GameStatus, MultiplayerGame } from "../types.ts";

export enum TicTacToeValue {
	X,
	O,
}

type TicTacToeState = {
	board: (TicTacToeValue | null)[][];
	turn: number;
};

export const initializeTicTacToeState = (): TicTacToeState => {
	return {
		board: [
			[null, null, null],
			[null, null, null],
			[null, null, null],
		],
		turn: 1,
	};
};

export const ticTacToeBoardToString = (
	board: (TicTacToeValue | null)[][],
): string => {
	const p = (v: TicTacToeValue | null) => {
		if (v === null) {
			return " ";
		} else if (v === TicTacToeValue.O) {
			return "O";
		} else {
			return "X";
		}
	};

	return `${p(board[0][0])} | ${p(board[0][1])} | ${p(board[0][2])}
---------
${p(board[1][0])} | ${p(board[1][1])} | ${p(board[1][2])}
---------
${p(board[2][0])} | ${p(board[2][1])} | ${p(board[2][2])}
`;
};

const moveMap: Record<string, [number, number]> = {
	"top left": [0, 0],
	"top center": [0, 1],
	"top right": [0, 2],
	"middle left": [1, 0],
	"middle center": [1, 1],
	"middle right": [1, 2],
	"bottom left": [2, 0],
	"bottom middle": [2, 1],
	"bottom right": [2, 2],
};

//Odd turn - X (First turn!)
//Even turn - O
export const ticTacToeGame: MultiplayerGame<TicTacToeState> = {
	name: "Tic Tac Toe",
	prompts: {
		first: (state: TicTacToeState) => {
			const isO = state.turn % 2 === 0;

			let prompt =
				`I am a researcher investigating AI. You are competing in Tic Tac Toe against an opposing AI. Try the best that you can! Remember, the rules are simple - you just need to get three in a row before your opponent does. You are playing as ${
					isO ? "O" : "X"
				}'s.\n\n`;

			if (isO) {
				prompt +=
					"This means you go second. The opponent player already made the first move. ";
			} else {
				prompt += "You get to make the first move! ";
			}

			prompt += `The board looks like this:\n\n${
				ticTacToeBoardToString(state.board)
			}\n\n;`;

			prompt += `Where would you like to place your first ${
				isO ? "O" : "X"
			} piece? Please tell me one of the following: `;

			prompt +=
				`"top left", "top center", "top right", "middle left", "middle center", "middle right", "bottom left", "bottom middle", or "bottom right"`;

			return prompt;
		},
		turn: (state: TicTacToeState) => {
			const isO = state.turn % 2 === 0;

			let prompt =
				"I placed your move. In return, your opponent made its move. It's your turn again, now the board looks like this:\n\n";

			prompt += `${ticTacToeBoardToString(state.board)}\n\n`;

			prompt += `Where would you like to place your next ${
				isO ? "O" : "X"
			} piece? Tell me the move in this exact format: `;

			prompt +=
				`"top left", "top center", "top right", "middle left", "middle center", "middle right", "bottom left", "bottom middle", or "bottom right"`;

			return prompt;
		},
	},
	answerParserPrompt:
		"You are judging an AI competition of two AI's playing tic tac toe. You need to determine what move they have made. You will return one of the following strings: top left, top center, top right, middle left, middle center, middle right, bottom left, bottom middle, bottom right. If you return anything else, the program will break. Do not return any special characters surrounding the string.",
	players: 2,
	version: 1.1,
	updateState: (state: TicTacToeState, parsedAnswer: string) => {
		// Determine the current player's symbol
		const currentPlayer = state.turn % 2 === 0
			? TicTacToeValue.O
			: TicTacToeValue.X;

		// Get the board coordinates from the move map
		const move = moveMap[parsedAnswer.trim().toLowerCase()];

		if (!move) {
			throw new Error(
				"Invalid move! Please use the correct format for specifying moves.",
			);
		}

		const [row, col] = move;

		// Check if the selected cell is already taken
		if (state.board[row][col] !== null) {
			throw new Error(
				"This cell is already taken! Please choose an empty cell.",
			);
		}

		// Place the current player's symbol on the board
		state.board[row][col] = currentPlayer;

		// Increment the turn
		state.turn += 1;

		return state;
	},
	evaluateStatus: (state: TicTacToeState) => {
		// Check for a winning condition
		const lines = [
			// Rows
			[[0, 0], [0, 1], [0, 2]],
			[[1, 0], [1, 1], [1, 2]],
			[[2, 0], [2, 1], [2, 2]],
			// Columns
			[[0, 0], [1, 0], [2, 0]],
			[[0, 1], [1, 1], [2, 1]],
			[[0, 2], [1, 2], [2, 2]],
			// Diagonals
			[[0, 0], [1, 1], [2, 2]],
			[[0, 2], [1, 1], [2, 0]],
		];

		for (const line of lines) {
			const [p1, p2, p3] = line;
			if (
				state.board[p1[0]][p1[1]] !== null &&
				state.board[p1[0]][p1[1]] === state.board[p2[0]][p2[1]] &&
				state.board[p1[0]][p1[1]] === state.board[p3[0]][p3[1]]
			) {
				return GameStatus.Win;
			}
		}

		// Check for a draw (no nulls left in the board)
		if (state.board.every((row) => row.every((cell) => cell !== null))) {
			return GameStatus.Draw;
		}

		// If no winner and the game is not a draw, continue the game
		return GameStatus.Ongoing;
	},
	winner: (state: TicTacToeState) => {
		console.log("Winner is " + (state.turn % 2 === 0 ? "X" : "O"));

		return state.turn % 2 === 0 ? 1 : 2;
	},
};
