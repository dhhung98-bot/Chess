# Chess

A small learning project for exploring reinforcement learning in a simplified chess endgame: White King + White Rook vs Black King (KRR? actually K+R vs K, also called KRK).

This repository is built around a set of Jupyter notebooks that teach the basic ideas of:

- chess rules and legal moves
- state representation for a chess position
- creating a simple environment for RL experiments
- reward design and cumulative return
- fair policy evaluation
- improving a policy step by step

## Project goal

The goal is to train and compare simple strategies for the King-Rook-King endgame, using the `python-chess` library and a custom environment.

The project follows a structured learning flow:

1. Understand chess basics and how to model a position.
2. Build a minimal game environment for a one-side attack puzzle.
3. Run many random games and measure outcomes.
4. Add basic heuristics such as:
   - if a move can checkmate immediately, take it
   - avoid moves that allow the rook to be captured
5. Compare results across different strategies.

## Repository contents

- `lesson01.ipynb` — introduction to chess mechanics, board representation, random board generation, and a basic KRK environment.
- `lesson02_student.ipynb` — reward design, fairness in experiments, `evaluate()`, and improved policies (`mate_policy`, `safe_policy`).

## Learning outcomes

This project introduces several core concepts used in reinforcement learning and decision making:

- state: the current board configuration
- action: a legal move from the current position
- reward: score assigned for each move or terminal outcome
- cumulative return: total reward across a whole game
- policy: a strategy that decides which move to choose
- evaluation: running many games to compare policies fairly

## Example strategy comparison

From the lesson notebooks, a simple benchmark looks like this:

| Strategy | Win rate | Rook lost | Timeout |
|---|---:|---:|---:|
| Random | 0.7% | 2076 | 894 |
| Can mate immediately | 8.1% | 1951 | 805 |
| Avoid losing the rook | 12.3% | 0 | 2632 |

This shows how even a simple rule-based improvement can dramatically raise the win rate compared with pure random play.

## Quick start

Open the notebooks in Google Colab or Jupyter Notebook and run them in order.

Install the required package:

```bash
pip install chess
```

Then import the library in Python:

```python
import chess
import random
```

## Typical workflow

The repo uses a custom `KRKEnv` environment with methods like:

- `reset()` — start a new random position
- `legal_actions()` — list legal moves
- `step(move)` — apply a move and return reward + game status
- `is_terminal()` — check whether the game is over

The basic structure is:

```python
env = KRKEnv()
state = env.reset()

while not env.is_terminal():
    move = random.choice(env.legal_actions())
    state, reward, done = env.step(move)
```

## Why this repo is useful

This repository is a good beginner-friendly way to learn:

- how to model a game as an environment
- how to write simple policies and compare them
- how reward design affects learning behavior
- how to evaluate a strategy using repeated trials
- how small heuristics can produce meaningful improvements

## Notes

This project is intentionally focused on a simplified chess endgame rather than full chess. That keeps the problem small enough to reason about while still showing real reinforcement-learning ideas in practice.

## License

This project is shared for educational and learning purposes.
