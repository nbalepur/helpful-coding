"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface TabbedInterfaceProps {
  taskName: string;
  children?: React.ReactNode;
  // Props for different tab content
  codeContent?: React.ReactNode;
  previewContent?: React.ReactNode;
  leaderboardContent?: React.ReactNode;
  submissionsContent?: React.ReactNode;
}

type TabType = 'code' | 'preview' | 'leaderboard' | 'submissions';

const TabbedInterface: React.FC<TabbedInterfaceProps> = ({ 
  taskName, 
  children,
  codeContent,
  previewContent,
  leaderboardContent,
  submissionsContent
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('code');

  console.log('TabbedInterface rendered with taskName:', taskName);

  const tabs = [
    { id: 'code' as TabType, label: 'Code' },
    { id: 'preview' as TabType, label: 'Preview' },
    { id: 'leaderboard' as TabType, label: 'Leaderboard' },
    { id: 'submissions' as TabType, label: 'Submissions' }
  ];

  const handleTabClick = (tabId: TabType) => {
    setActiveTab(tabId);
  };

  const handleBackClick = () => {
    router.push('/');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'code':
        return codeContent || children;
      case 'preview':
        return previewContent || (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-lg font-semibold mb-2">Preview</h3>
            <p>Preview functionality coming soon...</p>
          </div>
        );
      case 'leaderboard':
        return leaderboardContent || (
          <div className="p-8 text-center text-gray-400 bg-gray-950 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Leaderboard</h3>
            <p>Leaderboard functionality coming soon...</p>
          </div>
        );
      case 'submissions':
        return submissionsContent || (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-lg font-semibold mb-2">Submissions</h3>
            <p>Submissions functionality coming soon...</p>
          </div>
        );
      default:
        return children;
    }
  };

  return (
    <div className="tabbed-interface h-full flex flex-col">
      {/* Tab navigation */}
      <div className="tab-navigation" style={{ padding: '0 1rem' }}>
        <div className="tab-list" style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid #374151' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              style={{
                padding: '0.75rem 0.25rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'color 0.2s ease',
                position: 'relative',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeTab === tab.id ? 'white' : '#9ca3af'
              }}
            >
              {tab.label}
              {/* Active tab underline - only for non-code tabs */}
              {activeTab === tab.id && tab.id !== 'code' && (
                <div 
                  className="tab-underline"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'white'
                  }}
                ></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="tab-content flex-1 overflow-hidden">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default TabbedInterface;
