/**
 * host-controls.js — Host-only room management: kick, mute, transfer host, pause, lock, expiry
 */

const HostControls = (() => {
  let _roomCode = null;
  const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  function init(roomCode) {
    _roomCode = roomCode;
    refreshExpiry();
    _startExpiryWatcher();
  }

  /* ---- Expiry ---- */
  function refreshExpiry() {
    if (!_roomCode || !FirebaseConfig.isReady()) return;
    const db = FirebaseConfig.getDatabase();
    db.ref(`rooms/${_roomCode}/expiresAt`).set(Date.now() + EXPIRY_MS);
  }

  function _startExpiryWatcher() {
    if (!FirebaseConfig.isReady()) return;
    const db = FirebaseConfig.getDatabase();
    db.ref(`rooms/${_roomCode}/expiresAt`).on('value', snap => {
      const expiresAt = snap.val();
      if (!expiresAt) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        _handleExpiry();
      } else {
        setTimeout(_handleExpiry, remaining);
      }
    });
  }

  function _handleExpiry() {
    Chat.sendSystem('⏰ Room expired due to inactivity. The room will close.');
    setTimeout(() => {
      Rooms.leaveRoom();
      location.reload();
    }, 3000);
  }

  /* ---- Kick ---- */
  async function kickPlayer(playerId) {
    if (!_isHost()) return;
    refreshExpiry();
    const db = FirebaseConfig.getDatabase();
    const snap = await db.ref(`rooms/${_roomCode}/players/${playerId}`).once('value');
    const player = snap.val();
    if (!player) return;

    await db.ref(`rooms/${_roomCode}/players/${playerId}`).remove();
    Chat.sendSystem(`🥾 ${player.name} was removed from the room.`);
    Rooms.showToast(`Kicked ${player.name}`, 'warning');
  }

  /* ---- Transfer Host ---- */
  async function transferHost(newHostId) {
    if (!_isHost()) return;
    refreshExpiry();
    const db = FirebaseConfig.getDatabase();
    const myId = Rooms.getCurrentUserId();

    const snap = await db.ref(`rooms/${_roomCode}/players/${newHostId}`).once('value');
    const newHost = snap.val();
    if (!newHost) return;

    await db.ref(`rooms/${_roomCode}`).update({
      hostId: newHostId,
      [`players/${myId}/isHost`]: false,
      [`players/${newHostId}/isHost`]: true
    });
    Chat.sendSystem(`👑 ${newHost.name} is now the host.`);
    Rooms.showToast(`Host transferred to ${newHost.name}`, 'info');
  }

  /* ---- Mute ---- */
  async function mutePlayer(playerId, muted) {
    if (!_isHost()) return;
    refreshExpiry();
    const db = FirebaseConfig.getDatabase();
    await db.ref(`rooms/${_roomCode}/players/${playerId}/muted`).set(muted);
    const snap = await db.ref(`rooms/${_roomCode}/players/${playerId}/name`).once('value');
    const name = snap.val() || 'Player';
    Chat.sendSystem(muted ? `🔇 ${name} has been muted.` : `🔊 ${name} has been unmuted.`);
  }

  /* ---- Pause / Resume ---- */
  async function pauseGame(paused) {
    if (!_isHost()) return;
    refreshExpiry();
    const db = FirebaseConfig.getDatabase();
    await db.ref(`rooms/${_roomCode}/paused`).set(paused);
    Chat.sendSystem(paused ? '⏸️ Game paused by host.' : '▶️ Game resumed by host.');
    Rooms.showToast(paused ? 'Game paused' : 'Game resumed', 'info');
  }

  /* ---- Lock Room ---- */
  async function lockRoom(locked) {
    if (!_isHost()) return;
    refreshExpiry();
    const db = FirebaseConfig.getDatabase();
    await db.ref(`rooms/${_roomCode}/locked`).set(locked);
    Chat.sendSystem(locked ? '🔒 Room locked. No new players can join.' : '🔓 Room unlocked.');
    Rooms.showToast(locked ? 'Room locked' : 'Room unlocked', 'info');
  }

  /* ---- Host Pack Selection ---- */
  async function updateActivePacks(packs) {
    if (!_isHost()) return;
    refreshExpiry();
    const db = FirebaseConfig.getDatabase();
    await db.ref(`rooms/${_roomCode}/settings/packs`).set(packs);
    // Sync locally
    Game.updateSettings({ packs });
    Chat.sendSystem(`📦 Category packs updated: ${packs.join(', ')}`);
  }

  /* ---- Render Host Controls Panel ---- */
  function renderHostPanel(players) {
    const container = document.getElementById('host-controls-panel');
    if (!container || !_isHost()) return;

    const activePlayers = Object.values(players).filter(p => p.role !== 'spectator' && p.id !== Rooms.getCurrentUserId());
    container.innerHTML = activePlayers.length === 0 ? '<p class="hc-empty">No other players yet.</p>' : '';

    activePlayers.forEach(p => {
      const row = document.createElement('div');
      row.className = 'hc-player-row';
      row.innerHTML = `
        <div class="hc-avatar" style="background:${p.color}">${p.initials || p.name[0].toUpperCase()}</div>
        <span class="hc-name">${p.name}</span>
        <div class="hc-actions">
          <button class="hc-btn hc-kick" title="Kick" data-id="${p.id}">🥾</button>
          <button class="hc-btn hc-mute" title="${p.muted ? 'Unmute' : 'Mute'}" data-id="${p.id}" data-muted="${p.muted || false}">${p.muted ? '🔊' : '🔇'}</button>
          <button class="hc-btn hc-transfer" title="Transfer host" data-id="${p.id}">👑</button>
        </div>
      `;
      row.querySelector('.hc-kick').addEventListener('click', () => kickPlayer(p.id));
      row.querySelector('.hc-mute').addEventListener('click', (e) => {
        const muted = e.currentTarget.dataset.muted === 'true';
        mutePlayer(p.id, !muted);
      });
      row.querySelector('.hc-transfer').addEventListener('click', () => {
        if (confirm(`Transfer host to ${p.name}?`)) transferHost(p.id);
      });
      container.appendChild(row);
    });
  }

  function _isHost() {
    return Rooms.getIsHost() && !!_roomCode;
  }

  function destroy() {
    _roomCode = null;
  }

  return {
    init, refreshExpiry,
    kickPlayer, transferHost, mutePlayer, pauseGame, lockRoom, updateActivePacks,
    renderHostPanel, destroy
  };
})();
