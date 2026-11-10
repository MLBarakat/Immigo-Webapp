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

/**
 * Stored verbatim in `user_settings.learning_goal` when the learner chooses
 * every category. It is deliberately human-readable because the column is a
 * plain text note and older clients may display it as-is.
 */
export const ALL_FOCUS_AREAS = 'All focus areas';
export const MAX_FOCUS_CATEGORIES = 3;

export function isAllFocusAreas(value: string | null | undefined): boolean {
  return normalize(value ?? '') === normalize(ALL_FOCUS_AREAS);
}

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
  allFocusAreas: boolean;
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
  if (isAllFocusAreas(value)) return { selectedIds: [], other: '', allFocusAreas: true };
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
  // An empty goal means the learner has not narrowed anything yet, so the
  // selector opens on the same "All focus areas" option that gets stored.
  return { selectedIds, other: other.join('; '), allFocusAreas: chunks.length === 0 };
}

/** Saves selected categories using the active bank edition's labels. */
export function serializeLearningGoal(
  selectedIds: string[],
  other: string,
  version: FocusTestVersion,
  allFocusAreas = false,
): string {
  if (allFocusAreas) return ALL_FOCUS_AREAS;
  const parts = selectedIds
    .map(id => CATEGORY_TITLES[id]?.[version])
    .filter((label): label is string => Boolean(label));
  const cleanOther = other.trim();
  if (cleanOther) parts.push(cleanOther);
  return parts.join('; ');
}
