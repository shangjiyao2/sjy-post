import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Empty } from 'antd';
import { useJavaProjectStore } from '../../stores/javaProjectStore';
import { usePermissionConfigStore } from '../../stores/permissionConfigStore';
import { useNavStore } from '../../stores/navStore';

const PermissionConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const { currentProject, parsedData } = useJavaProjectStore();
  const { generatedRows, clearAll } = usePermissionConfigStore();
  const { setActiveNavItem } = useNavStore();

  if (!currentProject || !parsedData) {
    return (
      <div style={{ padding: 16 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('permissionConfig.noJavaProject')}
        />
        <Button type="primary" block onClick={() => setActiveNavItem('javaImport')}>
          {t('permissionConfig.goToJavaImport')}
        </Button>
      </div>
    );
  }

  const controllerCount = parsedData.controllers.length;
  const endpointCount = parsedData.controllers.reduce((sum, controller) => sum + controller.endpoints.length, 0);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert message={t('permissionConfig.panelHint')} type="info" showIcon />

      <div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {t('permissionConfig.currentJavaProject')}
        </div>
        <div style={{ fontWeight: 600 }}>{currentProject.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{currentProject.path}</div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>{t('permissionConfig.controllerCount', { count: controllerCount })}</span>
        <span>{t('permissionConfig.endpointCount', { count: endpointCount })}</span>
        <span>{t('permissionConfig.generatedCount', { count: generatedRows.length })}</span>
      </div>

      <Button onClick={() => setActiveNavItem('javaImport')}>
        {t('permissionConfig.goToJavaImport')}
      </Button>
      <Button danger onClick={clearAll} disabled={generatedRows.length === 0}>
        {t('permissionConfig.clearDrafts')}
      </Button>
    </div>
  );
};

export default PermissionConfigPanel;
