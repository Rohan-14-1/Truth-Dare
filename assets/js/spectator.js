/**
 * spectator.js — Join a room as a read-only viewer (no turns, no votes)
 * Handles both Firebase (live) and localStorage (local fallback) modes.
 */

const Spectator = (() => {
  let _roomCode   = null;
  let _spectatorId = null;
  let _isLocalMode = false;

  /**
   * Join room as spectator
   */
  async function join(roomCode, name) {
    const code        = roomCode.trim().toUpperCase();
    const displayName = name.trim();

    // ── Local fallback mode ─────────────────────────────────────
    // If Rooms is already in local fallback, use localStorage directly
    if (typeof Rooms !== 'undefined' && Rooms.isLocalFallback()) {
      const storageKey = `truth-dare-room-${code}`;
      const existing   = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!existing) return { success: false, error: 'Room not found.' };

      _spectatorId  = `spec_local_${Date.now()}`;
      _roomCode     = code;
      _isLocalMode  = true;
      return { success: true };
    }

    // ── Firebase mode ───────────────────────────────────────────
    if (typeof firebase === 'undefined') {
      // No Firebase SDK — try localStorage as last resort
      const storageKey = `truth-dare-room-${code}`;
      const existing   = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (existing) {
        _spectatorId = `spec_local_${Date.now()}`;
        _roomCode    = code;
        _isLocalMode = true;
        return { success: true };
      }
      return { success: false, error: 'Firebase unavailable and room not found locally.' };
    }

    try {
      const db = firebase.database();

      const roomSnap = await Promise.race([
        db.ref(`rooms/${code}`).once('value'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
      ]);

      if (!roomSnap.exists()) {
        // Also try localStorage (room might be local only)
        const storageKey = `truth-dare-room-${code}`;
        const existing   = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (existing) {
          _spectatorId = `spec_local_${Date.now()}`;
          _roomCode    = code;
          _isLocalMode = true;
          return { success: true };
        }
        return { success: false, error: 'Room not found. Check the room code and try again.' };
      }

      const roomData = roomSnap.val();
      if (roomData && roomData.locked) {
        return { success: false, error: 'Room is locked. New viewers cannot join.' };
      }

      _spectatorId  = `spec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      _roomCode     = code;
      _isLocalMode  = false;

      const spectatorData = {
        id:       _spectatorId,
        name:     displayName,
        role:     'spectator',
        joinedAt: Date.now(),
        color:    '#94a3b8',
        initials: displayName.substring(0, 2).toUpperCase()
      };

      await Promise.race([
        db.ref(`rooms/${code}/players/${_spectatorId}`).set(spectatorData),
        new Promise((_, rej) => setTimeout(() => rej(new Error('write timeout')), 5000))
      ]);

      db.ref(`rooms/${code}/players/${_spectatorId}`).onDisconnect().remove();
      return { success: true };

    } catch (err) {
      console.warn('Spectator Firebase join failed:', err.message);
      // Fall back to local mode if room exists in localStorage
      const storageKey = `truth-dare-room-${code}`;
      const existing   = JSON.parse(localStorage.getItem(storageKey) || 'null');
      _spectatorId  = `spec_local_${Date.now()}`;
      _roomCode     = code;
      _isLocalMode  = !!existing;
      return { success: true };
    }
  }

  /**
   * Get the players for the spectator's room from the appropriate source.
   * Returns an array of player objects (excludes other spectators for the count).
   */
  async function fetchPlayers() {
    if (!_roomCode) return [];

    if (_isLocalMode) {
      try {
        const storageKey = `truth-dare-room-${_roomCode}`;
        const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
        return Array.isArray(data.players) ? data.players : Object.values(data.players || {});
      } catch { return []; }
    }

    try {
      const db   = firebase.database();
      const snap = await db.ref(`rooms/${_roomCode}/players`).once('value');
      return Object.values(snap.val() || {});
    } catch { return []; }
  }

  function getList(players) {
    return Object.values(players || {}).filter(p => p.role === 'spectator');
  }

  function isSpectator()  { return !!_spectatorId; }
  function isLocalMode()  { return _isLocalMode; }
  function getId()        { return _spectatorId; }
  function getRoomCode()  { return _roomCode; }

  function destroy() {
    if (!_isLocalMode && _spectatorId && _roomCode && typeof firebase !== 'undefined') {
      try { firebase.database().ref(`rooms/${_roomCode}/players/${_spectatorId}`).remove(); }
      catch { /* ignore */ }
    }
    _roomCode = null; _spectatorId = null; _isLocalMode = false;
  }

  return { join, fetchPlayers, getList, isSpectator, isLocalMode, getId, getRoomCode, destroy };
})();
