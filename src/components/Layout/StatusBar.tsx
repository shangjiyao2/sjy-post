import React from 'react';
import { useTranslation } from 'react-i18next';
import './StatusBar.css';

const StatusBar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className="status-item">{t('app.ready')}</span>
      </div>
      <div className="status-bar-right">
        <span className="status-item">v0.1.0</span>
      </div>
    </div>
  );
};

export default StatusBar;
