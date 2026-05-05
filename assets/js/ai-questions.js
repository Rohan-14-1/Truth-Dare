/**
 * ai-questions.js — Template-based AI question generator.
 * Generates fresh, personalised questions using player names and group vibe.
 */

const AIQuestions = (() => {
  // Vibe modes
  const VIBES = {
    chill: 'chill',
    chaotic: 'chaotic',
    deep: 'deep',
    flirty: 'flirty'
  };

  let currentVibe = VIBES.chill;
  let isEnabled = false;

  // Truth templates by vibe — {player} and {other} are replaced with real names
  const TRUTH_TEMPLATES = {
    chill: [
      "What's {player}'s most embarrassing childhood memory?",
      "{player}, if you could have dinner with anyone alive, who would it be and why?",
      "What's a hidden talent that {player} hasn't told anyone about?",
      "{player}, what's the best advice you've ever received?",
      "If {player} won the lottery tomorrow, what's the first thing they'd buy?",
      "{player}, what's a movie that always makes you cry?",
      "What's {player}'s comfort food when they're having a bad day?",
      "{player}, what song do you know every single word to?",
      "If {player} could travel anywhere tomorrow, where would they go?",
      "{player}, what's something you're irrationally afraid of?",
      "What would {player}'s autobiography title be?",
      "{player}, describe your perfect lazy Sunday.",
      "What's the most spontaneous thing {player} has ever done?",
      "{player}, who in this room would you call at 3am in an emergency?",
      "What's {player}'s most controversial food opinion?"
    ],
    chaotic: [
      "{player}, what's the most chaotic thing you've done this month?",
      "If {player} and {other} were in a wrestling match, who wins and why?",
      "{player}, what rule have you broken that you're secretly proud of?",
      "What's the wildest rumor about {player} that might be true?",
      "{player}, tell us about a time you completely lost it.",
      "If {player} could prank anyone in this room right now, who and how?",
      "{player}, what's the most unhinged text you've ever sent?",
      "Rate everyone in the room from most to least likely to survive a heist.",
      "{player}, what's the most ridiculous argument you've won?",
      "If {player} started a cult, what would it be about?",
      "{player}, what's the fastest you've ever ruined a good thing?",
      "What conspiracy theory does {player} secretly believe?",
      "{player}, if you had to fight one person in this room, who?",
      "What's the most chaotic energy {player} has ever brought to a party?",
      "{player}, describe your villain origin story."
    ],
    deep: [
      "{player}, what's something you wish you could tell your younger self?",
      "What's {player}'s biggest regret that still keeps them up at night?",
      "{player}, when was the last time you truly felt at peace?",
      "What does {player} think is their biggest flaw, honestly?",
      "{player}, have you ever cut someone out of your life? Do you regret it?",
      "What's the most important lesson {player} learned the hard way?",
      "{player}, what scares you most about the future?",
      "If {player} could change one decision from their past, what would it be?",
      "{player}, do you think you're living the life you were meant to?",
      "What's something {player} pretends not to care about but really does?",
      "{player}, who had the biggest impact on who you are today?",
      "What does {player} think happens after we die?",
      "{player}, what's the kindest thing a stranger has done for you?",
      "If {player} could have an honest conversation with anyone, living or dead, who?",
      "{player}, what truth about yourself are you still learning to accept?"
    ],
    flirty: [
      "{player}, what's the most attractive quality in a person?",
      "Who in this room does {player} think gives the best hugs?",
      "{player}, describe your ideal date in three words.",
      "What's {player}'s go-to move when they're trying to impress someone?",
      "{player}, what's the most romantic thing you've ever done?",
      "If {player} had to write a love letter to someone here, who?",
      "{player}, what's your biggest dating dealbreaker?",
      "Who in this room has the most attractive laugh? {player}, answer honestly.",
      "{player}, what's the cheesiest thing that would actually sweep you off your feet?",
      "If {player} could go on a dream date with anyone, where and who?",
      "{player}, what's the most flirtatious compliment you've received?",
      "Who does {player} think would be the best cuddler in this room?",
      "{player}, what makes someone instantly more attractive to you?",
      "If {player}'s love life were a movie genre, which would it be?",
      "{player}, what's your signature look when you're trying to look good?"
    ]
  };

  // Dare templates by vibe
  const DARE_TEMPLATES = {
    chill: [
      "{player}, do your best impression of {other}!",
      "{player}, show us your most-used emoji in real life.",
      "{player}, give {other} the most genuine compliment you can.",
      "{player}, do your happiest dance for 20 seconds.",
      "{player}, tell us a joke — if nobody laughs, do 10 pushups.",
      "{player}, show the group the last photo you took.",
      "{player}, speak in an accent for the next 2 rounds.",
      "{player}, draw a self-portrait in 30 seconds blindfolded.",
      "{player}, serenade {other} with any song.",
      "{player}, demonstrate your morning routine in fast-forward.",
      "{player}, do your best motivational speech about {other}.",
      "{player}, make the group laugh within 30 seconds or lose a point.",
      "{player}, show us how you dance when nobody's watching.",
      "{player}, compliment every person in the room uniquely.",
      "{player}, do a dramatic runway walk across the room."
    ],
    chaotic: [
      "{player}, text '{other} is my hero' to your last conversation.",
      "{player}, do your best dramatic villain monologue about {other}!",
      "{player}, let {other} post anything on your social media.",
      "{player}, eat the weirdest food combo the group picks.",
      "{player}, call a random contact and sing them happy birthday.",
      "{player}, swap an item of clothing with {other}.",
      "{player}, do your best impression of each player — rapid fire!",
      "{player}, let {other} go through your recent searches.",
      "{player}, speak only in song lyrics for the next 3 rounds.",
      "{player}, do 30 seconds of interpretive dance to silence.",
      "{player}, record a dramatic breakup video with a household object.",
      "{player}, let the group compose a text from your phone.",
      "{player}, do a cartwheel (or your best attempt).",
      "{player}, roast {other} — but make it loving.",
      "{player}, go outside and shout something the group decides."
    ],
    deep: [
      "{player}, give {other} the most heartfelt compliment you can.",
      "{player}, share a voice note telling someone you appreciate them.",
      "{player}, write a 4-line poem about this moment right now.",
      "{player}, tell {other} something you've never told them before.",
      "{player}, share a memory that changed who you are.",
      "{player}, make a 30-second speech about what friendship means to you.",
      "{player}, look {other} in the eyes and say what you admire about them.",
      "{player}, write a letter to your future self — read it aloud.",
      "{player}, share a goal you've been too scared to say out loud.",
      "{player}, tell the group one thing you're genuinely grateful for.",
      "{player}, apologize for something small you've been meaning to.",
      "{player}, give each player one word that describes them.",
      "{player}, share the best compliment you've ever received.",
      "{player}, tell us about a moment of kindness that stuck with you.",
      "{player}, make a toast — from the heart."
    ],
    flirty: [
      "{player}, give {other} your best pickup line with a straight face.",
      "{player}, do a slow-motion hair flip and hold a smolder.",
      "{player}, rank the group from most to least dateable.",
      "{player}, whisper something to {other} that makes them blush.",
      "{player}, do your most confident 'hey' in 5 different styles.",
      "{player}, strike 3 romance novel cover poses.",
      "{player}, wink at every player without laughing.",
      "{player}, give {other} a dramatic movie-style compliment.",
      "{player}, demonstrate your flirting technique on a chair.",
      "{player}, do your best 'running through a field' romantic scene.",
      "{player}, describe {other} as a dating profile.",
      "{player}, give a 30-second TED talk on why you're a catch.",
      "{player}, do the most dramatic slow-motion wave at {other}.",
      "{player}, blow a kiss to whoever the group chooses.",
      "{player}, say 'you look amazing' to {other} in 3 languages."
    ]
  };

  /**
   * Sets the current vibe.
   * @param {string} vibe
   */
  function setVibe(vibe) {
    if (VIBES[vibe]) {
      currentVibe = vibe;
    }
  }

  /**
   * Gets the current vibe.
   * @returns {string}
   */
  function getVibe() {
    return currentVibe;
  }

  /**
   * Gets all available vibes.
   * @returns {object}
   */
  function getVibes() {
    return { ...VIBES };
  }

  /**
   * Enables or disables AI question generation.
   * @param {boolean} enabled
   */
  function setEnabled(enabled) {
    isEnabled = enabled;
  }

  /**
   * Checks if AI questions are enabled.
   * @returns {boolean}
   */
  function getEnabled() {
    return isEnabled;
  }

  /**
   * Generates an AI truth question using templates.
   * @param {string} playerName - Current player's name
   * @param {string[]} allPlayerNames - All player names
   * @returns {{ question: string, pack: string, difficulty: string }}
   */
  function generateTruth(playerName, allPlayerNames) {
    const templates = TRUTH_TEMPLATES[currentVibe] || TRUTH_TEMPLATES.chill;
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Pick a random other player
    const otherPlayers = allPlayerNames.filter(n => n !== playerName);
    const otherPlayer = otherPlayers.length > 0
      ? otherPlayers[Math.floor(Math.random() * otherPlayers.length)]
      : 'someone';

    const question = template
      .replace(/\{player\}/g, playerName)
      .replace(/\{other\}/g, otherPlayer);

    return {
      question,
      pack: 'ai-generated',
      difficulty: _vibeToDifficulty(currentVibe)
    };
  }

  /**
   * Generates an AI dare question using templates.
   * @param {string} playerName - Current player's name
   * @param {string[]} allPlayerNames - All player names
   * @returns {{ question: string, pack: string, difficulty: string }}
   */
  function generateDare(playerName, allPlayerNames) {
    const templates = DARE_TEMPLATES[currentVibe] || DARE_TEMPLATES.chill;
    const template = templates[Math.floor(Math.random() * templates.length)];

    const otherPlayers = allPlayerNames.filter(n => n !== playerName);
    const otherPlayer = otherPlayers.length > 0
      ? otherPlayers[Math.floor(Math.random() * otherPlayers.length)]
      : 'someone';

    const question = template
      .replace(/\{player\}/g, playerName)
      .replace(/\{other\}/g, otherPlayer);

    return {
      question,
      pack: 'ai-generated',
      difficulty: _vibeToDifficulty(currentVibe)
    };
  }

  /**
   * Maps vibe to difficulty for scoring purposes.
   * @param {string} vibe
   * @returns {string}
   */
  function _vibeToDifficulty(vibe) {
    const map = {
      chill: 'easy',
      chaotic: 'wild',
      deep: 'medium',
      flirty: 'medium'
    };
    return map[vibe] || 'easy';
  }

  return {
    setVibe,
    getVibe,
    getVibes,
    setEnabled,
    getEnabled,
    generateTruth,
    generateDare
  };
})();
