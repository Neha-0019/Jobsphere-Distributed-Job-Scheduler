import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen w-screen bg-[#181b1f] text-[#F9FAFB] font-sans overflow-hidden">
      {/* Permanent Left Sidebar */}
      <Sidebar />

      {/* Main Panel */}
      <div className="flex flex-col flex-1 h-full min-w-0">
        {/* Top Header */}
        <Header />

        {/* Scrollable Main Content Container */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#181b1f]">
          <div className="max-w-[1400px] mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
