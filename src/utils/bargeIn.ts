import type { BargeIn } from '../types/settings';

export function getBargeInHoldDurationMs(style: BargeIn): number {
  switch (style) {
    case 'aggressive':
      return 0;
    case 'balanced':
      return 150;
    case 'relaxed':
      return 400;
  }
}
