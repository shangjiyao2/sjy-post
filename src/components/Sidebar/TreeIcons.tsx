import React from 'react';

interface TreeIconProps {
  className?: string;
}

type LucideIconName = 'folder' | 'chevron-down' | 'search';

const LUCIDE_PATHS: Record<LucideIconName, React.ReactNode[]> = {
  folder: [
    <path
      key="p1"
      d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
    />,
  ],
  'chevron-down': [<path key="p1" d="m6 9 6 6 6-6" />],
  search: [
    <path key="p1" d="m21 21-4.34-4.34" />,
    <circle key="p2" cx="11" cy="11" r="8" />,
  ],
};

const LucideIcon: React.FC<{
  name: LucideIconName;
  className?: string;
  size?: number;
  strokeWidth?: number;
}> = ({ name, className, size = 14, strokeWidth = 2 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
  >
    {LUCIDE_PATHS[name]}
  </svg>
);

export const FolderIcon: React.FC<TreeIconProps> = ({ className }) => (
  <LucideIcon name="folder" className={className} size={12} />
);

export const ChevronDownIcon: React.FC<TreeIconProps> = ({ className }) => (
  <LucideIcon name="chevron-down" className={className} size={12} strokeWidth={2.2} />
);

export const SearchIcon: React.FC<TreeIconProps> = ({ className }) => (
  <LucideIcon name="search" className={className} size={14} />
);
