/**
 * reactions.js — Emoji reaction system with floating animations.
 * Players can react to questions/dares with emoji reactions.
 */

const Reactions = (() => {
  // Available reaction emojis
  const REACTION_SET = [
    { emoji: '🔥', label: 'Fire', key: 'fire' },
    { emoji: '😂', label: 'Laugh', key: 'laugh' },
    { emoji: '😱', label: 'Shock', key: 'shock' },
    { emoji: '💀', label: 'Dead', key: 'dead' },
    { emoji: '👏', label: 'Clap', key: 'clap' },
    { emoji: '😍', label: 'Love', key: 'love' }
  ];

  // Reaction counts for current question
  let currentReactions = {};

  /**
   * Gets the set of available reactions.
   * @returns {object[]}
   */
  function getReactionSet() {
    return [...REACTION_SET];
  }

  /**
   * Resets reaction counts for a new question.
   */
  function reset() {
    currentReactions = {};
    REACTION_SET.forEach(r => {
      currentReactions[r.key] = 0;
    });
  }

  /**
   * Adds a reaction.
   * @param {string} key - Reaction key
   * @returns {{ count: number, emoji: string }}
   */
  function addReaction(key) {
    if (currentReactions[key] !== undefined) {
      currentReactions[key]++;
    }
    const reaction = REACTION_SET.find(r => r.key === key);
    return {
      count: currentReactions[key] || 0,
      emoji: reaction ? reaction.emoji : '❓'
    };
  }

  /**
   * Gets current reaction counts.
   * @returns {object}
   */
  function getCounts() {
    return { ...currentReactions };
  }

  /**
   * Gets the most popular reaction.
   * @returns {{ key: string, emoji: string, count: number }|null}
   */
  function getMostPopular() {
    let maxKey = null;
    let maxCount = 0;

    for (const [key, count] of Object.entries(currentReactions)) {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    }

    if (!maxKey || maxCount === 0) return null;

    const reaction = REACTION_SET.find(r => r.key === maxKey);
    return {
      key: maxKey,
      emoji: reaction ? reaction.emoji : '❓',
      count: maxCount
    };
  }

  /**
   * Creates a floating emoji animation at a given position.
   * @param {string} emoji - The emoji to float
   * @param {HTMLElement} container - Container to append the floater to
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  function createFloatingEmoji(emoji, container, x, y) {
    const floater = document.createElement('div');
    floater.className = 'floating-emoji';
    floater.textContent = emoji;

    // Randomize direction slightly
    const offsetX = (Math.random() - 0.5) * 60;
    floater.style.cssText = `
      left: ${x}px;
      top: ${y}px;
      --float-x: ${offsetX}px;
    `;

    container.appendChild(floater);

    // Remove after animation completes
    floater.addEventListener('animationend', () => {
      floater.remove();
    });

    // Fallback removal
    setTimeout(() => {
      if (floater.parentNode) floater.remove();
    }, 1500);
  }

  return {
    getReactionSet,
    reset,
    addReaction,
    getCounts,
    getMostPopular,
    createFloatingEmoji
  };
})();
