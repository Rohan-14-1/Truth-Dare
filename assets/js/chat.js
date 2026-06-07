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

  /* ─── Media (photo / video) ───────────────────────────────────────────
     Bytes are stored in IndexedDB (large quota, shared across same-browser
     tabs); only a lightweight reference travels through the chat message, so
     localStorage never overflows. NOTE: the blob lives in THIS browser's
     IndexedDB — true cross-DEVICE media needs Firebase Storage (see sendMedia).
  ──────────────────────────────────────────────────────────────────────── */
  const _MEDIA_DB = 'truth-dare-media';
  const _MEDIA_ST = 'media';
  let   _dbPromise = null;
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB cap for video

  function _openMediaDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(_MEDIA_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(_MEDIA_ST)) db.createObjectStore(_MEDIA_ST);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _dbPromise;
  }

  function _mediaPut(key, blob) {
    return _openMediaDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(_MEDIA_ST, 'readwrite');
      tx.objectStore(_MEDIA_ST).put(blob, key);
      tx.oncomplete = () => resolve(key);
      tx.onerror    = () => reject(tx.error);
    }));
  }

  function _mediaGet(key) {
    return _openMediaDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(_MEDIA_ST, 'readonly');
      const r  = tx.objectStore(_MEDIA_ST).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror   = () => reject(r.error);
    }));
  }

  // Downscale + re-encode an image to keep it small and fast to render.
  function _compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = Math.min(MAX / width, MAX / height);
          width  = Math.round(width  * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  /**
   * Send a photo or video. Returns { success, error? }.
   * @param {File} file
   */
  async function sendMedia(file) {
    if (!file || !_roomCode) return { success: false, error: 'Nothing to send.' };
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) return { success: false, error: 'Only photos and videos can be sent.' };

    let blob = file;
    let mime = file.type;
    try {
      if (isImage) {
        blob = await _compressImage(file);
        mime = blob.type || 'image/jpeg';
      } else if (file.size > MAX_VIDEO_BYTES) {
        return { success: false, error: 'Video is too large (max 25 MB).' };
      }
    } catch (e) {
      blob = file; // compression failed — store the original
    }

    const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await _mediaPut(mediaId, blob); // commit BEFORE announcing, so other tabs can read it
    } catch (e) {
      return { success: false, error: 'Could not store the file on this device.' };
    }

    const myId    = sessionStorage.getItem('myPlayerId')   || 'unknown';
    const myName  = sessionStorage.getItem('myPlayerName') || 'You';
    const players = typeof Players !== 'undefined' ? Players.getAll() : [];
    const me      = players.find(p => p.id === myId) || { color: '#6366f1' };

    const msg = {
      id:          `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      playerId:    myId,
      playerName:  myName,
      playerColor: me.color || '#6366f1',
      type:        isImage ? 'image' : 'video',
      mediaId,
      mime,
      fileName:    file.name || '',
      text:        '',
      timestamp:   Date.now()
    };

    if (!_isLocal && _chatRef) {
      // Online (real Firebase) note: the blob is only in THIS device's IndexedDB,
      // so remote peers would see a placeholder. For true cross-device media,
      // upload `blob` to Firebase Storage here and store the download URL on msg.
      try { await _chatRef.push(msg); return { success: true }; } catch { /* fall through */ }
    }
    _appendLocal(msg);
    _deliver(msg);
    return { success: true };
  }

  /** Retrieve a stored media blob by id. @returns {Promise<Blob|null>} */
  function getMedia(mediaId) {
    return _mediaGet(mediaId).catch(() => null);
  }

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

  return { init, send, sendAnswer, sendMedia, getMedia, sendSystem, onMessage, setChatOpen, getUnreadCount, destroy };
})();