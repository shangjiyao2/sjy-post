import React, { useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { useThemeStore } from './stores/themeStore';
import { useShortcuts } from './hooks/useShortcuts';
import { useAutoSave } from './hooks/useAutoSave';
import MainLayout from './components/Layout/MainLayout';
import './i18n';

const App: React.FC = () => {
  const skin = useThemeStore((s) => s.skin);
  const isDark = useThemeStore((s) => s.isDark);
  const { i18n } = useTranslation();

  // Register global shortcuts
  useShortcuts();

  // Enable auto-save with 3 second delay
  useAutoSave({ delay: 3000 });

  useEffect(() => {
    document.documentElement.dataset.theme = skin;
  }, [skin]);

  return (
    <ConfigProvider
      locale={i18n.language === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          // 以 CSS vars 为主；此处仅保留少量基础 token
          borderRadius: 4,
        },
      }}
    >
      <MainLayout />
    </ConfigProvider>
  );
};

export default App;
