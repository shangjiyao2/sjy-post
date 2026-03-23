import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isQaPreset } from './browserQaPreset';
import './assets/styles/index.css';

const renderApp = () => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

const qaPreset = new URLSearchParams(globalThis.location.search).get('qa');

if (isQaPreset(qaPreset)) {
  const { bootstrapBrowserQa } = await import('./browserQaMock');
  bootstrapBrowserQa();
}

renderApp();
