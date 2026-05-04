/**
 * timer.js — Countdown timer with progress ring for physical dares.
 */

const Timer = (() => {
  let interval = null;
  let timeLeft = 60;
  let totalTime = 60;
  let isPaused = false;
  let isRunning = false;
  let onTickCallback = null;
  let onCompleteCallback = null;

  // SVG circle circumference (radius=60)
  const CIRCUMFERENCE = 2 * Math.PI * 60;

  /**
   * Starts the countdown timer.
   * @param {number} duration - Duration in seconds (default 60)
   * @param {Function} onTick - Called every second with remaining time
   * @param {Function} onComplete - Called when timer reaches 0
   */
  function start(duration = 60, onTick = null, onComplete = null) {
    stop(); // Clear any existing timer
    totalTime = duration;
    timeLeft = duration;
    isPaused = false;
    isRunning = true;
    onTickCallback = onTick;
    onCompleteCallback = onComplete;

    _updateDisplay();

    interval = setInterval(() => {
      if (!isPaused) {
        timeLeft--;
        _updateDisplay();

        if (timeLeft <= 0) {
          stop();
          if (onCompleteCallback) onCompleteCallback();
        }
      }
    }, 1000);
  }

  /**
   * Pauses the timer.
   */
  function pause() {
    isPaused = true;
  }

  /**
   * Resumes the timer from paused state.
   */
  function resume() {
    isPaused = false;
  }

  /**
   * Toggles between paused and running.
   * @returns {boolean} New paused state
   */
  function togglePause() {
    isPaused = !isPaused;
    return isPaused;
  }

  /**
   * Resets the timer to the original duration.
   */
  function reset() {
    timeLeft = totalTime;
    isPaused = false;
    _updateDisplay();
  }

  /**
   * Stops and clears the timer completely.
   */
  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    isRunning = false;
    isPaused = false;
  }

  /**
   * Returns the current state of the timer.
   * @returns {{ timeLeft: number, totalTime: number, isPaused: boolean, isRunning: boolean, progress: number }}
   */
  function getState() {
    return {
      timeLeft,
      totalTime,
      isPaused,
      isRunning,
      progress: totalTime > 0 ? timeLeft / totalTime : 0
    };
  }

  /**
   * Calculates the SVG stroke-dashoffset for the progress ring.
   * @returns {number}
   */
  function getStrokeDashoffset() {
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    return CIRCUMFERENCE * (1 - progress);
  }

  /**
   * Returns the circumference constant for SVG setup.
   * @returns {number}
   */
  function getCircumference() {
    return CIRCUMFERENCE;
  }

  /**
   * Formats seconds into MM:SS string.
   * @param {number} seconds
   * @returns {string}
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Internal: Calls the tick callback with current state.
   */
  function _updateDisplay() {
    if (onTickCallback) {
      onTickCallback({
        timeLeft,
        totalTime,
        formatted: formatTime(timeLeft),
        progress: totalTime > 0 ? timeLeft / totalTime : 0,
        dashoffset: getStrokeDashoffset()
      });
    }
  }

  return {
    start,
    pause,
    resume,
    togglePause,
    reset,
    stop,
    getState,
    getStrokeDashoffset,
    getCircumference,
    formatTime
  };
})();
