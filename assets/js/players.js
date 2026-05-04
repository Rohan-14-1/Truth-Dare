/**
 * players.js — Manages player data: adding, removing, colors, avatars.
 */

const Players = (() => {
  // Player list: { id, name, initials, color, score, skipsLeft }
  let players = [];
  let nextId = 1;

  // Curated vibrant avatar colors
  const AVATAR_COLORS = [
    '#6366f1', // Indigo
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#22c55e', // Green
    '#f97316', // Orange
    '#a855f7'  // Purple
  ];

  /**
   * Extracts initials from a player name.
   * @param {string} name
   * @returns {string} Up to 2 character initials
   */
  function _getInitials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Adds a new player to the game.
   * @param {string} name - Player name
   * @returns {{ success: boolean, player?: object, error?: string }}
   */
  function addPlayer(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: 'Name cannot be empty.' };
    }
    if (trimmed.length > 20) {
      return { success: false, error: 'Name must be 20 characters or less.' };
    }
    if (players.length >= 10) {
      return { success: false, error: 'Maximum 10 players allowed.' };
    }
    if (players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, error: 'Name already taken.' };
    }

    const player = {
      id: nextId++,
      name: trimmed,
      initials: _getInitials(trimmed),
      color: AVATAR_COLORS[(players.length) % AVATAR_COLORS.length],
      score: 0,
      skipsLeft: 1
    };

    players.push(player);
    return { success: true, player };
  }

  /**
   * Removes a player by their ID.
   * @param {number} id
   */
  function removePlayer(id) {
    players = players.filter(p => p.id !== id);
  }

  /**
   * Gets all current players.
   * @returns {object[]}
   */
  function getAll() {
    return [...players];
  }

  /**
   * Gets a player by ID.
   * @param {number} id
   * @returns {object|undefined}
   */
  function getById(id) {
    return players.find(p => p.id === id);
  }

  /**
   * Returns number of players.
   * @returns {number}
   */
  function count() {
    return players.length;
  }

  /**
   * Adds points to a player.
   * @param {number} id
   * @param {number} points
   */
  function addScore(id, points) {
    const player = players.find(p => p.id === id);
    if (player) {
      player.score += points;
    }
  }

  /**
   * Uses a skip for a player (costs 1 point).
   * @param {number} id
   * @returns {boolean} Whether skip was available
   */
  function useSkip(id) {
    const player = players.find(p => p.id === id);
    if (player && player.skipsLeft > 0) {
      player.skipsLeft--;
      player.score = Math.max(0, player.score - 1);
      return true;
    }
    return false;
  }

  /**
   * Checks if a player has skips remaining.
   * @param {number} id
   * @returns {boolean}
   */
  function hasSkips(id) {
    const player = players.find(p => p.id === id);
    return player ? player.skipsLeft > 0 : false;
  }

  /**
   * Returns players sorted by score (descending).
   * @returns {object[]}
   */
  function getLeaderboard() {
    return [...players].sort((a, b) => b.score - a.score);
  }

  /**
   * Resets all scores and skips for a new game.
   */
  function resetScores() {
    players.forEach(p => {
      p.score = 0;
      p.skipsLeft = 1;
    });
  }

  /**
   * Clears all players (full reset).
   */
  function clearAll() {
    players = [];
    nextId = 1;
  }

  return {
    addPlayer,
    removePlayer,
    getAll,
    getById,
    count,
    addScore,
    useSkip,
    hasSkips,
    getLeaderboard,
    resetScores,
    clearAll
  };
})();
