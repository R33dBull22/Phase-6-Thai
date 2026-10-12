// Only the SHA-256 hash of the required registration passcode is stored here.
// The raw plaintext password is never committed or present in source code.
export const REGISTRATION_PASSCODE_HASH =
  '37c9951b34c6841108e527f77a53325ec68e8ec98a07bb6a68e73c1a1436f68d';

/**
 * Validates the user-entered registration passcode against the stored SHA-256 hash.
 */
export async function verifyRegistrationPasscode(passcode: string): Promise<boolean> {
  if (!passcode || typeof passcode !== 'string') return false;
  const trimmed = passcode.trim();
  if (!trimmed) return false;

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(trimmed);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex.toLowerCase() === REGISTRATION_PASSCODE_HASH.toLowerCase();
  } catch (err) {
    console.error('Hash verification error:', err);
    return false;
  }
}
