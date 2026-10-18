// A write-only secret (API key, gateway password) in a settings form - masked on screen but NOT a password field, so the
// browser's password manager never offers to "save" a merchant key as a website login (owner's report, 2026-10-10).
export const secretInputProps = {
  type: 'text', autoComplete: 'off', spellCheck: false, 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-form-type': 'other',
  style: { WebkitTextSecurity: 'disc' },
}
