import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { PASSWORD_RULES } from '../utils/passwordStrength';

const STRENGTH_KEYS = ['weak', 'fair', 'moderate', 'strong', 'veryStrong'] as const;

interface PasswordStrengthCheckerProps {
  password: string;
}

export function PasswordStrengthChecker({ password }: PasswordStrengthCheckerProps): JSX.Element {
  const { t } = useTranslation('common');
  const results = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ key: rule.key, met: rule.test(password) })),
    [password],
  );

  const strength = results.filter((r) => r.met).length;

  const strengthLabel = strength > 0
    ? t(`password.strength.${STRENGTH_KEYS[strength - 1]}`)
    : '';
  const strengthColor = [
    '',
    'bg-art-red-500',
    'bg-orange-400',
    'bg-yellow-400',
    'bg-lime-500',
    'bg-emerald-500',
  ][strength] ?? 'bg-immigo-gray-200';

  if (!password) return <></>;

  return (
    <div className="mt-2 space-y-2" aria-live="polite" aria-label={t('password.feedbackLabel')}>
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1 h-1.5">
          {[1, 2, 3, 4, 5].map((seg) => (
            <div
              key={seg}
              className={`flex-1 rounded-full transition-colors duration-300 ${
                seg <= strength ? strengthColor : 'bg-immigo-gray-200'
              }`}
            />
          ))}
        </div>
        <span
          className={`text-xs font-semibold transition-colors duration-300 ${
            strength <= 1
              ? 'text-art-red-600'
              : strength <= 2
              ? 'text-orange-500'
              : strength <= 3
              ? 'text-yellow-600'
              : 'text-emerald-600'
          }`}
        >
          {strengthLabel}
        </span>
      </div>

      {/* Rule checklist */}
      <ul className="space-y-1">
        {results.map(({ key, met }) => (
          <li key={key} className="flex items-center gap-2 text-xs">
            {met ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
            ) : (
              <X className="w-3.5 h-3.5 text-art-red-500 shrink-0" aria-hidden="true" />
            )}
            <span className={met ? 'text-emerald-700' : 'text-art-red-600'}>
              {t(`password.rules.${key}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
