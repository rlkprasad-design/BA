// Player-scoped localStorage helpers. Every piece of per-player state
// (draw queues, exposure counts, totals, ramps) MUST go through
// playerScopedKey so progress never leaks between names on a shared device.

export function playerScopedKey(baseKey, playerName) {
  return `${baseKey}.${playerName}`;
}

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readPlayerJson(baseKey, playerName, fallback) {
  return readJson(playerScopedKey(baseKey, playerName), fallback);
}

export function writePlayerJson(baseKey, playerName, value) {
  writeJson(playerScopedKey(baseKey, playerName), value);
}
