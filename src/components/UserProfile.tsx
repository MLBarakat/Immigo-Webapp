import { DisplayUser } from '../types/user';

interface UserProfileProps {
  readonly user: DisplayUser;
}

export interface UserProfile {
    id: string;
    full_name: string;
    language: string;
}

export function UserBubble({ user }: UserProfileProps): JSX.Element {
  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-art-blue-100 text-art-blue-700 font-bold text-lg flex-shrink-0">
        {user.initials}
      </div>
    </div>
  );
}