import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Returns the image path only when the file is really in /public, so a missing photo falls back to
 * the card's placeholder pattern instead of a broken background. Runs at build time (static pages). */
export const publicImage = (src?: string): string | undefined =>
  src && existsSync(join(process.cwd(), 'public', src)) ? src : undefined;
