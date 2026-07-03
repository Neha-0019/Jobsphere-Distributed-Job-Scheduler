import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, RefreshCw, Trash2, Terminal, X
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function DLQ() {
  const { api, refreshTrigger } = useApp();
  const [dlqJobs, setDlqJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inspectJob, setInspectJob] = useState(null);

  const fetchDlqJobs = async () => {
    try {
      const resp = await api.get('/jobs/', { params: { status: 'FAILED_DLQ', limit: 50 } });
      if (resp.data.success) {
        setDlqJobs(resp.data.jobs || []);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch DLQ entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDlqJobs();
  }, [refreshTrigger]);

  const handleRetryJob = async (jobId) => {
    setError('');
    setSuccess('');
    try {
      const resp = await api.post(`/jobs/${jobId}/retry`);
      if (resp.data.success) {
        setSuccess('Job re-queued successfully.');
        fetchDlqJobs();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to re-queue job');
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!confirm('Are you sure you want to permanently delete this job and clear it from the Dead Letter Queue?')) return;
    setError('');
    setSuccess('');
    try {
      const resp = await api.delete(`/jobs/${jobId}`);
      if (resp.data.success) {
        setSuccess('Job deleted successfully.');
        fetchDlqJobs();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete job');
    }
  };

  const handleInspectJobLogs = async (job) => {
    try {
      const resp = await api.get(`/jobs/${job.id}`);
      if (resp.data.success) {
        setInspectJob(resp.data.job);
      }
    } catch (err) {
      setError('Failed to fetch job details and logs');
    }
  };

  if (loading && dlqJobs.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#1F2937] border border-[#374151] rounded">
        <div className="flex items-center space-x-2 text-[#9CA3AF]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#2563EB]" />
          <span className="text-xs">Loading Dead Letter Queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-[#F9FAFB]">Dead Letter Queue (DLQ)</h2>
        <p className="text-xs text-[#9CA3AF]">Inspect and manage failed jobs that have exhausted all configured retry policies</p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded text-xs flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A] rounded text-xs">
          {success}
        </div>
      )}

      {/* DLQ Table */}
      <div className="bg-[#1F2937] border border-[#374151] rounded flex flex-col justify-between overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#374151] bg-[#111827] text-[#9CA3AF] uppercase tracking-wider font-semibold text-[10px]">
                <th className="p-3">Job ID</th>
                <th className="p-3">Queue</th>
                <th className="p-3">Last Failed Reason</th>
                <th className="p-3 text-center">Retries Exhausted</th>
                <th className="p-3">Worker Node</th>
                <th className="p-3 text-right">Failed Time</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#374151] text-[#F9FAFB]">
              {dlqJobs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-[#9CA3AF] font-mono text-[11px]">
                    Dead Letter Queue is empty. No jobs are currently in FAILED_DLQ state.
                  </td>
                </tr>
              ) : (
                dlqJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-[#2D3748] transition-colors">
                    <td className="p-3 font-mono text-xs font-semibold text-[#DC2626] max-w-[120px] truncate" title={j.id}>
                      {j.id}
                    </td>
                    <td className="p-3 font-mono text-xs">{j.queue_name}</td>
                    <td className="p-3 text-xs max-w-[200px] truncate text-[#9CA3AF]" title={j.last_error}>
                      {j.last_error || 'No error message log recorded.'}
                    </td>
                    <td className="p-3 text-center font-mono">{j.retry_count} / {j.max_retries}</td>
                    <td className="p-3 font-mono text-[11px] text-[#9CA3AF]">{j.worker_id || 'N/A'}</td>
                    <td className="p-3 text-right font-mono text-[#9CA3AF]">
                      {new Date(j.updated_at).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button 
                          onClick={() => handleInspectJobLogs(j)}
                          className="p-1.5 bg-[#1F2937] hover:bg-[#2D3748] border border-[#374151] text-[#9CA3AF] hover:text-[#F9FAFB] rounded transition-colors"
                          title="Inspect failure logs"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          onClick={() => handleRetryJob(j.id)}
                          className="p-1.5 bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A] rounded hover:bg-[#16A34A]/20 transition-colors"
                          title="Re-enqueue job"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteJob(j.id)}
                          className="p-1.5 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded hover:bg-[#DC2626]/20 transition-colors"
                          title="Purge job permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monospace terminal logs inspector overlay */}
      {inspectJob && (
        <div className="fixed inset-0 bg-[#111827]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1F2937] border border-[#374151] rounded w-full max-w-3xl flex flex-col h-[550px] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#374151] shrink-0">
              <div className="flex items-center space-x-2">
                <Terminal className="h-4 w-4 text-[#DC2626]" />
                <span className="text-xs font-bold font-mono text-[#F9FAFB]">Inspect Logs: {inspectJob.id}</span>
              </div>
              <button 
                onClick={() => setInspectJob(null)}
                className="text-[#9CA3AF] hover:text-[#F9FAFB]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#111827] font-mono text-xs text-[#9CA3AF] space-y-4">
              {/* Failure Context */}
              <div className="p-3 bg-[#DC2626]/5 border border-[#DC2626]/20 text-[#DC2626] rounded">
                <span className="font-bold block mb-1 uppercase tracking-wider text-[10px]">Last Failed Error Traceback:</span>
                <span className="whitespace-pre-wrap">{inspectJob.last_error || 'No error details recorded.'}</span>
              </div>

              {/* Payload */}
              <div>
                <span className="font-bold text-[#F9FAFB] block mb-1 uppercase tracking-wider text-[10px]">Execution Payload:</span>
                <pre className="p-3 bg-[#1F2937] border border-[#374151] rounded text-[#9CA3AF] whitespace-pre-wrap">
                  {inspectJob.payload}
                </pre>
              </div>

              {/* History Attempts Logs */}
              <div>
                <span className="font-bold text-[#F9FAFB] block mb-1 uppercase tracking-wider text-[10px]">Worker Execution Attempts:</span>
                {inspectJob.history?.length === 0 ? (
                  <div className="p-3 text-[#9CA3AF] border border-[#374151] rounded text-center">No runs logged.</div>
                ) : (
                  <div className="space-y-2">
                    {inspectJob.history?.map((attempt, idx) => (
                      <div key={idx} className="p-3 bg-[#1F2937] border border-[#374151] rounded">
                        <div className="flex items-center justify-between text-[#F9FAFB] text-[10px] mb-2 font-bold uppercase">
                          <span>Attempt #{idx + 1} - Worker [{attempt.worker_id}]</span>
                          <span className={attempt.status === 'COMPLETED' ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                            {attempt.status} ({attempt.duration_ms || 0}ms)
                          </span>
                        </div>
                        {attempt.logs?.length === 0 ? (
                          <div className="text-[10px] text-slate-500 italic">No output logs captured.</div>
                        ) : (
                          <div className="space-y-1 text-[#9CA3AF] text-[11px]">
                            {attempt.logs?.map((l, lIdx) => (
                              <div key={lIdx}>
                                <span className="text-[#9CA3AF] mr-2">[{new Date(l.timestamp).toLocaleTimeString()}]</span>
                                <span className={l.log_level === 'ERROR' ? 'text-[#DC2626]' : 'text-[#9CA3AF]'}>{l.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-[#374151] shrink-0">
              <button 
                onClick={() => setInspectJob(null)}
                className="px-3 py-1.5 border border-[#374151] hover:bg-[#2D3748] text-xs font-semibold rounded text-[#F9FAFB] transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
