/**
 * multiplayer-ui.js — UI components for online rooms and turn tracking
 * Renders room lobby, player avatars, turn queue, waiting lobby, and toast notifications.
 * All dialogs are rendered inline (no browser prompt/alert).
 */

const MultiplayerUI = (() => {
  let _roomStateHandler = null;

  /**
   * Render room creation/join buttons on the lobby screen
   */
  function renderRoomSelectScreen() {
    const lobbyScreen = document.getElementById('lobby-screen');
    if (!lobbyScreen) return;

    // Remove existing if re-rendered
    const existingRoom = document.getElementById('room-select-panel');
    if (existingRoom) existingRoom.remove();

    const roomPanel = document.createElement('div');
    roomPanel.id = 'room-select-panel';
    roomPanel.className = 'card lobby-card room-select-panel animate-fade-in';
    roomPanel.innerHTML = `
      <div class="lobby-card-header">
        <h4>🌐 Multiplayer Mode</h4>
      </div>
      <div class="room-select-buttons">
        <button class="btn btn-room-create btn-lg" id="btn-create-room">
          <span class="btn-icon">🏠</span>
          <span>Create Room</span>
        </button>
        <button class="btn btn-room-join btn-lg" id="btn-join-room">
          <span class="btn-icon">🚪</span>
          <span>Join Room</span>
        </button>
      </div>
      <div class="room-mode-info">
        <p>💡 <strong>Create:</strong> Host a game and share the code with friends</p>
        <p>💡 <strong>Join:</strong> Enter a friend's room code to play together</p>
      </div>
    `;

    // Insert before the player list card
    const playerListCard = document.querySelector('.lobby-card');
    if (playerListCard) {
      playerListCard.parentNode.insertBefore(roomPanel, playerListCard);
    } else {
      lobbyScreen.appendChild(roomPanel);
    }

    // Event handlers
    document.getElementById('btn-create-room').addEventListener('click', showCreateRoomDialog);
    document.getElementById('btn-join-room').addEventListener('click', showJoinRoomDialog);
  }

  /* ═══════════════════════════════════════
     CREATE ROOM DIALOG (inline, no prompt)
     ═══════════════════════════════════════ */
  function showCreateRoomDialog() {
    _removeExistingModals();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay animate-fade-in';
    modal.id = 'create-room-modal';
    modal.innerHTML = `
      <div class="modal-content animate-fade-in-scale">
        <div class="modal-header">
          <h3>🏠 Create a Room</h3>
          <button class="btn btn-icon btn-secondary modal-close-btn" id="modal-close-create">&times;</button>
        </div>
        <div class="modal-body">
          <label class="modal-label" for="create-room-name">Your Name</label>
          <input type="text" id="create-room-name" class="input-field modal-input" placeholder="Enter your name..." maxlength="20" autocomplete="off" autofocus>
          <p class="modal-hint">You'll be the host of this room.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary btn-lg modal-action-btn" id="btn-confirm-create" disabled>
            <span class="btn-spinner hidden" id="create-spinner"></span>
            Create Room
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = document.getElementById('create-room-name');
    const confirmBtn = document.getElementById('btn-confirm-create');
    const closeBtn = document.getElementById('modal-close-create');

    input.focus();

    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value.trim().length === 0;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmBtn.disabled) {
        e.preventDefault();
        confirmBtn.click();
      }
    });

    confirmBtn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) return;

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="btn-spinner"></span> Creating...';

      const result = await Rooms.createRoom(name);

      if (result.success) {
        modal.remove();
        showRoomCodeScreen(result.roomCode);
      } else {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Create Room';
        _showModalError(modal, result.error || 'Failed to create room');
      }
    });

    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  /* ═══════════════════════════════════════
     JOIN ROOM DIALOG (inline, no prompt)
     ═══════════════════════════════════════ */
  function showJoinRoomDialog() {
    _removeExistingModals();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay animate-fade-in';
    modal.id = 'join-room-modal';
    modal.innerHTML = `
      <div class="modal-content animate-fade-in-scale">
        <div class="modal-header">
          <h3>🚪 Join a Room</h3>
          <button class="btn btn-icon btn-secondary modal-close-btn" id="modal-close-join">&times;</button>
        </div>
        <div class="modal-body">
          <label class="modal-label" for="join-room-code">Room Code</label>
          <input type="text" id="join-room-code" class="input-field modal-input room-code-input" placeholder="TRD-XXX" maxlength="7" autocomplete="off" autofocus style="text-transform:uppercase;letter-spacing:2px;text-align:center;font-size:1.3rem;font-family:'Courier New',monospace;">
          <label class="modal-label" for="join-room-name" style="margin-top:var(--sp-lg)">Your Name</label>
          <input type="text" id="join-room-name" class="input-field modal-input" placeholder="Enter your name..." maxlength="20" autocomplete="off">
          <div id="join-error" class="modal-error hidden"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary btn-lg modal-action-btn" id="btn-confirm-join" disabled>
            Join Room
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const codeInput = document.getElementById('join-room-code');
    const nameInput = document.getElementById('join-room-name');
    const confirmBtn = document.getElementById('btn-confirm-join');
    const closeBtn = document.getElementById('modal-close-join');
    const errorEl = document.getElementById('join-error');

    codeInput.focus();

    function validateInputs() {
      const code = codeInput.value.trim();
      const name = nameInput.value.trim();
      confirmBtn.disabled = code.length < 3 || name.length === 0;
    }

    codeInput.addEventListener('input', validateInputs);
    nameInput.addEventListener('input', validateInputs);

    // Auto-add dash after TRD
    codeInput.addEventListener('input', (e) => {
      let val = codeInput.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
      // Auto-insert dash after TRD if user types it
      if (val.length === 3 && !val.includes('-') && val === 'TRD') {
        val = 'TRD-';
      }
      codeInput.value = val;
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmBtn.disabled) {
        e.preventDefault();
        confirmBtn.click();
      }
    });

    confirmBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim().toUpperCase();
      const name = nameInput.value.trim();
      if (!code || !name) return;

      errorEl.classList.add('hidden');
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="btn-spinner"></span> Joining...';

      const result = await Rooms.joinRoom(code, name);

      if (result.success) {
        modal.remove();
        showWaitingLobby();
      } else {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Join Room';
        errorEl.textContent = result.error || 'Failed to join room';
        errorEl.classList.remove('hidden');
        codeInput.classList.add('animate-shake');
        setTimeout(() => codeInput.classList.remove('animate-shake'), 500);
      }
    });

    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  /* ═══════════════════════════════════════
     ROOM CODE DISPLAY (after host creates)
     ═══════════════════════════════════════ */
  function showRoomCodeScreen(roomCode) {
    _removeExistingModals();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay animate-fade-in';
    modal.id = 'room-code-modal';
    modal.innerHTML = `
      <div class="modal-content animate-fade-in-scale room-code-modal-content">
        <div class="modal-header">
          <h3>🎲 Room Created!</h3>
        </div>
        <div class="room-code-display">
          <p class="room-label">Share this code with your friends:</p>
          <div class="room-code-box">
            <span class="room-code-text" id="room-code-value">${roomCode}</span>
            <button class="btn btn-icon btn-secondary btn-copy-code" id="btn-copy-code" title="Copy code">📋</button>
          </div>
          <div class="room-code-copied hidden" id="copy-feedback">✅ Copied!</div>
        </div>
        <div class="room-info">
          <div class="room-info-dot"></div>
          <p>Waiting for players to join...</p>
        </div>
        <button class="btn btn-primary btn-lg room-code-continue" id="btn-go-to-lobby">Go to Waiting Lobby →</button>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-copy-code').addEventListener('click', async () => {
      if (await Rooms.copyCodeToClipboard()) {
        const feedback = document.getElementById('copy-feedback');
        feedback.classList.remove('hidden');
        setTimeout(() => feedback.classList.add('hidden'), 2000);
      }
    });

    document.getElementById('btn-go-to-lobby').addEventListener('click', () => {
      modal.remove();
      showWaitingLobby();
    });
  }

  /* ═══════════════════════════════════════
     WAITING LOBBY
     ═══════════════════════════════════════ */
  async function showWaitingLobby() {
    // Hide the main lobby
    const lobbyScreen = document.getElementById('lobby-screen');
    if (lobbyScreen) lobbyScreen.style.display = 'none';

    // Remove any previous waiting lobby
    const existingWaiting = document.getElementById('waiting-lobby-screen');
    if (existingWaiting) existingWaiting.remove();

    const waitingScreen = document.createElement('section');
    waitingScreen.id = 'waiting-lobby-screen';
    waitingScreen.className = 'screen active';
    document.getElementById('app-container').appendChild(waitingScreen);

    const displayCode = Rooms.getDisplayCode();

    waitingScreen.innerHTML = `
      <header class="lobby-header waiting-lobby-header">
        <div class="lobby-icon animate-bounce-soft">🎯</div>
        <h1 class="title-gradient">Waiting Lobby</h1>
        <div class="waiting-room-code">
          <span class="waiting-code-label">Room Code:</span>
          <span class="waiting-code-value">${displayCode}</span>
          <button class="btn btn-icon btn-sm btn-copy-inline" id="btn-copy-waiting" title="Copy code">📋</button>
        </div>
      </header>

      <div class="card lobby-card waiting-card">
        <div class="lobby-card-header">
          <h4>👥 Players Joined (<span id="player-count">0</span>/10)</h4>
        </div>
        <div id="waiting-player-list" class="waiting-player-list"></div>
      </div>

      <div class="lobby-actions waiting-lobby-actions">
        ${Rooms.getIsHost()
          ? '<button class="btn btn-primary btn-lg animate-pulse-glow" id="btn-start-from-lobby" disabled>🚀 Start Game</button>'
          : '<div class="waiting-host-msg"><div class="waiting-dots"><span></span><span></span><span></span></div><p>Waiting for host to start the game...</p></div>'
        }
        <button class="btn btn-secondary" id="btn-leave-room">❌ Leave Room</button>
      </div>
    `;

    // Initial player list render
    await _updateWaitingPlayerList();

    // Copy button
    document.getElementById('btn-copy-waiting')?.addEventListener('click', async () => {
      if (await Rooms.copyCodeToClipboard()) {
        Rooms.showToast('📋 Room code copied!', 'success');
      }
    });

    // Start button (host only)
    const startBtn = document.getElementById('btn-start-from-lobby');
    if (startBtn) {
      startBtn.addEventListener('click', () => startGameFromRoom());

      // Immediately check player count to enable/disable button (need 2+ players)
      const initialPlayers = await Rooms.getRoomPlayers();
      startBtn.disabled = initialPlayers.length < 2;
    }

    // Leave button
    document.getElementById('btn-leave-room')?.addEventListener('click', () => {
      Rooms.leaveRoom();
      location.reload();
    });

    // Listen for room updates (works via Firebase OR localStorage cross-tab sync)
    if (_roomStateHandler) {
      Rooms.offRoomStateChange(_roomStateHandler);
    }
    _roomStateHandler = (roomData) => {
      _updateWaitingPlayerList();

      // Enable start button for host if >= 2 players
      if (Rooms.getIsHost() && startBtn) {
        const playerCount = Object.keys(roomData.players || {}).length;
        startBtn.disabled = playerCount < 2;
      }

      // Non-host: if game started, jump to game
      if (roomData.gameStarted && !Rooms.getIsHost()) {
        Rooms.offRoomStateChange(_roomStateHandler);
        _roomStateHandler = null;
        setTimeout(() => startGameFromRoom(), 800);
      }
    };
    Rooms.onRoomStateChange(_roomStateHandler);
  }

  /**
   * Update waiting lobby player list from Firebase
   */
  async function _updateWaitingPlayerList() {
    const players = await Rooms.getRoomPlayers();
    const container = document.getElementById('waiting-player-list');
    const countEl = document.getElementById('player-count');

    if (!container) return;

    container.innerHTML = '';
    if (countEl) countEl.textContent = players.length;

    players.forEach((p, i) => {
      const playerEl = document.createElement('div');
      playerEl.className = 'waiting-player-item animate-fade-in';
      playerEl.style.animationDelay = `${i * 0.08}s`;
      playerEl.innerHTML = `
        <div class="avatar waiting-avatar" style="background:${p.color}">
          <span>${p.initials}</span>
        </div>
        <span class="player-name">${p.name}</span>
        ${p.isHost ? '<span class="host-badge">👑 Host</span>' : ''}
      `;
      container.appendChild(playerEl);
    });
  }

  /* ═══════════════════════════════════════
     PLAYER AVATARS BAR (top of game board)
     ═══════════════════════════════════════ */
  function renderPlayerAvatarsBar() {
    // Remove existing bar
    const existingBar = document.getElementById('player-avatars-bar');
    if (existingBar) existingBar.remove();

    const gameHeader = document.querySelector('.game-header');
    if (!gameHeader) return;

    const bar = document.createElement('div');
    bar.id = 'player-avatars-bar';
    bar.className = 'player-avatars-bar';

    const players = TurnTracker.getAllPlayers();
    const currentIndex = TurnTracker.getCurrentPlayerIndex();

    players.forEach((p, i) => {
      const avatar = document.createElement('div');
      const isCurrent = i === currentIndex;
      avatar.className = `player-avatar${isCurrent ? ' current' : ''}`;
      avatar.dataset.playerId = p.id;
      avatar.dataset.index = i;
      avatar.title = p.name;

      avatar.innerHTML = `
        <div class="avatar-circle" style="background:${p.color}">
          <span class="avatar-initials">${p.initials}</span>
        </div>
        ${isCurrent ? '<div class="avatar-glow-ring"></div>' : ''}
        <span class="avatar-name-label">${p.name.split(' ')[0]}</span>
      `;

      bar.appendChild(avatar);
    });

    // Insert after the round badge, before the settings button
    const headerLeft = gameHeader.querySelector('.game-header-left');
    if (headerLeft) {
      headerLeft.appendChild(bar);
    } else {
      gameHeader.insertBefore(bar, gameHeader.lastElementChild);
    }
  }

  /**
   * Update player avatars bar when turn changes
   */
  function updatePlayerAvatarsBar(turnData) {
    const bar = document.getElementById('player-avatars-bar');
    if (!bar) {
      renderPlayerAvatarsBar();
      return;
    }

    const currentIndex = TurnTracker.getCurrentPlayerIndex();
    const avatars = bar.querySelectorAll('.player-avatar');

    avatars.forEach((avatar, i) => {
      const glowRing = avatar.querySelector('.avatar-glow-ring');

      if (i === currentIndex) {
        avatar.classList.add('current');
        // Add glow ring if not present
        if (!glowRing) {
          const ring = document.createElement('div');
          ring.className = 'avatar-glow-ring';
          avatar.insertBefore(ring, avatar.querySelector('.avatar-name-label'));
        }
        // Trigger bounce transition
        avatar.classList.add('turn-transition');
        setTimeout(() => avatar.classList.remove('turn-transition'), 700);
      } else {
        avatar.classList.remove('current');
        if (glowRing) glowRing.remove();
      }
    });
  }

  /* ═══════════════════════════════════════
     NEXT PLAYER QUEUE
     ═══════════════════════════════════════ */
  function renderNextPlayerQueue() {
    const existingQueue = document.getElementById('next-player-queue');
    if (existingQueue) existingQueue.remove();

    const gameHeader = document.querySelector('.game-header');
    if (!gameHeader) return;

    const queue = document.createElement('div');
    queue.id = 'next-player-queue';
    queue.className = 'next-player-queue';

    _populateQueue(queue);
    gameHeader.appendChild(queue);
  }

  /**
   * Populate queue element with current/next info
   */
  function _populateQueue(queue) {
    const current = TurnTracker.getCurrentPlayer();
    const nextPlayers = TurnTracker.getNextPlayersQueue(2);

    queue.innerHTML = '';

    if (current) {
      const nowSection = document.createElement('div');
      nowSection.className = 'queue-now-section';
      nowSection.innerHTML = `
        <span class="queue-label-text">Now Playing</span>
        <div class="queue-current-player">
          <div class="queue-avatar queue-avatar-current" style="background:${current.color}">${current.initials}</div>
          <span class="queue-current-name">${current.name}</span>
        </div>
      `;
      queue.appendChild(nowSection);
    }

    if (nextPlayers.length > 0) {
      const upSection = document.createElement('div');
      upSection.className = 'queue-upcoming-section';
      upSection.innerHTML = '<span class="queue-label-text queue-label-upcoming">Next Up</span>';

      nextPlayers.forEach((p, i) => {
        const item = document.createElement('div');
        item.className = `queue-item queue-item-${i + 1}`;
        item.innerHTML = `
          <span class="queue-number">${i + 1}</span>
          <div class="queue-avatar" style="background:${p.color}">${p.initials}</div>
          <span class="queue-name">${p.name}</span>
        `;
        upSection.appendChild(item);
      });

      queue.appendChild(upSection);
    }
  }

  /**
   * Update next player queue with slide animation
   */
  function updateNextPlayerQueue(turnData) {
    const queue = document.getElementById('next-player-queue');
    if (!queue) {
      renderNextPlayerQueue();
      return;
    }

    // Add exit animation
    queue.classList.add('queue-updating');
    setTimeout(() => {
      _populateQueue(queue);
      queue.classList.remove('queue-updating');
      queue.classList.add('queue-updated');
      setTimeout(() => queue.classList.remove('queue-updated'), 500);
    }, 200);
  }

  /* ═══════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════ */

  function _removeExistingModals() {
    ['create-room-modal', 'join-room-modal', 'room-code-modal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function _showModalError(modal, message) {
    let errEl = modal.querySelector('.modal-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'modal-error';
      const body = modal.querySelector('.modal-body');
      if (body) body.appendChild(errEl);
    }
    errEl.textContent = message;
    errEl.classList.remove('hidden');
  }

  return {
    renderRoomSelectScreen,
    showCreateRoomDialog,
    showJoinRoomDialog,
    showRoomCodeScreen,
    showWaitingLobby,
    renderPlayerAvatarsBar,
    updatePlayerAvatarsBar,
    renderNextPlayerQueue,
    updateNextPlayerQueue
  };
})();

/**
 * Start game from waiting room — bridges room data to the game engine
 */
async function startGameFromRoom() {
  if (Rooms.getIsHost()) {
    await Rooms.startGameInRoom();
  }

  // Fetch all players from Firebase
  const players = await Rooms.getRoomPlayers();

  // Clear local player list and populate from room
  Players.clearAll();
  players.forEach(p => {
    Players.addPlayerObject(p);
  });

  // Initialize turn tracker
  const mapped = Players.getAll().map(p => ({
    id: p.id,
    name: p.name,
    initials: p.initials,
    color: p.color,
    score: p.score
  }));
  TurnTracker.initialize(mapped);

  // Remove waiting lobby screen
  const waitingScreen = document.getElementById('waiting-lobby-screen');
  if (waitingScreen) waitingScreen.remove();

  // Start the game
  Game.startGame();

  // Render multiplayer UI
  MultiplayerUI.renderPlayerAvatarsBar();
  MultiplayerUI.renderNextPlayerQueue();

  // Listen for turn changes from Firebase (non-host)
  if (!Rooms.getIsHost()) {
    Rooms.onRoomStateChange((roomData) => {
      if (roomData.currentTurn && typeof roomData.currentPlayerIndex === 'number') {
        TurnTracker.setTurnFromSync(roomData.currentPlayerIndex);
        Game.setCurrentPlayerIndex(roomData.currentPlayerIndex);
        MultiplayerUI.updatePlayerAvatarsBar();
        MultiplayerUI.updateNextPlayerQueue();
      }
    });
  }

  // Listen for turn changes to update UI
  TurnTracker.onTurnChange((turnData) => {
    MultiplayerUI.updatePlayerAvatarsBar(turnData);
    MultiplayerUI.updateNextPlayerQueue(turnData);
  });
}
