import React from 'react';
import { Home, BookOpen, PlusCircle, Settings } from 'lucide-react';
import { ActiveTab } from '../types/vocab';

interface NavigationProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  dueCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onChangeTab,
  dueCount,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'learn', label: 'Lernen', icon: Home, badge: dueCount > 0 ? dueCount : undefined },
    { id: 'pool', label: 'Vokabelpool', icon: BookOpen },
    { id: 'create', label: 'Neu Anlegen', icon: PlusCircle },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#1C1C1E]/95 backdrop-blur-md border-t border-[#2C2C2E] px-3 py-2 pb-safe">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className="flex flex-col items-center justify-center flex-1 py-1 relative transition-colors"
            >
              <div className="relative">
                <Icon
                  className={`w-6 h-6 transition-transform ${
                    isActive ? 'text-[#FF7A00] scale-105' : 'text-[#8E8E93] hover:text-[#D1D1D6]'
                  }`}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-[#FF7A00] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center leading-none shadow-sm">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] mt-1 font-medium tracking-tight ${
                  isActive ? 'text-[#FF7A00]' : 'text-[#8E8E93]'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
