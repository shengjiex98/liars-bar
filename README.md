# 🃏 Liar's Bar

A mobile-friendly web version of the bluffing card game **Liar's Bar** — you against three bots, with Russian roulette for whoever gets caught.

**Play it:** https://shengjiex98.github.io/liars-bar/

## How to play

- You and 3 bots each get **5 cards** from a deck of 6 Queens, 6 Kings, 6 Aces, and 2 Jokers (Jokers count as anything).
- Each round one rank is **on the table** (e.g. Kings). On your turn, play **1–3 cards face-down** and claim they're all that rank — truth or lie.
- Instead of playing, you can **call Liar** on the previous play. The cards are revealed: if they were all real, the challenger takes the gun; if not, the liar does.
- The revolver has one bullet in six chambers, and each survived pull makes the next one riskier. Chambers persist across rounds.
- Empty your hand and you're safe for the round. The last player still holding cards must face the gun.
- **Last one alive wins.**

## Tech

Plain HTML/CSS/JS — no dependencies, no build step. Deployed to GitHub Pages via GitHub Actions on every push to `main`.

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server
```
