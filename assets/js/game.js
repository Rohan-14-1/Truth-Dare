/**
 * game.js — Central game state machine. All game state lives here.
 * Enhanced with AI questions, reactions, streaks, and room support.
 */

const Game = (() => {
  // Game states
  const STATES = {
    LOBBY: 'lobby',
    SPINNING: 'spinning',
    CHOOSING: 'choosing',
    QUESTION: 'question',
    VOTING: 'voting',
    RESULT: 'result',
    GAME_OVER: 'game_over'
  };

  // Current game state
  let state = STATES.LOBBY;
  let currentPlayerIndex = -1;
  let currentQuestion = null;
  let currentType = null; // 'truth' or 'dare'
  let currentRound = 0;
  let totalRounds = 10;
  let turnsThisRound = 0;

  // Settings
  let settings = {
    packs: ['friends'],
    difficulty: 'easy',
    totalRounds: 10,
    aiEnabled: false,
    aiVibe: 'chill',
    customPackEnabled: false
  };

  /**
   * Returns the current game state.
   * @returns {string}
   */
  function getState() {
    return state;
  }

  /**
   * Returns all state constants.
   * @returns {object}
   */
  function getStates() {
    return { ...STATES };
  }

  /**
   * Gets the current game settings.
   * @returns {object}
   */
  function getSettings() {
    return { ...settings };
  }

  /**
   * Updates game settings.
   * @param {object} newSettings
   */
  function updateSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    totalRounds = settings.totalRounds;
    Questions.setActivePacks(settings.packs);
    Questions.setDifficulty(settings.difficulty);
    Questions.setCustomPackEnabled(settings.customPackEnabled);

    // Update AI settings
    if (typeof AIQuestions !== 'undefined') {
      AIQuestions.setEnabled(settings.aiEnabled);
      AIQuestions.setVibe(settings.aiVibe);
    }
  }

  /**
   * Gets the current round number.
   * @returns {number}
   */
  function getCurrentRound() {
    return currentRound;
  }

  /**
   * Gets total configured rounds.
   * @returns {number}
   */
  function getTotalRounds() {
    return totalRounds;
  }

  /**
   * Gets the current player whose turn it is.
   * @returns {object|null}
   */
  function getCurrentPlayer() {
    const players = Players.getAll();
    if (currentPlayerIndex >= 0 && currentPlayerIndex < players.length) {
      return players[currentPlayerIndex];
    }
    return null;
  }

  /**
   * Gets the current question data.
   * @returns {object|null}
   */
  function getCurrentQuestion() {
    return currentQuestion;
  }

  /**
   * Gets the current type (truth/dare).
   * @returns {string|null}
   */
  function getCurrentType() {
    return currentType;
  }

  /**
   * Starts a new game from the lobby.
   */
  async function startGame() {
    const _isSpectator = typeof Spectator !== 'undefined' && Spectator.isSpectator();

    if (Players.count() < 2 && !Rooms.isInRoom() && !_isSpectator) return;

    currentRound = 1;
    turnsThisRound = 0;
    currentPlayerIndex = -1;
    Questions.resetUsed();
    Scoring.clearHistory();
    if (!_isSpectator) Players.resetScores();

    Questions.setActivePacks(settings.packs);
    Questions.setDifficulty(settings.difficulty);
    Questions.setCustomPackEnabled(settings.customPackEnabled);

    if (typeof AIQuestions !== 'undefined') {
      AIQuestions.setEnabled(settings.aiEnabled);
      AIQuestions.setVibe(settings.aiVibe);
    }

    state = STATES.SPINNING;

    // --- Multiplayer / Spectator: use TurnFlow ---
    if (Rooms.isInRoom() || _isSpectator) {
      const roomCode = _isSpectator ? Spectator.getRoomCode() : Rooms.getRoomCode();

      // Always re-fetch players to ensure list is current (host AND non-host)
      if (!_isSpectator && Rooms.isInRoom()) {
        const roomPlayers = await Rooms.getRoomPlayers();
        if (roomPlayers && roomPlayers.length >= 1) {
          Players.clearAll();
          roomPlayers.filter(p => p.role !== 'spectator')
            .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
            .forEach(p => Players.addPlayerObject(p));
        }
      }

      console.log('[Game] startGame — players loaded:', Players.count(), '| isHost:', Rooms.getIsHost());

      UI.renderGameScreen();

      // Init chat, reactions, host controls
      if (typeof Chat !== 'undefined') Chat.init(roomCode);
      if (typeof Reactions !== 'undefined') Reactions.init(roomCode);
      if (!_isSpectator && typeof HostControls !== 'undefined' && Rooms.getIsHost()) {
        HostControls.init(roomCode);
      }

      // Init TurnFlow — third param = spectatorMode (read-only)
      if (typeof TurnFlow !== 'undefined') {
        TurnFlow.init(roomCode, settings.totalRounds, _isSpectator);
        if (!_isSpectator && Rooms.getIsHost()) await TurnFlow.startTurn();
      }
      return;
    }

    // --- Local: old spinner flow ---
    _selectNextPlayer();
    UI.renderGameScreen();
  }

  /**
   * Selects the next player via random selection.
   */
  function _selectNextPlayer() {
    const players = Players.getAll();
    // If in a room, use TurnTracker's current index
    if (Rooms.isInRoom()) {
      currentPlayerIndex = TurnTracker.getCurrentPlayerIndex();
      return;
    }

    // Pick a random player (different from current if possible)
    let newIndex;
    if (players.length > 1) {
      do {
        newIndex = Math.floor(Math.random() * players.length);
      } while (newIndex === currentPlayerIndex);
    } else {
      newIndex = 0;
    }
    currentPlayerIndex = newIndex;
  }

  /**
   * Initiates the spin animation to select a player.
   */
  async function spinForPlayer() {
    state = STATES.SPINNING;

    // If in a room, advance via TurnTracker so Firebase syncs everyone
    if (Rooms.isInRoom()) {
      await TurnTracker.nextTurn();
      currentPlayerIndex = TurnTracker.getCurrentPlayerIndex();
    } else {
      _selectNextPlayer();
    }

    UI.renderSpinner(() => {
      state = STATES.CHOOSING;
      UI.renderChoosing();
    });
  }

  /**
   * Allows external sync to set current player index (used by TurnTracker listeners)
   */
  function setCurrentPlayerIndex(idx) {
    currentPlayerIndex = idx;
  }

  /**
   * Player chooses truth or dare.
   * @param {string} type - 'truth' or 'dare'
   */
  function chooseType(type) {
    currentType = type;
    state = STATES.QUESTION;

    // Check if AI generation is enabled and should be used
    const useAI = settings.aiEnabled && typeof AIQuestions !== 'undefined' && Math.random() < 0.4;

    if (useAI) {
      const player = getCurrentPlayer();
      const allNames = Players.getAll().map(p => p.name);
      if (type === 'truth') {
        currentQuestion = AIQuestions.generateTruth(player.name, allNames);
      } else {
        currentQuestion = AIQuestions.generateDare(player.name, allNames);
      }
    } else {
      if (type === 'truth') {
        currentQuestion = Questions.getTruth();
      } else {
        currentQuestion = Questions.getDare();
      }
    }

    // Reset reactions for new question
    if (typeof Reactions !== 'undefined') {
      Reactions.reset();
    }

    UI.renderQuestion();
  }

  /**
   * Handles regenerating the current question with AI.
   */
  function regenerateQuestion() {
    if (typeof AIQuestions === 'undefined') return;

    const player = getCurrentPlayer();
    const allNames = Players.getAll().map(p => p.name);

    if (currentType === 'truth') {
      currentQuestion = AIQuestions.generateTruth(player.name, allNames);
    } else {
      currentQuestion = AIQuestions.generateDare(player.name, allNames);
    }

    UI.renderQuestion();
  }

  /**
   * Handles skipping the current question.
   */
  function skipQuestion() {
    const player = getCurrentPlayer();
    if (!player) return;

    const canSkip = Players.useSkip(player.id);
    if (!canSkip) return;

    // Update streak (broken)
    Scoring.updateStreak(player.id, false);

    const penalty = Questions.getRandomPenalty();

    Scoring.addHistoryEntry({
      playerName: player.name,
      playerId: player.id,
      type: currentType,
      question: currentQuestion.question,
      difficulty: currentQuestion.difficulty,
      pack: currentQuestion.pack,
      completed: false,
      skipped: true,
      pointsEarned: -1
    });

    UI.showPenalty(penalty);

    // Move to next turn after a delay
    setTimeout(() => {
      nextTurn();
    }, 3000);
  }

  /**
   * Records the voting result and moves forward.
   * @param {boolean} completed - Whether the player completed the challenge
   */
  function submitVote(completed) {
    const player = getCurrentPlayer();
    if (!player) return;

    state = STATES.RESULT;
    Timer.stop();

    // Update streak
    Scoring.updateStreak(player.id, completed);

    let pointsEarned = 0;
    let bonuses = null;

    if (completed) {
      const pointsBreakdown = Scoring.calculatePoints(
        currentQuestion.difficulty,
        currentType,
        player.id
      );
      pointsEarned = pointsBreakdown.total;
      bonuses = pointsBreakdown;
      Players.addScore(player.id, pointsEarned);
    }

    Scoring.addHistoryEntry({
      playerName: player.name,
      playerId: player.id,
      type: currentType,
      question: currentQuestion.question,
      difficulty: currentQuestion.difficulty,
      pack: currentQuestion.pack,
      completed,
      skipped: false,
      pointsEarned,
      bonuses
    });

    UI.renderResult(completed, pointsEarned, bonuses);

    // Auto-advance after showing result
    setTimeout(() => {
      nextTurn();
    }, 2500);
  }

  /**
   * Advances to the next turn or ends the game.
   */
  function nextTurn() {
    turnsThisRound++;

    // Check if round is complete (all players had a turn)
    if (turnsThisRound >= Players.count()) {
      turnsThisRound = 0;
      currentRound++;
    }

    // Check if game is over
    if (currentRound > totalRounds) {
      endGame();
      return;
    }

    // Spin for next player
    spinForPlayer();
  }

  /**
   * Ends the game and shows the winner screen.
   */
  function endGame() {
    state = STATES.GAME_OVER;
    Timer.stop();
    UI.renderWinnerScreen();
  }

  /**
   * Resets for a new game with the same players.
   */
  function playAgain() {
    Players.resetScores();
    Questions.resetUsed();
    Scoring.clearHistory();
    currentRound = 1;
    turnsThisRound = 0;
    currentPlayerIndex = -1;
    state = STATES.SPINNING;
    _selectNextPlayer();
    UI.renderGameScreen();
  }

  /**
   * Returns to the lobby screen.
   */
  function returnToLobby() {
    state = STATES.LOBBY;
    Timer.stop();
    UI.renderLobbyScreen();
  }

  return {
    getState,
    getStates,
    getSettings,
    updateSettings,
    getCurrentRound,
    getTotalRounds,
    getCurrentPlayer,
    getCurrentQuestion,
    getCurrentType,
    startGame,
    spinForPlayer,
    setCurrentPlayerIndex,
    chooseType,
    regenerateQuestion,
    skipQuestion,
    submitVote,
    nextTurn,
    endGame,
    playAgain,
    returnToLobby
  };
})();
