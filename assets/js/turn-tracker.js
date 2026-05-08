/**
 * turn-tracker.js — Real-time player turn tracking and synchronization
 * Manages current player, next player queue, turn animations, and Firebase sync
 */

const TurnTracker = (() => {
  let currentPlayerIndex = -1;
  let players = [];
  let turnListeners = [];
  let turnSwitchInProgress = false;

  /**
   * Initialize turn tracker with players
   * @param {Array} playerList - Array of player objects
   */
  function initialize(playerList) {
    players = [...playerList];
    currentPlayerIndex = -1;
    turnSwitchInProgress = false;
  }

  /**
   * Get current player
   */
  function getCurrentPlayer() {
    if (currentPlayerIndex >= 0 && currentPlayerIndex < players.length) {
      return players[currentPlayerIndex];
    }
    return null;
  }

  /**
   * Get next player in queue
   */
  function getNextPlayer() {
    if (players.length < 2) return null;
    if (currentPlayerIndex >= 0 && currentPlayerIndex < players.length) {
      const nextIndex = (currentPlayerIndex + 1) % players.length;
      return players[nextIndex];
    }
    return null;
  }

  /**
   * Get next N players in queue (wraps around)
   * @param {number} count - Number of upcoming players to return
   */
  function getNextPlayersQueue(count = 2) {
    const queue = [];
    if (currentPlayerIndex < 0 || players.length <= 1) return queue;

    for (let i = 1; i <= Math.min(count, players.length - 1); i++) {
      const index = (currentPlayerIndex + i) % players.length;
      queue.push({ ...players[index], queueIndex: index });
    }
    return queue;
  }

  /**
   * Move to next player's turn
   */
  async function nextTurn() {
    if (turnSwitchInProgress || players.length === 0) return;
    turnSwitchInProgress = true;

    const oldIndex = currentPlayerIndex;
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;

    // Sync to Firebase if in a room (host pushes turn state)
    if (Rooms.isInRoom() && Rooms.getIsHost()) {
      const currentPlayer = getCurrentPlayer();
      await Rooms.updateCurrentTurn(currentPlayerIndex, currentPlayer?.id);
    }

    // Notify listeners with animation info
    _notifyListeners(oldIndex, currentPlayerIndex, false, false);

    // Allow next turn after animation completes
    setTimeout(() => {
      turnSwitchInProgress = false;
    }, 600);
  }

  /**
   * Set turn from Firebase sync (non-host receives this)
   */
  function setTurnFromSync(playerIndex) {
    if (playerIndex === currentPlayerIndex) return;
    if (playerIndex < 0 || playerIndex >= players.length) return;

    const oldIndex = currentPlayerIndex;
    currentPlayerIndex = playerIndex;

    _notifyListeners(oldIndex, currentPlayerIndex, true, false);
  }

  /**
   * Start turn (first player, index 0)
   */
  function startTurn() {
    if (players.length === 0) return;
    currentPlayerIndex = 0;
    _notifyListeners(-1, 0, false, true);
  }

  /**
   * Notify all listeners of a turn change
   */
  function _notifyListeners(from, to, isSync, isStart) {
    const data = {
      from,
      to,
      currentPlayer: getCurrentPlayer(),
      nextPlayers: getNextPlayersQueue(2),
      isSync: !!isSync,
      isStart: !!isStart
    };
    turnListeners.forEach(callback => callback(data));
  }

  /**
   * Listen to turn changes
   */
  function onTurnChange(callback) {
    turnListeners.push(callback);
  }

  /**
   * Remove a turn change listener
   */
  function offTurnChange(callback) {
    turnListeners = turnListeners.filter(cb => cb !== callback);
  }

  /**
   * Get current player index
   */
  function getCurrentPlayerIndex() {
    return currentPlayerIndex;
  }

  /**
   * Get all players
   */
  function getAllPlayers() {
    return [...players];
  }

  /**
   * Update players list (when players join/leave during game)
   */
  function updatePlayers(newPlayerList) {
    const oldLength = players.length;
    players = [...newPlayerList];

    // If current index is now out of bounds, wrap it
    if (currentPlayerIndex >= players.length && players.length > 0) {
      currentPlayerIndex = currentPlayerIndex % players.length;
    }
  }

  /**
   * Remove a player by ID (disconnect handling)
   * Returns true if the player was found and removed
   */
  function removePlayer(playerId) {
    const idx = players.findIndex(p => p.id === playerId);
    if (idx < 0) return false;

    players.splice(idx, 1);

    // Adjust currentPlayerIndex
    if (players.length === 0) {
      currentPlayerIndex = -1;
    } else if (idx < currentPlayerIndex) {
      currentPlayerIndex--;
    } else if (idx === currentPlayerIndex) {
      currentPlayerIndex = currentPlayerIndex % players.length;
    }

    return true;
  }

  /**
   * Get player by index
   */
  function getPlayerByIndex(index) {
    if (index >= 0 && index < players.length) {
      return players[index];
    }
    return null;
  }

  /**
   * Reset turn tracker
   */
  function reset() {
    currentPlayerIndex = -1;
    turnSwitchInProgress = false;
    turnListeners = [];
  }

  return {
    initialize,
    getCurrentPlayer,
    getNextPlayer,
    getNextPlayersQueue,
    nextTurn,
    setTurnFromSync,
    onTurnChange,
    offTurnChange,
    getCurrentPlayerIndex,
    getAllPlayers,
    updatePlayers,
    removePlayer,
    getPlayerByIndex,
    startTurn,
    reset
  };
})();
