/**
 * firebase-config.js — Firebase configuration and initialization
 * Uses Firebase compat SDK for Realtime Database multiplayer sync.
 * Falls back gracefully to local-only play when Firebase is unavailable.
 */

const FirebaseConfig = (() => {
  let isInitialized = false;
  let db = null;
  let connectionState = 'disconnected'; // 'connected', 'disconnected', 'error'
  let connectionListeners = [];

  /**
   * Initialize Firebase with provided or default config.
   * Replace the placeholder config below with your actual Firebase project config.
   */
  function initialize(config = null) {
    const firebaseConfig = config || {
      apiKey: "AIzaSyDemoKey123456789",
      authDomain: "truth-dare-game.firebaseapp.com",
      databaseURL: "https://truth-dare-game-default-rtdb.firebaseio.com",
      projectId: "truth-dare-game",
      storageBucket: "truth-dare-game.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef123456"
    };

    // Guard: the bundled config is a non-functional placeholder. Initializing
    // against it succeeds silently but produces a dead connection whose cached
    // listener can clobber the localStorage turn-state mid-game (breaking turn 2+).
    // Treat placeholder credentials as "not configured" so the app runs cleanly
    // in local cross-tab mode. Pass a real config to initialize() to enable sync.
    const _isPlaceholder =
      !config &&
      (/Demo/i.test(firebaseConfig.apiKey || '') ||
       (firebaseConfig.messagingSenderId === '123456789'));

    if (_isPlaceholder) {
      console.warn('⚠️ Firebase config is a placeholder — running in local-only mode. ' +
        'Pass a real config to FirebaseConfig.initialize() to enable multiplayer sync.');
      connectionState = 'error';
      isInitialized = false;
      db = null;
      return;
    }

    try {
      if (typeof firebase !== 'undefined' && !isInitialized) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        isInitialized = true;
        connectionState = 'connected';
        console.log('✅ Firebase initialized successfully');

        // Monitor connection state
        _monitorConnection();
      } else if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK not loaded — running in local-only mode');
        connectionState = 'error';
      }
    } catch (error) {
      console.error('Firebase initialization error:', error);
      connectionState = 'error';
    }
  }

  /**
   * Monitor Firebase Realtime Database connection
   */
  function _monitorConnection() {
    if (!db) return;
    const connRef = db.ref('.info/connected');
    connRef.on('value', (snap) => {
      const connected = snap.val() === true;
      connectionState = connected ? 'connected' : 'disconnected';
      connectionListeners.forEach(cb => cb(connectionState));
    });
  }

  /**
   * Listen for connection state changes
   */
  function onConnectionChange(callback) {
    connectionListeners.push(callback);
  }

  /**
   * Get Firebase database reference
   */
  function getDatabase() {
    if (!isInitialized) {
      console.warn('Firebase not initialized. Call initialize() first.');
      return null;
    }
    return db;
  }

  /**
   * Check if Firebase is ready
   */
  function isReady() {
    return isInitialized && db !== null;
  }

  /**
   * Get connection state
   */
  function getConnectionState() {
    return connectionState;
  }

  return {
    initialize,
    getDatabase,
    isReady,
    getConnectionState,
    onConnectionChange
  };
})();

// Auto-initialize on script load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase !== 'undefined') {
      FirebaseConfig.initialize();
    }
  });
} else {
  if (typeof firebase !== 'undefined') {
    FirebaseConfig.initialize();
  }
}