export type FocusTestVersion = '2008' | '2020';

export interface FocusCategory {
  id: string;
  label: string;
}

interface CategoryTitles {
  '2008': string;
  '2020': string;
}

/**
 * Official USCIS study categories, in bank order. Titles follow each bank
 * edition exactly; the two editions differ only in a few labels.
 */
const CATEGORY_TITLES: Record<string, CategoryTitles> = {
  'principles-of-american-democracy': {
    '2008': 'Principles of American Democracy',
    '2020': 'Principles of American Democracy',
  },
  'system-of-government': {
    '2008': 'System of Government',
    '2020': 'System of Government',
  },
  'rights-and-responsibilities': {
    '2008': 'Rights and Responsibilities',
    '2020': 'Rights and Responsibilities',
  },
  'colonial-period-and-independence': {
    '2008': 'Colonial Period and Independence',
    '2020': 'Colonial Period and Independence',
  },
  '1800s': {
    '2008': 'The 1800s',
    '2020': '1800s',
  },
  'recent-history': {
    '2008': 'Recent American History',
    '2020': 'Recent American History and Other Important Historical Information',
  },
  geography: {
    '2008': 'Geography',
    '2020': 'Geography',
  },
  symbols: {
    '2008': 'Symbols',
    '2020': 'Symbols',
  },
  holidays: {
    '2008': 'Holidays',
    '2020': 'Holidays',
  },
};

export const FOCUS_CATEGORY_IDS = Object.keys(CATEGORY_TITLES);

export function getFocusCategories(version: FocusTestVersion): FocusCategory[] {
  return FOCUS_CATEGORY_IDS.map(id => ({
    id,
    label: CATEGORY_TITLES[id][version],
  }));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function findCategoryId(chunk: string): string | null {
  const normalized = normalize(chunk);
  for (const id of FOCUS_CATEGORY_IDS) {
    const titles = CATEGORY_TITLES[id];
    if (normalize(titles['2008']) === normalized || normalize(titles['2020']) === normalized) {
      return id;
    }
  }
  return null;
}

export interface ParsedLearningGoal {
  selectedIds: string[];
  other: string;
}

/**
 * Reads a saved goal (categories joined with "; ") into checkbox ids and the
 * free-text Other value. Unrecognized chunks are preserved as Other text so a
 * hand-written goal is never lost.
 */
export function parseLearningGoal(
  value: string | null | undefined,
  _version: FocusTestVersion,
): ParsedLearningGoal {
  const chunks = (value ?? '')
    .split(';')
    .map(chunk => chunk.trim())
    .filter(Boolean);
  const selectedIds: string[] = [];
  const other: string[] = [];
  for (const chunk of chunks) {
    const id = findCategoryId(chunk);
    if (id && !selectedIds.includes(id)) selectedIds.push(id);
    else if (!id) other.push(chunk);
  }
  return { selectedIds, other: other.join('; ') };
}

/** Saves selected categories using the active bank edition's labels. */
export function serializeLearningGoal(
  selectedIds: string[],
  other: string,
  version: FocusTestVersion,
): string {
  const parts = selectedIds
    .map(id => CATEGORY_TITLES[id]?.[version])
    .filter((label): label is string => Boolean(label));
  const cleanOther = other.trim();
  if (cleanOther) parts.push(cleanOther);
  return parts.join('; ');
}
