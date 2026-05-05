/**
 * custom-questions.js — Custom question builder with localStorage persistence.
 * Allows players to add their own truths and dares to the deck.
 */

const CustomQuestions = (() => {
  const STORAGE_KEY = 'truth-dare-custom-questions';

  // Custom question pool: { id, type: 'truth'|'dare', difficulty, question }
  let customQuestions = [];
  let nextId = 1;

  /**
   * Loads custom questions from localStorage.
   */
  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        customQuestions = parsed.questions || [];
        nextId = parsed.nextId || 1;
      }
    } catch (e) {
      console.warn('Failed to load custom questions:', e);
    }
  }

  /**
   * Saves custom questions to localStorage.
   */
  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        questions: customQuestions,
        nextId
      }));
    } catch (e) {
      console.warn('Failed to save custom questions:', e);
    }
  }

  /**
   * Adds a new custom question.
   * @param {string} type - 'truth' or 'dare'
   * @param {string} difficulty - 'easy', 'medium', or 'wild'
   * @param {string} question - The question text
   * @returns {{ success: boolean, question?: object, error?: string }}
   */
  function addQuestion(type, difficulty, question) {
    const trimmed = question.trim();
    if (!trimmed) {
      return { success: false, error: 'Question cannot be empty.' };
    }
    if (trimmed.length < 10) {
      return { success: false, error: 'Question must be at least 10 characters.' };
    }
    if (trimmed.length > 300) {
      return { success: false, error: 'Question must be under 300 characters.' };
    }
    if (!['truth', 'dare'].includes(type)) {
      return { success: false, error: 'Type must be truth or dare.' };
    }
    if (!['easy', 'medium', 'wild'].includes(difficulty)) {
      return { success: false, error: 'Invalid difficulty level.' };
    }

    // Check for duplicates
    if (customQuestions.some(q => q.question.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, error: 'This question already exists.' };
    }

    const newQuestion = {
      id: nextId++,
      type,
      difficulty,
      question: trimmed,
      createdAt: Date.now()
    };

    customQuestions.push(newQuestion);
    _save();

    return { success: true, question: newQuestion };
  }

  /**
   * Removes a custom question by ID.
   * @param {number} id
   * @returns {boolean}
   */
  function removeQuestion(id) {
    const before = customQuestions.length;
    customQuestions = customQuestions.filter(q => q.id !== id);
    if (customQuestions.length < before) {
      _save();
      return true;
    }
    return false;
  }

  /**
   * Gets all custom questions.
   * @returns {object[]}
   */
  function getAll() {
    return [...customQuestions];
  }

  /**
   * Gets custom truths filtered by difficulty.
   * @param {string} difficulty
   * @returns {string[]}
   */
  function getTruths(difficulty) {
    return customQuestions
      .filter(q => q.type === 'truth' && q.difficulty === difficulty)
      .map(q => q.question);
  }

  /**
   * Gets custom dares filtered by difficulty.
   * @param {string} difficulty
   * @returns {string[]}
   */
  function getDares(difficulty) {
    return customQuestions
      .filter(q => q.type === 'dare' && q.difficulty === difficulty)
      .map(q => q.question);
  }

  /**
   * Gets count of custom questions.
   * @returns {{ truths: number, dares: number, total: number }}
   */
  function getCount() {
    const truths = customQuestions.filter(q => q.type === 'truth').length;
    const dares = customQuestions.filter(q => q.type === 'dare').length;
    return { truths, dares, total: truths + dares };
  }

  /**
   * Exports all custom questions as JSON string.
   * @returns {string}
   */
  function exportJSON() {
    return JSON.stringify(customQuestions, null, 2);
  }

  /**
   * Imports custom questions from JSON string.
   * @param {string} jsonString
   * @returns {{ success: boolean, imported?: number, error?: string }}
   */
  function importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) {
        return { success: false, error: 'Invalid format — expected an array.' };
      }

      let imported = 0;
      parsed.forEach(q => {
        if (q.type && q.difficulty && q.question) {
          const result = addQuestion(q.type, q.difficulty, q.question);
          if (result.success) imported++;
        }
      });

      return { success: true, imported };
    } catch (e) {
      return { success: false, error: 'Invalid JSON format.' };
    }
  }

  /**
   * Clears all custom questions.
   */
  function clearAll() {
    customQuestions = [];
    nextId = 1;
    _save();
  }

  return {
    load,
    addQuestion,
    removeQuestion,
    getAll,
    getTruths,
    getDares,
    getCount,
    exportJSON,
    importJSON,
    clearAll
  };
})();
