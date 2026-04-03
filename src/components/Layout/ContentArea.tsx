import React from 'react';
import { useNavStore } from '../../stores/navStore';
import RequestWorkspace from '../Editor/RequestWorkspace';
import ApiDocViewer from './ApiDocViewer';
import JavaEndpointsViewer from './JavaEndpointsViewer';
import PermissionConfigViewer from './PermissionConfigViewer';
import HistoryViewer from './HistoryViewer';
import EnvironmentsViewer from './EnvironmentsViewer';
import SettingsViewer from './SettingsViewer';
import './ContentArea.css';

const ContentArea: React.FC = () => {
  const activeNavItem = useNavStore((s) => s.activeNavItem);

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
