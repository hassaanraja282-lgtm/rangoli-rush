// Local-only persistence (no accounts, no network): tutorial flag,
// best scores/stars per level, and the Daily Rangoli streak.
import { dateKey } from './patterns.js';

const KEY = 'rangoli-rush.v1';

export interface SaveData {
  tutorialDone: boolean;
  best: Record<string, { score: number; stars: number }>;
  daily: {
    lastCompleted: string | null; // YYYY-MM-DD
    streak: number;
    bestStreak: number;
    history: Record<string, number>; // date -> best score
  };
}

function fresh(): SaveData {
  return {
    tutorialDone: false,
    best: {},
    daily: { lastCompleted: null, streak: 0, bestStreak: 0, history: {} },
  };
}

let cache: SaveData | null = null;

export function load(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
  } catch {
    cache = fresh();
  }
  return cache!;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* storage may be unavailable (private mode); game still works */
  }
}

export function recordLevel(id: string, score: number, stars: number) {
  const d = load();
  const prev = d.best[id];
  if (!prev || score > prev.score || stars > prev.stars) {
    d.best[id] = {
      score: Math.max(score, prev?.score ?? 0),
      stars: Math.max(stars, prev?.stars ?? 0),
    };
  }
  save();
}

function daysBetween(a: string, b: string) {
  const pa = new Date(a + 'T00:00:00');
  const pb = new Date(b + 'T00:00:00');
  return Math.round((pb.getTime() - pa.getTime()) / 86400000);
}

/** Current streak as it stands today (0 if a day was missed). */
export function currentStreak(today = dateKey()): number {
  const d = load().daily;
  if (!d.lastCompleted) return 0;
  const gap = daysBetween(d.lastCompleted, today);
  return gap <= 1 ? d.streak : 0;
}

export function dailyDoneToday(today = dateKey()): boolean {
  return load().daily.lastCompleted === today;
}

export function recordDaily(score: number, today = dateKey()) {
  const d = load().daily;
  d.history[today] = Math.max(score, d.history[today] ?? 0);
  if (d.lastCompleted !== today) {
    const gap = d.lastCompleted ? daysBetween(d.lastCompleted, today) : 99;
    d.streak = gap === 1 ? d.streak + 1 : 1;
    d.lastCompleted = today;
    d.bestStreak = Math.max(d.bestStreak, d.streak);
  }
  save();
  return d.streak;
}
