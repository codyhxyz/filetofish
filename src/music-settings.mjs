export const DEFAULT_MUSIC_VOLUME = 0.7;
const KEY = "ftf.music.volume";

export function clampMusicVolume(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : DEFAULT_MUSIC_VOLUME;
}

export function readMusicVolume(storage) {
  try {
    const value = (storage || globalThis.localStorage).getItem(KEY);
    return value === null ? DEFAULT_MUSIC_VOLUME : clampMusicVolume(value);
  } catch (error) {
    return DEFAULT_MUSIC_VOLUME;
  }
}

export function writeMusicVolume(value, storage) {
  const volume = clampMusicVolume(value);
  try { (storage || globalThis.localStorage).setItem(KEY, String(volume)); } catch (error) { }
  return volume;
}
