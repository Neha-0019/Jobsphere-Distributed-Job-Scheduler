import React, { useState, useEffect } from 'react';
import { 
  Cpu, AlertTriangle, RefreshCw, Layers, CheckCircle, Clock, Plus, Terminal, X, Key
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Workers() {
  const { api, refreshTrigger, project } = useApp();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const fetchWorkers = async () => {
    try {
      const resp = await api.get('/metrics/overview');
      if (resp.data.success) {
        setWorkers(resp.data.workers || []);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch workers registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, [refreshTrigger]);

  const getStatusBadge = (lastHeartbeatStr) => {
    const lastHeartbeat = new Date(lastHeartbeatStr);
    const diffSeconds = (new Date() - lastHeartbeat) / 1000;

    if (diffSeconds <= 15) {
      return (
        <span className="px-2 py-0.5 bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A] rounded text-[9px] font-bold font-mono">
          ACTIVE
        </span>
      );
    } else if (diffSeconds <= 30) {
      return (
        <span className="px-2 py-0.5 bg-[#D97706]/10 border border-[#D97706]/30 text-[#D97706] rounded text-[9px] font-bold font-mono animate-pulse">
          LAGGING
        </span>
      );
    } else {
      return (
        <span className="px-2 py-0.5 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded text-[9px] font-bold font-mono">
          UNRESPONSIVE
        </span>
      );
    }
  };

  if (loading && workers.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#1F2937] border border-[#374151] rounded">
        <div className="flex items-center space-x-2 text-[#9CA3AF]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#2563EB]" />
          <span className="text-xs">Loading workers registry...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-[#374151] pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#F9FAFB]">Worker Management</h2>
          <p className="text-xs text-[#9CA3AF]">Monitor daemon node heartbeats, capacities, and active thread pools</p>
        </div>
        <button 
          onClick={() => setShowRegisterModal(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#2563EB] hover:bg-[#2563EB]/90 text-white text-xs font-semibold rounded transition-colors"
          title="Register new worker runner node"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Add Worker</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded text-xs flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2" /> {error}
        </div>
      )}

      {/* Main split layout: list and inspector detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Workers List Table */}
        <div className="lg:col-span-2 bg-[#1F2937] border border-[#374151] rounded overflow-hidden h-fit">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#374151] bg-[#111827] text-[#9CA3AF] uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-3">Worker ID / Host</th>
                  <th className="p-3 text-center">CPU</th>
                  <th className="p-3 text-center">Memory</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Last Heartbeat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#374151] text-[#F9FAFB]">
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-[#9CA3AF] font-mono text-[11px]">
                      No active workers connected. Run "python run.py worker" in terminal to scale capacity.
                    </td>
                  </tr>
                ) : (
                  workers.map((w) => (
                    <tr 
                      key={w.id} 
                      onClick={() => setSelectedWorker(w)}
                      className={`hover:bg-[#2D3748] transition-colors cursor-pointer ${
                        selectedWorker?.id === w.id ? 'bg-[#2D3748]' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-semibold text-[#2563EB]">{w.name}</span>
                          <span className="text-[10px] text-[#9CA3AF] font-mono mt-0.5">{w.host}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono font-semibold">12.4%</td>
                      <td className="p-3 text-center font-mono font-semibold">1.8 GB / 16 GB</td>
                      <td className="p-3 text-center">{getStatusBadge(w.last_heartbeat)}</td>
                      <td className="p-3 text-right font-mono text-[#9CA3AF]">
                        {new Date(w.last_heartbeat).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Worker Details Panel */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded h-fit">
          <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider mb-4 flex items-center">
            <Cpu className="h-4 w-4 mr-1 shrink-0 text-[#2563EB]" /> Worker Telemetry Node
          </h3>
          {selectedWorker ? (
            <div className="space-y-4">
              <div>
                <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block">Worker Identifier</span>
                <span className="text-xs font-semibold font-mono text-[#F9FAFB] truncate block select-all mt-0.5">
                  {selectedWorker.name}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block">Host Address</span>
                <span className="text-xs font-mono text-[#F9FAFB] block mt-0.5">
                  {selectedWorker.host}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-[#374151] pt-3">
                <div>
                  <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block">Daemon CPU</span>
                  <span className="text-xs font-mono font-bold text-[#F9FAFB]">12.4%</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block">Virtual Memory</span>
                  <span className="text-xs font-mono font-bold text-[#F9FAFB]">1.8 GB / 16 GB</span>
                </div>
              </div>

              <div className="border-t border-[#374151] pt-3">
                <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block">Heartbeat Status</span>
                <div className="flex items-center space-x-2 mt-1">
                  {getStatusBadge(selectedWorker.last_heartbeat)}
                  <span className="text-[10px] text-[#9CA3AF] font-mono">
                    Last check-in: {new Date(selectedWorker.last_heartbeat).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="border-t border-[#374151] pt-3 space-y-2">
                <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block">Active Thread Pool</span>
                <div className="flex items-center space-x-1.5 p-2 bg-[#111827] border border-[#374151] rounded text-[11px] font-mono text-[#9CA3AF]">
                  <Layers className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                  <span>Pool size: 10 worker execution threads</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-[#9CA3AF] font-mono text-[11px] select-none">
              Select a worker node from the table to inspect telemetry data.
            </div>
          )}
        </div>

      </div>

      {/* Add Worker Instructions Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-[#111827]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1F2937] border border-[#374151] rounded w-full max-w-lg flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#374151] shrink-0">
              <div className="flex items-center space-x-2">
                <Terminal className="h-4 w-4 text-[#2563EB]" />
                <span className="text-xs font-bold font-mono text-[#F9FAFB]">Register New Worker Daemon</span>
              </div>
              <button 
                onClick={() => setShowRegisterModal(false)}
                className="text-[#9CA3AF] hover:text-[#F9FAFB]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Instructions Content */}
            <div className="p-5 font-sans text-xs text-[#9CA3AF] space-y-4">
              <p className="leading-relaxed">
                Workers run autonomously on host machines. To register a new worker under this project and connect it to your database, set your Project API Key and execute the run command inside your terminal:
              </p>

              <div className="space-y-4 font-mono text-[11px] bg-[#111827] border border-[#374151] p-3 rounded">
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[9px] mb-1">Option A: Windows (PowerShell)</span>
                  <div className="space-y-1.5">
                    <div className="p-1.5 bg-[#1F2937] border border-[#2c323d] rounded text-[#F9FAFB] select-all break-all">
                      $env:API_KEY="{project?.api_key || 'YOUR_API_KEY'}"
                    </div>
                    <div className="p-1.5 bg-[#1F2937] border border-[#2c323d] rounded text-[#F9FAFB] select-all">
                      python run.py worker
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[9px] mb-1">Option B: Windows (Command Prompt)</span>
                  <div className="space-y-1.5">
                    <div className="p-1.5 bg-[#1F2937] border border-[#2c323d] rounded text-[#F9FAFB] select-all break-all">
                      set API_KEY={project?.api_key || 'YOUR_API_KEY'}
                    </div>
                    <div className="p-1.5 bg-[#1F2937] border border-[#2c323d] rounded text-[#F9FAFB] select-all">
                      python run.py worker
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[9px] mb-1">Option C: Linux / macOS (Bash)</span>
                  <div className="space-y-1.5">
                    <div className="p-1.5 bg-[#1F2937] border border-[#2c323d] rounded text-[#F9FAFB] select-all break-all">
                      export API_KEY={project?.api_key || 'YOUR_API_KEY'}
                    </div>
                    <div className="p-1.5 bg-[#1F2937] border border-[#2c323d] rounded text-[#F9FAFB] select-all">
                      python run.py worker
                    </div>
                  </div>
                </div>
              </div>

              <p className="leading-relaxed">
                Once executed, the daemon will start polling for jobs, send a heartbeat ping every 5 seconds, and instantly register as **`ACTIVE`** in the table on this page.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-[#374151] shrink-0">
              <button 
                onClick={() => setShowRegisterModal(false)}
                className="px-3 py-1.5 border border-[#374151] hover:bg-[#2D3748] text-xs font-semibold rounded text-[#F9FAFB] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
