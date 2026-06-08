/**
 * firebase-config.js — Firebase configuration and initialization
 * Uses the Firebase compat SDK for Realtime Database multiplayer sync.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  HOW TO ENABLE CROSS-DEVICE MULTIPLAYER (free, no card):                   │
 * │                                                                            │
 * │  1. Create a project at https://console.firebase.google.com                │
 * │  2. Build → Realtime Database → Create Database (Spark/free plan)          │
 * │  3. Project settings → Your apps → Web app → copy the config object        │
 * │  4. Paste those values into FIREBASE_CONFIG below (replace every YOUR_…)   │
 * │                                                                            │
 * │  Until you do that, the game runs in LOCAL mode (same-browser play only).  │
 * │  Real values switch cross-device sync on automatically — no other changes. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ▼▼▼ PASTE YOUR FIREBASE CONFIG VALUES HERE ▼▼▼
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCvTqzSTDAV-w9gu3dAM2ze0LAoULkfPyc",
  authDomain:        "truth-dare-ecf9f.firebaseapp.com",
  databaseURL:       "https://truth-dare-ecf9f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "truth-dare-ecf9f",
  storageBucket:     "truth-dare-ecf9f.firebasestorage.app",
  messagingSenderId: "551926183921",
  appId:             "1:551926183921:web:621a5b469bbca5da927650",
  measurementId:     "G-ZB6LRV7EKW"
};
// ▲▲▲ PASTE YOUR FIREBASE CONFIG VALUES HERE ▲▲▲

const FirebaseConfig = (() => {
  let isInitialized = false;
  let db = null;
  let connectionState = 'disconnected'; // 'connected' | 'disconnected' | 'error'
  let connectionListeners = [];

  /**
   * Detects whether the config is still the unfilled template (or the old demo
   * placeholder). If so, we DON'T initialize — initializing against fake creds
   * produces a dead connection whose cache can corrupt local game state.
   * Staying local keeps same-browser play working cleanly.
   */
  function _looksLikePlaceholder(cfg) {
    if (!cfg || !cfg.apiKey) return true;
    const blob = `${cfg.apiKey} ${cfg.projectId || ''} ${cfg.databaseURL || ''} ${cfg.authDomain || ''}`;
    return /YOUR_|PASTE|Demo|XXXX|example/i.test(blob)
      || cfg.messagingSenderId === '123456789'
      || cfg.apiKey === 'AIzaSyDemoKey123456789';
  }

  /**
   * Initialize Firebase. Pass a config object to override the one above.
   */
  function initialize(config = null) {
    const firebaseConfig = config || FIREBASE_CONFIG;

    if (_looksLikePlaceholder(firebaseConfig)) {
      console.warn('⚠️ Firebase config not filled in — running in LOCAL-only mode ' +
        '(same-browser play). Paste your real config in firebase-config.js to enable ' +
        'cross-device multiplayer.');
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
        console.log('✅ Firebase initialized — cross-device multiplayer enabled');
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

  /** Monitor Realtime Database connection state. */
  function _monitorConnection() {
    if (!db) return;
    const connRef = db.ref('.info/connected');
    connRef.on('value', (snap) => {
      const connected = snap.val() === true;
      connectionState = connected ? 'connected' : 'disconnected';
      connectionListeners.forEach(cb => cb(connectionState));
    });
  }

  function onConnectionChange(callback) {
    connectionListeners.push(callback);
  }

  function getDatabase() {
    if (!isInitialized) {
      console.warn('Firebase not initialized. Call initialize() first.');
      return null;
    }
    return db;
  }

  function isReady() {
    return isInitialized && db !== null;
  }

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