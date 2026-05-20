/**
 * ready-check.js — All players must click "I'm Ready" before host can start
 */

const ReadyCheck = (() => {
  let _roomCode = null;
  let _ref = null;
  let _onAllReadyCb = null;

  function init(roomCode) {
    _roomCode = roomCode;
    _detach();
    if (!FirebaseConfig.isReady()) return;
    const db = FirebaseConfig.getDatabase();
    _ref = db.ref(`rooms/${roomCode}/players`);
    _ref.on('value', snap => {
      const players = snap.val() || {};
      const all = Object.values(players).filter(p => p.role !== 'spectator');
      const allReady = all.length >= 2 && all.every(p => p.ready === true);
      _updateReadyUI(players);
      if (allReady && _onAllReadyCb) _onAllReadyCb();
    });
  }

  async function setReady(isReady) {
    const userId = Rooms.getCurrentUserId();
    if (!userId || !_roomCode) return;
    if (FirebaseConfig.isReady()) {
      const db = FirebaseConfig.getDatabase();
      await db.ref(`rooms/${_roomCode}/players/${userId}/ready`).set(isReady);
    }
    // Update local UI immediately
    const btn = document.getElementById('btn-ready-check');
    if (btn) {
      btn.textContent = isReady ? '✅ Ready!' : '⚪ I\'m Ready';
      btn.classList.toggle('btn-ready-active', isReady);
    }
  }

  async function reset() {
    if (!_roomCode || !FirebaseConfig.isReady()) return;
    const db = FirebaseConfig.getDatabase();
    const snap = await db.ref(`rooms/${_roomCode}/players`).once('value');
    const players = snap.val() || {};
    const updates = {};
    Object.keys(players).forEach(id => { updates[`${id}/ready`] = false; });
    await db.ref(`rooms/${_roomCode}/players`).update(updates);
  }

  function onAllReady(cb) {
    _onAllReadyCb = cb;
  }

  function _updateReadyUI(players) {
    const all = Object.values(players).filter(p => p.role !== 'spectator');
    const readyCount = all.filter(p => p.ready).length;
    const total = all.length;

    // Update waiting lobby player items
    all.forEach(p => {
      const el = document.querySelector(`.waiting-player-item[data-id="${p.id}"]`);
      if (!el) return;
      let badge = el.querySelector('.ready-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ready-badge';
        el.appendChild(badge);
      }
      badge.textContent = p.ready ? '✅' : '⏳';
      badge.classList.toggle('ready', !!p.ready);
    });

    // Update ready count display
    const countEl = document.getElementById('ready-count-display');
    if (countEl) countEl.textContent = `${readyCount}/${total} Ready`;

    // Enable start button only if all are ready AND user is host
    const startBtn = document.getElementById('btn-start-from-lobby');
    if (startBtn && Rooms.getIsHost()) {
      startBtn.disabled = readyCount < total || total < 2;
    }
  }

  function _detach() {
    if (_ref) { _ref.off(); _ref = null; }
  }

  function destroy() {
    _detach();
    _roomCode = null;
    _onAllReadyCb = null;
  }

  return { init, setReady, reset, onAllReady, destroy };
})();
