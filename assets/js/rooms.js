/**
 * rooms.js — Multiplayer room management with Firebase Realtime Database
 * Handles room creation, joining, player sync, disconnect detection, and real-time collaboration
 */

const Rooms = (() => {
  // State
  let currentRoomCode = null;
  let isHost = false;
  let currentUserId = null;
  let roomStateListeners = [];
  let roomRef = null;
  let _localPlayers = []; // Local fallback player storage
  let _useLocalFallback = false; // True when Firebase is unavailable/failing
  let _previousPlayerIds = new Set();
  let _disconnectToastTimeout = null;

  // Curated player colors for unique assignment
  const PLAYER_COLORS = [
    '#6366f1', // Indigo
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#22c55e', // Green
    '#f97316', // Orange
    '#a855f7'  // Purple
  ];

  // Room structure in Firebase:
  // /rooms/{roomCode}
  //   ├── hostId: string
  //   ├── createdAt: timestamp
  //   ├── players: { playerId: { name, color, initials, score, joinedAt, isHost, colorIndex } }
  //   ├── gameStarted: boolean
  //   ├── currentPlayerIndex: number
  //   ├── currentTurn: { playerIndex, playerId, timestamp }
  //   ├── status: 'waiting' | 'playing' | 'finished'

  /**
   * Generate a random room code in TRD-XXX format
   */
  function _generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 3; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TRD-${suffix}`;
  }

  /**
   * Generate a unique user ID
   */
  function _generateUserId() {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new room and become the host
   * @param {string} playerName - Host player name
   * @returns {Promise<{success: boolean, roomCode?: string, error?: string}>}
   */
  async function createRoom(playerName) {
    if (!FirebaseConfig.isReady()) {
      return _createRoomLocal(playerName);
    }

    const db = FirebaseConfig.getDatabase();
    const roomCode = _generateCode();
    currentUserId = _generateUserId();

    const hostPlayer = {
      id: currentUserId,
      name: playerName,
      color: PLAYER_COLORS[0],
      colorIndex: 0,
      initials: playerName.trim().split(/\s+/).length >= 2
        ? (playerName.trim().split(/\s+/)[0][0] + playerName.trim().split(/\s+/)[1][0]).toUpperCase()
        : playerName.substring(0, 2).toUpperCase(),
      score: 0,
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      isHost: true
    };

    try {
      // Race Firebase write against a timeout to avoid hanging with invalid credentials
      const writePromise = db.ref(`rooms/${roomCode}`).set({
        hostId: currentUserId,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {
          [currentUserId]: hostPlayer
        },
        gameStarted: false,
        currentPlayerIndex: -1,
        currentTurn: null,
        status: 'waiting'
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase timeout')), 5000)
      );

      await Promise.race([writePromise, timeoutPromise]);

      currentRoomCode = roomCode;
      isHost = true;
      _setupRoomListener();

      // Persist session for rejoin-after-disconnect
      localStorage.setItem('truth-dare-session', JSON.stringify({
        roomCode, userId: currentUserId, host: true
      }));
      // Save player identity for cross-tab access by TurnFlow
      sessionStorage.setItem('myPlayerId',   currentUserId);
      sessionStorage.setItem('myPlayerName', playerName.trim());

      return { success: true, roomCode };
    } catch (error) {
      console.warn('Firebase room creation failed, falling back to local:', error.message);
      _useLocalFallback = true;
      return _createRoomLocal(playerName);
    }
  }

  /**
   * Fallback local room creation
   */
  function _createRoomLocal(playerName) {
    currentRoomCode = _generateCode();
    isHost = true;
    currentUserId = `player_local_${Date.now()}`;

    // Store host in local players
    _localPlayers = [{
      id: currentUserId,
      name: playerName.trim(),
      color: PLAYER_COLORS[0],
      initials: playerName.trim().split(/\s+/).length >= 2
        ? (playerName.trim().split(/\s+/)[0][0] + playerName.trim().split(/\s+/)[1][0]).toUpperCase()
        : playerName.trim().substring(0, 2).toUpperCase(),
      score: 0,
      joinedAt: Date.now(),
      isHost: true
    }];

    const url = new URL(window.location);
    url.searchParams.set('room', currentRoomCode);
    window.history.replaceState({}, '', url);

    // Save to room-specific localStorage key
    _saveLocalRoomData();
    // Save player identity
    sessionStorage.setItem('myPlayerId',   currentUserId);
    sessionStorage.setItem('myPlayerName', playerName.trim());

    // Start listening for cross-tab storage changes
    _setupLocalStorageSync();

    return { success: true, roomCode: currentRoomCode };
  }

  /**
   * Join an existing room
   * @param {string} roomCode - Room code to join
   * @param {string} playerName - Joining player name
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function joinRoom(roomCode, playerName) {
    const trimmed = roomCode.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');

    if (FirebaseConfig.isReady()) {
      return _joinRoomFirebase(trimmed, playerName);
    } else {
      return _joinRoomLocal(trimmed, playerName);
    }
  }

  /**
   * Join room via Firebase (with timeout fallback)
   */
  async function _joinRoomFirebase(roomCode, playerName) {
    const db = FirebaseConfig.getDatabase();
    currentUserId = _generateUserId();

    try {
      // Race the Firebase read against a timeout to avoid hanging with invalid credentials
      const readPromise = db.ref(`rooms/${roomCode}`).once('value');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase timeout')), 5000)
      );

      const snapshot = await Promise.race([readPromise, timeoutPromise]);

      if (!snapshot.exists()) {
        return { success: false, error: 'Room not found. Check the code and try again.' };
      }

      const roomData = snapshot.val();
      if (roomData.locked) {
        return { success: false, error: 'Room is locked. No new players can join.' };
      }
      if (roomData.gameStarted) {
        return { success: false, error: 'Game has already started in this room.' };
      }

      const existingPlayers = Object.fromEntries(
        Object.entries(roomData.players || {}).filter(([,p]) => p.role !== 'spectator')
      );
      const playerCount = Object.keys(existingPlayers).length;

      if (playerCount >= 10) {
        return { success: false, error: 'Room is full (max 10 players).' };
      }

      // Check for duplicate names
      const names = Object.values(existingPlayers).map(p => p.name.toLowerCase());
      if (names.includes(playerName.trim().toLowerCase())) {
        return { success: false, error: 'A player with this name already exists in the room.' };
      }

      // Assign a unique color based on player index
      const colorIndex = playerCount % PLAYER_COLORS.length;

      const newPlayer = {
        id: currentUserId,
        name: playerName.trim(),
        color: PLAYER_COLORS[colorIndex],
        colorIndex: colorIndex,
        initials: playerName.trim().split(/\s+/).length >= 2
          ? (playerName.trim().split(/\s+/)[0][0] + playerName.trim().split(/\s+/)[1][0]).toUpperCase()
          : playerName.trim().substring(0, 2).toUpperCase(),
        score: 0,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        isHost: false
      };

      // Also timeout the write operation
      const writePromise = db.ref(`rooms/${roomCode}/players/${currentUserId}`).set(newPlayer);
      const writeTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase write timeout')), 5000)
      );
      await Promise.race([writePromise, writeTimeout]);

      currentRoomCode = roomCode;
      isHost = false;
      _setupRoomListener();

      // Persist session for rejoin-after-disconnect
      localStorage.setItem('truth-dare-session', JSON.stringify({
        roomCode, userId: currentUserId, name: playerName.trim()
      }));
      // Save player identity for cross-tab access by TurnFlow
      sessionStorage.setItem('myPlayerId',   currentUserId);
      sessionStorage.setItem('myPlayerName', playerName.trim());

      return { success: true };
    } catch (error) {
      console.warn('Firebase join failed, falling back to local:', error.message);
      _useLocalFallback = true;
      return _joinRoomLocal(roomCode, playerName);
    }
  }

  /**
   * Fallback local room joining
   */
  function _joinRoomLocal(roomCode, playerName) {
    // Validate code format (6 chars or TRD-XXX)
    const stripped = roomCode.replace(/-/g, '');
    if (stripped.length < 3 || stripped.length > 6) {
      return { success: false, error: 'Invalid room code format' };
    }

    currentRoomCode = roomCode;
    isHost = false;
    currentUserId = `player_local_${Date.now()}`;
    _useLocalFallback = true;

    // Load existing room data from the room-specific key
    const storageKey = `truth-dare-room-${roomCode}`;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (existing.players && Array.isArray(existing.players)) {
        _localPlayers = existing.players;
      }
    } catch (e) { /* ignore parse errors */ }

    // Check for duplicate names
    const existingNames = _localPlayers.map(p => p.name.toLowerCase());
    if (existingNames.includes(playerName.trim().toLowerCase())) {
      return { success: false, error: 'A player with this name already exists in the room.' };
    }

    // Add this player to local list
    const colorIndex = _localPlayers.length % PLAYER_COLORS.length;
    _localPlayers.push({
      id: currentUserId,
      name: playerName.trim(),
      color: PLAYER_COLORS[colorIndex],
      initials: playerName.trim().split(/\s+/).length >= 2
        ? (playerName.trim().split(/\s+/)[0][0] + playerName.trim().split(/\s+/)[1][0]).toUpperCase()
        : playerName.trim().substring(0, 2).toUpperCase(),
      score: 0,
      joinedAt: Date.now(),
      isHost: false
    });

    const url = new URL(window.location);
    url.searchParams.set('room', currentRoomCode);
    window.history.replaceState({}, '', url);

    // Save to room-specific key (this triggers storage event in other tabs!)
    _saveLocalRoomData();
    // Save player identity
    sessionStorage.setItem('myPlayerId',   currentUserId);
    sessionStorage.setItem('myPlayerName', playerName.trim());

    // Start listening for cross-tab storage changes
    _setupLocalStorageSync();

    return { success: true };
  }
  /**
   * Save room data to room-specific localStorage key
   */
  function _saveLocalRoomData() {
    if (!currentRoomCode) return;
    const key = `truth-dare-room-${currentRoomCode}`;
    const data = {
      code: currentRoomCode,
      players: _localPlayers,
      gameStarted: false,
      updatedAt: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(data));
    // Also save a general reference so we know which room we're in
    localStorage.setItem('truth-dare-room', JSON.stringify({
      code: currentRoomCode,
      isHost: isHost
    }));
  }

  /**
   * Cross-tab localStorage sync — detects when another tab updates the room data
   * This is the local-mode equivalent of Firebase's real-time listeners
   */
  function _setupLocalStorageSync() {
    if (!currentRoomCode) return;
    const key = `truth-dare-room-${currentRoomCode}`;

    window.addEventListener('storage', (e) => {
      // Only react to changes for our room key
      if (e.key !== key || !currentRoomCode) return;

      try {
        const newData = JSON.parse(e.newValue);
        if (!newData || !newData.players) return;

        const oldCount = _localPlayers.length;
        _localPlayers = newData.players;
        const newCount = _localPlayers.length;

        // Show toast for new player joins
        if (newCount > oldCount) {
          const newPlayer = _localPlayers[_localPlayers.length - 1];
          if (newPlayer && newPlayer.id !== currentUserId) {
            _showToast(`🎉 ${newPlayer.name} joined the room!`, 'success');
          }
        }

        // If game was started by host, notify non-host
        if (newData.gameStarted && !isHost) {
          roomStateListeners.forEach(cb => cb({
            players: _buildPlayersObject(),
            gameStarted: true,
            currentPlayerIndex: newData.currentPlayerIndex || 0
          }));
          return;
        }

        // Notify all listeners (this updates the waiting lobby UI)
        roomStateListeners.forEach(cb => cb({
          players: _buildPlayersObject(),
          gameStarted: newData.gameStarted || false,
          currentPlayerIndex: newData.currentPlayerIndex || -1
        }));
      } catch (err) {
        console.warn('Error processing storage event:', err);
      }
    });
  }

  /**
   * Build a players object keyed by id (mimics Firebase structure)
   */
  function _buildPlayersObject() {
    const obj = {};
    _localPlayers.forEach(p => { obj[p.id] = p; });
    return obj;
  }

  /**
   * Setup listener for room changes
   */
  function _setupRoomListener() {
    if (!currentRoomCode || !FirebaseConfig.isReady()) return;

    const db = FirebaseConfig.getDatabase();
    roomRef = db.ref(`rooms/${currentRoomCode}`);

    // Listen for full room state changes
    roomRef.on('value', (snapshot) => {
      const roomData = snapshot.val();
      if (!roomData) return;

      // Check for player disconnects
      _checkForDisconnects(roomData.players || {});

      // Notify listeners of room state changes
      roomStateListeners.forEach(callback => callback(roomData));
    });

    // Presence: mark online now, set disconnected on drop (don't remove so rejoin works)
    const playerRef = db.ref(`rooms/${currentRoomCode}/players/${currentUserId}`);
    playerRef.child('status').set('online');
    playerRef.child('status').onDisconnect().set('disconnected');
    playerRef.child('lastSeen').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
  }

  /**
   * Check for player disconnects and show toast notification
   */
  function _checkForDisconnects(players) {
    const currentIds = new Set(Object.keys(players));

    // Only run after we have a baseline
    if (_previousPlayerIds.size > 0) {
      for (const oldId of _previousPlayerIds) {
        if (!currentIds.has(oldId) && oldId !== currentUserId) {
          // Find the name in our local cache (from previous snapshot)
          _showDisconnectToast(oldId);
        }
      }

      // Check for new joins
      for (const newId of currentIds) {
        if (!_previousPlayerIds.has(newId) && newId !== currentUserId) {
          const p = players[newId];
          if (p) _showJoinToast(p.name);
        }
      }
    }

    // Store player names for disconnect lookup
    _previousPlayerNames = {};
    for (const [id, p] of Object.entries(players)) {
      _previousPlayerNames[id] = p.name;
    }
    _previousPlayerIds = currentIds;
  }

  let _previousPlayerNames = {};

  /**
   * Show a toast when a player disconnects
   */
  function _showDisconnectToast(playerId) {
    const name = _previousPlayerNames[playerId] || 'A player';
    _showToast(`😔 ${name} has disconnected`, 'warning');
  }

  /**
   * Show a toast when a player joins
   */
  function _showJoinToast(name) {
    _showToast(`🎉 ${name} joined the room!`, 'success');
  }

  /**
   * Create and show a toast notification
   */
  function _showToast(message, type = 'info') {
    // Remove existing toasts
    const existing = document.querySelectorAll('.mp-toast');
    existing.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `mp-toast mp-toast-${type} animate-fade-in-up`;
    toast.innerHTML = `<span class="mp-toast-msg">${message}</span>`;
    document.body.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => {
      toast.classList.add('mp-toast-exit');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  /**
   * Get all players in current room
   * @returns {Promise<array>}
   */
  async function getRoomPlayers() {
    if (!currentRoomCode) return [];

    if (!FirebaseConfig.isReady() || _useLocalFallback) {
      // In local mode, always refresh from localStorage to catch cross-tab updates
      const key = `truth-dare-room-${currentRoomCode}`;
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (data.players && Array.isArray(data.players)) {
          _localPlayers = data.players;
        }
      } catch (e) { /* ignore */ }
      return [..._localPlayers];
    }

    const db = FirebaseConfig.getDatabase();
    try {
      const snapshot = await db.ref(`rooms/${currentRoomCode}/players`).once('value');
      if (!snapshot.exists()) return _localPlayers.length > 0 ? [..._localPlayers] : [];

      const playersObj = snapshot.val();
      return Object.values(playersObj).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    } catch (error) {
      console.error('Error getting room players:', error);
      return _localPlayers.length > 0 ? [..._localPlayers] : [];
    }
  }

  /**
   * Get room info (full snapshot)
   * @returns {Promise<object|null>}
   */
  async function getRoomInfo() {
    if (!currentRoomCode || _useLocalFallback) return null;
    if (!FirebaseConfig.isReady()) return null;

    const db = FirebaseConfig.getDatabase();
    try {
      const snapshot = await db.ref(`rooms/${currentRoomCode}`).once('value');
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      console.error('Error getting room info:', error);
      return null;
    }
  }

  /**
   * Start the game in this room (host only)
   */
  async function startGameInRoom() {
    if (!isHost || !currentRoomCode) return false;

    if (!FirebaseConfig.isReady() || _useLocalFallback) {
      // Broadcast game start via localStorage for cross-tab sync
      if (currentRoomCode) {
        const key = `truth-dare-room-${currentRoomCode}`;
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          data.gameStarted = true;
          data.currentPlayerIndex = 0;
          localStorage.setItem(key, JSON.stringify(data));
        } catch (e) { /* ignore */ }
      }
      return true;
    }

    const db = FirebaseConfig.getDatabase();
    try {
      await db.ref(`rooms/${currentRoomCode}`).update({
        gameStarted: true,
        gameStartedAt: firebase.database.ServerValue.TIMESTAMP,
        status: 'playing'
      });
      return true;
    } catch (error) {
      console.error('Error starting game:', error);
      return true;
    }
  }

  /**
   * Update current turn for all players
   */
  async function updateCurrentTurn(playerIndex, playerId) {
    if (!currentRoomCode) return false;

    if (!FirebaseConfig.isReady() || _useLocalFallback) {
      return true;
    }

    const db = FirebaseConfig.getDatabase();
    try {
      await db.ref(`rooms/${currentRoomCode}`).update({
        currentPlayerIndex: playerIndex,
        currentTurn: {
          playerId,
          playerIndex,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        }
      });
      return true;
    } catch (error) {
      console.error('Error updating turn:', error);
      return true;
    }
  }

  /**
   * Update player score
   */
  async function updatePlayerScore(playerId, newScore) {
    if (!currentRoomCode) return false;

    if (!FirebaseConfig.isReady() || _useLocalFallback) {
      return true;
    }

    const db = FirebaseConfig.getDatabase();
    try {
      await db.ref(`rooms/${currentRoomCode}/players/${playerId}/score`).set(newScore);
      return true;
    } catch (error) {
      console.error('Error updating score:', error);
      return true;
    }
  }

  /**
   * Listen to room state changes
   */
  function onRoomStateChange(callback) {
    roomStateListeners.push(callback);
  }

  /**
   * Remove a room state change listener
   */
  function offRoomStateChange(callback) {
    roomStateListeners = roomStateListeners.filter(cb => cb !== callback);
  }

  /**
   * Get current room code
   */
  function getRoomCode() {
    return currentRoomCode;
  }

  /**
   * Get formatted display code (with dash)
   */
  function getDisplayCode() {
    return currentRoomCode || '';
  }

  /**
   * Check if user is host
   */
  function getIsHost() {
    return isHost;
  }

  /**
   * Check if currently in a room
   */
  function isInRoom() {
    return currentRoomCode !== null;
  }

  /**
   * Get share URL
   */
  function getShareURL() {
    if (!currentRoomCode) return window.location.href;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('room', currentRoomCode);
    return url.toString();
  }

  /**
   * Copy code to clipboard
   */
  async function copyCodeToClipboard() {
    if (!currentRoomCode) return false;
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = currentRoomCode;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  }

  /**
   * Leave current room
   */
  async function leaveRoom() {
    // Clear session — this is a deliberate leave, not a disconnect
    localStorage.removeItem('truth-dare-session');

    // Remove player from local storage data first (for cross-tab sync)
    if (currentRoomCode && currentUserId && _useLocalFallback) {
      const key = `truth-dare-room-${currentRoomCode}`;
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (data.players && Array.isArray(data.players)) {
          data.players = data.players.filter(p => p.id !== currentUserId);
          localStorage.setItem(key, JSON.stringify(data));
        }
      } catch (e) { /* ignore */ }
    }

    if (currentRoomCode && currentUserId && FirebaseConfig.isReady() && !_useLocalFallback) {
      const db = FirebaseConfig.getDatabase();
      try {
        await db.ref(`rooms/${currentRoomCode}/players/${currentUserId}`).remove();
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    }

    if (roomRef) {
      roomRef.off();
      roomRef = null;
    }

    const oldCode = currentRoomCode;
    currentRoomCode = null;
    currentUserId = null;
    isHost = false;
    roomStateListeners = [];
    _previousPlayerIds = new Set();
    _previousPlayerNames = {};
    _localPlayers = [];
    _useLocalFallback = false;

    const url = new URL(window.location);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);

    localStorage.removeItem('truth-dare-room');
  }

  /**
   * Check URL for room on page load
   */
  function checkURLForRoom() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && code.length >= 3) {
      return code.toUpperCase();
    }
    return null;
  }

  /**
   * Get current user ID
   */
  function getCurrentUserId() {
    return currentUserId;
  }

  /**
   * Show a toast from external code
   */
  function showToast(message, type) {
    _showToast(message, type);
  }

  /**
   * Rejoin a room after disconnect using stored userId
   */
  async function rejoinRoom(roomCode, storedUserId) {
    if (!FirebaseConfig.isReady()) return { success: false, error: 'Firebase required.' };
    const db = FirebaseConfig.getDatabase();
    const snap = await db.ref(`rooms/${roomCode}/players/${storedUserId}`).once('value');
    if (!snap.exists()) return { success: false, error: 'Your seat was lost. Please join as a new player.' };
    currentRoomCode = roomCode;
    currentUserId = storedUserId;
    const playerData = snap.val();
    isHost = !!playerData.isHost;
    // Restore status
    await db.ref(`rooms/${roomCode}/players/${storedUserId}/status`).set('online');
    _setupRoomListener();
    return { success: true };
  }

  return {
    createRoom,
    joinRoom,
    rejoinRoom,
    getRoomPlayers,
    getRoomInfo,
    startGameInRoom,
    updateCurrentTurn,
    updatePlayerScore,
    onRoomStateChange,
    offRoomStateChange,
    getRoomCode,
    getDisplayCode,
    getIsHost,
    isInRoom,
    getShareURL,
    copyCodeToClipboard,
    leaveRoom,
    checkURLForRoom,
    getCurrentUserId,
    showToast,
    isLocalFallback: () => _useLocalFallback,
    getLocalPlayers: () => _localPlayers || []
  };
})();
