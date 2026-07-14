/**
 * Rotating home-screen greeting. Picks a template deterministically from the
 * day of the year, so it stays put for a whole session/day and then varies on
 * the next visit — not a fresh random pick on every render.
 */
const GREETINGS: ((name: string) => string)[] = [
  (name) => `Welcome back, ${name}`,
  (name) => `What's new, ${name}?`,
  (name) => `Good to see you, ${name}`,
  (name) => `Hey, ${name}`,
  (name) => `Ready to write, ${name}?`,
];

export function pickGreeting(name: string, dayStamp: number = Date.now()): string {
  const dayIndex = Math.floor(dayStamp / 86_400_000);
  const template = GREETINGS[dayIndex % GREETINGS.length];
  return template(name);
}
