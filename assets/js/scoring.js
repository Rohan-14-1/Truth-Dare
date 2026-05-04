/**
 * scoring.js — Manages point calculations, streaks, bonuses, and game history log.
 */

const Scoring = (() => {
  // Points awarded per difficulty level
  const POINTS = {
    easy: 1,
    medium: 2,
    wild: 3
  };

  // Bravery bonus for completing wild dares
  const BRAVERY_BONUS = 1;

  // Streak multiplier thresholds
  const STREAK_BONUS_THRESHOLD = 3; // 3+ consecutive completes = bonus

  // Game history log entries
  let history = [];

  // Player streak tracking: { playerId: consecutiveCompletes }
  let streaks = {};

  /**
   * Gets the points awarded for completing a question at given difficulty.
   * @param {string} difficulty - 'easy', 'medium', or 'wild'
   * @returns {number}
   */
  function getPoints(difficulty) {
    return POINTS[difficulty] || 1;
  }

  /**
   * Calculates total points including bonuses.
   * @param {string} difficulty
   * @param {string} type - 'truth' or 'dare'
   * @param {number} playerId
   * @returns {{ base: number, braveryBonus: number, streakBonus: number, total: number }}
   */
  function calculatePoints(difficulty, type, playerId) {
    const base = POINTS[difficulty] || 1;

    // Bravery bonus: extra point for completing wild dares
    const braveryBonus = (difficulty === 'wild' && type === 'dare') ? BRAVERY_BONUS : 0;

    // Streak bonus: extra point for 3+ consecutive completions
    const currentStreak = (streaks[playerId] || 0) + 1; // Include this completion
    const streakBonus = currentStreak >= STREAK_BONUS_THRESHOLD ? 1 : 0;

    return {
      base,
      braveryBonus,
      streakBonus,
      total: base + braveryBonus + streakBonus
    };
  }

  /**
   * Updates streak tracking after a turn.
   * @param {number} playerId
   * @param {boolean} completed
   */
  function updateStreak(playerId, completed) {
    if (completed) {
      streaks[playerId] = (streaks[playerId] || 0) + 1;
    } else {
      streaks[playerId] = 0;
    }
  }

  /**
   * Gets the current streak for a player.
   * @param {number} playerId
   * @returns {number}
   */
  function getStreak(playerId) {
    return streaks[playerId] || 0;
  }

  /**
   * Records a completed turn in the history log.
   * @param {object} entry
   * @param {string} entry.playerName - Name of the player
   * @param {number} entry.playerId - ID of the player
   * @param {string} entry.type - 'truth' or 'dare'
   * @param {string} entry.question - The question/dare text
   * @param {string} entry.difficulty - Difficulty level
   * @param {string} entry.pack - Category pack name
   * @param {boolean} entry.completed - Whether it was completed
   * @param {boolean} entry.skipped - Whether it was skipped
   * @param {number} entry.pointsEarned - Points earned (or lost)
   * @param {object} [entry.bonuses] - Optional bonus breakdown
   */
  function addHistoryEntry(entry) {
    history.push({
      ...entry,
      timestamp: Date.now(),
      round: history.length + 1
    });
  }

  /**
   * Gets the full game history.
   * @returns {object[]}
   */
  function getHistory() {
    return [...history];
  }

  /**
   * Gets the most recent N history entries (newest first).
   * @param {number} count
   * @returns {object[]}
   */
  function getRecentHistory(count = 10) {
    return [...history].reverse().slice(0, count);
  }

  /**
   * Gets statistics for the game.
   * @returns {object}
   */
  function getStats() {
    const completed = history.filter(h => h.completed).length;
    const skipped = history.filter(h => h.skipped).length;
    const totalTruths = history.filter(h => h.type === 'truth').length;
    const totalDares = history.filter(h => h.type === 'dare').length;

    return {
      totalRounds: history.length,
      completed,
      skipped,
      failed: history.length - completed - skipped,
      totalTruths,
      totalDares,
      completionRate: history.length > 0
        ? Math.round((completed / history.length) * 100)
        : 0
    };
  }

  /**
   * Gets the MVP player (most completed challenges).
   * @returns {{ playerId: number, playerName: string, completedCount: number }|null}
   */
  function getMVP() {
    const completionCounts = {};
    const playerNames = {};

    history.forEach(h => {
      if (h.completed) {
        completionCounts[h.playerId] = (completionCounts[h.playerId] || 0) + 1;
        playerNames[h.playerId] = h.playerName;
      }
    });

    let mvpId = null;
    let maxCount = 0;

    for (const [id, count] of Object.entries(completionCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mvpId = parseInt(id);
      }
    }

    if (!mvpId) return null;

    return {
      playerId: mvpId,
      playerName: playerNames[mvpId],
      completedCount: maxCount
    };
  }

  /**
   * Gets the player with the longest streak in the game.
   * @returns {{ playerId: number, playerName: string, streak: number }|null}
   */
  function getLongestStreak() {
    // Calculate longest historical streak per player
    const longestStreaks = {};
    const currentStreaks = {};
    const playerNames = {};

    history.forEach(h => {
      playerNames[h.playerId] = h.playerName;
      if (h.completed) {
        currentStreaks[h.playerId] = (currentStreaks[h.playerId] || 0) + 1;
        longestStreaks[h.playerId] = Math.max(
          longestStreaks[h.playerId] || 0,
          currentStreaks[h.playerId]
        );
      } else {
        currentStreaks[h.playerId] = 0;
      }
    });

    let bestId = null;
    let bestStreak = 0;

    for (const [id, streak] of Object.entries(longestStreaks)) {
      if (streak > bestStreak) {
        bestStreak = streak;
        bestId = parseInt(id);
      }
    }

    if (!bestId || bestStreak < 2) return null;

    return {
      playerId: bestId,
      playerName: playerNames[bestId],
      streak: bestStreak
    };
  }

  /**
   * Generates a shareable text recap of the game.
   * @returns {string}
   */
  function generateRecap() {
    const stats = getStats();
    const mvp = getMVP();
    const longestStreak = getLongestStreak();

    let recap = '🎲 TRUTH & DARE — Game Recap\n';
    recap += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    // Final standings
    if (typeof Players !== 'undefined') {
      const standings = Players.getLeaderboard();
      recap += '🏆 Final Standings:\n';
      standings.forEach((p, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        const rank = i < 3 ? medals[i] : `#${i + 1}`;
        recap += `${rank} ${p.name} — ${p.score} pts\n`;
      });
      recap += '\n';
    }

    // Stats
    recap += '📊 Game Stats:\n';
    recap += `• ${stats.totalRounds} total rounds played\n`;
    recap += `• ${stats.completed} completed (${stats.completionRate}%)\n`;
    recap += `• ${stats.skipped} skipped, ${stats.failed} failed\n`;
    recap += `• ${stats.totalTruths} truths, ${stats.totalDares} dares\n\n`;

    // Awards
    if (mvp) {
      recap += `⭐ MVP: ${mvp.playerName} (${mvp.completedCount} completed)\n`;
    }
    if (longestStreak) {
      recap += `🔥 Longest Streak: ${longestStreak.playerName} (${longestStreak.streak} in a row)\n`;
    }

    recap += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    recap += 'Played with Truth & Dare 🎲';

    return recap;
  }

  /**
   * Copies the game recap to clipboard.
   * @returns {Promise<boolean>}
   */
  async function copyRecapToClipboard() {
    try {
      await navigator.clipboard.writeText(generateRecap());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clears all history and streaks (for new game).
   */
  function clearHistory() {
    history = [];
    streaks = {};
  }

  return {
    getPoints,
    calculatePoints,
    updateStreak,
    getStreak,
    addHistoryEntry,
    getHistory,
    getRecentHistory,
    getStats,
    getMVP,
    getLongestStreak,
    generateRecap,
    copyRecapToClipboard,
    clearHistory
  };
})();
