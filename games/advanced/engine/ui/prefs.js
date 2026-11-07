// Device preferences for the Advanced Games (both games share them). They live in this browser only (localStorage), NOT on the
// server, on purpose: the server profile only knows the original settings, and these are per-device comforts anyway
// (a student may want on-screen buttons on the phone but not on the laptop).
// Every access is guarded: blocked storage must never break the game.

export const PREF_KEY = 'wha_adv_prefs_v1';

export const DEFAULT_PREFS = {
  engine: true,          // Racer: car engine hum
  ambient: true,         // birds (day) / breeze + crickets (night)
  touchButtons: null,    // on-screen Left / Right / Go buttons: null = automatic (on for touch screens), true / false = the student's choice
  place: 'highway',      // Racer scenery: highway | city | offroad | snow | coast   (some unlock with rank)
  car: 'street',         // Racer car body (unlocks with rank)
  lights: false,         // Racer: headlight beams at night (unlocks with rank)
  coach: { racer: false, defense: false },   // "how to play" card already shown once on this device
  confirmChosen: false,  // Defense: the student has set "Confirm tap" themselves (until then classes 6-8 get it ON by default)
};

const PLACES = ['highway', 'city', 'offroad', 'snow', 'coast'];
const CARS = ['street', 'sport', 'super', 'hyper'];

export function sanitizePrefs(p) {
  const out = { ...DEFAULT_PREFS, coach: { ...DEFAULT_PREFS.coach } };
  if (!p || typeof p !== 'object') return out;
  if (typeof p.engine === 'boolean') out.engine = p.engine;
  if (typeof p.ambient === 'boolean') out.ambient = p.ambient;
  if (typeof p.touchButtons === 'boolean') out.touchButtons = p.touchButtons;
  if (PLACES.includes(p.place)) out.place = p.place;
  if (CARS.includes(p.car)) out.car = p.car;
  if (typeof p.lights === 'boolean') out.lights = p.lights;
  if (typeof p.confirmChosen === 'boolean') out.confirmChosen = p.confirmChosen;
  if (p.coach && typeof p.coach === 'object') { out.coach.racer = !!p.coach.racer; out.coach.defense = !!p.coach.defense; }
  return out;
}

export function loadPrefs(storage) {
  try {
    const st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const raw = st && st.getItem(PREF_KEY);
    return sanitizePrefs(raw ? JSON.parse(raw) : null);
  } catch (e) { return sanitizePrefs(null); }
}

export function savePrefs(prefs, storage) {
  try {
    const st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (st) st.setItem(PREF_KEY, JSON.stringify(prefs));
    return true;
  } catch (e) { return false; }
}

/** Are the on-screen buttons shown? Automatic = yes on touch screens (coarse pointer), no on a computer. */
export function touchButtonsOn(prefs, coarse) {
  if (typeof prefs.touchButtons === 'boolean') return prefs.touchButtons;
  if (typeof coarse === 'boolean') return coarse;
  try { return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
}
