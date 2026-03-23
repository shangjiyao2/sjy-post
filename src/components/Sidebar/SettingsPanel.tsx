import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Button, Modal, message, Radio } from 'antd';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useThemeStore } from '../../stores/themeStore';

const SettingsPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const skin = useThemeStore((s) => s.skin);
  const setSkin = useThemeStore((s) => s.setSkin);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const handleLanguageChange = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    void i18n.changeLanguage(newLang);
    localStorage.setItem('sjypost-lang', newLang);
  };

  const handleCheckUpdates = async () => {
    if (isCheckingUpdate) return;

    try {
      setIsCheckingUpdate(true);
      message.loading({ content: t('app.checkingUpdates'), key: 'updater' });

      const update = await check();

      if (!update) {
        message.success({ content: t('app.noUpdates'), key: 'updater' });
        return;
      }

      message.destroy('updater');
      Modal.confirm({
        title: t('app.updateAvailableTitle'),
        content: update.body || `v${update.version}`,
        okText: t('app.updateNow'),
        cancelText: t('app.updateLater'),
        onOk: async () => {
          try {
            message.loading({ content: t('app.updating'), key: 'updater' });
            await update.downloadAndInstall();
            message.success({ content: t('app.updateSuccess'), key: 'updater' });
            await relaunch();
          } catch (e) {
            message.error({ content: t('app.updateFailed', { error: String(e) }), key: 'updater' });
          }
        },
      });
    } catch (e) {
      message.error({ content: t('app.updateFailed', { error: String(e) }), key: 'updater' });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="panel-content">
        <div className="settings-item">
          <span className="settings-label">{t('app.toggleTheme')}</span>
          <Radio.Group
            value={skin}
            onChange={(e) => setSkin(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="light">{t('app.themeLight')}</Radio.Button>
            <Radio.Button value="dark">{t('app.themeDark')}</Radio.Button>
            <Radio.Button value="black">{t('app.themeBlack')}</Radio.Button>
          </Radio.Group>
        </div>

        <div className="settings-item">
          <span className="settings-label">{t('app.toggleLang')}</span>
          <Switch
            checked={i18n.language === 'en'}
            onChange={handleLanguageChange}
            size="small"
            checkedChildren="EN"
            unCheckedChildren="中"
          />
        </div>

        <div className="settings-item">
          <span className="settings-label">{t('app.checkUpdates')}</span>
          <Button size="small" onClick={handleCheckUpdates} loading={isCheckingUpdate}>
            {t('app.checkUpdates')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
