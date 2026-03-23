import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './TitleBar.css';

const TitleBar: React.FC = () => {
  const handleMinimize = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  };

  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar-right">
        <button className="window-btn minimize" onClick={handleMinimize} aria-label="Minimize">
          <span className="window-icon minimize" />
        </button>
        <button className="window-btn maximize" onClick={handleMaximize} aria-label="Maximize">
          <span className="window-icon maximize" />
        </button>
        <button className="window-btn close" onClick={handleClose} aria-label="Close">
          <span className="window-icon close" />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
