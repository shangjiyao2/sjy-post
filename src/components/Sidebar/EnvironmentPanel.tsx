import React from 'react';
import EnvironmentManager from '../Environment/EnvironmentManager';

const EnvironmentPanel: React.FC = () => {
  return (
    <div className="environment-panel">
      <EnvironmentManager />
    </div>
  );
};

export default EnvironmentPanel;
