import dynamicAnswersJson from '../civics-dynamic-answers.json';
import type { CivicsItem } from './types';

type FederalAnswerField =
  | 'president'
  | 'vicePresident'
  | 'supremeCourtJustices'
  | 'chiefJustice'
  | 'presidentParty'
  | 'speaker';
type StateAnswerField = 'senators' | 'representatives' | 'governor' | 'capital';
type DynamicAnswerSource = `federal.${FederalAnswerField}` | `state.${StateAnswerField}`;

interface StateAnswers {
  name: string;
  capital: string[];
  senators: string[];
  representatives: string[];
  governor: string[];
}

interface DynamicAnswersData {
  questions: Record<string, DynamicAnswerSource>;
  federal: Record<FederalAnswerField, string[]>;
  states: Record<string, StateAnswers>;
}

const dynamicAnswers = dynamicAnswersJson as DynamicAnswersData;

export function dynamicAnswersRequireLocation(itemId: string): boolean {
  return dynamicAnswers.questions[itemId]?.startsWith('state.') ?? false;
}

export function getDynamicAnswers(itemId: string, locationState?: string | null): string[] {
  const source = dynamicAnswers.questions[itemId];
  if (!source) return [];

  switch (source) {
    case 'federal.president':
      return [...dynamicAnswers.federal.president];
    case 'federal.vicePresident':
      return [...dynamicAnswers.federal.vicePresident];
    case 'federal.supremeCourtJustices':
      return [...dynamicAnswers.federal.supremeCourtJustices];
    case 'federal.chiefJustice':
      return [...dynamicAnswers.federal.chiefJustice];
    case 'federal.presidentParty':
      return [...dynamicAnswers.federal.presidentParty];
    case 'federal.speaker':
      return [...dynamicAnswers.federal.speaker];
    default: {
      if (!locationState) return [];
      const state = dynamicAnswers.states[locationState.toUpperCase()];
      if (!state) return [];
      switch (source) {
        case 'state.senators':
          return [...state.senators];
        case 'state.representatives':
          return [...state.representatives];
        case 'state.governor':
          return [...state.governor];
        case 'state.capital':
          return [...state.capital];
      }
    }
  }
  return [];
}

export function withDynamicAnswers(item: CivicsItem, locationState?: string | null): CivicsItem {
  if (item.kind !== 'dynamic') return item;
  return { ...item, acceptableAnswers: getDynamicAnswers(item.id, locationState) };
}
