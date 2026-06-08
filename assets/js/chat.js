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
    }, err => {
      // Most commonly PERMISSION_DENIED — means the Realtime Database rules were
      // not published (or test mode expired). Chat reads are being blocked.
      console.error('[Chat] ❌ Cannot READ messages from Firebase — likely your ' +
        'database rules are not published. Error:', err && err.message ? err.message : err);
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
      try {
        await _chatRef.push(msg);
        return;
      } catch (err) {
        // In Firebase mode, do NOT silently fall back to a local-only render — that
        // would make the sender think it worked while no one else receives it.
        // Surface the real cause (almost always PERMISSION_DENIED = rules not published).
        console.error('[Chat] ❌ Cannot SEND message to Firebase — likely your ' +
          'database rules are not published. Error:', err && err.message ? err.message : err);
        return;
      }
    }
    _appendLocal(msg);
    _deliver(msg);
  }

  function sendAnswer(text)       { return send(text, 'answer'); }

  /* ─── Media (photo / video / voice) ──────────────────────────────────────
     Media travels INSIDE the message as a compressed base64 data URL, so it
     syncs cross-device on the free Firebase plan (no Storage / no card needed).
     A size ceiling keeps the Realtime Database happy: photos compress to fit,
     short voice clips fit easily, and oversized video is rejected with a note.
  ──────────────────────────────────────────────────────────────────────── */
  const MAX_MEDIA_B64 = 900 * 1024; // ~900 KB base64 per message

  function _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsDataURL(blob);
    });
  }

  // Downscale + re-encode an image to keep it small enough to embed.
  function _compressImage(file, maxDim = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width  = Math.round(width  * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  /**
   * Send a photo, video, or voice clip. Returns { success, error? }.
   * @param {Blob|File} fileOrBlob
   * @param {{ type?: 'audio', official?: boolean }} [opts]
   */
  async function sendMedia(fileOrBlob, opts = {}) {
    if (!fileOrBlob || !_roomCode) return { success: false, error: 'Nothing to send.' };

    const mime    = fileOrBlob.type || (opts.type === 'audio' ? 'audio/webm' : '');
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    const isAudio = opts.type === 'audio' || mime.startsWith('audio/');
    if (!isImage && !isVideo && !isAudio) {
      return { success: false, error: 'Only photos, videos and voice clips can be sent.' };
    }

    // Compress images; convert everything to a base64 data URL.
    let dataUrl;
    try {
      let blob = fileOrBlob;
      if (isImage) blob = await _compressImage(fileOrBlob);
      dataUrl = await _blobToDataUrl(blob);

      // If an image is still too big, compress harder before giving up.
      if (isImage && dataUrl.length > MAX_MEDIA_B64) {
        blob = await _compressImage(fileOrBlob, 720, 0.5);
        dataUrl = await _blobToDataUrl(blob);
      }
    } catch (e) {
      return { success: false, error: 'Could not process the file.' };
    }

    if (dataUrl.length > MAX_MEDIA_B64) {
      return {
        success: false,
        error: isVideo
          ? 'Video is too large to share on the free plan. Try a photo or a short voice note.'
          : 'That file is too large to share. Try something smaller.'
      };
    }

    const type    = isImage ? 'image' : isVideo ? 'video' : 'audio';
    const myId    = sessionStorage.getItem('myPlayerId')   || 'unknown';
    const myName  = sessionStorage.getItem('myPlayerName') || 'You';
    const players = typeof Players !== 'undefined' ? Players.getAll() : [];
    const me      = players.find(p => p.id === myId) || { color: '#6366f1' };

    const msg = {
      id:          `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      playerId:    myId,
      playerName:  myName,
      playerColor: me.color || '#6366f1',
      type,
      dataUrl,
      mime:        mime || (type === 'audio' ? 'audio/webm' : ''),
      official:    !!opts.official,
      text:        '',
      timestamp:   Date.now()
    };

    if (!_isLocal && _chatRef) {
      try { await _chatRef.push(msg); return { success: true }; }
      catch (err) {
        console.error('[Chat] ❌ Could not send media to Firebase:', err && err.message ? err.message : err);
        return { success: false, error: 'Could not send — check your connection / database rules.' };
      }
    }
    _appendLocal(msg);
    _deliver(msg);
    return { success: true };
  }

  /** Back-compat no-op (media now travels inline as a data URL). */
  function getMedia() { return Promise.resolve(null); }

  /* ─── Voice recording ─── */
  let _recorder = null;
  let _recChunks = [];
  let _recStream = null;

  function isVoiceSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async function startVoice() {
    if (!isVoiceSupported()) throw new Error('unsupported');
    _recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _recChunks = [];
    _recorder  = new MediaRecorder(_recStream);
    _recorder.ondataavailable = e => { if (e.data && e.data.size) _recChunks.push(e.data); };
    _recorder.start();
  }

  function stopVoice() {
    return new Promise(resolve => {
      if (!_recorder) { resolve(null); return; }
      _recorder.onstop = () => {
        const blob = new Blob(_recChunks, { type: (_recorder && _recorder.mimeType) || 'audio/webm' });
        if (_recStream) _recStream.getTracks().forEach(t => t.stop());
        _recorder = null; _recStream = null; _recChunks = [];
        resolve(blob);
      };
      try { _recorder.stop(); } catch { resolve(null); }
    });
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

  return { init, send, sendAnswer, sendMedia, getMedia, isVoiceSupported, startVoice, stopVoice, sendSystem, onMessage, setChatOpen, getUnreadCount, destroy };
})();