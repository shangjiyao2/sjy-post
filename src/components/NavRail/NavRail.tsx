import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavStore } from '../../stores/navStore';
import './NavRail.css';

type LucideName = 'layers' | 'history' | 'sliders-horizontal' | 'import' | 'file-text' | 'shield' | 'settings';

const LUCIDE_PATHS: Record<LucideName, React.ReactNode[]> = {
  layers: [
    <path
      key="p1"
      d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
    />,
    <path
      key="p2"
      d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"
    />,
    <path
      key="p3"
      d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
    />,
  ],
  history: [
    <path key="p1" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />,
    <path key="p2" d="M3 3v5h5" />,
    <path key="p3" d="M12 7v5l4 2" />,
  ],
  'sliders-horizontal': [
    <path key="p1" d="M10 5H3" />,
    <path key="p2" d="M12 19H3" />,
    <path key="p3" d="M14 3v4" />,
    <path key="p4" d="M16 17v4" />,
    <path key="p5" d="M21 12h-9" />,
    <path key="p6" d="M21 19h-5" />,
    <path key="p7" d="M21 5h-7" />,
    <path key="p8" d="M8 10v4" />,
    <path key="p9" d="M8 12H3" />,
  ],
  import: [
    <path key="p1" d="M12 3v12" />,
    <path key="p2" d="m8 11 4 4 4-4" />,
    <path key="p3" d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />,
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
  settings: [
    <path key="p1" d="M12 3a1 1 0 0 1 1 1v1.05a7.97 7.97 0 0 1 1.93.8l.74-.74a1 1 0 1 1 1.41 1.41l-.74.74c.34.6.61 1.24.8 1.93H20a1 1 0 1 1 0 2h-1.05a7.97 7.97 0 0 1-.8 1.93l.74.74a1 1 0 1 1-1.41 1.41l-.74-.74a7.97 7.97 0 0 1-1.93.8V20a1 1 0 1 1-2 0v-1.05a7.97 7.97 0 0 1-1.93-.8l-.74.74a1 1 0 1 1-1.41-1.41l.74-.74a7.97 7.97 0 0 1-.8-1.93H4a1 1 0 1 1 0-2h1.05a7.97 7.97 0 0 1 .8-1.93l-.74-.74A1 1 0 0 1 6.52 4.7l.74.74A7.97 7.97 0 0 1 9.19 4.64V3a1 1 0 0 1 1-1z" />,
    <circle key="p2" cx="12" cy="12" r="3" />,
  ],
};

const LucideIcon: React.FC<{ name: LucideName; className?: string }> = ({ name, className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
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

export type NavRailItem = 'collections' | 'history' | 'environments' | 'javaImport' | 'apiDocs' | 'permissionConfig' | 'settings';

interface NavRailProps {
  activeItem: NavRailItem;
  onItemChange: (item: NavRailItem) => void;
}

const NavRail: React.FC<NavRailProps> = ({ activeItem, onItemChange }) => {
  const { t } = useTranslation();
  const visibleNavItems = useNavStore((state) => state.visibleNavItems);

  const navItems = useMemo<{ key: NavRailItem; icon: React.ReactNode; label: string }[]>(
    () => [
      { key: 'collections', icon: <LucideIcon name="layers" />, label: t('navRail.collections') },
      { key: 'history', icon: <LucideIcon name="history" />, label: t('navRail.history') },
      { key: 'environments', icon: <LucideIcon name="sliders-horizontal" />, label: t('navRail.environments') },
      { key: 'javaImport', icon: <LucideIcon name="import" />, label: t('navRail.javaImport') },
      { key: 'apiDocs', icon: <LucideIcon name="file-text" />, label: t('navRail.apiDocs') },
      { key: 'permissionConfig', icon: <LucideIcon name="shield" />, label: t('navRail.permissionConfig') },
    ],
    [t],
  );

  const visibleItems = useMemo(
    () => navItems.filter((item) => visibleNavItems.includes(item.key as Exclude<NavRailItem, 'settings'>)),
    [navItems, visibleNavItems],
  );

  return (
    <div className="nav-rail">
      <div className="nav-rail-top">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            className={`nav-rail-item ${activeItem === item.key ? 'active' : ''}`}
            onClick={() => onItemChange(item.key)}
            title={item.label}
            aria-label={item.label}
          >
            <span className="nav-rail-item-icon">{item.icon}</span>
            <span className="nav-rail-item-label">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="nav-rail-bottom">
        <button
          className={`nav-rail-item ${activeItem === 'settings' ? 'active' : ''}`}
          onClick={() => onItemChange('settings')}
          title={t('navRail.settings')}
          aria-label={t('navRail.settings')}
        >
          <span className="nav-rail-item-icon"><LucideIcon name="settings" /></span>
          <span className="nav-rail-item-label">{t('navRail.settings')}</span>
        </button>
      </div>
    </div>
  );
};

export default NavRail;
