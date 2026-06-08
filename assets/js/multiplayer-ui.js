/**
 * multiplayer-ui.js — UI components for online rooms and turn tracking
 * Renders room lobby, player avatars, turn queue, waiting lobby, and toast notifications.
 * All dialogs are rendered inline (no browser prompt/alert).
 */

const MultiplayerUI = (() => {
  let _roomStateHandler = null;

  /**
   * Bind room creation/join events to the existing lobby HTML elements
   */
  function renderRoomSelectScreen() {
    const createBtn = document.getElementById('btn-create-room');
    const joinBtn = document.getElementById('btn-join-room');
    const joinCodeInput = document.getElementById('join-code-inline');

    if (createBtn) {
      createBtn.addEventListener('click', showCreateRoomDialog);
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        const code = joinCodeInput ? joinCodeInput.value.trim() : '';
        showJoinRoomDialog(code);
      });
    }

    // Auto-format join code input
    if (joinCodeInput) {
      joinCodeInput.addEventListener('input', () => {
        let val = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
        if (val.length === 3 && !val.includes('-') && val === 'TRD') {
          val = 'TRD-';
        }
        joinCodeInput.value = val;
      });

      joinCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const code = joinCodeInput.value.trim();
          showJoinRoomDialog(code);
        }
      });
    }
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
  function showJoinRoomDialog(prefillCode) {
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
        <div class="modal-footer" style="flex-direction:column;gap:var(--sp-sm)">
          <button class="btn btn-primary btn-lg modal-action-btn" id="btn-confirm-join" disabled>
            Join Room
          </button>
          <button class="btn btn-secondary modal-action-btn" id="btn-join-spectator" disabled style="font-size:var(--fs-sm)">
            👁️ Watch as Spectator
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

    // Pre-fill code from inline input if provided
    if (prefillCode && codeInput) {
      codeInput.value = prefillCode.toUpperCase();
      nameInput.focus();
    } else {
      codeInput.focus();
    }

    // Validation: enable both join buttons when inputs are filled
    function validateInputs() {
      const code = codeInput.value.trim();
      const name = nameInput.value.trim();
      const ok = code.length >= 3 && name.length > 0;
      confirmBtn.disabled = !ok;
      const specBtn = document.getElementById('btn-join-spectator');
      if (specBtn) specBtn.disabled = !ok;
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

    // Spectator join
    const specBtn = document.getElementById('btn-join-spectator');
    if (specBtn) {
      specBtn.addEventListener('click', async () => {
        const code = codeInput.value.trim().toUpperCase();
        const name = nameInput.value.trim();
        if (!code || !name) return;
        errorEl.classList.add('hidden');
        specBtn.disabled = true;
        specBtn.innerHTML = '<span class="btn-spinner"></span> Joining...';
        const result = await Spectator.join(code, name);
        if (result.success) {
          modal.remove();
          showWaitingLobby();
        } else {
          specBtn.disabled = false;
          specBtn.textContent = '👁️ Watch as Spectator';
          errorEl.textContent = result.error || 'Failed to join as spectator';
          errorEl.classList.remove('hidden');
        }
      });
    }

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
    const lobbyScreen = document.getElementById('lobby-screen');
    if (lobbyScreen) lobbyScreen.style.display = 'none';

    const existingWaiting = document.getElementById('waiting-lobby-screen');
    if (existingWaiting) existingWaiting.remove();

    const waitingScreen = document.createElement('section');
    waitingScreen.id = 'waiting-lobby-screen';
    waitingScreen.className = 'screen active';
    document.getElementById('app-container').appendChild(waitingScreen);

    // Support both regular players and spectators
    const isSpectatorMode = typeof Spectator !== 'undefined' && Spectator.isSpectator();
    const displayCode = Rooms.getDisplayCode()
      || (isSpectatorMode ? Spectator.getRoomCode() : '???');
    const isHost = Rooms.getIsHost() && !isSpectatorMode;

    waitingScreen.innerHTML = `
      <header class="lobby-header waiting-lobby-header">
        <div class="lobby-masks animate-bounce-soft">🎯</div>
        <h1 class="lobby-title-new" style="font-size:2.5rem">Waiting Lobby</h1>
        ${isSpectatorMode ? '<div style="display:inline-block;background:rgba(148,163,184,0.15);border:1px solid rgba(148,163,184,0.25);border-radius:999px;padding:4px 14px;font-size:0.75rem;color:#94a3b8;margin-bottom:8px">👁️ Watching as Spectator</div>' : ''}
        <div class="waiting-room-code">
          <span class="waiting-code-label">Room Code:</span>
          <span class="waiting-code-value">${displayCode}</span>
          <button class="btn btn-icon btn-sm btn-copy-inline" id="btn-copy-waiting" title="Copy code">📋</button>
        </div>
      </header>

      <div class="waiting-grid" style="display:grid;grid-template-columns:1fr ${isHost ? '260px' : ''};gap:var(--sp-lg);width:100%;max-width:760px">
        <div class="card waiting-card">
          <div class="lobby-card-header" style="display:flex;align-items:center;justify-content:space-between">
            <h4>👥 Players (<span id="player-count">0</span>/10)</h4>
            <span id="ready-count-display" style="font-size:var(--fs-sm);color:var(--clr-text-muted)"></span>
          </div>
          <div id="waiting-player-list" class="waiting-player-list"></div>
          <div class="spectator-section" id="spectator-section" style="display:none">
            <h5>👁️ Spectators</h5>
            <div class="spectator-list" id="spectator-list"></div>
          </div>
        </div>

        ${isHost ? `
        <div class="host-controls-card" style="align-self:start">
          <h4>👑 Host Controls</h4>
          <div id="host-controls-panel"></div>
          <div class="host-game-controls">
            <button class="btn btn-host-ctrl" id="btn-lock-room">🔒 Lock Room</button>
            <div style="margin-top:var(--sp-sm);font-size:var(--fs-xs);color:var(--clr-text-muted);padding:0 var(--sp-sm)">Category Packs:</div>
            <div id="host-pack-toggles" style="display:flex;flex-wrap:wrap;gap:4px;padding:var(--sp-sm)"></div>
          </div>
        </div>` : ''}
      </div>

      <div class="lobby-actions waiting-lobby-actions" style="margin-top:var(--sp-xl)">
        ${isSpectatorMode
          ? ''
          : isHost
            ? '<button class="btn btn-start-game btn-lg" id="btn-start-from-lobby" disabled>🚀 Start Game</button>'
            : '<button class="btn btn-ready-check" id="btn-ready-check">⚪ I\'m Ready</button>'
        }
        <button class="btn btn-settings-outline" id="btn-leave-room">❌ Leave Room</button>
      </div>
    `;

    // For spectators: skip initial player-list fetch — the Firebase .on('value') listener
    // fires immediately with current data and will populate the list
    if (!isSpectatorMode) {
      await _updateWaitingPlayerList();
    }

    // Copy button (works for both player and spectator room codes)
    document.getElementById('btn-copy-waiting')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(displayCode);
        Rooms.showToast('📋 Room code copied!', 'success');
      } catch {
        if (Rooms.isInRoom()) Rooms.copyCodeToClipboard();
      }
    });

    // Leave button — handles both regular players and spectators
    document.getElementById('btn-leave-room')?.addEventListener('click', () => {
      if (isSpectatorMode && typeof Spectator !== 'undefined') {
        Spectator.destroy();
      } else {
        Rooms.leaveRoom();
      }
      location.reload();
    });

    // Ready check (non-host)
    const readyBtn = document.getElementById('btn-ready-check');
    let _isReady = false;
    if (readyBtn) {
      readyBtn.addEventListener('click', () => {
        _isReady = !_isReady;
        if (typeof ReadyCheck !== 'undefined') ReadyCheck.setReady(_isReady);
        readyBtn.textContent = _isReady ? '✅ Ready!' : '⚪ I\'m Ready';
        readyBtn.classList.toggle('btn-ready-active', _isReady);
      });
    }

    // Host: lock room toggle
    const lockBtn = document.getElementById('btn-lock-room');
    let _locked = false;
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        _locked = !_locked;
        lockBtn.textContent = _locked ? '🔓 Unlock Room' : '🔒 Lock Room';
        lockBtn.classList.toggle('active', _locked);
        if (typeof HostControls !== 'undefined') HostControls.lockRoom(_locked);
      });
    }

    // Host: pack toggles
    _renderHostPackToggles();

    // Start button (host only)
    // Enabled as soon as there are 2+ active players — ready check is informational only
    const startBtn = document.getElementById('btn-start-from-lobby');
    if (startBtn) {
      startBtn.addEventListener('click', () => startGameFromRoom());
      // Check player count immediately
      const ip = await Rooms.getRoomPlayers();
      const activeCount = ip.filter(p => p.role !== 'spectator').length;
      startBtn.disabled = activeCount < 2;
      // ReadyCheck still syncs badges, but doesn't gate the button
      if (typeof ReadyCheck !== 'undefined') ReadyCheck.init(Rooms.getRoomCode());
    }

    // ── Room state listener ──────────────────────────────
    if (isSpectatorMode) {
      const spectatorCode = Spectator.getRoomCode();

      if (Spectator.isLocalMode()) {
        // ── Local fallback: room lives in localStorage ──────────
        // Poll every 2 seconds so the spectator sees live updates
        const _renderFromStorage = () => {
          try {
            const storageKey = `truth-dare-room-${spectatorCode}`;
            const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const playersArr = Array.isArray(data.players)
              ? data.players
              : Object.values(data.players || {});
            // Build a players-object keyed by id for _updateWaitingPlayerList
            const playersObj = {};
            playersArr.forEach(p => { playersObj[p.id] = p; });
            _updateWaitingPlayerList(playersObj);
            // Check if host started
            if (data.gameStarted) {
              clearInterval(_localPoll);
              setTimeout(() => startGameFromRoom(), 800);
            }
          } catch (e) { /* ignore parse errors */ }
        };

        _renderFromStorage(); // immediate
        const _localPoll = setInterval(_renderFromStorage, 2000);

      } else if (typeof firebase !== 'undefined') {
        // ── Firebase mode: use firebase SDK directly ────────────
        const db      = firebase.database();
        const roomRef = db.ref(`rooms/${spectatorCode}`);

        // .on('value') fires immediately with current snapshot, then on every change
        roomRef.on('value', snap => {
          const roomData = snap.val();
          if (!roomData) return;
          _updateWaitingPlayerList(roomData.players || {});
          if (roomData.gameStarted) {
            roomRef.off();
            setTimeout(() => startGameFromRoom(), 800);
          }
        });

      } else {
        // No data source available
        const c = document.getElementById('waiting-player-list');
        if (c) c.innerHTML = '<p style="color:var(--clr-text-muted);text-align:center;padding:1rem">⚠️ Could not load players — Firebase unavailable.</p>';
      }

    } else {
      // Regular player / host path
      if (_roomStateHandler) Rooms.offRoomStateChange(_roomStateHandler);
      _roomStateHandler = (roomData) => {
        _updateWaitingPlayerList(roomData.players);

        // Re-evaluate Start button state on every room update
        if (isHost && startBtn) {
          const activePlayers = Object.values(roomData.players || {})
            .filter(p => p.role !== 'spectator');
          startBtn.disabled = activePlayers.length < 2;
        }

        if (isHost && typeof HostControls !== 'undefined') {
          HostControls.renderHostPanel(roomData.players || {});
        }
        if (roomData.gameStarted && !isHost) {
          Rooms.offRoomStateChange(_roomStateHandler);
          _roomStateHandler = null;
          setTimeout(() => startGameFromRoom(), 800);
        }
      };
      Rooms.onRoomStateChange(_roomStateHandler);
    }
  }


  /**
   * Update waiting lobby player list from Firebase
   */
  async function _updateWaitingPlayerList(playersObj) {
    let players;
    if (playersObj) {
      players = Object.values(playersObj).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    } else {
      players = await Rooms.getRoomPlayers();

      // Spectator fallback: Rooms has no session, read directly from Firebase
      if ((!players || players.length === 0) && typeof Spectator !== 'undefined' && Spectator.isSpectator() && FirebaseConfig.isReady()) {
        try {
          const db = FirebaseConfig.getDatabase();
          const snap = await db.ref(`rooms/${Spectator.getRoomCode()}/players`).once('value');
          const data = snap.val() || {};
          players = Object.values(data).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
        } catch (e) { players = []; }
      }
    }

    const activePlayers  = players.filter(p => p.role !== 'spectator');
    const spectators     = players.filter(p => p.role === 'spectator');

    const container = document.getElementById('waiting-player-list');
    const countEl   = document.getElementById('player-count');
    if (!container) return;

    container.innerHTML = '';
    if (countEl) countEl.textContent = activePlayers.length;

    activePlayers.forEach((p, i) => {
      const statusClass = p.status === 'disconnected' ? 'status-dot-disconnected'
        : p.status === 'idle' ? 'status-dot-idle' : 'status-dot-online';
      const playerEl = document.createElement('div');
      playerEl.className = 'waiting-player-item animate-fade-in';
      playerEl.dataset.id = p.id;
      playerEl.style.animationDelay = `${i * 0.08}s`;
      playerEl.innerHTML = `
        <div class="avatar waiting-avatar" style="background:${p.color}">
          <span>${p.initials}</span>
        </div>
        <span class="status-dot ${statusClass}"></span>
        <span class="player-name">${p.name}</span>
        ${p.isHost ? '<span class="host-badge">👑</span>' : ''}
        <span class="ready-badge">${p.ready ? '✅' : '⏳'}</span>
      `;
      container.appendChild(playerEl);
    });

    // Spectators section
    const spectSection = document.getElementById('spectator-section');
    const spectList    = document.getElementById('spectator-list');
    if (spectSection && spectList) {
      spectSection.style.display = spectators.length > 0 ? 'block' : 'none';
      spectList.innerHTML = spectators.map(s =>
        `<span class="spectator-tag">👁️ ${s.name}</span>`
      ).join('');
    }
  }

  /**
   * Render host pack toggle checkboxes
   */
  function _renderHostPackToggles() {
    const container = document.getElementById('host-pack-toggles');
    if (!container) return;
    const PACKS = [
      { id: 'friends', label: '👫 Friends' },
      { id: 'couples', label: '💑 Couples' },
      { id: 'party',   label: '🎉 Party' },
      { id: 'wild',    label: '🔥 Wild' },
      { id: 'custom',  label: '✏️ Custom' },
    ];
    const activePacks = Game.getSettings().packs || ['friends'];
    PACKS.forEach(pack => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-host-ctrl' + (activePacks.includes(pack.id) ? ' active' : '');
      btn.style.cssText = 'font-size:0.7rem;padding:3px 8px;flex:none';
      btn.textContent = pack.label;
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const newPacks = Array.from(container.querySelectorAll('.active'))
          .map(b => PACKS.find(p => p.label === b.textContent)?.id)
          .filter(Boolean);
        if (typeof HostControls !== 'undefined') HostControls.updateActivePacks(newPacks.length ? newPacks : ['friends']);
      });
      container.appendChild(btn);
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
  const isSpectatorMode = typeof Spectator !== 'undefined' && Spectator.isSpectator();

  // Only the host signals the room that the game started
  if (Rooms.getIsHost() && !isSpectatorMode) {
    await Rooms.startGameInRoom();
  }

  // Fetch all active players (spectator-aware)
  let players = [];
  if (isSpectatorMode && typeof Spectator !== 'undefined') {
    // Spectator.fetchPlayers() handles both localStorage and Firebase
    const all = await Spectator.fetchPlayers();
    players = all.filter(p => p.role !== 'spectator');
  } else {
    players = await Rooms.getRoomPlayers();
    players = players.filter(p => p.role !== 'spectator');
  }

  // Populate local player list
  Players.clearAll();
  players
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .forEach(p => Players.addPlayerObject(p));

  // Initialize turn tracker
  const mapped = Players.getAll().map(p => ({
    id: p.id, name: p.name, initials: p.initials, color: p.color, score: p.score || 0
  }));
  if (typeof TurnTracker !== 'undefined') TurnTracker.initialize(mapped);

  // Remove waiting lobby
  const waitingScreen = document.getElementById('waiting-lobby-screen');
  if (waitingScreen) waitingScreen.remove();

  // Start the game engine (renders game screen, inits TurnFlow, Chat, etc.)
  await Game.startGame();

  // Render multiplayer UI
  MultiplayerUI.renderPlayerAvatarsBar();
  MultiplayerUI.renderNextPlayerQueue();

  // Non-host / spectator: listen for turn syncs
  if (!Rooms.getIsHost()) {
    if (isSpectatorMode && Spectator.isLocalMode()) {
      // Local mode: poll localStorage for turn changes
      setInterval(() => {
        const data = JSON.parse(localStorage.getItem(`truth-dare-room-${Spectator.getRoomCode()}`) || '{}');
        if (typeof data.currentPlayerIndex === 'number' && typeof TurnTracker !== 'undefined') {
          TurnTracker.setTurnFromSync(data.currentPlayerIndex);
          MultiplayerUI.updatePlayerAvatarsBar();
          MultiplayerUI.updateNextPlayerQueue();
        }
      }, 2000);
    } else {
      Rooms.onRoomStateChange((roomData) => {
        if (roomData.currentTurn && typeof roomData.currentPlayerIndex === 'number') {
          if (typeof TurnTracker !== 'undefined') TurnTracker.setTurnFromSync(roomData.currentPlayerIndex);
          MultiplayerUI.updatePlayerAvatarsBar();
          MultiplayerUI.updateNextPlayerQueue();
        }
      });
    }
  }

  if (typeof TurnTracker !== 'undefined') {
    TurnTracker.onTurnChange((turnData) => {
      MultiplayerUI.updatePlayerAvatarsBar(turnData);
      MultiplayerUI.updateNextPlayerQueue(turnData);
    });
  }
}