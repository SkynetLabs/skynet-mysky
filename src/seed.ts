import { removeAdjacentChars } from "skynet-mysky-utils";

import { sha512 } from "./crypto";
import { dictionary } from "./dictionary";

export const SEED_LENGTH = 16;
export const SEED_WORDS_LENGTH = 13;
export const CHECKSUM_WORDS_LENGTH = 2;
export const PHRASE_LENGTH = SEED_WORDS_LENGTH + CHECKSUM_WORDS_LENGTH;

const LAST_WORD_INDEX = 12;
const PHRASE_DELIMITER = " ";

/**
 * Generates a 15-word seed phrase for 16 bytes of entropy plus 20 bits of checksum. The dictionary length is 1024 which gives 10 bits of entropy per word.
 *
 * @returns - The generated phrase.
 */
export function generatePhrase(): string {
  const seedWords = new Uint16Array(SEED_WORDS_LENGTH);
  window.crypto.getRandomValues(seedWords);

  // Populate the seed words from the random values.
  for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
    let numBits = 10;
    // For the 13th word, only the first 256 words are considered valid.
    if (i === LAST_WORD_INDEX) {
      numBits = 8;
    }
    seedWords[i] = seedWords[i] % (1 << numBits);
  }

  // Generate checksum from hash of the seed.
  const checksumWords = generateChecksumWordsFromSeedWords(seedWords);

  const phraseWords: string[] = new Array(PHRASE_LENGTH);
  let phraseWord = 0;
  for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
    phraseWords[phraseWord++] = dictionary[seedWords[i]];
  }
  for (let i = 0; i < CHECKSUM_WORDS_LENGTH; i++) {
    phraseWords[phraseWord++] = dictionary[checksumWords[i]];
  }

  return phraseWords.join(PHRASE_DELIMITER);
}

/**
 * Converts the input seed phrase to the actual seed bytes.
 *
 * @param phrase - The input seed phrase.
 * @returns - The seed bytes.
 */
export function phraseToSeed(phrase: string): Uint8Array {
  phrase = sanitizePhrase(phrase);
  const [valid, error, seed] = validatePhrase(phrase);
  if (!valid || !seed) {
    throw new Error(error);
  }

  return seed;
}

/**
 * Converts the seed bytes to the original phrase. Useful for recovery of a lost phrase.
 *
 * @param seed - The seed bytes.
 * @returns - The original phrase.
 */
export function seedToPhrase(seed: Uint8Array): string {
  return seedWordsToPhrase(seedToSeedWords(seed));
}

/**
 * Validate the phrase by checking that for every word, there is a dictionary
 * word that starts with the first 3 letters of the word. For the last word of
 * the seed phrase (the 13th word; words 14 and 15 are checksum words), only the
 * first 256 words of the dictionary are considered valid.
 *
 * @param phrase - The input seed phrase to check.
 * @returns - A boolean indicating whether the phrase is valid, a string explaining the error if it's not, and the final seed bytes.
 */
export function validatePhrase(phrase: string): [boolean, string, Uint8Array | null] {
  phrase = sanitizePhrase(phrase);
  const phraseWords = phrase.split(" ");
  if (phraseWords.length !== PHRASE_LENGTH) {
    return [false, `Phrase must be '${PHRASE_LENGTH}' words long, was '${phraseWords.length}'`, null];
  }

  // Build the seed words from phrase words.
  const seedWords = new Uint16Array(SEED_WORDS_LENGTH);
  let i = 0;
  for (const word of phraseWords) {
    // Check word length.
    if (word.length < 3) {
      return [false, `Word ${i + 1} is not at least 3 letters long`, null];
    }

    // Iterate through the dictionary looking for the word prefix.
    const prefix = word.slice(0, 3);
    let bound = dictionary.length;
    if (i === LAST_WORD_INDEX) {
      bound = 256;
    }
    let found = -1;
    for (let j = 0; j < bound; j++) {
      const curPrefix = dictionary[j].slice(0, 3);
      if (curPrefix === prefix) {
        found = j;
        break;
      } else if (curPrefix > prefix) {
        break;
      }
    }
    // The prefix was not found in the dictionary.
    if (found < 0) {
      if (i === LAST_WORD_INDEX) {
        return [false, `Prefix for word ${i + 1} must be found in the first 256 words of the dictionary`, null];
      } else {
        return [false, `Unrecognized prefix "${prefix}" at word ${i + 1}, not found in dictionary`, null];
      }
    }

    seedWords[i] = found;

    i++;
  }

  // Validate checksum.
  const checksumWords = generateChecksumWordsFromSeedWords(seedWords);
  for (let i = 0; i < CHECKSUM_WORDS_LENGTH; i++) {
    const prefix = dictionary[checksumWords[i]].slice(0, 3);
    if (phraseWords[i + SEED_WORDS_LENGTH].slice(0, 3) !== prefix) {
      return [false, `Word "${phraseWords[i + SEED_WORDS_LENGTH]}" is not a valid checksum for the seed`, null];
    }
  }

  return [true, "", seedWordsToSeed(seedWords)];
}

// ================
// Helper Functions
// ================

/**
 * Generates 2 10-bit checksum words from the 10-bit seed words.
 *
 * @param seedWords - The array of 10-bit seed words.
 * @returns - The 2 10-bit checksum words.
 */
function generateChecksumWordsFromSeedWords(seedWords: Uint16Array): Uint16Array {
  if (seedWords.length != SEED_WORDS_LENGTH) {
    throw new Error(`Input seed was not of length ${SEED_WORDS_LENGTH}`);
  }

  const seed = seedWordsToSeed(seedWords);
  const h = sha512(seed);
  return hashToChecksumWords(h);
}

/**
 * Converts the hash of the seed bytes into 2 10-bit checksum words.
 *
 * @param h - The hash of the seed.
 * @returns - The 2 10-bit checksum words.
 */
export function hashToChecksumWords(h: Uint8Array): Uint16Array {
  let word1 = h[0] << 8;
  word1 += h[1];
  word1 >>= 6;
  let word2 = h[1] << 10;
  word2 &= 0xffff;
  word2 += h[2] << 2;
  word2 >>= 6;
  return new Uint16Array([word1, word2]);
}

/**
 * Sanitizes the input phrase by trimming it and lowercasing it.
 *
 * @param phrase - The input seed phrase.
 * @returns - The sanitized phrase.
 */
export function sanitizePhrase(phrase: string): string {
  // Remove duplicate adjacent spaces.
  return removeAdjacentChars(phrase.trim().toLowerCase(), " ");
}

/**
 * Converts the given seed bytes to 10-bit seed words.
 *
 * @param seed - The given seed bytes.
 * @returns - The 10-bit seed words.
 */
export function seedToSeedWords(seed: Uint8Array): Uint16Array {
  if (seed.length !== SEED_LENGTH) {
    throw new Error(`Input seed should be length '${SEED_LENGTH}', was '${seed.length}'`);
  }

  const words = new Uint16Array(SEED_WORDS_LENGTH);
  let curWord = 0;
  let curBit = 0;
  let wordBits = 10;

  for (let i = 0; i < SEED_LENGTH; i++) {
    const byte = seed[i];

    // Iterate over the bits of the 8-bit byte.
    for (let j = 0; j < 8; j++) {
      const bitSet = (byte & (1 << (8 - j - 1))) > 0;

      if (bitSet) {
        words[curWord] |= 1 << (wordBits - curBit - 1);
      }

      curBit += 1;
      if (curBit >= wordBits) {
        // Current word has maximum bits, go to the next word.
        curWord += 1;
        curBit = 0;
        if (curWord === SEED_WORDS_LENGTH - 1) {
          wordBits = 8;
        }
      }
    }
  }

  return words;
}

/**
 * Converts the given 10-bit seed words to a full phrase, including the checksum.
 *
 * @param seedWords - The seed words.
 * @returns - The full phrase.
 */
function seedWordsToPhrase(seedWords: Uint16Array): string {
  if (seedWords.length !== SEED_WORDS_LENGTH) {
    throw new Error(`Seed words must be '${SEED_WORDS_LENGTH}' long, was '${seedWords.length}'`);
  }

  let phrase = "";

  // Add checksum words.
  const checksumWords = generateChecksumWordsFromSeedWords(seedWords);
  const seedWordsWithChecksum = [...seedWords, ...checksumWords];

  // Build the phrase from seed words.
  let i = 0;
  for (const seedWord of seedWordsWithChecksum) {
    let maxSeedWord = dictionary.length;
    if (i === LAST_WORD_INDEX) {
      maxSeedWord = 256;
    }

    if (seedWord > maxSeedWord) {
      throw new Error(
        `Seed word '${seedWord}' is greater than the max seed word '${maxSeedWord}' for seed index '${i}'`
      );
    }

    if (i === 0) {
      phrase = dictionary[seedWord];
    } else {
      phrase += ` ${dictionary[seedWord]}`;
    }

    i++;
  }

  return phrase;
}

/**
 * Converts the input 10-bit seed words into seed bytes (8-bit array).
 *
 * @param seedWords - The array of 10-bit seed words.
 * @returns - The seed bytes.
 */
export function seedWordsToSeed(seedWords: Uint16Array): Uint8Array {
  if (seedWords.length !== SEED_WORDS_LENGTH) {
    throw new Error(`Input seed words should be length '${SEED_WORDS_LENGTH}', was '${seedWords.length}'`);
  }

  // We are getting 16 bytes of entropy.
  const bytes = new Uint8Array(SEED_LENGTH);
  let curByte = 0;
  let curBit = 0;

  for (let i = 0; i < SEED_WORDS_LENGTH; i++) {
    const word = seedWords[i];
    let wordBits = 10;
    if (i === SEED_WORDS_LENGTH - 1) {
      wordBits = 8;
    }

    // Iterate over the bits of the 10- or 8-bit word.
    for (let j = 0; j < wordBits; j++) {
      const bitSet = (word & (1 << (wordBits - j - 1))) > 0;

      if (bitSet) {
        bytes[curByte] |= 1 << (8 - curBit - 1);
      }

      curBit += 1;
      if (curBit >= 8) {
        // Current byte has 8 bits, go to the next byte.
        curByte += 1;
        curBit = 0;
      }
    }
  }

  return bytes;
}
