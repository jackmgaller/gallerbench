# Gallerbench

This repository contains a collection of text-based games (like **Wordle**, **Tic Tac Toe**, **Connect 4**, **Guess the Number**, and **Texas Hold ’Em** Poker) designed to be played by Large Language Models (LLMs) or human players. It provides a **Game Engine** that can run these games in either single-player or multi-player mode, log their results, and track statistics over time.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
  - [Core Files](#core-files)
  - [Games](#games)
  - [Data and Logs](#data-and-logs)


---

## Features

1. **Single-Player & Multi-Player**  
   Supports running games with one or more players (AI or human).

2. **Pluggable Language Models**  
   Easily switch between different LLM backends (OpenAI, Anthropic, custom).

3. **Prompt / State Architecture**  
   Each turn, the Game Engine:
   - Sends a prompt to the player (human or AI),
   - Receives an answer,
   - Updates the game state,
   - Checks for game termination (win, loss, or draw).

4. **Statistics & Logging**  
   All results can be automatically logged in `out/results.json` for win-rate calculation and analysis. Additionally, conversation logs (prompts/responses) are stored in JSON files.

5. **Examples Included**  
   The `games/` folder provides sample implementations for several games.

---

## Prerequisites

- **Deno** (version 1.28+ recommended)  
  Deno is required to run this project.  
  Installation instructions can be found at [Deno’s official site](https://deno.land/).

- **API Keys**  
  If you plan to use OpenAI or Anthropic models, set the following environment variables:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`

  Without these keys, only the built-in **Human** player model will be fully usable.

---

## Project Structure
```
.
├── data/
│   └── words.txt          # Word list used by Wordle
├── games/
│   ├── connectFour.ts     # Connect 4
│   ├── guessNumber.ts     # Simple number guessing game
│   ├── poker.ts           # Texas Hold 'Em
│   ├── ticTacToe.ts       # Tic Tac Toe
│   └── wordle.ts          # Wordle
├── out/
│   └── ...                # Logs will be generated here
├── gameLoop.ts            # Core engine for single-player & multi-player loops
├── index.ts               # Main entry point to run games
├── models.ts              # Definitions of language models (OpenAI, Anthropic, etc.)
├── statistics.ts          # Logging and statistics
├── types.ts               # Shared types and interfaces (Game, GameStatus, etc.)
├── versions.md            # Version history notes for Wordle & others
└── writeCode.ts           # Utility script for code generation from model output
```

### Core Files

- **`gameLoop.ts`**  
  Exports two main methods:
  - `gameLoop` for single-player games
  - `multiplayerGameLoop` for multi-player games  

  Each loop handles the process of:
  - Prompting the player(s) (human or AI),
  - Parsing responses,
  - Updating game state,
  - Checking game status,
  - Logging each move.

- **`index.ts`**  
  The main entry point. Use this file to choose which game to run and with which models. It contains example code showing how to:
  1. Run a single-player Wordle repeatedly with different LLM models.
  2. Run multi-player Connect 4 or Poker or Tic Tac Toe with AI or human players.
  3. Log outcomes for statistical tracking.

- **`models.ts`**  
  Defines the `LanguageModel` abstract class and its concrete implementations for OpenAI and Anthropic. It also includes:
  - A `HumanPlayer` model for a human user in the terminal.
  - A `models` object to map friendly enum keys (`LanguageModelName`) to specific model instances.

- **`statistics.ts`**  
  Handles reading and writing to `out/results.json` to store:
  - Single-player or multi-player results,
  - Model names/versions,
  - Game name/versions,
  - Timestamps and outcomes (Win, Loss, Draw).  

  Also provides methods like `calculateWinRate` for quick data analysis.

- **`types.ts`**  
  Shared interfaces for building new games (e.g., `Game` or `MultiplayerGame`), and enumerations like `GameStatus` (Win, Loss, Draw, Ongoing).

### Games

Each file in `games/` exports:
- An interface or type for the game’s internal `GameState`.
- Helper functions (e.g., to display a board, check for winners).
- A game definition object (implementing `Game` or `MultiplayerGame`) specifying:
  - The name & version
  - Prompts (initial and turn-based)
  - How to parse AI responses (the `answerParserPrompt`)
  - The `updateState` method
  - The `evaluateStatus` method
  - The `winner` method (for multi-player)

### Data and Logs

- **`data/words.txt`**  
  Used for Wordle guesses.
- **`out/`**  
  Auto-generated at runtime to store:
  - Chat transcripts (`chat.json`, `chats.json`),
  - Statistical summaries (`results.json`).

---

## Environment Variables

If you want to use OpenAI or Anthropic-based language models, set:

```bash
export OPENAI_API_KEY="sk-xxxxxx..."
export ANTHROPIC_API_KEY="xxxxxx..."
```