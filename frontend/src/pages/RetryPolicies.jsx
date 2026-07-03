import React, { useState, useEffect } from 'react';
import { 
  Plus, AlertTriangle, RefreshCw, Layers, ShieldCheck
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function RetryPolicies() {
  const { api, refreshTrigger } = useApp();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [pName, setPName] = useState('');
  const [pStrategy, setPStrategy] = useState('FIXED');
  const [pInterval, setPInterval] = useState(5);
  const [pMaxRetries, setPMaxRetries] = useState(3);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchPolicies = async () => {
    try {
      const resp = await api.get('/queues/retry-policies');
      if (resp.data.success) {
        setPolicies(resp.data.policies || []);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch retry policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, [refreshTrigger]);

  const handleCreatePolicy = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!pName.trim()) return;

    try {
      const resp = await api.post('/queues/retry-policies', {
        name: pName.trim(),
        strategy: pStrategy,
        backoff_interval: parseInt(pInterval),
        max_retries: parseInt(pMaxRetries)
      });
      if (resp.data.success) {
        setPName('');
        setSuccess(`Retry policy "${resp.data.policy.name}" created successfully.`);
        fetchPolicies();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create policy');
    }
  };

  const getBackoffDescription = (policy) => {
    const { strategy, backoff_interval, max_retries } = policy;
    if (strategy === 'FIXED') {
      return `Wait exactly ${backoff_interval} seconds between each attempt. Maximum attempts: ${max_retries}.`;
    }
    if (strategy === 'LINEAR') {
      return `Wait ${backoff_interval}s, then ${backoff_interval * 2}s, then ${backoff_interval * 3}s... (Multiplied by retry count). Max attempts: ${max_retries}.`;
    }
    if (strategy === 'EXPONENTIAL') {
      return `Wait ${backoff_interval}s, then ${backoff_interval * 2}s, then ${backoff_interval * 4}s, then ${backoff_interval * 8}s... (2^attempt delay). Max attempts: ${max_retries}.`;
    }
    return '';
  };

  if (loading && policies.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#1F2937] border border-[#374151] rounded">
        <div className="flex items-center space-x-2 text-[#9CA3AF]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#2563EB]" />
          <span className="text-xs">Loading retry policies...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-[#F9FAFB]">Retry Policies</h2>
        <p className="text-xs text-[#9CA3AF]">Configure backoff interval algorithms and max attempt parameters for fault-tolerant workers</p>
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

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Policies List Table */}
        <div className="lg:col-span-2 bg-[#1F2937] border border-[#374151] rounded flex flex-col justify-between overflow-hidden h-fit">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#374151] bg-[#111827] text-[#9CA3AF] uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-3">Policy Name</th>
                  <th className="p-3">Strategy</th>
                  <th className="p-3 text-center">Interval (sec)</th>
                  <th className="p-3 text-center">Max Retries</th>
                  <th className="p-3">Behavioral Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#374151] text-[#F9FAFB]">
                {policies.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-[#9CA3AF] font-mono text-[11px]">
                      No custom retry policies configured. Fallbacks default to failing immediately.
                    </td>
                  </tr>
                ) : (
                  policies.map((p) => (
                    <tr key={p.id} className="hover:bg-[#2D3748] transition-colors">
                      <td className="p-3 font-semibold font-mono text-xs text-[#2563EB]">{p.name}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-[#2563EB]/10 border border-[#2563EB]/30 text-[#2563EB] rounded text-[9px] font-bold font-mono">
                          {p.strategy}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">{p.backoff_interval}s</td>
                      <td className="p-3 text-center font-mono">{p.max_retries}</td>
                      <td className="p-3 text-[11px] text-[#9CA3AF] max-w-[200px] truncate" title={getBackoffDescription(p)}>
                        {getBackoffDescription(p)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Creation Form */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded h-fit">
          <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider mb-4 flex items-center">
            <Plus className="h-4 w-4 mr-1 shrink-0" /> Define Retry Policy
          </h3>
          <form onSubmit={handleCreatePolicy} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Policy Identifier</label>
              <input 
                type="text" 
                required
                placeholder="e.g. exponential-backoff-3x"
                value={pName}
                onChange={e => setPName(e.target.value)}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Backoff Strategy</label>
              <select 
                value={pStrategy}
                onChange={e => setPStrategy(e.target.value)}
                className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#9CA3AF] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="FIXED">FIXED (Constant delay)</option>
                <option value="LINEAR">LINEAR (Multiplier delay)</option>
                <option value="EXPONENTIAL">EXPONENTIAL (Power delay)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Base Interval (sec)</label>
                <input 
                  type="number" 
                  min="1"
                  value={pInterval}
                  onChange={e => setPInterval(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Max Retries</label>
                <input 
                  type="number" 
                  min="0"
                  value={pMaxRetries}
                  onChange={e => setPMaxRetries(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full py-2 bg-[#2563EB] hover:bg-[#2563EB]/90 text-white font-semibold text-xs rounded transition-colors mt-2"
            >
              Register Policy
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
