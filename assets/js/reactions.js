/**
 * reactions.js — Floating emoji reactions synced via Firebase
 * Players can send 😂 😱 🔥 💀 ❤️ — they float across the screen for everyone
 */

const Reactions = (() => {
  const EMOJIS = ['😂', '😱', '🔥', '💀', '❤️', '👏', '🤯', '😳'];
  let _roomCode = null;
  let _ref = null;

  function init(roomCode) {
    _roomCode = roomCode;
    _detach();
    if (!FirebaseConfig.isReady()) return;
    const db = FirebaseConfig.getDatabase();
    _ref = db.ref(`rooms/${roomCode}/reactions`);

    // Listen for new reactions and animate them
    _ref.limitToLast(20).on('child_added', snap => {
      const r = snap.val();
      if (r) _animateReaction(r.emoji, r.x || 0.5, r.y || 0.8);
    });

    // Auto-cleanup old reactions older than 5 seconds
    setInterval(() => {
      const cutoff = Date.now() - 5000;
      _ref.orderByChild('timestamp').endAt(cutoff).once('value', s => {
        s.forEach(child => child.ref.remove());
      });
    }, 10000);
  }

  async function send(emoji) {
    const x = 0.1 + Math.random() * 0.8;
    const y = 0.6 + Math.random() * 0.3;
    const r = { emoji, x, y, timestamp: Date.now(), playerId: _getMyId() };
    if (FirebaseConfig.isReady() && _ref) {
      await _ref.push(r);
    } else {
      _animateReaction(emoji, x, y);
    }
  }

  function _animateReaction(emoji, x, y) {
    const overlay = document.getElementById('emoji-overlay');
    if (!overlay) return;
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = `${x * 100}%`;
    el.style.top  = `${y * 100}%`;
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function renderEmojiBar(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = EMOJIS.map(e =>
      `<button class="emoji-btn" data-emoji="${e}" title="React ${e}">${e}</button>`
    ).join('');
    container.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => send(btn.dataset.emoji));
    });
  }

  function reset() { /* nothing needed */ }

  function _getMyId() {
    return typeof Rooms !== 'undefined' ? Rooms.getCurrentUserId() : 'local';
  }

  function _detach() {
    if (_ref) { _ref.off(); _ref = null; }
  }

  function destroy() { _detach(); _roomCode = null; }

  return { init, send, renderEmojiBar, reset, destroy };
})();
