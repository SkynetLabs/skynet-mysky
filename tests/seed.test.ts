import {
  generatePhrase,
  hashToChecksumWords,
  phraseToSeed,
  sanitizePhrase,
  seedToPhrase,
  seedWordsToSeed,
  validatePhrase,
} from "../src/seed";

const validDictionarySeeds = [
  // Typical phrase.
  "vector items adopt agenda ticket nagged devoid onward geyser mime eleven frown apart origin woes",
  // Single word repeated.
  " abbey    abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey amidst punch   ",
  "yanks yanks yanks yanks yanks yanks yanks yanks yanks yanks yanks yanks eggs voyage topic  ",
];
const validSeeds = [
  ...validDictionarySeeds,
  // Words not in dictionary but prefixes are valid.
  "abb about yanked yah unctuous spry mayflower malodious jabba irish gazebo bombastic eggplant acer avoidance",
];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toEqualUint8Array(argument: Uint8Array): R;
    }
  }
}

expect.extend({
  // source https://stackoverflow.com/a/60818105/6085242
  toEqualUint8Array(received: Uint8Array, argument: Uint8Array) {
    if (received.length !== argument.length) {
      return { pass: false, message: () => `expected ${received} to equal ${argument}` };
    }
    for (let i = 0; i < received.length; i++) {
      if (received[i] !== argument[i]) {
        return { pass: false, message: () => `expected ${received} to equal ${argument}` };
      }
    }
    return { pass: true, message: () => `expected ${received} not to equal ${argument}` };
  },
});

describe("generateSeed", () => {
  const phrases = new Array(100).map(() => generatePhrase());

  it.each(phrases)("generated phrase '%s' should be a valid phrase", (phrase) => {
    const [valid] = validatePhrase(phrase);
    expect(valid).toBeTruthy();
  });
});

describe("validatePhrase", () => {
  it.each(validSeeds)("validatePhrase should return true for phrase '%s'", (phrase) => {
    const [valid, error] = validatePhrase(phrase);
    expect(error).toEqual("");
    expect(valid).toBeTruthy();
  });

  const invalidSeeds: Array<[string, string]> = [
    // 14 words
    [
      "abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey pastry abbey",
      "Phrase must be '15' words long, was '14'",
    ],
    // 16 words
    [
      "abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey",
      "Phrase must be '15' words long, was '16'",
    ],
    // Word is too short
    ["ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ", "Word 1 is not at least 3 letters long"],
    // Unrecognized prefix
    [
      "abzey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey",
      'Unrecognized prefix "abz" at word 1, not found in dictionary',
    ],
    // 13th word falls outside first 256 words
    [
      "eggs abbey eggs abbey eggs abbey eggs abbey eggs abbey eggs abbey eight abbey eggs",
      "Prefix for word 13 must be found in the first 256 words of the dictionary",
    ],
  ];

  it.each(invalidSeeds)("validatePhrase should return false for phrase %s", (seed, expectedError) => {
    const [valid, error] = validatePhrase(seed);
    expect(valid).toBeFalsy();
    expect(error).toEqual(expectedError);
  });
});

describe("hashToChecksumWords", () => {
  it("should convert completely filled hash bytes to checksum words", () => {
    const hashBytes = new Uint8Array(64).fill(0xff);
    const checksumWords = hashToChecksumWords(hashBytes);
    expect(checksumWords[0]).toEqual(1023);
    expect(checksumWords[1]).toEqual(1023);
  });

  it("should convert custom bytes to checksum words", () => {
    const hashBytes = new Uint8Array([0b01011100, 0b00110011, 0b01010101]);
    const checksumWords = hashToChecksumWords(hashBytes);
    expect(checksumWords[0]).toEqual(0b0101110000);
    expect(checksumWords[1]).toEqual(0b1100110101);
  });
});

describe("phraseToSeed/seedToPhrase", () => {
  it.each(validDictionarySeeds)(
    "phraseToSeed should convert valid dictionary phrase '%s' and seedToPhrase should convert it back to the original phrase",
    (phrase) => {
      const seed = phraseToSeed(phrase);
      const returnedPhrase = seedToPhrase(seed);
      expect(returnedPhrase).toEqual(sanitizePhrase(phrase));
    }
  );
});

describe("seedWordsToSeed", () => {
  it("should convert completely filled seed words to an array of seed bytes", () => {
    const seedWords = new Uint16Array(13).fill(1023);
    const seed = seedWordsToSeed(seedWords);
    expect(seed).toEqualUint8Array(new Uint8Array(16).fill(0xff));
  });

  it("should convert custom seed words to an array of seed bytes", () => {
    const seedWords = new Uint16Array([
      0b0101110001, 0b1000110011, 0b1001010101, 0b0101110010, 0b0100010100, 0b1101111111, 0b0000000001, 0b1111111110,
      0b0001111000, 0b1111000001, 0b0111001100, 0b0110100111, 0b11100101,
    ]);
    const seed = seedWordsToSeed(seedWords);

    expect(seed[0]).toEqual(0b01011100);
    expect(seed[1]).toEqual(0b01100011);
    expect(seed[2]).toEqual(0b00111001);
    expect(seed[3]).toEqual(0b01010101);
    expect(seed[4]).toEqual(0b01110010);
    expect(seed[5]).toEqual(0b01000101);
    expect(seed[6]).toEqual(0b00110111);
    expect(seed[7]).toEqual(0b11110000);

    expect(seed[8]).toEqual(0b00000111);
    expect(seed[9]).toEqual(0b11111110);
    expect(seed[10]).toEqual(0b00011110);
    expect(seed[11]).toEqual(0b00111100);
    expect(seed[12]).toEqual(0b00010111);
    expect(seed[13]).toEqual(0b00110001);
    expect(seed[14]).toEqual(0b10100111);
    expect(seed[15]).toEqual(0b11100101);
  });
});
