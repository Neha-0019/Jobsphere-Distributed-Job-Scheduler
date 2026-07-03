import React, { useState, useEffect } from 'react';
import { 
  Plus, Play, Pause, Trash2, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Queues() {
  const { api, refreshTrigger } = useApp();
  const [queues, setQueues] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [qName, setQName] = useState('');
  const [qPriority, setQPriority] = useState(5);
  const [qConcurrency, setQConcurrency] = useState(5);
  const [qPolicyId, setQPolicyId] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const qResp = await api.get('/queues/');
      if (qResp.data.success) setQueues(qResp.data.queues || []);

      const pResp = await api.get('/queues/retry-policies');
      if (pResp.data.success) {
        setPolicies(pResp.data.policies || []);
        if (pResp.data.policies?.length > 0 && !qPolicyId) {
          setQPolicyId(pResp.data.policies[0].id);
        }
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch queues configuration data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  const handleCreateQueue = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!qName.trim()) return;

    try {
      const resp = await api.post('/queues/', {
        name: qName.trim(),
        priority: parseInt(qPriority),
        max_concurrency: parseInt(qConcurrency),
        retry_policy_id: qPolicyId || null
      });
      if (resp.data.success) {
        setQName('');
        setSuccess(`Queue "${resp.data.queue.name}" created successfully.`);
        fetchData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create queue');
    }
  };

  const handleTogglePause = async (qId, currentPaused) => {
    try {
      const resp = await api.patch(`/queues/${qId}`, { is_paused: !currentPaused });
      if (resp.data.success) fetchData();
    } catch (err) {
      setError('Failed to update queue status');
    }
  };

  const handleDeleteQueue = async (qId) => {
    if (!confirm('Are you sure you want to delete this queue and all its associated jobs?')) return;
    try {
      const resp = await api.delete(`/queues/${qId}`);
      if (resp.data.success) fetchData();
    } catch (err) {
      setError('Failed to delete queue');
    }
  };

  if (loading && queues.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#1F2937] border border-[#374151] rounded">
        <div className="flex items-center space-x-2 text-[#9CA3AF]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#2563EB]" />
          <span className="text-xs">Loading queue configurations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-[#F9FAFB]">Queues Configuration</h2>
        <p className="text-xs text-[#9CA3AF]">Manage active processing queues, capacity controls, and priority levels</p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded text-xs font-semibold flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A] rounded text-xs font-semibold">
          {success}
        </div>
      )}

      {/* Main Grid: List on Left, Creation Form on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Table List of Queues */}
        <div className="lg:col-span-2 bg-[#1F2937] border border-[#374151] rounded flex flex-col justify-between overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#374151] bg-[#111827] text-[#9CA3AF] uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-3">Queue Name</th>
                  <th className="p-3 text-center">Priority</th>
                  <th className="p-3 text-center">Concurrency</th>
                  <th className="p-3 text-center">Queued</th>
                  <th className="p-3 text-center">Running</th>
                  <th className="p-3 text-center">Completed</th>
                  <th className="p-3 text-center">Failed</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#374151] text-[#F9FAFB]">
                {queues.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-6 text-center text-[#9CA3AF] font-mono text-[11px]">
                      No active queues defined. Use the configuration form to initialize a queue.
                    </td>
                  </tr>
                ) : (
                  queues.map((q) => {
                    const queuedCount = (q.stats?.QUEUED || 0) + (q.stats?.SCHEDULED || 0);
                    const runningCount = (q.stats?.RUNNING || 0) + (q.stats?.CLAIMED || 0);
                    const completedCount = q.stats?.COMPLETED || 0;
                    const failedCount = q.stats?.FAILED_DLQ || 0;

                    return (
                      <tr key={q.id} className="hover:bg-[#2D3748] transition-colors">
                        <td className="p-3 font-semibold font-mono text-xs text-[#2563EB]">{q.name}</td>
                        <td className="p-3 text-center font-semibold font-mono">{q.priority}</td>
                        <td className="p-3 text-center font-semibold font-mono">{q.max_concurrency}</td>
                        <td className="p-3 text-center font-mono text-[#D97706]">{queuedCount}</td>
                        <td className="p-3 text-center font-mono text-[#2563EB]">{runningCount}</td>
                        <td className="p-3 text-center font-mono text-[#16A34A]">{completedCount}</td>
                        <td className="p-3 text-center font-mono text-[#DC2626]">{failedCount}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono ${
                            q.is_paused 
                              ? 'bg-[#D97706]/10 border border-[#D97706]/30 text-[#D97706]' 
                              : 'bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A]'
                          }`}>
                            {q.is_paused ? 'PAUSED' : 'ACTIVE'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button 
                              onClick={() => handleTogglePause(q.id, q.is_paused)}
                              className={`p-1 border rounded transition-colors ${
                                q.is_paused
                                  ? 'bg-[#16A34A]/10 border-[#16A34A]/30 text-[#16A34A] hover:bg-[#16A34A]/20'
                                  : 'bg-[#D97706]/10 border-[#D97706]/30 text-[#D97706] hover:bg-[#D97706]/20'
                              }`}
                              title={q.is_paused ? 'Resume processing' : 'Pause execution'}
                            >
                              {q.is_paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                            </button>
                            <button 
                              onClick={() => handleDeleteQueue(q.id)}
                              className="p-1 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded hover:bg-[#DC2626]/20 transition-colors"
                              title="Delete queue"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Queue Config Form */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded h-fit">
          <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider mb-4 flex items-center">
            <Plus className="h-4 w-4 mr-1 shrink-0" /> Initialize New Queue
          </h3>
          <form onSubmit={handleCreateQueue} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Queue Name</label>
              <input 
                type="text" 
                required
                placeholder="e.g. process-emails"
                value={qName}
                onChange={e => setQName(e.target.value)}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Retry Policy (Fallback)</label>
              <select 
                value={qPolicyId}
                onChange={e => setQPolicyId(e.target.value)}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#9CA3AF] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="">No retry policy (Fail instantly)</option>
                {policies.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.strategy})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Priority (1-10)</label>
                <input 
                  type="number" 
                  min="1" 
                  max="10"
                  value={qPriority}
                  onChange={e => setQPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Concurrency Limit</label>
                <input 
                  type="number" 
                  min="1"
                  value={qConcurrency}
                  onChange={e => setQConcurrency(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full py-2 bg-[#2563EB] hover:bg-[#2563EB]/90 text-white font-semibold text-xs rounded transition-colors mt-2"
            >
              Deploy Queue
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
