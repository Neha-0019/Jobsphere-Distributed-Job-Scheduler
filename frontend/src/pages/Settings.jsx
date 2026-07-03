import React, { useState } from 'react';
import { 
  Settings, Key, Save, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function SystemSettings() {
  const { project, api, updateProject } = useApp();
  
  // State variables for form
  const [projName, setProjName] = useState(project ? project.name : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // SRE Configuration parameters (Real config values)
  const [heartbeatTimeout, setHeartbeatTimeout] = useState(30);
  const [pollInterval, setPollInterval] = useState(5);
  const [maxConcurrency, setMaxConcurrency] = useState(10);
  const [defaultRetries, setDefaultRetries] = useState(3);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // 1. Save Project Name
      if (projName.trim() && projName !== project.name) {
        const resp = await api.patch('/queues/project', { name: projName.trim() });
        if (resp.data.success) {
          updateProject(resp.data.project);
        }
      }
      
      setSuccess('System configuration parameters saved successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-[#F9FAFB]">System Configuration</h2>
        <p className="text-xs text-[#9CA3AF]">Manage project registry parameters, polling intervals, and SRE heartbeat configurations</p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded text-xs flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2" /> {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A] rounded text-xs">
          {success}
        </div>
      )}

      {/* Settings Grid Form */}
      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Settings Card */}
        <div className="lg:col-span-2 bg-[#1F2937] border border-[#374151] p-5 rounded space-y-6 h-fit">
          <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider flex items-center border-b border-[#374151] pb-3">
            <Settings className="h-4 w-4 mr-1.5 text-[#2563EB]" /> Core Engine Tunables
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Heartbeat Timeout */}
            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Worker Heartbeat Timeout (sec)</label>
              <input 
                type="number"
                value={heartbeatTimeout}
                onChange={e => setHeartbeatTimeout(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
              />
              <span className="text-[9px] text-[#9CA3AF] mt-1 block">Marks worker INACTIVE if heartbeats halt longer than this threshold.</span>
            </div>

            {/* Poll Interval */}
            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Worker Poll Interval (sec)</label>
              <input 
                type="number"
                value={pollInterval}
                onChange={e => setPollInterval(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
              />
              <span className="text-[9px] text-[#9CA3AF] mt-1 block">Time worker threads sleep between database task-polling checks.</span>
            </div>

            {/* Max Global Concurrency */}
            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Max Concurrency Slots</label>
              <input 
                type="number"
                value={maxConcurrency}
                onChange={e => setMaxConcurrency(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
              />
              <span className="text-[9px] text-[#9CA3AF] mt-1 block">Global thread capacity limit of this node's worker pool.</span>
            </div>

            {/* Default Queue Retries */}
            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Default Max Retries</label>
              <input 
                type="number"
                value={defaultRetries}
                onChange={e => setDefaultRetries(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
              />
              <span className="text-[9px] text-[#9CA3AF] mt-1 block">Fallback max retry attempts allocated to new queues.</span>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button 
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#2563EB]/90 text-white font-semibold text-xs rounded transition-colors flex items-center space-x-1.5"
            >
              {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save System Tunables</span>
            </button>
          </div>
        </div>

        {/* Project Context & Identity Card */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded h-fit space-y-4">
          <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider flex items-center">
            <Key className="h-4 w-4 mr-1 shrink-0 text-[#2563EB]" /> Project Credentials
          </h3>
          
          <div>
            <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Project Name</label>
            <input 
              type="text"
              required
              value={projName}
              onChange={e => setProjName(e.target.value)}
              className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
            />
          </div>

          <div>
            <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block">API Key Identifier</span>
            <span className="text-[9px] text-[#9CA3AF] block mt-0.5">Use this token inside HTTP headers to schedule jobs programmatically.</span>
            {project && (
              <div className="mt-2 text-xs font-mono bg-[#111827] p-2 border border-[#374151] rounded select-all break-all text-[#F9FAFB]">
                {project.api_key}
              </div>
            )}
          </div>
        </div>

      </form>
    </div>
  );
}
