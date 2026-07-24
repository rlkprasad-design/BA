// A small, varied pool of first-person affirmations shown after every
// completed round, regardless of mode - one is picked at random each time
// so a player doesn't see the exact same line every round. Kept separate
// from marks/tokens on purpose: these are about character and effort, not
// performance, so they show up the same way whether a round went well or
// a lot of answers were shown rather than found.
export const AFFIRMATIONS = [
  'I am a bright student.',
  'I am a sincere student.',
  'I am a hardworking student.',
  'I am an honest person.',
  'I am a kind and thoughtful person.',
  'I am curious and love learning new things.',
  'I am resilient - I keep going even when it is hard.',
  'I am disciplined and finish what I start.',
  'I am creative and think in new ways.',
  'I am confident in my abilities.',
  'I am respectful of others.',
  'I am responsible and dependable.',
  'I am patient with myself as I learn.',
  'I am brave enough to try new things.',
  'I am humble and open to feedback.',
  'I am focused and give my best effort.',
  'I am generous with my time and help.',
  'I am trustworthy and keep my word.',
  'I am optimistic about what I can achieve.',
  'I am a good listener and a good friend.',
  'I am fair and treat others with integrity.',
  'I am growing a little more every day.',
];

export function randomAffirmation() {
  return AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
}
