/**
 * Optional Amplify outputs loader.
 *
 * `amplify_outputs.json` is generated per environment and is intentionally
 * gitignored. A static JSON import makes a fresh clone and CI fail before the
 * build even starts, so we use a Vite glob and treat a missing file as an empty
 * configuration. Deployments still generate the real file before building.
 */
export interface AmplifyOutputs {
  custom?: {
    apiBaseUrl?: string;
    API_URL?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const modules = import.meta.glob<{ default: AmplifyOutputs }>('../../amplify_outputs.json', {
  eager: true,
});

export const amplifyOutputs: AmplifyOutputs | null =
  modules['../../amplify_outputs.json']?.default ?? null;

export const apiBaseUrl: string =
  amplifyOutputs?.custom?.apiBaseUrl || amplifyOutputs?.custom?.API_URL || '';
