import { DisplayUser } from '../types/user';

interface UserProfileProps {
  readonly user: DisplayUser;
}

export interface UserProfile {
    id: string;
    full_name: string;
    language: string;
}
