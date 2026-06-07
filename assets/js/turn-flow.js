/**
 * turn-flow.js — Full 8-step Turn State Machine
 *
 * Firebase path:  rooms/{roomCode}/turnState
 * Local fallback: rooms/{roomCode} key in localStorage (truth-dare-room-{code})
 *
 * Phases: picking_player → choosing_type → choosing_question
 *         → awaiting_answer → judging → result → (next turn)
 */

const TurnFlow = (() => {
  const PHASES = {
    PICKING:    'picking_player',
    CHOOSING:   'choosing_type',
    QUESTIONING:'choosing_question',
    AWAITING:   'awaiting_answer',
    JUDGING:    'judging',
    RESULT:     'result',
  };

  let _roomCode      = null;
  let _totalRounds   = 10;
  let _roundsDone    = 0;
  let _spectator     = false;
  let _db            = null;
  let _stateRef      = null;
  let _pollInterval  = null;
  let _isLocalMode   = false;
  let _players       = [];
  let _myId          = null;
  let _myName        = null;
  let _lastState     = null;   // full last-rendered state (for dedup)

  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */
  function init(roomCode, totalRounds, spectatorMode) {
    _cleanup();

    _roomCode    = roomCode;
    _totalRounds = totalRounds || 10;
    _spectator   = !!spectatorMode;
    _roundsDone  = 0;
    _players     = Players.getAll();
    _myId        = sessionStorage.getItem('myPlayerId')
                 || (typeof Rooms !== 'undefined' ? Rooms.getCurrentUserId() : null);
    _myName      = sessionStorage.getItem('myPlayerName') || _myId;

    console.log('[TurnFlow] init — roomCode:', roomCode, '| myId:', _myId, '| spectator:', _spectator);

    // ── LAYER 1: localStorage + window.storage events (always works cross-tab) ──
    // Read any existing state immediately
    const existing = _readLocalState();
    if (existing) _applyState(existing);

    // Listen for changes written by other tabs via localStorage
    window.addEventListener('storage', _onStorageEvent);

    // ── LAYER 2: 400ms polling fallback (catches same-tab updates + any misses) ──
    _pollInterval = setInterval(() => {
      const s = _readLocalState();
      if (s) _applyState(s);
    }, 400);

    // ── LAYER 3: Firebase listener (OPTIONAL — only if credentials are real) ──
    const firebaseOK = typeof firebase !== 'undefined' &&
      typeof firebase.database === 'function' &&
      typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isReady();

    if (firebaseOK) {
      try {
        _db = firebase.database();
        _stateRef = _db.ref(`rooms/${_roomCode}/turnState`);
        _stateRef.on('value', snap => {
          const s = snap.val();
          if (s) {
            // Mirror Firebase state to localStorage so other tabs get it too
            _writeLocalStateDirect(s);
            _applyState(s);
          }
        }, () => { /* Firebase listener failed — localStorage covers it */ });
        _isLocalMode = false;
      } catch {
        _isLocalMode = true;
        _db = null; _stateRef = null;
      }
    } else {
      _isLocalMode = true;
    }
  }

  function _onStorageEvent(e) {
    if (e.key !== _turnStateKey()) return;
    try {
      const s = JSON.parse(e.newValue);
      if (s) _applyState(s);
    } catch {}
  }

  const _turnStateKey = () => `truth-dare-turn-${_roomCode}`;


  /**
   * Apply a state update — only re-renders if something meaningful changed.
   */
  let _renderTimer = null;  // debounce timer

  function _applyState(state) {
    if (!state) return;
    const prev = _lastState;

    // Compare currentQuestion by content (it's an object — reference always differs after JSON parse)
    const qNow  = state.currentQuestion ? JSON.stringify(state.currentQuestion) : null;
    const qPrev = prev?.currentQuestion  ? JSON.stringify(prev.currentQuestion)  : null;

    const changed = !prev
      || prev.turnPhase         !== state.turnPhase
      || prev.currentAsker      !== state.currentAsker
      || prev.currentAnswerer   !== state.currentAnswerer
      || qNow                   !== qPrev
      || prev.answererSubmitted !== state.answererSubmitted
      || prev.answererAnswer    !== state.answererAnswer
      || prev.askerJudgment     !== state.askerJudgment;

    if (!changed) return;  // nothing meaningful changed — skip render

    _lastState = { ...state, currentQuestion: state.currentQuestion };

    // Debounce: collapse rapid calls (storage event + poller firing together) into one render
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => {
      _renderTimer = null;
      renderTurnUI(_lastState);
    }, 80);
  }

  function _cleanup() {
    if (_stateRef)     { try { _stateRef.off(); } catch {} _stateRef = null; }
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
    if (_renderTimer)  { clearTimeout(_renderTimer); _renderTimer = null; }
    window.removeEventListener('storage', _onStorageEvent);
  }


  /* ══════════════════════════════════════════════════
     START TURN — called by host only
  ══════════════════════════════════════════════════ */
  async function startTurn() {
    if (_players.length === 0) _players = Players.getAll();
    const firstPlayer = _players[0];
    if (!firstPlayer) { console.warn('[TurnFlow] No players!'); return; }

    const initialState = {
      currentAsker:      firstPlayer.id,
      currentAnswerer:   null,
      currentQuestion:   null,
      questionType:      null,
      turnPhase:         PHASES.PICKING,
      answererSubmitted: false,
      answererAnswer:    null,
      askerJudgment:     null,
      turnNumber:        1,
      roundsDone:        0
    };

    await _writeState(initialState);
    console.log('[TurnFlow] startTurn written:', initialState);
  }

  /* ══════════════════════════════════════════════════
     STATE READ/WRITE
  ══════════════════════════════════════════════════ */
  async function _writeState(state) {
    // Always write to localStorage first (instant cross-tab via storage event)
    _writeLocalStateDirect(state);
    _applyState(state); // render on THIS tab immediately
    // Also attempt Firebase if available
    if (!_isLocalMode && _stateRef) {
      try { await _stateRef.set(state); } catch {}
    }
  }

  async function _updateState(updates) {
    const current = _readLocalState() || {};
    const next    = { ...current, ...updates };
    // Always write to localStorage (cross-tab)
    _writeLocalStateDirect(next);
    _applyState(next); // render on THIS tab immediately
    // Also attempt Firebase if available
    if (!_isLocalMode && _db) {
      try { await _db.ref(`rooms/${_roomCode}/turnState`).update(updates); } catch {}
    }
  }

  function _readLocalState() {
    try {
      return JSON.parse(localStorage.getItem(_turnStateKey()) || 'null');
    } catch { return null; }
  }

  function _writeLocalStateDirect(state) {
    try {
      localStorage.setItem(_turnStateKey(), JSON.stringify(state));
    } catch { /* ignore */ }
  }

  /* ══════════════════════════════════════════════════
     RENDER TURN UI — called on every state change
  ══════════════════════════════════════════════════ */
  function renderTurnUI(state) {
    if (!state) return;
    const main = document.getElementById('game-main-content');
    if (!main) { console.warn('[TurnFlow] #game-main-content not found'); return; }

    // Pull the authoritative cumulative scores into this tab's Players list so the
    // leaderboard reflects EVERY player's points — not just the ones this tab judged.
    _syncScoresFromRoom();

    // Self-heal: these phases REQUIRE an answerer. If the incoming state is
    // missing it (e.g. a stale/partial sync arrived out of order), re-read the
    // authoritative local state once instead of rendering a broken "undefined"
    // screen. This is what kept turns after the first from working.
    const _needsAnswerer = state.turnPhase === PHASES.CHOOSING
      || state.turnPhase === PHASES.QUESTIONING
      || state.turnPhase === PHASES.AWAITING
      || state.turnPhase === PHASES.JUDGING;
    if (_needsAnswerer && !state.currentAnswerer) {
      const fresh = _readLocalState();
      if (fresh && fresh.currentAnswerer) {
        state = fresh;
        _lastState = { ...fresh, currentQuestion: fresh.currentQuestion };
      } else {
        // No valid answerer anywhere yet — wait for the correct state to arrive
        // rather than painting an "undefined" turn.
        setTimeout(() => { const s = _readLocalState(); if (s) _applyState(s); }, 250);
        return;
      }
    }

    // Always re-read identity — sessionStorage is tab-isolated so this is safe
    const freshId = sessionStorage.getItem('myPlayerId')
                  || (typeof Rooms !== 'undefined' ? Rooms.getCurrentUserId() : null)
                  || _myId;
    if (freshId) _myId = freshId;

    // Always refresh player list
    const latest = Players.getAll();
    if (latest.length > 0) _players = latest;

    if (_players.length === 0) {
      setTimeout(() => renderTurnUI(state), 300);
      return;
    }

    const myId = _myId;

    // Resolve asker/answerer objects — fall back to a minimal stub if not yet in _players
    const asker = _players.find(p => p.id === state.currentAsker)
      || _players[0]
      || { id: state.currentAsker, name: '?', initials: '?', color: '#6366f1' };

    const answerer = state.currentAnswerer
      ? (_players.find(p => p.id === state.currentAnswerer)
         || { id: state.currentAnswerer, name: sessionStorage.getItem('myPlayerName') || '?',
               initials: (sessionStorage.getItem('myPlayerName') || '?').substring(0,2).toUpperCase(),
               color: '#ec4899' })
      : null;

    // *** KEY FIX: amAnswerer does NOT require answerer to exist in _players ***
    // The ID match alone is the authority — the player object may load later.
    const amAsker    = !_spectator && !!myId && myId === state.currentAsker;
    const amAnswerer = !_spectator && !!myId && !!state.currentAnswerer && myId === state.currentAnswerer;
    const phase      = state.turnPhase;

    console.log('[TurnFlow] phase:', phase,
      '| myId:', myId,
      '| asker:', state.currentAsker,
      '| answerer:', state.currentAnswerer,
      '| amAsker:', amAsker,
      '| amAnswerer:', amAnswerer);

    _updateAvatarBorders(state);

    switch (phase) {
      case PHASES.PICKING:     _renderPicking(state, asker, amAsker);                        break;
      case PHASES.CHOOSING:    _renderChoosing(state, asker, answerer, amAnswerer);          break;
      case PHASES.QUESTIONING: _renderQuestioning(state, asker, answerer, amAsker);          break;
      case PHASES.AWAITING:    _renderAwaiting(state, asker, answerer, amAsker, amAnswerer);  break;
      case PHASES.JUDGING:     _renderJudging(state, asker, answerer, amAsker, amAnswerer);   break;
      case PHASES.RESULT:      _renderResult(state, asker, answerer);                        break;
      default:
        main.innerHTML = `<div class="turn-waiting"><p>Loading turn…</p></div>`;
    }

    if (typeof UI !== 'undefined') UI.renderLeaderboard?.();
  }

  /* ══════════════════════════════════════════════════
     PHASE RENDERERS
  ══════════════════════════════════════════════════ */

  // Step 1 — Asker picks who to challenge
  function _renderPicking(state, asker, amAsker) {
    const main = document.getElementById('game-main-content');
    if (!main) return;

    // Debug strip (remove after confirming IDs match)
    const dbg = `<div style="font-size:10px;opacity:0.4;padding:4px 8px;color:#aaa">
      myId: ${_myId || 'null'} | asker: ${state.currentAsker} | match: ${_myId === state.currentAsker}</div>`;

    if (!amAsker) {
      main.innerHTML = `
        ${dbg}
        <div class="turn-waiting animate-fade-in">
          <div class="tw-avatar" style="background:${asker?.color || '#6366f1'}">${asker?.initials || '?'}</div>
          <h3>${asker?.name || '?'} is choosing who to challenge…</h3>
          <div class="waiting-dots"><span></span><span></span><span></span></div>
        </div>`;
      return;
    }

    main.innerHTML = `
      <div class="phase-picking animate-fade-in">
        <h3 class="phase-title">🎯 Your turn, ${asker?.name}!</h3>
        <p class="phase-sub">Pick a player to challenge</p>
        <div class="challenger-grid" id="challenger-grid"></div>
      </div>`;

    const grid = document.getElementById('challenger-grid');
    _players.forEach(p => {
      if (p.id === state.currentAsker) return; // skip self
      const card = document.createElement('button');
      card.className = 'challenger-card';
      card.innerHTML = `
        <div class="cc-avatar" style="background:${p.color}">${p.initials}</div>
        <span>${p.name}</span>`;
      card.addEventListener('click', async () => {
        await _updateState({ currentAnswerer: p.id, turnPhase: PHASES.CHOOSING });
      });
      grid.appendChild(card);
    });
  }

  // Step 2 — Answerer picks Truth or Dare
  function _renderChoosing(state, asker, answerer, amAnswerer) {
    const main = document.getElementById('game-main-content');
    if (!main) return;

    if (!amAnswerer) {
      const who = (_myId === state.currentAsker) ? 'You' : (asker?.name || '?');
      main.innerHTML = `
        <div class="turn-waiting animate-fade-in">
          <div class="tw-avatar" style="background:${answerer?.color || '#ec4899'}">${answerer?.initials || '?'}</div>
          <h3>${asker?.name} challenged ${answerer?.name}!</h3>
          <p>Waiting for ${answerer?.name} to choose Truth or Dare…</p>
          <div class="waiting-dots"><span></span><span></span><span></span></div>
        </div>`;
      return;
    }

    main.innerHTML = `
      <div class="phase-choosing animate-fade-in">
        <div class="tw-avatar" style="background:${asker?.color}">${asker?.initials}</div>
        <h3>${asker?.name} is challenging you!</h3>
        <p>Choose your fate:</p>
        <div class="choice-buttons">
          <button class="btn btn-truth btn-lg" id="btn-choose-truth">🔮 Truth</button>
          <button class="btn btn-dare  btn-lg" id="btn-choose-dare">🔥 Dare</button>
        </div>
      </div>`;

    document.getElementById('btn-choose-truth').addEventListener('click', async () => {
      await _updateState({ questionType: 'truth', turnPhase: PHASES.QUESTIONING });
    });
    document.getElementById('btn-choose-dare').addEventListener('click', async () => {
      await _updateState({ questionType: 'dare', turnPhase: PHASES.QUESTIONING });
    });
  }

  // Step 3 — Asker picks question source
  function _renderQuestioning(state, asker, answerer, amAsker) {
    const main = document.getElementById('game-main-content');
    if (!main) return;
    const typeLabel = state.questionType === 'truth' ? '🔮 Truth' : '🔥 Dare';

    if (!amAsker) {
      main.innerHTML = `
        <div class="turn-waiting animate-fade-in">
          <h3>${asker?.name} is picking a ${typeLabel} for ${answerer?.name}…</h3>
          <div class="waiting-dots"><span></span><span></span><span></span></div>
        </div>`;
      return;
    }

    main.innerHTML = `
      <div class="phase-questioning animate-fade-in">
        <h3 class="phase-title">${typeLabel} for ${answerer?.name}</h3>
        <p class="phase-sub">How do you want to challenge them?</p>
        <div class="question-source-btns">
          <button class="btn btn-secondary qsb" id="btn-auto-q">🎲 Generate Random Question</button>
          <span class="qsb-or">— or write your own —</span>
          <div class="custom-q-area">
            <textarea id="custom-q-input" class="custom-q-input"
              placeholder="Type your own ${state.questionType}…" maxlength="300"></textarea>
            <button class="btn btn-primary" id="btn-custom-q">✉️ Send This</button>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-auto-q').addEventListener('click', async () => {
      const q = (state.questionType === 'truth') ? Questions.getTruth() : Questions.getDare();
      if (typeof Chat !== 'undefined') Chat.sendSystem(`🎲 Auto ${state.questionType} selected!`);
      await _updateState({ currentQuestion: q, turnPhase: PHASES.AWAITING });
    });

    document.getElementById('btn-custom-q').addEventListener('click', async () => {
      const txt = document.getElementById('custom-q-input')?.value?.trim();
      if (!txt) return;
      const q = { question: txt, pack: 'custom', difficulty: 'custom' };
      await _updateState({ currentQuestion: q, turnPhase: PHASES.AWAITING });
    });
  }

  // Step 4 — Question shown, Answerer submits answer
  function _renderAwaiting(state, asker, answerer, amAsker, amAnswerer) {
    const main = document.getElementById('game-main-content');
    if (!main || !state.currentQuestion) return;
    const isTruth   = state.questionType === 'truth';
    const cardClass = isTruth ? 'truth-card' : 'dare-card';
    const q         = state.currentQuestion;

    let actionBlock = '';
    if (amAnswerer) {
      actionBlock = `
        <div class="answerer-block">
          <p style="color:var(--clr-text-muted);margin-bottom:0.5rem">Type your answer below and submit:</p>
          <textarea id="answer-input" class="answer-input"
            placeholder="Type your answer here…" maxlength="400" rows="3"></textarea>
          <button class="btn btn-primary btn-lg" id="btn-submit-answer">📩 Submit Answer</button>
        </div>`;
    } else if (amAsker) {
      actionBlock = `
        <div class="asker-waiting-block">
          <p>⏳ Waiting for <strong>${answerer?.name}</strong> to submit their answer…</p>
        </div>`;
    } else {
      actionBlock = `
        <div class="voter-block">
          <p>👀 Watching ${answerer?.name} answer…</p>
          ${!_spectator ? `
          <div class="vote-section" style="margin-top:0.5rem">
            <button class="vote-btn vote-up" id="btn-vote-yes"><span class="vote-emoji">👍</span>Completed</button>
            <button class="vote-btn vote-down" id="btn-vote-no"><span class="vote-emoji">👎</span>Failed</button>
          </div>` : `<p class="spectator-note">👁 Spectating</p>`}
        </div>`;
    }

    main.innerHTML = `
      <div class="phase-displaying animate-fade-in">
        <div class="q-card-full ${cardClass}">
          <div class="qcf-label">${isTruth ? '🔮 TRUTH' : '🔥 DARE'}</div>
          <div class="qcf-question">${q.question || q}</div>
          <div class="qcf-meta"><span class="qcf-answerer">⚡ ${answerer?.name} must answer</span></div>
        </div>
        ${actionBlock}
      </div>`;

    if (amAnswerer) {
      document.getElementById('btn-submit-answer')?.addEventListener('click', async () => {
        const txt = document.getElementById('answer-input')?.value?.trim();
        if (!txt) return;
        // Post as official answer bubble in chat
        if (typeof Chat !== 'undefined') Chat.sendAnswer(txt);
        await _updateState({
          answererSubmitted: true,
          answererAnswer:    txt,
          turnPhase:         PHASES.JUDGING
        });
      });
    }

    if (!amAsker && !amAnswerer && !_spectator) {
      document.getElementById('btn-vote-yes')?.addEventListener('click', () => _castVote(state, true));
      document.getElementById('btn-vote-no') ?.addEventListener('click', () => _castVote(state, false));
    }
  }

  // Step 5 — Asker judges the answer
  function _renderJudging(state, asker, answerer, amAsker, amAnswerer) {
    const main = document.getElementById('game-main-content');
    if (!main || !state.currentQuestion) return;
    const isTruth   = state.questionType === 'truth';
    const cardClass = isTruth ? 'truth-card' : 'dare-card';
    const q         = state.currentQuestion;
    const answer    = state.answererAnswer || '(no answer submitted)';

    let actionBlock = '';
    if (amAsker) {
      actionBlock = `
        <div class="judgment-card animate-fade-in">
          <div class="judgment-answer-bubble">
            <span class="judgment-label">💬 ${answerer?.name}'s Answer:</span>
            <p class="judgment-answer-text">${answer}</p>
          </div>
          <p class="judgment-prompt">${answerer?.name} has answered! Did they complete it?</p>
          <div class="verdict-btns">
            <button class="btn verdict-done"    id="btn-mark-done">✅ Done — They completed it! (+10 pts)</button>
            <button class="btn verdict-notdone" id="btn-mark-notdone">❌ Not Done — They failed or refused (0 pts)</button>
          </div>
        </div>`;
    } else if (amAnswerer) {
      actionBlock = `
        <div class="answerer-waiting-block">
          <p>✅ Answer submitted! Waiting for <strong>${asker?.name}</strong> to judge…</p>
        </div>`;
    } else {
      actionBlock = `
        <div class="voter-block">
          <div class="answered-bubble">
            <span class="answered-label">📩 ${answerer?.name} answered:</span>
            <p>${answer}</p>
          </div>
          ${!_spectator ? `
          <p class="vote-prompt">Cast your vote (informational only):</p>
          <div class="vote-section">
            <button class="vote-btn vote-up" id="btn-vote-yes"><span class="vote-emoji">👍</span>Completed</button>
            <button class="vote-btn vote-down" id="btn-vote-no"><span class="vote-emoji">👎</span>Failed</button>
          </div>` : `<p class="spectator-note">👁 Spectating</p>`}
        </div>`;
    }

    main.innerHTML = `
      <div class="phase-displaying animate-fade-in">
        <div class="q-card-full ${cardClass}">
          <div class="qcf-label">${isTruth ? '🔮 TRUTH' : '🔥 DARE'}</div>
          <div class="qcf-question">${q.question || q}</div>
        </div>
        ${actionBlock}
      </div>`;

    if (amAsker) {
      document.getElementById('btn-mark-done')?.addEventListener('click',    () => _judgeAnswer(state, answerer, true));
      document.getElementById('btn-mark-notdone')?.addEventListener('click', () => _judgeAnswer(state, answerer, false));
    }
    if (!amAsker && !amAnswerer && !_spectator) {
      document.getElementById('btn-vote-yes')?.addEventListener('click', () => _castVote(state, true));
      document.getElementById('btn-vote-no') ?.addEventListener('click', () => _castVote(state, false));
    }
  }

  // Step 6 — Result screen
  function _renderResult(state, asker, answerer) {
    const main = document.getElementById('game-main-content');
    if (!main) return;
    const pts = state.lastPoints ?? 0;
    const done = state.askerJudgment === 'done';

    main.innerHTML = `
      <div class="phase-result animate-bounce-in">
        <div class="result-emoji">${done ? '🎊' : '😬'}</div>
        <h2>${done ? 'Done!' : 'Not Done!'}</h2>
        <p>${answerer?.name || 'Player'} ${done ? `earned <strong>+${pts} points</strong>` : 'got 0 points'}!</p>
        <p style="color:var(--clr-text-muted);margin-top:0.5rem">Next turn starting in 3 seconds…</p>
      </div>`;

    if (typeof UI !== 'undefined') { UI.renderLeaderboard?.(); UI.renderHistoryLog?.(); }

    // Only the currentAsker auto-advances to prevent race conditions
    if (_myId === state.currentAsker) {
      setTimeout(async () => {
        _roundsDone = (state.roundsDone || 0) + 1;
        if (_roundsDone >= _totalRounds) {
          _endGame();
          return;
        }
        // Next asker = previous answerer (round-robin)
        const answererObj = _players.find(p => p.id === state.currentAnswerer) || _players[0];
        const nextAsker   = answererObj?.id || _players[0]?.id;
        await _writeState({
          currentAsker:      nextAsker,
          currentAnswerer:   null,
          currentQuestion:   null,
          questionType:      null,
          turnPhase:         PHASES.PICKING,
          answererSubmitted: false,
          answererAnswer:    null,
          askerJudgment:     null,
          turnNumber:        (state.turnNumber || 1) + 1,
          roundsDone:        _roundsDone
        });
      }, 3000);
    }
  }

  /* ══════════════════════════════════════════════════
     ACTIONS
  ══════════════════════════════════════════════════ */
  async function _judgeAnswer(state, answerer, done) {
    if (!answerer) return;
    const pts = done ? 10 : 0;

    // Update score in Firebase / local
    Players.addScore(answerer.id, pts);
    if (!_isLocalMode && _db) {
      const newScore = (answerer.score || 0) + pts;
      _db.ref(`rooms/${_roomCode}/players/${answerer.id}/score`).set(newScore);
    } else {
      // Update in localStorage room data
      try {
        const key  = `truth-dare-room-${_roomCode}`;
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (Array.isArray(data.players)) {
          const p = data.players.find(x => x.id === answerer.id);
          if (p) p.score = (p.score || 0) + pts;
          localStorage.setItem(key, JSON.stringify(data));
        }
      } catch { /* ignore */ }
    }

    const askerName   = _players.find(p => p.id === state.currentAsker)?.name || '?';
    const msg = done
      ? `✅ ${askerName} judged ${answerer.name}'s answer as DONE! +${pts} points awarded`
      : `❌ ${askerName} judged ${answerer.name}'s answer as NOT DONE. No points.`;

    if (typeof Chat !== 'undefined') Chat.sendSystem(msg);

    if (typeof Scoring !== 'undefined') {
      Scoring.addHistoryEntry?.({
        playerName: answerer.name, playerId: answerer.id,
        type: state.questionType,
        question: (state.currentQuestion?.question || state.currentQuestion || ''),
        difficulty: state.currentQuestion?.difficulty || 'custom',
        pack:       state.currentQuestion?.pack       || 'custom',
        completed: done, skipped: false, pointsEarned: pts
      });
    }

    await _updateState({
      askerJudgment: done ? 'done' : 'not_done',
      lastPoints:    pts,
      turnPhase:     PHASES.RESULT
    });
  }

  async function _castVote(state, thumbsUp) {
    if (!_myId || _spectator) return;
    if (!_isLocalMode && _db) {
      await _db.ref(`rooms/${_roomCode}/turnState/votes/${_myId}`).set(thumbsUp);
    }
  }

  /* ══════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════ */

  /**
   * Read cumulative per-player scores from the shared store (Firebase players or
   * the localStorage room data) and apply them as ABSOLUTE values onto this tab's
   * Players objects. Scores are awarded by the judging tab only; without this sync
   * every other tab's leaderboard would stay stuck at the points it personally
   * awarded, making it look like only one player ever scores.
   */
  function _syncScoresFromRoom() {
    try {
      // Firebase mode: read the authoritative players node
      if (!_isLocalMode && _db) {
        _db.ref(`rooms/${_roomCode}/players`).once('value', snap => {
          const obj = snap.val() || {};
          let changed = false;
          Object.values(obj).forEach(p => {
            if (!p || p.id == null) return;
            const local = Players.getById(p.id);
            if (local && typeof p.score === 'number' && local.score !== p.score) {
              local.score = p.score; changed = true;
            }
          });
          if (changed && typeof UI !== 'undefined') UI.renderLeaderboard?.();
        });
        return;
      }

      // Local mode: read scores from the shared room data in localStorage
      const data = JSON.parse(localStorage.getItem(`truth-dare-room-${_roomCode}`) || '{}');
      const arr  = Array.isArray(data.players) ? data.players : Object.values(data.players || {});
      arr.forEach(p => {
        if (!p || p.id == null) return;
        const local = Players.getById(p.id);
        if (local && typeof p.score === 'number') local.score = p.score;
      });
    } catch (e) { /* ignore — leaderboard just keeps its current values */ }
  }

  function _updateAvatarBorders(state) {
    document.querySelectorAll('.player-avatar').forEach(av => {
      av.classList.remove('asker-turn', 'answerer-turn');
    });
    if (state.currentAsker) {
      const askerIdx = _players.findIndex(p => p.id === state.currentAsker);
      const el = document.querySelectorAll('.player-avatar')[askerIdx];
      if (el) el.classList.add('asker-turn');
    }
    if (state.currentAnswerer) {
      const answIdx = _players.findIndex(p => p.id === state.currentAnswerer);
      const el = document.querySelectorAll('.player-avatar')[answIdx];
      if (el) el.classList.add('answerer-turn');
    }
  }

  function _endGame() {
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
    if (_stateRef)     { _stateRef.off(); _stateRef = null; }
    if (typeof UI !== 'undefined') UI.renderWinnerScreen?.();
  }

  /* ══════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════ */
  function destroy() {
    _cleanup();
    _roomCode = null; _db = null; _lastState = null;
  }

  return {
    init,
    startTurn,
    renderTurnUI,
    destroy
  };
})();