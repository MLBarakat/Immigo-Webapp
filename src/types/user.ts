/**
* Defines the shape of a user object intended for display purposes.
* This simplifies prop management and decouples components from the full Supabase User object.
*/
export interface DisplayUser {
    name: string;
initials: string;
}