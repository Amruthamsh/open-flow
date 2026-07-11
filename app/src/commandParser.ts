export type ParsedCommand =
  | { type: 'launchApp'; packageName: string; label: string }
  | { type: 'search'; query: string }
  | { type: 'ask'; prompt: string };

const APP_ALIASES: { keywords: string[]; packageName: string; label: string }[] = [
  { keywords: ['whatsapp'], packageName: 'com.whatsapp', label: 'WhatsApp' },
  {
    keywords: ['youtube'],
    packageName: 'com.google.android.youtube',
    label: 'YouTube',
  },
  { keywords: ['chrome'], packageName: 'com.android.chrome', label: 'Chrome' },
];

export function parseCommand(transcript: string): ParsedCommand {
  const text = transcript.trim().toLowerCase();

  const openMatch = text.match(/^open\s+(.+)$/);
  if (openMatch) {
    const target = openMatch[1].trim();
    const app = APP_ALIASES.find(a => a.keywords.some(k => target.includes(k)));
    if (app) {
      return { type: 'launchApp', packageName: app.packageName, label: app.label };
    }
  }

  const searchOnGoogleMatch = text.match(/^search\s+(.+?)\s+on\s+google$/);
  if (searchOnGoogleMatch) {
    return { type: 'search', query: searchOnGoogleMatch[1].trim() };
  }

  const searchForMatch = text.match(/^search\s+for\s+(.+)$/);
  if (searchForMatch) {
    return { type: 'search', query: searchForMatch[1].trim() };
  }

  const googleMatch = text.match(/^google\s+(.+)$/);
  if (googleMatch) {
    return { type: 'search', query: googleMatch[1].trim() };
  }

  return { type: 'ask', prompt: transcript.trim() };
}
