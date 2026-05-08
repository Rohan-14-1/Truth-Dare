/**
 * app.js — Application entry point. Initializes all modules and binds global events.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Load question data before anything else
  await Questions.loadData();

  // Initialize the lobby screen
  UI.renderLobbyScreen();
  // Render multiplayer room controls
  if (typeof MultiplayerUI !== 'undefined') {
    MultiplayerUI.renderRoomSelectScreen();
  }
  UI.initSettingsUI();

  _bindLobbyEvents();
  _bindSettingsEvents();
  _bindGlobalEvents();
});

/**
 * Binds all lobby screen event listeners.
 */
function _bindLobbyEvents() {
  const input = document.getElementById('player-name-input');
  const addBtn = document.getElementById('btn-add-player');
  const startBtn = document.getElementById('btn-start-game');

  // Add player on button click
  if (addBtn) {
    addBtn.addEventListener('click', () => _addPlayerFromInput());
  }

  // Add player on Enter key
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        _addPlayerFromInput();
      }
    });
  }

  // Start game
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      UI.saveSettings(); // Save any setting changes
      Game.startGame();
    });
  }
}

/**
 * Reads the input field, adds a player, clears the field.
 */
function _addPlayerFromInput() {
  const input = document.getElementById('player-name-input');
  if (!input) return;

  const result = Players.addPlayer(input.value);
  if (result.success) {
    input.value = '';
    UI.renderPlayerList();
    // Update start button state
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.disabled = Players.count() < 2;
  } else {
    // Shake the input on error
    input.classList.add('animate-shake');
    setTimeout(() => input.classList.remove('animate-shake'), 500);
  }

  input.focus();
}

/**
 * Binds settings panel event listeners.
 */
function _bindSettingsEvents() {
  // Open settings
  const openBtn = document.getElementById('btn-open-settings');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      UI.initSettingsUI();
      UI.openSettings();
    });
  }

  // Close settings
  const closeBtn = document.getElementById('btn-close-settings');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => UI.closeSettings());
  }

  // Save settings
  const saveBtn = document.getElementById('btn-save-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => UI.saveSettings());
  }

  // Close on overlay click
  const overlay = document.getElementById('settings-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) UI.closeSettings();
    });
  }

  // Difficulty chip selection
  document.querySelectorAll('.difficulty-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.difficulty-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

/**
 * Binds global/persistent event listeners.
 */
function _bindGlobalEvents() {
  // History panel toggle
  const historyToggle = document.getElementById('history-toggle');
  if (historyToggle) {
    historyToggle.addEventListener('click', () => UI.toggleHistory());
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape closes settings
    if (e.key === 'Escape') {
      UI.closeSettings();
    }
  });

  // Handle window resize for confetti canvas
  window.addEventListener('resize', () => {
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  });
}
