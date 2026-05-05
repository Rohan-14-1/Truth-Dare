/**
 * rooms.js — Room code generation and management for local multiplayer.
 * Uses URL parameters and localStorage for room state.
 */

const Rooms = (() => {
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
  const CODE_LENGTH = 6;
  const STORAGE_KEY = 'truth-dare-room';

  let currentRoomCode = null;
  let isHost = false;

  /**
   * Generates a random room code.
   * @returns {string} 6-character alphanumeric code
   */
  function _generateCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    return code;
  }

  /**
   * Creates a new room and returns the code.
   * @returns {string} Room code
   */
  function createRoom() {
    currentRoomCode = _generateCode();
    isHost = true;

    // Save room state
    _saveRoomState();

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('room', currentRoomCode);
    window.history.replaceState({}, '', url);

    return currentRoomCode;
  }

  /**
   * Joins an existing room by code.
   * @param {string} code - Room code to join
   * @returns {{ success: boolean, error?: string }}
   */
  function joinRoom(code) {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== CODE_LENGTH) {
      return { success: false, error: 'Room code must be 6 characters.' };
    }

    currentRoomCode = trimmed;
    isHost = false;

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('room', currentRoomCode);
    window.history.replaceState({}, '', url);

    return { success: true };
  }

  /**
   * Checks URL for a room code on page load.
   * @returns {string|null} Room code if found
   */
  function checkURLForRoom() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && code.length === CODE_LENGTH) {
      currentRoomCode = code.toUpperCase();
      return currentRoomCode;
    }
    return null;
  }

  /**
   * Gets the current room code.
   * @returns {string|null}
   */
  function getRoomCode() {
    return currentRoomCode;
  }

  /**
   * Checks if the current user is the host.
   * @returns {boolean}
   */
  function getIsHost() {
    return isHost;
  }

  /**
   * Checks if currently in a room.
   * @returns {boolean}
   */
  function isInRoom() {
    return currentRoomCode !== null;
  }

  /**
   * Gets a shareable URL for the current room.
   * @returns {string}
   */
  function getShareURL() {
    if (!currentRoomCode) return window.location.href;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('room', currentRoomCode);
    return url.toString();
  }

  /**
   * Copies the room code to clipboard.
   * @returns {Promise<boolean>}
   */
  async function copyCodeToClipboard() {
    if (!currentRoomCode) return false;
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      return true;
    } catch {
      // Fallback for older browsers
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
   * Copies the share URL to clipboard.
   * @returns {Promise<boolean>}
   */
  async function copyURLToClipboard() {
    try {
      await navigator.clipboard.writeText(getShareURL());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Saves room state to localStorage.
   */
  function _saveRoomState() {
    const state = {
      code: currentRoomCode,
      isHost,
      createdAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * Leaves the current room and cleans up.
   */
  function leaveRoom() {
    currentRoomCode = null;
    isHost = false;
    localStorage.removeItem(STORAGE_KEY);
    const url = new URL(window.location);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
  }

  return {
    createRoom,
    joinRoom,
    checkURLForRoom,
    getRoomCode,
    getIsHost,
    isInRoom,
    getShareURL,
    copyCodeToClipboard,
    copyURLToClipboard,
    leaveRoom
  };
})();
