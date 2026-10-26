interface Rule {
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: Rule[] = [
  { label: 'At least 8 characters', test: password => password.length >= 8 },
  { label: 'Lowercase letter (a-z)', test: password => /[a-z]/.test(password) },
  { label: 'Uppercase letter (A-Z)', test: password => /[A-Z]/.test(password) },
  { label: 'Number (0-9)', test: password => /[0-9]/.test(password) },
  { label: 'Symbol (!@#$...)', test: password => /[^a-zA-Z0-9]/.test(password) },
];

export function getPasswordStrength(password: string): number {
  return PASSWORD_RULES.reduce((score, rule) => score + Number(rule.test(password)), 0);
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password));
}
