import type { ReactElement } from 'react';
import type { LifeOSModule, UserProfile } from '../types/task';
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
}

export function DesktopShell({ activeModule, profile, isSignedIn, isCloudLoading, syncStateLabel, content, onModuleChange, onSignIn, onSignOut }: DesktopShellProps) {
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
      />
      <div key={activeModule} className="animate-module-fade">{content}</div>
      <MobileBottomNav activeModule={activeModule} onModuleChange={onModuleChange} />
    </div>
  );
}
