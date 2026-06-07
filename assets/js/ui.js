/**
 * ui.js — All DOM rendering and UI update functions.
 * No game logic here — only presentation.
 */

const UI = (() => {
  /* ---- Helper: Create element shorthand ---- */
  function _el(tag, cls = '', html = '') {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html) el.innerHTML = html;
    return el;
  }

  /* ---- Screen Management ---- */
  function _showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    if (screen) {
      screen.classList.add('active');
      screen.classList.add('screen-enter');
      setTimeout(() => screen.classList.remove('screen-enter'), 500);
    }
  }

  /* ---- Floating Particles System ---- */
  function initParticles() {
    const container = document.getElementById('particles-container');
    if (!container) return;

    const colors = [
      'rgba(79, 172, 254, 0.4)',
      'rgba(245, 87, 108, 0.4)',
      'rgba(168, 85, 247, 0.4)',
      'rgba(251, 191, 36, 0.3)',
      'rgba(52, 211, 153, 0.3)'
    ];

    // Create 15 floating particles
    for (let i = 0; i < 15; i++) {
      const particle = document.createElement('div');
      particle.className = 'floating-particle';
      const size = Math.random() * 4 + 2;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const duration = Math.random() * 15 + 15;
      const delay = Math.random() * 20;

      particle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        box-shadow: 0 0 ${size * 3}px ${color};
        left: ${left}%;
        animation-duration: ${duration}s;
        animation-delay: -${delay}s;
      `;
      container.appendChild(particle);
    }
  }

  /* ---- LOBBY SCREEN ---- */
  function renderLobbyScreen() {
    _showScreen('lobby-screen');
    renderPlayerList();
    _updateStartButton();
  }

  /**
   * Renders the list of player tags in the lobby.
   */
  function renderPlayerList() {
    const container = document.getElementById('player-list');
    if (!container) return;
    container.innerHTML = '';

    const allPlayers = Players.getAll();

    // Update count badge
    const countBadge = document.getElementById('player-count-badge');
    if (countBadge) countBadge.textContent = `(${allPlayers.length}/10)`;

    allPlayers.forEach((p, i) => {
      const tag = _el('div', 'player-tag');
      tag.style.animationDelay = `${i * 0.05}s`;
      tag.innerHTML = `
        <div class="avatar" style="background:${p.color}">${p.initials}</div>
        <span>${p.name}</span>
        <button class="player-remove" data-id="${p.id}" aria-label="Remove ${p.name}">&times;</button>
      `;
      tag.querySelector('.player-remove').addEventListener('click', () => {
        Players.removePlayer(p.id);
        renderPlayerList();
        _updateStartButton();
      });
      container.appendChild(tag);
    });
  }

  /**
   * Enables/disables the start button based on player count.
   */
  function _updateStartButton() {
    const btn = document.getElementById('btn-start-game');
    if (btn) btn.disabled = Players.count() < 2;
  }

  /* ---- GAME SCREEN ---- */
  function renderGameScreen() {
    _showScreen('game-screen');
    renderLeaderboard();
    renderHistoryLog();
    _updateRoundDisplay();
    _renderBackToLobbyBtn();

    const _isSpectator = typeof Spectator !== 'undefined' && Spectator.isSpectator();

    // Spectator badge
    const gameScreen = document.getElementById('game-screen');
    if (_isSpectator && gameScreen) {
      gameScreen.classList.add('spectator-mode');
      let badge = document.getElementById('spectator-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'spectator-badge';
        badge.className = 'spectator-badge';
        badge.innerHTML = '👁 You are spectating';
        const header = gameScreen.querySelector('.game-header');
        if (header) header.prepend(badge);
      }
    }

    // Render multiplayer avatar bar + queue
    if (typeof MultiplayerUI !== 'undefined') {
      MultiplayerUI.renderPlayerAvatarsBar();
      MultiplayerUI.renderNextPlayerQueue();
    }

    // Render chat panel if in room OR spectating
    const inRoomOrSpectating = (typeof Rooms !== 'undefined' && Rooms.isInRoom()) || _isSpectator;
    if (inRoomOrSpectating) {
      _renderChatPanel();
      _renderEmojiBar();
      if (!_isSpectator) _wireHostIngamePanel();
    }

    // Local game: start spinner flow (only if not in room AND not spectating)
    if (!inRoomOrSpectating) {
      Game.spinForPlayer();
    }
  }

  function _wireHostIngamePanel() {
    if (typeof Rooms === 'undefined' || !Rooms.getIsHost()) return;

    const card = document.getElementById('host-ingame-card');
    if (card) card.style.display = 'block';

    let _paused = false;
    let _locked = false;

    const pauseBtn = document.getElementById('btn-pause-game');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        _paused = !_paused;
        pauseBtn.textContent = _paused ? '▶️ Resume Game' : '⏸️ Pause Game';
        pauseBtn.classList.toggle('active', _paused);
        if (typeof HostControls !== 'undefined') HostControls.pauseGame(_paused);
      });
    }

    const lockBtn = document.getElementById('btn-lock-game');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        _locked = !_locked;
        lockBtn.textContent = _locked ? '🔓 Unlock Room' : '🔒 Lock Room';
        lockBtn.classList.toggle('active', _locked);
        if (typeof HostControls !== 'undefined') HostControls.lockRoom(_locked);
      });
    }

    // Render host player management panel (kick/mute/transfer)
    if (typeof HostControls !== 'undefined') {
      Rooms.getRoomPlayers().then(players => {
        const playersObj = {};
        players.forEach(p => { playersObj[p.id] = p; });
        HostControls.renderHostPanel(playersObj);
      });
    }
  }

  let _chatSubscribed = false;  // guard: subscribe to Chat exactly once (listener persists across re-renders)

  /* ---- BACK TO LOBBY ---- */
  function _renderBackToLobbyBtn() {
    const header = document.querySelector('#game-screen .game-header');
    if (!header || document.getElementById('btn-back-to-lobby')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-back-to-lobby';
    btn.className = 'btn btn-secondary btn-sm';
    btn.innerHTML = '← Lobby';
    btn.title = 'Leave this game and return to the lobby';
    btn.addEventListener('click', _confirmBackToLobby);
    header.prepend(btn);
  }

  function _confirmBackToLobby() {
    const inRoom = typeof Rooms !== 'undefined' && Rooms.isInRoom();
    const isSpec = typeof Spectator !== 'undefined' && Spectator.isSpectator();
    const message = (inRoom || isSpec)
      ? 'Leave the room and return to the lobby? You will exit this game.'
      : 'Return to the lobby? The current game will end.';
    if (!window.confirm(message)) return;

    // Tear down all live modules so nothing keeps polling/listening in the background
    try { if (typeof Chat        !== 'undefined') Chat.destroy(); }         catch (e) {}
    try { if (typeof Reactions   !== 'undefined') Reactions.destroy(); }    catch (e) {}
    try { if (typeof TurnFlow    !== 'undefined') TurnFlow.destroy(); }     catch (e) {}
    try { if (typeof HostControls!== 'undefined') HostControls.destroy(); } catch (e) {}
    try { if (typeof Timer       !== 'undefined') Timer.stop(); }           catch (e) {}

    if (inRoom || isSpec) {
      // Multiplayer: leave the room, clear the session, then reload to a fresh
      // lobby. A reload guarantees a clean reset of all module state.
      const finish = () => window.location.reload();
      try {
        if (isSpec && typeof Spectator !== 'undefined') Spectator.destroy();
        if (inRoom && typeof Rooms !== 'undefined') {
          const res = Rooms.leaveRoom();
          if (res && typeof res.then === 'function') { res.then(finish).catch(finish); return; }
        }
      } catch (e) { /* fall through */ }
      finish();
    } else {
      // Local game: soft return to the lobby
      if (typeof Game !== 'undefined') Game.returnToLobby();
    }
  }

  function _renderChatPanel() {
    // Ensure chat column exists
    let chatCol = document.getElementById('game-chat-col');
    if (!chatCol) {
      chatCol = _el('div', '', '');
      chatCol.id = 'game-chat-col';
      const layout = document.querySelector('.game-layout');
      if (layout) layout.appendChild(chatCol);
    }

    chatCol.innerHTML = `
      <div class="chat-panel" id="chat-panel">
        <div class="chat-header">
          <h4>💬 Live Chat</h4>
          <button class="btn-chat-collapse" id="btn-chat-collapse" title="Collapse">╱</button>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="emoji-reaction-bar" id="emoji-bar"></div>
        <div class="chat-input-row">
          <input type="file" id="chat-file-input" accept="image/*,video/*" style="display:none">
          <button class="chat-attach-btn" id="chat-attach-btn" title="Send a photo or video">📎</button>
          <textarea class="chat-input" id="chat-input" placeholder="Type a message… (Enter to send)" rows="1" maxlength="300"></textarea>
          <button class="chat-send-btn" id="chat-send-btn" title="Send">➤</button>
        </div>
      </div>
    `;

    // Emoji bar
    if (typeof Reactions !== 'undefined') Reactions.renderEmojiBar('emoji-bar');

    // Send message
    const input  = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    function _sendMsg(isAnswer) {
      const txt = input.value.trim();
      if (!txt) return;
      input.value = '';
      input.style.height = 'auto';
      const type = isAnswer ? 'answer' : 'message';
      if (typeof Chat !== 'undefined') Chat.send(txt, type);
    }

    sendBtn.addEventListener('click', () => _sendMsg(false));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMsg(false); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    // Attach photo / video
    const fileInput = document.getElementById('chat-file-input');
    const attachBtn = document.getElementById('chat-attach-btn');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = ''; // allow re-selecting the same file later
        if (!file || typeof Chat === 'undefined' || !Chat.sendMedia) return;
        attachBtn.disabled = true;
        attachBtn.textContent = '⏳';
        let res;
        try { res = await Chat.sendMedia(file); }
        finally { attachBtn.disabled = false; attachBtn.textContent = '📎'; }
        if (res && !res.success && res.error) window.alert(res.error);
      });
    }

    // Collapse toggle
    document.getElementById('btn-chat-collapse').addEventListener('click', () => {
      const panel = document.getElementById('chat-panel');
      panel.classList.toggle('chat-panel-collapsed');
    });

    // Subscribe to incoming messages — only once. The listener persists across
    // panel re-renders and resolves #chat-messages at call time, so a single
    // subscription keeps working even after the panel DOM is rebuilt.
    if (typeof Chat !== 'undefined' && !_chatSubscribed) {
      Chat.onMessage(msg => _appendChatMessage(msg));
      _chatSubscribed = true;
    }

    // Mobile floating button
    _renderChatFloatButton();
  }

  function _appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const time     = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div      = document.createElement('div');
    const msgType  = msg.type || 'message';
    div.className  = `chat-msg type-${msgType}`;

    if (msgType === 'system') {
      // Italic, centered, no avatar
      div.innerHTML = `<div class="chat-msg-bubble chat-system"><em>${msg.text}</em></div>`;

    } else if (msgType === 'answer' || msgType === 'official_answer') {
      // Official answer — gold highlighted bubble with "Official Answer" label
      const initials = msg.playerName ? msg.playerName.substring(0, 2).toUpperCase() : '?';
      div.innerHTML = `
        <div class="chat-msg-header">
          <div class="chat-msg-avatar" style="background:${msg.playerColor || '#f59e0b'}">${initials}</div>
          <span class="chat-msg-name">${msg.playerName || 'Player'}</span>
          <span class="chat-official-label">📩 Official Answer</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-bubble chat-answer">${_escapeHtml(msg.text)}</div>`;

    } else if (msgType === 'image' || msgType === 'video') {
      // Photo / video — header + a media bubble whose blob loads asynchronously
      // from the shared media store.
      const initials = msg.playerName ? msg.playerName.substring(0, 2).toUpperCase() : '?';
      div.innerHTML = `
        <div class="chat-msg-header">
          <div class="chat-msg-avatar" style="background:${msg.playerColor || '#6366f1'}">${initials}</div>
          <span class="chat-msg-name">${msg.playerName || 'Player'}</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-bubble chat-media-bubble">
          <div class="chat-media-loading">${msgType === 'image' ? '🖼 Loading photo…' : '🎬 Loading video…'}</div>
        </div>`;

      if (typeof Chat !== 'undefined' && Chat.getMedia && msg.mediaId) {
        Chat.getMedia(msg.mediaId).then(blob => {
          const bubble = div.querySelector('.chat-media-bubble');
          if (!bubble) return;
          if (!blob) {
            bubble.innerHTML = '<div class="chat-media-missing">📎 Media not available on this device</div>';
            return;
          }
          const url = URL.createObjectURL(blob);
          if (msgType === 'image') {
            bubble.innerHTML = `<img class="chat-media" src="${url}" alt="shared photo" loading="lazy">`;
            bubble.querySelector('img')?.addEventListener('click', () => window.open(url, '_blank'));
          } else {
            bubble.innerHTML = `<video class="chat-media" src="${url}" controls preload="metadata"></video>`;
          }
          container.scrollTop = container.scrollHeight;
        }).catch(() => {});
      }

    } else {
      div.innerHTML = `
        <div class="chat-msg-header">
          <div class="chat-msg-avatar" style="background:${msg.playerColor || '#6366f1'}">${initials}</div>
          <span class="chat-msg-name">${msg.playerName || 'Player'}</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-bubble">${_escapeHtml(msg.text)}</div>`;
    }

    container.appendChild(div);
    // Auto-scroll to latest message
    container.scrollTop = container.scrollHeight;
  }

  function _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _renderEmojiBar() {
    // Ensure emoji overlay exists at body level
    if (!document.getElementById('emoji-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'emoji-overlay';
      document.body.appendChild(overlay);
    }
  }

  function _renderChatFloatButton() {
    if (document.getElementById('chat-float-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'chat-float-btn';
    btn.className = 'chat-float-btn';
    btn.innerHTML = '💬 <span id="chat-unread-badge" style="display:none"></span>';
    btn.addEventListener('click', () => {
      const panel = document.getElementById('chat-panel');
      if (panel) {
        panel.classList.toggle('chat-panel-open');
        if (typeof Chat !== 'undefined') Chat.setChatOpen(panel.classList.contains('chat-panel-open'));
      }
    });
    document.body.appendChild(btn);
  }


  /**
   * Updates the round badge display.
   */
  function _updateRoundDisplay() {
    const el = document.getElementById('round-display');
    if (el) el.innerHTML = `Round <span>${Game.getCurrentRound()}</span> / ${Game.getTotalRounds()}`;
  }

  /* ---- SPINNER ---- */
  function renderSpinner(onComplete) {
    const main = document.getElementById('game-main-content');
    if (!main) return;
    const players = Players.getAll();
    const current = Game.getCurrentPlayer();

    main.innerHTML = `
      <div class="current-player-display animate-fade-in">
        <h3 class="turn-label">Spinning the wheel...</h3>
        <div class="spinner-container" id="spinner-visual">
          <div class="spinner-pointer"></div>
          <div class="spinner-wheel" id="spinner-wheel"></div>
          <div class="spinner-center">🎯</div>
        </div>
      </div>
    `;

    const wheel = document.getElementById('spinner-wheel');
    const segAngle = 360 / players.length;

    // Build segments via SVG for cleaner look
    players.forEach((p, i) => {
      const seg = _el('div', 'spinner-segment');
      const rotation = i * segAngle;
      seg.style.cssText = `
        position:absolute; width:100%; height:100%;
        clip-path: polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin(segAngle * Math.PI / 180)}% ${50 - 50 * Math.cos(segAngle * Math.PI / 180)}%);
        transform: rotate(${rotation}deg);
        background: ${p.color};
        display:flex; align-items:flex-start; justify-content:center;
        padding-top:18%; font-weight:700; font-size:0.7rem; color:#fff;
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      `;
      seg.textContent = p.initials;
      wheel.appendChild(seg);
    });

    // Animate spin to land on selected player
    const targetIndex = players.indexOf(current);
    const spins = 4 + Math.random() * 2;
    const targetAngle = spins * 360 + (360 - targetIndex * segAngle - segAngle / 2);

    requestAnimationFrame(() => {
      wheel.style.transition = 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
      wheel.style.transform = `rotate(${targetAngle}deg)`;
    });

    setTimeout(() => {
      main.innerHTML = `
        <div class="turn-display animate-bounce-in">
          <div class="avatar avatar-xl avatar-ring turn-avatar animate-pulse-glow" style="background:${current.color}">${current.initials}</div>
          <h3 class="turn-label">It's your turn!</h3>
          <div class="current-player-name" style="color:${current.color}">${current.name}</div>
        </div>
      `;
      setTimeout(() => { if (onComplete) onComplete(); }, 1200);
    }, 3800);
  }

  /* ---- CHOOSING TRUTH OR DARE ---- */
  function renderChoosing() {
    const main = document.getElementById('game-main-content');
    const player = Game.getCurrentPlayer();
    if (!main || !player) return;

    main.innerHTML = `
      <div class="turn-display animate-fade-in">
        <div class="avatar avatar-lg turn-avatar" style="background:${player.color}">${player.initials}</div>
        <h3 class="turn-label">${player.name}, choose wisely...</h3>
        <div class="choice-buttons">
          <button class="btn btn-truth btn-lg" id="btn-choose-truth">🔮 Truth</button>
          <button class="btn btn-dare btn-lg" id="btn-choose-dare">🔥 Dare</button>
        </div>
      </div>
    `;

    document.getElementById('btn-choose-truth').addEventListener('click', () => Game.chooseType('truth'));
    document.getElementById('btn-choose-dare').addEventListener('click', () => Game.chooseType('dare'));
    _updateRoundDisplay();
    renderLeaderboard();
  }

  /* ---- QUESTION CARD ---- */
  function renderQuestion() {
    const main = document.getElementById('game-main-content');
    const player = Game.getCurrentPlayer();
    const q = Game.getCurrentQuestion();
    const type = Game.getCurrentType();
    if (!main || !player || !q) return;

    const isTruth = type === 'truth';
    const cardClass = isTruth ? 'truth-card' : 'dare-card';
    const icon = isTruth ? '🔮' : '🔥';
    const label = isTruth ? 'TRUTH' : 'DARE';
    const hasSkip = Players.hasSkips(player.id);
    const packLabel = q.pack.charAt(0).toUpperCase() + q.pack.slice(1);
    const diffLabel = q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1);

    main.innerHTML = `
      <div class="animate-fade-in" style="text-align:center">
        <div class="flip-card-container" style="margin:0 auto">
          <div class="flip-card" id="question-card">
            <div class="flip-card-front">
              <div style="font-size:4.5rem;margin-bottom:var(--sp-lg)">${icon}</div>
              <h3 style="font-family:var(--ff-heading)">${label}</h3>
              <p style="color:var(--clr-text-muted);margin-top:var(--sp-sm);font-size:var(--fs-sm)">Tap to reveal</p>
            </div>
            <div class="flip-card-back ${cardClass}">
              <div class="flip-card-meta">${label} · ${diffLabel} · ${packLabel}</div>
              <div class="flip-card-question">${q.question}</div>
            </div>
          </div>
        </div>
        <div id="timer-area"></div>
        <div class="vote-section" id="vote-section" style="display:none">
          <button class="vote-btn vote-up" id="btn-vote-yes"><span class="vote-emoji">👍</span>Completed</button>
          <button class="vote-btn vote-down" id="btn-vote-no"><span class="vote-emoji">👎</span>Failed</button>
        </div>
        <div class="skip-section" id="skip-section" style="display:none">
          <button class="btn btn-secondary btn-sm" id="btn-skip" ${!hasSkip ? 'disabled' : ''}>⏭️ Skip (-1 pt)</button>
          <div class="skip-info">${hasSkip ? '1 skip remaining' : 'No skips left'}</div>
        </div>
        <div class="penalty-banner" id="penalty-banner"></div>
      </div>
    `;

    const card = document.getElementById('question-card');
    card.addEventListener('click', () => {
      if (!card.classList.contains('flipped')) {
        card.classList.add('flipped');
        setTimeout(() => {
          document.getElementById('vote-section').style.display = 'flex';
          document.getElementById('skip-section').style.display = 'block';
          if (!isTruth) _startDareTimer();
        }, 700);
      }
    });

    // Auto-flip after short delay
    setTimeout(() => card.click(), 900);

    document.getElementById('btn-vote-yes').addEventListener('click', () => Game.submitVote(true));
    document.getElementById('btn-vote-no').addEventListener('click', () => Game.submitVote(false));
    document.getElementById('btn-skip').addEventListener('click', () => Game.skipQuestion());
  }

  /* ---- DARE TIMER ---- */
  function _startDareTimer() {
    const area = document.getElementById('timer-area');
    if (!area) return;
    const circ = Timer.getCircumference();

    area.innerHTML = `
      <div class="timer-container animate-fade-in-up">
        <svg class="timer-svg" viewBox="0 0 140 140">
          <circle class="timer-bg" cx="70" cy="70" r="60"/>
          <circle class="timer-progress" id="timer-ring" cx="70" cy="70" r="60"
            stroke-dasharray="${circ}" stroke-dashoffset="0"/>
        </svg>
        <div class="timer-text" id="timer-text">1:00</div>
      </div>
      <div class="timer-controls">
        <button class="btn btn-secondary btn-sm" id="btn-timer-pause">⏸️ Pause</button>
        <button class="btn btn-secondary btn-sm" id="btn-timer-reset">🔄 Reset</button>
      </div>
    `;

    const ring = document.getElementById('timer-ring');
    const text = document.getElementById('timer-text');

    Timer.start(60, (data) => {
      if (ring) ring.style.strokeDashoffset = data.dashoffset;
      if (text) text.textContent = data.formatted;
      if (data.timeLeft <= 10 && ring) {
        ring.style.stroke = '#ef4444';
        ring.style.animation = 'timer-pulse 0.5s ease-in-out infinite';
        if (text) text.classList.add('timer-warning');
      }
    }, () => {
      if (text) text.textContent = '0:00';
    });

    document.getElementById('btn-timer-pause').addEventListener('click', (e) => {
      const paused = Timer.togglePause();
      e.target.textContent = paused ? '▶️ Resume' : '⏸️ Pause';
    });
    document.getElementById('btn-timer-reset').addEventListener('click', () => {
      Timer.reset();
      if (ring) {
        ring.style.stroke = '';
        ring.style.animation = '';
      }
      if (text) text.classList.remove('timer-warning');
    });
  }

  /* ---- RESULT ---- */
  function renderResult(completed, points) {
    const main = document.getElementById('game-main-content');
    const player = Game.getCurrentPlayer();
    if (!main || !player) return;

    const emoji = completed ? '🎉' : '😅';
    const msg = completed ? `+${points} point${points > 1 ? 's' : ''}!` : 'No points this time';
    const title = completed ? 'Nailed it!' : 'Better luck next time!';
    const cls = completed ? 'text-glow-truth' : '';

    main.innerHTML = `
      <div class="result-display animate-bounce-in">
        <div class="result-emoji">${emoji}</div>
        <h2 class="result-message ${cls}">${title}</h2>
        <p class="result-points">${player.name} — ${msg}</p>
      </div>
    `;

    renderLeaderboard();
    renderHistoryLog();
  }

  /* ---- PENALTY ---- */
  function showPenalty(penalty) {
    const main = document.getElementById('game-main-content');
    if (!main) return;
    const player = Game.getCurrentPlayer();

    main.innerHTML = `
      <div class="penalty-display animate-shake">
        <div class="penalty-emoji">⚠️</div>
        <h2 class="penalty-title">Skipped! Penalty Time!</h2>
        <p class="penalty-points">${player?.name} loses 1 point</p>
        <div class="penalty-banner visible">${penalty}</div>
      </div>
    `;

    renderLeaderboard();
    renderHistoryLog();
  }

  /* ---- LEADERBOARD ---- */
  function renderLeaderboard() {
    const container = document.getElementById('leaderboard-content');
    if (!container) return;
    const sorted = Players.getLeaderboard();
    const current = Game.getCurrentPlayer();

    container.innerHTML = '';
    sorted.forEach((p, i) => {
      const isActive = current && current.id === p.id;
      const medals = ['🥇', '🥈', '🥉'];
      const item = _el('li', `leaderboard-item${isActive ? ' active-player' : ''}`);
      item.style.animationDelay = `${i * 0.05}s`;
      item.innerHTML = `
        <span class="leaderboard-rank">${i < 3 ? medals[i] : i + 1}</span>
        <div class="avatar" style="background:${p.color};width:28px;height:28px;font-size:0.65rem">${p.initials}</div>
        <span class="leaderboard-name">${p.name}</span>
        <span class="leaderboard-score">${p.score}</span>
      `;
      container.appendChild(item);
    });
  }

  /* ---- HISTORY LOG ---- */
  function renderHistoryLog() {
    const container = document.getElementById('history-list-content');
    if (!container) return;
    const entries = Scoring.getRecentHistory(20);

    container.innerHTML = '';
    if (entries.length === 0) {
      container.innerHTML = '<li class="history-item" style="color:var(--clr-text-muted)">No history yet...</li>';
      return;
    }
    entries.forEach(e => {
      const statusIcon = e.skipped ? '⏭️' : e.completed ? '✅' : '❌';
      const item = _el('li', 'history-item');
      item.innerHTML = `
        <span class="history-item-badge ${e.type}">${e.type}</span>
        <div style="flex:1;min-width:0">
          <strong>${e.playerName}</strong>
          <div style="font-size:var(--fs-xs);color:var(--clr-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.question}</div>
        </div>
        <span class="history-item-status">${statusIcon}</span>
      `;
      container.appendChild(item);
    });
  }

  /* ---- WINNER SCREEN ---- */
  function renderWinnerScreen() {
    _showScreen('winner-screen');
    const container = document.getElementById('winner-content');
    if (!container) return;
    const standings = Players.getLeaderboard();
    const winner = standings[0];
    const stats = Scoring.getStats();

    container.innerHTML = `
      <div class="winner-container animate-fade-in-up">
        <div class="winner-crown animate-crown-float">👑</div>
        <div class="winner-name animate-bounce-in stagger-1">${winner.name}</div>
        <div class="winner-score animate-fade-in stagger-2">🏆 ${winner.score} points</div>
        <div class="final-standings animate-fade-in stagger-3">
          <h4 style="text-align:left;margin-bottom:var(--sp-md);color:var(--clr-text-secondary)">Final Standings</h4>
          ${standings.map((p, i) => `
            <div class="final-standing-item">
              <span class="standing-rank">${['🥇','🥈','🥉'][i] || '#' + (i+1)}</span>
              <div class="avatar" style="background:${p.color};width:36px;height:36px;font-size:0.75rem">${p.initials}</div>
              <span class="standing-name">${p.name}</span>
              <span class="standing-score">${p.score} pts</span>
            </div>
          `).join('')}
        </div>
        <div class="winner-stats">
          ${stats.totalRounds} turns · ${stats.completed} completed · ${stats.completionRate}% success rate
        </div>
        <div class="winner-actions">
          <button class="btn btn-primary btn-lg" id="btn-play-again">🔄 Play Again</button>
          <button class="btn btn-secondary" id="btn-new-game">🏠 New Game</button>
        </div>
      </div>
    `;

    document.getElementById('btn-play-again').addEventListener('click', () => Game.playAgain());
    document.getElementById('btn-new-game').addEventListener('click', () => Game.returnToLobby());

    _launchConfetti();
  }

  /* ---- CONFETTI ---- */
  function _launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#fbbf24','#4facfe','#f5576c','#a855f7','#34d399','#ec4899','#06b6d4','#f59e0b'];
    const pieces = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: Math.random() * 12 + 4,
      h: Math.random() * 8 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: Math.random() * 3 + 1.5,
      vx: Math.random() * 2.5 - 1.25,
      rot: Math.random() * 360,
      rv: Math.random() * 8 - 4,
      opacity: Math.random() * 0.5 + 0.5
    }));

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        p.rot += p.rv;
        // Add slight wave
        p.x += Math.sin(p.y * 0.01) * 0.5;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 400) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    animate();
  }

  /* ---- SETTINGS MODAL ---- */
  function openSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.add('visible');
  }

  function closeSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  function initSettingsUI() {
    const s = Game.getSettings();
    document.querySelectorAll('.pack-toggle').forEach(input => {
      input.checked = s.packs.includes(input.dataset.pack);
    });
    document.querySelectorAll('.difficulty-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.difficulty === s.difficulty);
    });
    const roundsInput = document.getElementById('rounds-input');
    if (roundsInput) roundsInput.value = s.totalRounds;
  }

  function saveSettings() {
    const packs = [];
    document.querySelectorAll('.pack-toggle').forEach(input => {
      if (input.checked) packs.push(input.dataset.pack);
    });

    const activeChip = document.querySelector('.difficulty-chip.active');
    const difficulty = activeChip ? activeChip.dataset.difficulty : 'easy';

    const roundsInput = document.getElementById('rounds-input');
    const totalRounds = Math.max(1, Math.min(50, parseInt(roundsInput?.value) || 10));

    Game.updateSettings({ packs, difficulty, totalRounds });
    closeSettings();
  }

  /* ---- HISTORY TOGGLE ---- */
  function toggleHistory() {
    const panel = document.getElementById('history-panel');
    if (panel) panel.classList.toggle('collapsed');
  }

  return {
    initParticles,
    renderLobbyScreen,
    renderPlayerList,
    renderGameScreen,
    renderSpinner,
    renderChoosing,
    renderQuestion,
    renderResult,
    showPenalty,
    renderLeaderboard,
    renderHistoryLog,
    renderWinnerScreen,
    openSettings,
    closeSettings,
    initSettingsUI,
    saveSettings,
    toggleHistory
  };
})();