import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Activity, Layers, Play, Cpu, RefreshCw, AlertTriangle, BarChart2, Settings, Key
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Sidebar() {
  const { project } = useApp();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: Activity },
    { name: 'Queues', path: '/queues', icon: Layers },
    { name: 'Jobs', path: '/jobs', icon: Play },
    { name: 'Workers', path: '/workers', icon: Cpu },
    { name: 'Retry Policies', path: '/retry-policies', icon: RefreshCw },
    { name: 'Dead Letter Queue', path: '/dlq', icon: AlertTriangle },
    { name: 'Metrics', path: '/metrics', icon: BarChart2 },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-[#2c323d] bg-[#111217] flex flex-col justify-between select-none shrink-0 h-full">
      <div className="flex flex-col">
        {/* Header/Logo */}
        <div className="flex items-center space-x-2 px-6 py-5 border-b border-[#2c323d]">
          <div className="p-1.5 bg-[#8b7fc4]/10 text-[#8b7fc4] rounded">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-[#F9FAFB] tracking-tight">JobSphere</h1>
            <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider font-semibold block">Console v1.0.0</span>
          </div>
        </div>

        {/* Project Details Panel */}
        {project && (
          <div className="mx-4 my-4 p-3 bg-[#181b1f] border border-[#2c323d] rounded flex flex-col">
            <span className="text-[10px] text-[#9CA3AF] uppercase tracking-widest font-semibold">Active Project</span>
            <span className="text-xs font-semibold text-[#F9FAFB] truncate mt-0.5">{project.name}</span>
            <div className="flex items-center mt-2 text-[10px] text-[#9CA3AF] font-mono bg-[#111217] px-2 py-1 border border-[#2c323d] rounded select-all truncate">
              <Key className="h-3 w-3 mr-1 text-[#9CA3AF] shrink-0" />
              {project.api_key}
            </div>
          </div>
        )}

        {/* Navigation items */}
        <nav className="px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2 text-xs font-semibold rounded transition-colors ${
                  isActive
                    ? 'bg-[#8b7fc4] text-[#0d0d0d]'
                    : 'text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#2D3748]'
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-[#2c323d] text-[10px] text-[#9CA3AF] font-mono">
        Host: production-cluster
      </div>
    </aside>
  );
}
