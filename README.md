# 🎲 Truth & Dare — The Ultimate Party Game

A fully functional, visually stunning Truth & Dare party game that runs entirely in the browser. No backend, no external libraries (except Google Fonts) — just pure HTML, CSS, and vanilla JavaScript.

## ✨ Features

- **Lobby System** — Add 2–10 players with unique color avatars
- **Spinning Wheel** — Random player selection with animated spinner
- **Card Flip Reveal** — Smooth 3D card flip animation for questions
- **5 Category Packs** — Friends, Couples, Office Party, Teens, Spicy
- **3 Difficulty Levels** — Easy, Medium, Wild (with point scaling)
- **225+ Questions** — 15 truths and 15 dares per difficulty per pack
- **No Repeat System** — Questions never repeat until the pool is exhausted
- **Skip & Penalty** — One free skip per game (costs 1 point + funny penalty)
- **Dare Timer** — 60-second countdown with animated progress ring
- **Live Leaderboard** — Real-time score tracking in the sidebar
- **Game History Log** — Collapsible log of every question asked
- **Winner Screen** — Confetti animation with final standings
- **Play Again** — Reset scores and reshuffle while keeping players
- **Fully Responsive** — Works on desktop, tablet, and mobile
- **Dark Party Theme** — Vibrant Truth (blue) vs Dare (red/orange) color coding

## 📁 File Structure

```
truth-dare-game/
├── index.html                 # Main HTML — all screens and settings modal
├── assets/
│   ├── css/
│   │   ├── main.css           # Design tokens, layout, typography, reset
│   │   ├── components.css     # Reusable component styles
│   │   └── animations.css     # All @keyframes and animation utilities
│   ├── js/
│   │   ├── app.js             # Entry point — init and event binding
│   │   ├── game.js            # Central game state machine
│   │   ├── players.js         # Player management (add, remove, scores)
│   │   ├── questions.js       # Question loading, filtering, no-repeat logic
│   │   ├── timer.js           # Countdown timer with progress ring
│   │   ├── scoring.js         # Point calculations and history log
│   │   └── ui.js              # All DOM rendering functions
│   └── data/
│       ├── truths.json        # 225 truth questions (5 packs × 3 levels × 15)
│       └── dares.json         # 225 dares + 15 skip penalties
├── components/
│   ├── lobby.html             # Lobby component reference
│   ├── gameBoard.html         # Game board component reference
│   ├── cardFlip.html          # Card flip component reference
│   ├── leaderboard.html       # Leaderboard component reference
│   ├── timer.html             # Timer component reference
│   ├── historyLog.html        # History log component reference
│   └── winnerScreen.html      # Winner screen component reference
└── README.md                  # This file
```

## 🚀 How to Run Locally

1. **Clone or download** this project
2. **Serve it** with any local HTTP server (required for JSON fetch):

   ```bash
   # Option 1: Python
   cd truth-dare-game
   python3 -m http.server 8000

   # Option 2: Node.js
   npx serve .

   # Option 3: VS Code Live Server extension
   # Right-click index.html → "Open with Live Server"
   ```

3. **Open** `http://localhost:8000` in your browser
4. **Add players**, configure settings, and start playing!

> ⚠️ Opening `index.html` directly as a file won't work due to `fetch()` requiring HTTP.

## 🎮 How to Play

1. **Add Players** — Type names and press Enter or click Add (2–10 players)
2. **Configure** — Open Settings to choose packs, difficulty, and round count
3. **Start Game** — The wheel spins to pick a random player
4. **Choose** — The selected player picks Truth or Dare
5. **Reveal** — A card flips to show the question (dares get a 60s timer)
6. **Vote** — Other players vote thumbs up/down on completion
7. **Score** — Points are awarded based on difficulty (Easy=1, Medium=2, Wild=3)
8. **Repeat** — Game continues until all rounds are complete
9. **Winner** — Final standings with confetti celebration!

## 🛠️ Technical Details

- **ES6+ JavaScript** — Modules use the revealing module pattern (IIFE)
- **CSS Custom Properties** — All colors, spacing, and fonts use `:root` variables
- **No inline styles** — All styling through CSS classes
- **Kebab-case naming** — All IDs and class names follow convention
- **Mobile responsive** — Breakpoints at 900px and 600px
- **Accessible** — Semantic HTML, ARIA labels, reduced-motion support

## 📄 License

Free to use for personal and party purposes. Have fun!!! 🎉
