export type PasswordRuleKey = 'minLength' | 'lowercase' | 'uppercase' | 'number' | 'symbol';

interface Rule {
  key: PasswordRuleKey;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: Rule[] = [
  { key: 'minLength', test: password => password.length >= 8 },
  { key: 'lowercase', test: password => /[a-z]/.test(password) },
  { key: 'uppercase', test: password => /[A-Z]/.test(password) },
  { key: 'number', test: password => /[0-9]/.test(password) },
  { key: 'symbol', test: password => /[^a-zA-Z0-9]/.test(password) },
];

export function getPasswordStrength(password: string): number {
  return PASSWORD_RULES.reduce((score, rule) => score + Number(rule.test(password)), 0);
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password));
}
