import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppShellStore } from '../../stores/appShellStore';
import { useProjectStore } from '../../stores/projectStore';
import { useRequestStore } from '../../stores/requestStore';
import './WelcomePanel.css';

type LucideName = 'zap' | 'cable' | 'import' | 'git-branch' | 'file-text' | 'shield';

type Feature = {
  title: string;
  desc: string;
  iconName: LucideName;
  iconColor: string;
};

type FeatureColumn = {
  id: string;
  items: Feature[];
};

const LUCIDE_PATHS: Record<LucideName, React.ReactNode[]> = {
  zap: [
    <path key="p1" d="M4 14a1 1 0 0 1-.78-1.63L9.65 4.4A1 1 0 0 1 10.43 4H14a1 1 0 0 1 .8 1.6L13 10h7a1 1 0 0 1 .78 1.63l-9 11.2A1 1 0 0 1 10 22l2-8z" />,
  ],
  cable: [
    <path key="p1" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 1-4-4V7" />,
    <path key="p2" d="M19 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 1-4-4V7" />,
    <path key="p3" d="M7 15V7a4 4 0 0 1 4-4h8" />,
    <path key="p4" d="M17 5l2-2-2-2" />,
    <path key="p5" d="M7 7l-2 2 2 2" />,
  ],
  import: [
    <path key="p1" d="M12 3v12" />,
    <path key="p2" d="m8 11 4 4 4-4" />,
    <path key="p3" d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />,
  ],
  'git-branch': [
    <path key="p1" d="M6 3v12" />,
    <path key="p2" d="M18 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6" />,
    <path key="p3" d="M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />,
    <path key="p4" d="M18 9a9 9 0 0 0-9 9" />,
  ],
  'file-text': [
    <path key="p1" d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />,
    <path key="p2" d="M14 2v5a1 1 0 0 0 1 1h5" />,
    <path key="p3" d="M10 9H8" />,
    <path key="p4" d="M16 13H8" />,
    <path key="p5" d="M16 17H8" />,
  ],
  shield: [
    <path
      key="p1"
      d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
    />,
  ],
};

const LucideIcon: React.FC<{ name: LucideName; className?: string }> = ({ name, className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {LUCIDE_PATHS[name]}
  </svg>
);

const WelcomePanel: React.FC = () => {
  const { t } = useTranslation();
  const { collections, openProject } = useProjectStore();
  const { openNewTab } = useRequestStore();
  const dismissWelcome = useAppShellStore((s) => s.dismissWelcome);
  const markWelcomeShown = useAppShellStore((s) => s.markWelcomeShown);

  const hasCollections = Object.keys(collections).length > 0;

  const featureColumns = useMemo<FeatureColumn[]>(
    () => [
      {
        id: 'rowA',
        items: [
          { title: t('welcome.fastTitle'), desc: t('welcome.fastDesc'), iconName: 'zap', iconColor: '#5B8CFF' },
          { title: t('welcome.restTitle'), desc: t('welcome.restDesc'), iconName: 'cable', iconColor: '#62F6E2' },
        ],
      },
      {
        id: 'rowB',
        items: [
          { title: t('welcome.importTitle'), desc: t('welcome.importDesc'), iconName: 'import', iconColor: '#F59E0B' },
          { title: t('welcome.gitTitle'), desc: t('welcome.gitDesc'), iconName: 'git-branch', iconColor: '#10B981' },
        ],
      },
      {
        id: 'newCol',
        items: [
          { title: t('welcome.docTitle'), desc: t('welcome.docDesc'), iconName: 'file-text', iconColor: '#5B8CFF' },
          { title: t('welcome.caTitle'), desc: t('welcome.caDesc'), iconName: 'shield', iconColor: '#10B981' },
        ],
      },
    ],
    [t]
  );

  const handleOpenProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('sidebar.selectProjectFolder'),
    });

    if (selected) {
      await openProject(selected);
    }
  };

  return (
    <div className="welcome-page">
      <div className="welcome-hero">
        <div className="welcome-brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <div className="brand-title">SjyPost</div>
            <div className="brand-subtitle">{t('welcome.back')}</div>
          </div>
        </div>

        <div className="welcome-desc">{t('welcome.longDesc')}</div>
      </div>

      <div className="welcome-center">
        <div className="welcome-section-title">{t('welcome.features')}</div>

        <div className="welcome-features">
          {featureColumns.map((col) => (
            <div key={col.id} className="welcome-feature-col">
              {col.items.map((f) => (
                <div key={f.title} className="welcome-card">
                  <div className="card-icon" style={{ color: f.iconColor }}>
                    <LucideIcon name={f.iconName} className="card-lucide-icon" />
                  </div>
                  <div className="card-body">
                    <div className="card-title">{f.title}</div>
                    <div className="card-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="welcome-actions">
        <Button
          className="btn-ghost"
          type="default"
          onClick={dismissWelcome}
        >
          {t('welcome.hide')}
        </Button>
        <Button
          className="btn-primary"
          type="primary"
          onClick={hasCollections ? () => {
            markWelcomeShown();
            openNewTab();
          } : async () => {
            markWelcomeShown();
            await handleOpenProject();
          }}
        >
          {t('welcome.start')}
        </Button>
      </div>
    </div>
  );
};

export default WelcomePanel;
