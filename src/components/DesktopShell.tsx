import type { ReactElement } from 'react';
import type { LifeOSModule, UserProfile } from '../types/task';
import type { VDNotification } from '../types/notification';
import { LifeOSNav } from './LifeOSNav';
import { MobileBottomNav } from './MobileBottomNav';

interface DesktopShellProps {
  activeModule: LifeOSModule;
  profile: UserProfile;
  isSignedIn: boolean;
  isCloudLoading: boolean;
  syncStateLabel: string;
  content: ReactElement;
  onModuleChange: (module: LifeOSModule) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  notifications: VDNotification[];
  onMarkNotificationRead: (id: string) => void;
}

export function DesktopShell({ activeModule, profile, isSignedIn, isCloudLoading, syncStateLabel, content, onModuleChange, onSignIn, onSignOut, notifications, onMarkNotificationRead }: DesktopShellProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
      <LifeOSNav
        activeModule={activeModule}
        profile={profile}
        isSignedIn={isSignedIn}
        isCloudLoading={isCloudLoading}
        syncStateLabel={syncStateLabel}
        onModuleChange={onModuleChange}
        onOpenProfile={() => onModuleChange('me')}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        notifications={notifications}
        onMarkNotificationRead={onMarkNotificationRead}
      />
      <div key={activeModule} className="animate-module-fade">{content}</div>
      <MobileBottomNav activeModule={activeModule} onModuleChange={onModuleChange} />
    </div>
  );
}
