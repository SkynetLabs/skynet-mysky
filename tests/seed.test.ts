import { generatePhrase, validatePhrase } from "../scripts/seed-display";

describe("generateSeed", () => {
  const seeds = new Array(100).map(() => generatePhrase());

  it.each(seeds)("generated seed %s should be a valid seed", (seed) => {
    const [valid] = validatePhrase(seed);
    expect(valid).toBeTruthy();
  });
});

describe("validateSeed", () => {
  const validSeeds = [
    // Single word
    " abbey    abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey amidst punch   ",
    "yanks yanks yanks yanks yanks yanks yanks yanks yanks yanks yanks yanks eggs voyage topic  ",
    // Words not in dictionary but with valid prefixes
    "abb about yanked yah unctuous spry mayflower malodious jabba irish gazebo bombastic eggplant acer avoidance",
  ];

  it.each(validSeeds)("validateSeed should return true for phrase %s", (seed) => {
    const [valid, error] = validatePhrase(seed);
    expect(error).toEqual("");
    expect(valid).toBeTruthy();
  });

  const invalidSeeds: Array<[string, string]> = [
    // 14 words
    [
      "abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey pastry abbey",
      "Phrase must be 15 words long, was 14",
    ],
    // 16 words
    [
      "abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey abbey",
      "Phrase must be 15 words long, was 16",
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

  it.each(invalidSeeds)("validateSeed should return false for phrase %s", (seed, expectedError) => {
    const [valid, error] = validatePhrase(seed);
    expect(valid).toBeFalsy();
    expect(error).toEqual(expectedError);
  });
});
