import React, { useEffect, useMemo } from 'react';
import { useNavStore } from '../../stores/navStore';
import { useAppShellStore } from '../../stores/appShellStore';
import { useProjectStore } from '../../stores/projectStore';
import RequestWorkspace from '../Editor/RequestWorkspace';
import WelcomePanel from '../Welcome/WelcomePanel';
import ApiDocViewer from './ApiDocViewer';
import JavaEndpointsViewer from './JavaEndpointsViewer';
import PermissionConfigViewer from './PermissionConfigViewer';
import HistoryViewer from './HistoryViewer';
import EnvironmentsViewer from './EnvironmentsViewer';
import SettingsViewer from './SettingsViewer';
import './ContentArea.css';

const ContentArea: React.FC = () => {
  const activeNavItem = useNavStore((s) => s.activeNavItem);
  const collectionCount = useProjectStore((s) => Object.keys(s.collections).length);
  const hideWelcome = useAppShellStore((s) => s.hideWelcome);
  const hasShownWelcome = useAppShellStore((s) => s.hasShownWelcome);
  const markWelcomeShown = useAppShellStore((s) => s.markWelcomeShown);
  const qaPreset = new URLSearchParams(globalThis.location.search).get('qa');
  const forceWelcomeQa = qaPreset === 'welcome' && !hideWelcome && collectionCount === 0;

  const shouldShowWelcome = useMemo(
    () => !forceWelcomeQa && activeNavItem === 'collections' && !hideWelcome && !hasShownWelcome,
    [activeNavItem, forceWelcomeQa, hasShownWelcome, hideWelcome],
  );

  useEffect(() => {
    if (shouldShowWelcome) {
      markWelcomeShown();
    }
  }, [markWelcomeShown, shouldShowWelcome]);

  if (activeNavItem === 'javaImport') {
    return (
      <div className="content-area no-card">
        <JavaEndpointsViewer />
      </div>
    );
  }

  if (activeNavItem === 'apiDocs') {
    return (
      <div className="content-area no-card">
        <ApiDocViewer />
      </div>
    );
  }

  if (activeNavItem === 'permissionConfig') {
    return (
      <div className="content-area no-card">
        <PermissionConfigViewer />
      </div>
    );
  }

  if (activeNavItem === 'history') {
    return (
      <div className="content-area no-card">
        <HistoryViewer />
      </div>
    );
  }

  if (activeNavItem === 'environments') {
    return (
      <div className="content-area no-card">
        <EnvironmentsViewer />
      </div>
    );
  }

  if (activeNavItem === 'settings') {
    return (
      <div className="content-area no-card">
        <SettingsViewer />
      </div>
    );
  }

  if (forceWelcomeQa || shouldShowWelcome) {
    return (
      <div className="content-area no-card">
        <WelcomePanel />
      </div>
    );
  }

  if (activeNavItem === 'collections') {
    return (
      <div className="content-area no-card collections-content-area">
        <RequestWorkspace />
      </div>
    );
  }

  return <div className="content-area" />;
};

export default ContentArea;
