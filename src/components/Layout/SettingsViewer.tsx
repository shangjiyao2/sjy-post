import React, { useMemo, useRef, useState } from 'react';
import { Button, Empty, message } from 'antd';
import { CheckOutlined, GlobalOutlined, SettingOutlined, SkinOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useThemeStore } from '../../stores/themeStore';
import { DEFAULT_VISIBLE_NAV_ITEMS, useNavStore, type ConfigurableNavRailItem } from '../../stores/navStore';
import { SearchIcon } from '../Sidebar/TreeIcons';
import { useHorizontalPaneResize } from '../../hooks/useHorizontalPaneResize';
import './SettingsViewer.css';
import './SplitPaneDivider.css';

type SettingsSection = 'general' | 'appearance' | 'navigation';

const SettingsViewer: React.FC = () => {
  const { t, i18n } = useTranslation();
  const skin = useThemeStore((s) => s.skin);
  const setSkin = useThemeStore((s) => s.setSkin);
  const visibleNavItems = useNavStore((s) => s.visibleNavItems);
  const [search, setSearch] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const {
    containerRef,
    isStacked,
    paneStyle,
    handleResizeKeyDown,
    handleResizeMouseDown,
  } = useHorizontalPaneResize({ initialWidth: 360, minWidth: 280, maxWidth: 460, minSecondaryWidth: 520, stackedBreakpoint: 1080 });

  const sectionRefs = useRef<Record<SettingsSection, HTMLDivElement | null>>({
    general: null,
    appearance: null,
    navigation: null,
  });

  const sections = useMemo(
    () => [
      {
        key: 'general' as const,
        title: t('settingsView.general'),
        icon: <GlobalOutlined />,
      },
      {
        key: 'appearance' as const,
        title: t('settingsView.appearance'),
        icon: <SkinOutlined />,
      },
      {
        key: 'navigation' as const,
        title: t('settingsView.navigation'),
        icon: <SettingOutlined />,
      },
    ],
    [t],
  );

  const filteredSections = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sections;
    return sections.filter((section) => section.title.toLowerCase().includes(keyword));
  }, [search, sections]);

  const navigationLabels = useMemo<Record<ConfigurableNavRailItem, string>>(
    () => ({
      collections: t('navRail.collections'),
      history: t('navRail.history'),
      environments: t('navRail.environments'),
      javaImport: t('navRail.javaImport'),
      apiDocs: t('navRail.apiDocs'),
      permissionConfig: t('navRail.permissionConfig'),
    }),
    [t],
  );

  const navigationEntries = useMemo<
    {
      key: ConfigurableNavRailItem;
      label: string;
      enabled: boolean;
      required: boolean;
      status: 'enabled' | 'hidden' | 'required';
      statusLabel: string;
    }[]
  >(
    () =>
      DEFAULT_VISIBLE_NAV_ITEMS.map((key) => {
        const required = key === 'collections';
        const enabled = visibleNavItems.includes(key);
        let status: 'enabled' | 'hidden' | 'required' = 'hidden';
        let statusLabel = t('settingsView.hidden');

        if (required) {
          status = 'required';
          statusLabel = t('settingsView.required');
        } else if (enabled) {
          status = 'enabled';
          statusLabel = t('settingsView.enabled');
        }

        return {
          key,
          label: navigationLabels[key],
          enabled,
          required,
          status,
          statusLabel,
        };
      }),
    [navigationLabels, t, visibleNavItems],
  );

  function handleToggleNavigationEntry(item: ConfigurableNavRailItem) {
    if (item === 'collections') {
      return;
    }

    useNavStore.getState().setNavItemVisible(item, !visibleNavItems.includes(item));
  }

  const handleLanguageChange = async (lang: 'zh' | 'en') => {
    if (i18n.language === lang) return;
    await i18n.changeLanguage(lang);
    localStorage.setItem('sjypost-lang', lang);
  };

  const handleCheckUpdates = async () => {
    if (isCheckingUpdate) return;

    try {
      setIsCheckingUpdate(true);
      message.loading({ content: t('app.checkingUpdates'), key: 'settings-updater' });

      const update = await check();

      if (!update) {
        message.success({ content: t('app.noUpdates'), key: 'settings-updater' });
        return;
      }

      message.loading({ content: t('app.updating'), key: 'settings-updater' });
      await update.downloadAndInstall();
      message.success({ content: t('app.updateSuccess'), key: 'settings-updater' });
      await relaunch();
    } catch (error) {
      message.error({ content: t('app.updateFailed', { error: String(error) }), key: 'settings-updater' });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSelectSection = (section: SettingsSection) => {
    setActiveSection(section);
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="settings-viewer" ref={containerRef}>
      <div className="settings-sidebar" style={paneStyle}>
        <div className="settings-sidebar-head">
          <div className="settings-sidebar-title">{t('settingsView.categories')}</div>
        </div>

        <label className="settings-sidebar-search" aria-label={t('settingsView.searchPlaceholder')}>
          <span className="settings-sidebar-search-icon">
            <SearchIcon />
          </span>
          <input
            className="settings-sidebar-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('settingsView.searchPlaceholder')}
          />
        </label>

        <div className="settings-sidebar-list">
          {filteredSections.length === 0 ? (
            <div className="settings-sidebar-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settingsView.noMatch')} />
            </div>
          ) : (
            filteredSections.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`settings-sidebar-item ${activeSection === section.key ? 'active' : ''}`}
                onClick={() => handleSelectSection(section.key)}
              >
                <span className="settings-sidebar-item-icon">{section.icon}</span>
                <span className="settings-sidebar-item-label">{section.title}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        className="split-pane-divider"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
        aria-label={t('settingsView.categories')}
        hidden={isStacked}
      />

      <div className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <div className="settings-panel-title">{t('settingsView.title')}</div>
            <div className="settings-panel-subtitle">{t('settingsView.summary')}</div>
          </div>
          <span className="settings-panel-chip">
            {t('settingsView.currentVersion')} {t('app.version')}
          </span>
        </div>

        <div className="settings-panel-sections">
          <div
            ref={(node) => {
              sectionRefs.current.general = node;
            }}
            className="settings-card"
          >
            <div className="settings-card-title">{t('settingsView.language')}</div>
            <div className="settings-card-desc">{t('settingsView.languageDesc')}</div>

            <div className="settings-option-row">
              <button
                type="button"
                className={`settings-choice ${i18n.language === 'zh' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('zh')}
              >
                <span>{t('settingsView.languageZh')}</span>
                {i18n.language === 'zh' && <CheckOutlined />}
              </button>
              <button
                type="button"
                className={`settings-choice ${i18n.language === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('en')}
              >
                <span>{t('settingsView.languageEn')}</span>
                {i18n.language === 'en' && <CheckOutlined />}
              </button>
            </div>

            <div className="settings-inline-card">
              <div>
                <div className="settings-inline-title">{t('settingsView.updates')}</div>
                <div className="settings-inline-desc">{t('settingsView.updatesDesc')}</div>
              </div>
              <Button type="primary" onClick={handleCheckUpdates} loading={isCheckingUpdate}>
                {t('settingsView.checkNow')}
              </Button>
            </div>
          </div>

          <div
            ref={(node) => {
              sectionRefs.current.appearance = node;
            }}
            className="settings-card"
          >
            <div className="settings-card-title">{t('settingsView.theme')}</div>
            <div className="settings-card-desc">{t('settingsView.themeDesc')}</div>

            <div className="settings-theme-grid">
              <button
                type="button"
                className={`settings-theme-card ${skin === 'light' ? 'active' : ''}`}
                onClick={() => setSkin('light')}
              >
                <span className="settings-theme-preview light" />
                <span>{t('app.themeLight')}</span>
                {skin === 'light' && <CheckOutlined />}
              </button>
              <button
                type="button"
                className={`settings-theme-card ${skin === 'dark' ? 'active' : ''}`}
                onClick={() => setSkin('dark')}
              >
                <span className="settings-theme-preview dark" />
                <span>{t('app.themeDark')}</span>
                {skin === 'dark' && <CheckOutlined />}
              </button>
              <button
                type="button"
                className={`settings-theme-card ${skin === 'black' ? 'active' : ''}`}
                onClick={() => setSkin('black')}
              >
                <span className="settings-theme-preview black" />
                <span>{t('app.themeBlack')}</span>
                {skin === 'black' && <CheckOutlined />}
              </button>
            </div>
          </div>

          <div
            ref={(node) => {
              sectionRefs.current.navigation = node;
            }}
            className="settings-card"
          >
            <div className="settings-card-title">{t('settingsView.navigation')}</div>
            <div className="settings-card-desc">{t('settingsView.navigationDesc')}</div>

            <div className="settings-navigation-list">
              {navigationEntries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`settings-navigation-item ${entry.enabled ? 'active' : ''} ${entry.required ? 'required' : ''}`}
                  onClick={() => handleToggleNavigationEntry(entry.key)}
                  disabled={entry.required}
                  aria-pressed={entry.required ? undefined : entry.enabled}
                >
                  <span className="settings-navigation-info">
                    <span className="settings-navigation-name">{entry.label}</span>
                    {entry.required && <span className="settings-navigation-note">{t('settingsView.alwaysVisible')}</span>}
                  </span>
                  <span className={`settings-navigation-status ${entry.status}`}>
                    {entry.enabled && <CheckOutlined />}
                    {entry.statusLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsViewer;
