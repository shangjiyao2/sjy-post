import React, { useEffect } from 'react';
import TitleBar from './TitleBar';
import NavRail from '../NavRail/NavRail';
import Sidebar from '../Sidebar/Sidebar';
import TabBar from '../TabBar/TabBar';
import ContentArea from './ContentArea';
import { isQaPreset } from '../../browserQaPreset';
import { useNavStore } from '../../stores/navStore';
import { useProjectStore } from '../../stores/projectStore';
import { useGlobalEnvironmentStore } from '../../stores/globalEnvironmentStore';
import { useAppShellStore } from '../../stores/appShellStore';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  const activeNavItem = useNavStore((s) => s.activeNavItem);
  const setActiveNavItem = useNavStore((s) => s.setActiveNavItem);
  const restoreCollections = useProjectStore((s) => s.restoreCollections);
  const collectionCount = useProjectStore((s) => Object.keys(s.collections).length);
  const hideWelcome = useAppShellStore((s) => s.hideWelcome);
  const loadEnvironments = useGlobalEnvironmentStore((s) => s.loadEnvironments);
  const qaPreset = new URLSearchParams(globalThis.location.search).get('qa');

  useEffect(() => {
    if (!isQaPreset(qaPreset)) {
      restoreCollections();
    }
    loadEnvironments();
  }, [loadEnvironments, qaPreset, restoreCollections]);

  if (qaPreset === 'welcome' && !hideWelcome && collectionCount === 0) {
    return (
      <div className="main-layout">
        <div className="main-content">
          <div className="workspace">
            <ContentArea />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-layout">
      <div className="main-content">
        <NavRail activeItem={activeNavItem} onItemChange={setActiveNavItem} />
        {activeNavItem === 'collections' && <Sidebar activeNavItem={activeNavItem} />}
        <div className="workspace">
          <TitleBar />
          {activeNavItem === 'collections' && <TabBar />}
          <ContentArea />
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
