/**
 * questions.js — Manages loading, filtering, and serving questions/dares.
 * Ensures no repeats until all questions in a pool are exhausted.
 * Now integrates custom questions and AI-generated questions.
 */

const Questions = (() => {
  // Raw data loaded from JSON
  let truthsData = {};
  let daresData = {};
  let penaltiesList = [];

  // Tracking used questions to prevent repeats
  let usedTruths = new Set();
  let usedDares = new Set();

  // Active settings
  let activePacks = ['friends'];
  let activeDifficulty = 'easy';
  let customPackEnabled = false;

  /**
   * Loads truth and dare data from JSON files.
   * @returns {Promise<void>}
   */
  async function loadData() {
    try {
      const [truthsRes, daresRes] = await Promise.all([
        fetch('./assets/data/truths.json'),
        fetch('./assets/data/dares.json')
      ]);
      truthsData = await truthsRes.json();
      daresData = await daresRes.json();
      // Extract penalties from dares data
      penaltiesList = daresData.penalties || [];
    } catch (error) {
      console.error('Failed to load question data:', error);
    }
  }

  /**
   * Sets which category packs are currently active.
   * @param {string[]} packs - Array of pack names
   */
  function setActivePacks(packs) {
    activePacks = packs.length > 0 ? packs : ['friends'];
  }

  /**
   * Gets the list of currently active packs.
   * @returns {string[]}
   */
  function getActivePacks() {
    return [...activePacks];
  }

  /**
   * Sets the current difficulty level.
   * @param {string} difficulty - 'easy', 'medium', or 'wild'
   */
  function setDifficulty(difficulty) {
    activeDifficulty = difficulty;
  }

  /**
   * Gets the current difficulty level.
   * @returns {string}
   */
  function getDifficulty() {
    return activeDifficulty;
  }

  /**
   * Enables or disables the custom question pack.
   * @param {boolean} enabled
   */
  function setCustomPackEnabled(enabled) {
    customPackEnabled = enabled;
  }

  /**
   * Checks if custom pack is enabled.
   * @returns {boolean}
   */
  function isCustomPackEnabled() {
    return customPackEnabled;
  }

  /**
   * Builds a pool of available questions based on active packs and difficulty.
   * Now includes custom questions if enabled.
   * @param {string} type - 'truth' or 'dare'
   * @returns {string[]} Array of available questions
   */
  function _buildPool(type) {
    const data = type === 'truth' ? truthsData : daresData;
    const used = type === 'truth' ? usedTruths : usedDares;
    const pool = [];

    for (const pack of activePacks) {
      if (data[pack] && data[pack][activeDifficulty]) {
        const questions = data[pack][activeDifficulty];
        questions.forEach(q => {
          if (!used.has(q)) {
            pool.push(q);
          }
        });
      }
    }

    // Add custom questions if enabled
    if (customPackEnabled && typeof CustomQuestions !== 'undefined') {
      const customPool = type === 'truth'
        ? CustomQuestions.getTruths(activeDifficulty)
        : CustomQuestions.getDares(activeDifficulty);
      customPool.forEach(q => {
        if (!used.has(q)) {
          pool.push(q);
        }
      });
    }

    // If all questions exhausted, reset and rebuild
    if (pool.length === 0) {
      if (type === 'truth') {
        usedTruths.clear();
      } else {
        usedDares.clear();
      }
      return _buildPool(type);
    }

    return pool;
  }

  /**
   * Gets a random truth question from the active pool.
   * @returns {{ question: string, pack: string, difficulty: string }}
   */
  function getTruth() {
    const pool = _buildPool('truth');
    const index = Math.floor(Math.random() * pool.length);
    const question = pool[index];
    usedTruths.add(question);

    // Find which pack it belongs to
    let pack = 'unknown';

    // Check custom questions first
    if (customPackEnabled && typeof CustomQuestions !== 'undefined') {
      const customTruths = CustomQuestions.getTruths(activeDifficulty);
      if (customTruths.includes(question)) {
        pack = 'custom';
        return { question, pack, difficulty: activeDifficulty };
      }
    }

    for (const p of activePacks) {
      if (truthsData[p]?.[activeDifficulty]?.includes(question)) {
        pack = p;
        break;
      }
    }

    return { question, pack, difficulty: activeDifficulty };
  }

  /**
   * Gets a random dare from the active pool.
   * @returns {{ question: string, pack: string, difficulty: string }}
   */
  function getDare() {
    const pool = _buildPool('dare');
    const index = Math.floor(Math.random() * pool.length);
    const question = pool[index];
    usedDares.add(question);

    let pack = 'unknown';

    // Check custom questions first
    if (customPackEnabled && typeof CustomQuestions !== 'undefined') {
      const customDares = CustomQuestions.getDares(activeDifficulty);
      if (customDares.includes(question)) {
        pack = 'custom';
        return { question, pack, difficulty: activeDifficulty };
      }
    }

    for (const p of activePacks) {
      if (daresData[p]?.[activeDifficulty]?.includes(question)) {
        pack = p;
        break;
      }
    }

    return { question, pack, difficulty: activeDifficulty };
  }

  /**
   * Gets a random funny penalty for skipping.
   * @returns {string}
   */
  function getRandomPenalty() {
    if (penaltiesList.length === 0) return 'Do 10 jumping jacks as a penalty!';
    return penaltiesList[Math.floor(Math.random() * penaltiesList.length)];
  }

  /**
   * Returns the total number of available questions for current settings.
   * @returns {{ truths: number, dares: number }}
   */
  function getPoolSize() {
    return {
      truths: _buildPool('truth').length,
      dares: _buildPool('dare').length
    };
  }

  /**
   * Resets all used question tracking (for new game).
   */
  function resetUsed() {
    usedTruths.clear();
    usedDares.clear();
  }

  return {
    loadData,
    setActivePacks,
    getActivePacks,
    setDifficulty,
    getDifficulty,
    setCustomPackEnabled,
    isCustomPackEnabled,
    getTruth,
    getDare,
    getRandomPenalty,
    getPoolSize,
    resetUsed
  };
})();
