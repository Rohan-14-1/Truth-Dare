/**
 * chat.js — Real-time in-room chat
 *
 * Firebase mode:  rooms/{roomCode}/chat — uses firebase.database() directly
 * Local mode:     localStorage truth-dare-chat-{roomCode} + window 'storage' events
 *
 * Message types:
 *   'message'        — regular chat
 *   'answer'         — Answerer's official answer (gold bubble)
 *   'official_answer'— alias for 'answer'
 *   'system'         — game event (italic, centered)
 */

const Chat = (() => {
  let _roomCode    = null;
  let _chatRef     = null;
  let _listeners   = [];
  let _unreadCount = 0;
  let _chatOpen    = true;
  let _isLocal     = false;
  let _seenIds     = new Set();

  const _storageKey = () => `truth-dare-chat-${_roomCode}`;

  /* ─── Init ─── */
  function init(roomCode) {
    console.log('[Chat] init — roomCode:', roomCode);
    _destroy();
    _roomCode    = roomCode;
    // NOTE: do NOT reset _listeners here. The UI subscribes via Chat.onMessage()
    // during renderGameScreen, which runs BEFORE Chat.init() in game.js. Wiping
    // listeners on init silently disabled ALL incoming-message rendering (the chat
    // looked dead). Subscriptions are UI-lifetime and must survive re-init; the
    // _seenIds reset below lets stored history re-deliver into the fresh panel.
    _unreadCount = 0;
    _seenIds     = new Set();

    const ok = typeof firebase !== 'undefined' &&
      typeof firebase.database === 'function' &&
      typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isReady();

    if (ok) {
      _isLocal = false;
      _initFirebase();
    } else {
      _isLocal = true;
      _initLocal();
    }
  }

  function _initFirebase() {
    const db  = firebase.database();
    _chatRef  = db.ref(`rooms/${_roomCode}/chat`);
    _chatRef.limitToLast(100).on('child_added', snap => {
      const msg = snap.val();
      if (msg) _deliver({ ...msg, id: snap.key });
    });
    console.log('[Chat] Firebase listener attached to rooms/' + _roomCode + '/chat');
  }

  function _initLocal() {
    const existing = _readLocal();
    existing.forEach(m => _deliver(m));
    window.addEventListener('storage', _onStorage);
    console.log('[Chat] Local mode — polling via storage events');
  }

  function _onStorage(e) {
    if (!_roomCode || e.key !== _storageKey()) return;
    const all = JSON.parse(e.newValue || '[]');
    all.forEach(m => _deliver(m));
  }

  /* ─── Send ─── */
  async function send(text, type = 'message') {
    if (!text?.trim() || !_roomCode) return;
    const myId   = sessionStorage.getItem('myPlayerId')   || 'unknown';
    const myName = sessionStorage.getItem('myPlayerName') || 'You';
    const players = typeof Players !== 'undefined' ? Players.getAll() : [];
    const me      = players.find(p => p.id === myId) || { color: '#6366f1' };
    const id      = `${Date.now()}_${Math.random().toString(36).substr(2,5)}`;

    const msg = {
      id,
      playerId:    myId,
      playerName:  myName,
      playerColor: me.color || '#6366f1',
      text:        text.trim(),
      type,
      timestamp:   Date.now()
    };

    if (!_isLocal && _chatRef) {
      try { await _chatRef.push(msg); return; } catch { /* fall through */ }
    }
    _appendLocal(msg);
    _deliver(msg);
  }

  function sendAnswer(text)       { return send(text, 'answer'); }
  function sendSystem(text) {
    const id  = `sys_${Date.now()}`;
    const msg = {
      id,
      playerId:    'system',
      playerName:  'Game',
      playerColor: '#a855f7',
      text,
      type:        'system',
      timestamp:   Date.now()
    };
    if (!_isLocal && _chatRef) {
      _chatRef.push(msg).catch(() => { _appendLocal(msg); _deliver(msg); });
    } else {
      _appendLocal(msg);
      _deliver(msg);
    }
  }

  /* ─── Local storage ─── */
  function _readLocal() {
    try { return JSON.parse(localStorage.getItem(_storageKey()) || '[]'); } catch { return []; }
  }
  function _appendLocal(msg) {
    const msgs = _readLocal();
    msgs.push(msg);
    localStorage.setItem(_storageKey(), JSON.stringify(msgs.slice(-100)));
  }

  /* ─── Deliver ─── */
  function _deliver(msg) {
    if (!msg || !msg.id) return;
    if (_seenIds.has(msg.id)) return;
    _seenIds.add(msg.id);
    _listeners.forEach(cb => cb(msg));
    if (!_chatOpen) { _unreadCount++; _updateBadge(); }
  }

  /* ─── Subscribe ─── */
  function onMessage(cb) { _listeners.push(cb); }

  /* ─── Unread badge ─── */
  function setChatOpen(open) {
    _chatOpen = open;
    if (open) { _unreadCount = 0; _updateBadge(); }
  }
  function getUnreadCount() { return _unreadCount; }
  function _updateBadge() {
    const b = document.getElementById('chat-unread-badge');
    if (b) { b.textContent = _unreadCount || ''; b.style.display = _unreadCount > 0 ? 'flex' : 'none'; }
  }

  /* ─── Teardown ─── */
  function _destroy() {
    if (_chatRef) { _chatRef.off(); _chatRef = null; }
    window.removeEventListener('storage', _onStorage);
  }
  function destroy() {
    _destroy();
    _roomCode = null;
    _listeners = [];
    _seenIds.clear();
  }

  return { init, send, sendAnswer, sendSystem, onMessage, setChatOpen, getUnreadCount, destroy };
})();