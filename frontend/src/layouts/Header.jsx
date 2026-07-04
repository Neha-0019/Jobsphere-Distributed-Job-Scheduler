import React from 'react';
import { LogOut, User, RefreshCw, Radio } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Header() {
  const { user, logout, connectionStatus, triggerRefresh } = useApp();

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return (
          <div className="flex items-center space-x-1.5 text-[#9CA3AF]">
            <span className="h-2 w-2 rounded-full bg-[#5fb87a] inline-block animate-pulse"></span>
            <span className="font-mono text-[10px] uppercase tracking-wider">Connected</span>
          </div>
        );
      case 'CONNECTING':
        return (
          <div className="flex items-center space-x-1.5 text-[#9CA3AF]">
            <span className="h-2 w-2 rounded-full bg-[#c9a15c] inline-block animate-pulse"></span>
            <span className="font-mono text-[10px] uppercase tracking-wider">Connecting</span>
          </div>
        );
      case 'DISCONNECTED':
      case 'ERROR':
      default:
        return (
          <div className="flex items-center space-x-1.5 text-[#9CA3AF]">
            <span className="h-2 w-2 rounded-full bg-[#a05a5a] inline-block"></span>
            <span className="font-mono text-[10px] uppercase tracking-wider">Offline</span>
          </div>
        );
    }
  };

  return (
    <header className="h-14 border-b border-[#2c323d] bg-[#181b1f] flex items-center justify-between px-6 select-none shrink-0">
      <div className="flex flex-col">
        <h2 className="text-sm font-bold text-[#F9FAFB]">JobSphere Operations Console</h2>
        <p className="text-[10px] text-[#9CA3AF]">Production Distributed Job Scheduling Platform</p>
      </div>

      <div className="flex items-center space-x-4">
        {/* WS Connection Status */}
        {getStatusBadge()}

        {/* Sync Trigger button */}
        <button 
          onClick={triggerRefresh}
          className="p-1 text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#2D3748] border border-[#2c323d] rounded transition-colors"
          title="Force telemetry refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        {/* Profile Details */}
        {user && (
          <div className="flex items-center space-x-3 border-l border-[#2c323d] pl-4">
            <div className="flex flex-col text-right">
              <span className="text-[11px] font-semibold text-[#F9FAFB]">{user.email}</span>
              <span className="text-[9px] text-[#9CA3AF]">Operator</span>
            </div>
            
            <button 
              onClick={logout}
              className="p-1.5 text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#2D3748] border border-[#2c323d] rounded transition-colors"
              title="Logout session"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
