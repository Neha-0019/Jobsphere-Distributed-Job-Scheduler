import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Clock, RefreshCw, AlertTriangle, Terminal, Play, Pause, ChevronRight, ChevronDown, CheckCircle, ArrowLeft, Send
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Jobs() {
  const { api, refreshTrigger } = useApp();
  
  // Lists
  const [queues, setQueues] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [recurringJobs, setRecurringJobs] = useState([]);
  
  // View & Filter State
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [inspectedJob, setInspectedJob] = useState(null); // Detailed job info
  const [expandedAttempt, setExpandedAttempt] = useState(null);
  const [viewMode, setViewMode] = useState('explorer'); // explorer, submit, recurring
  
  // Explorer Filters
  const [queueFilter, setQueueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobsCount, setTotalJobsCount] = useState(0);

  // Job Submission Form
  const [subQueueId, setSubQueueId] = useState('');
  const [subPriority, setSubPriority] = useState(1);
  const [subType, setSubType] = useState('GENERIC');
  const [subDelay, setSubDelay] = useState('');
  const [subDependsOn, setSubDependsOn] = useState('');
  
  // Payload States
  const [genericDuration, setGenericDuration] = useState(2.0);
  const [httpUrl, setHttpUrl] = useState('');
  const [httpMethod, setHttpMethod] = useState('POST');
  const [httpBody, setHttpBody] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [computeSteps, setComputeSteps] = useState(5);

  // Cron Form
  const [cronName, setCronName] = useState('');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchQueues = async () => {
    try {
      const resp = await api.get('/queues/');
      if (resp.data.success) {
        setQueues(resp.data.queues || []);
        if (resp.data.queues?.length > 0 && !subQueueId) {
          setSubQueueId(resp.data.queues[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchJobs = async () => {
    setLoading(true);
    try {
      let query = `?page=${currentPage}&limit=15`;
      if (queueFilter) query += `&queue_id=${queueFilter}`;
      if (statusFilter) query += `&status=${statusFilter}`;
      if (batchFilter) query += `&batch_id=${batchFilter}`;

      const resp = await api.get(`/jobs/${query}`);
      if (resp.data.success) {
        setJobs(resp.data.jobs || []);
        setTotalPages(resp.data.pages || 1);
        setTotalJobsCount(resp.data.total || 0);
      }
    } catch (err) {
      setError('Failed to fetch jobs logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecurringJobs = async () => {
    try {
      const resp = await api.get('/jobs/recurring');
      if (resp.data.success) {
        setRecurringJobs(resp.data.recurring_jobs || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchQueues();
    fetchRecurringJobs();
  }, [refreshTrigger]);

  useEffect(() => {
    if (viewMode === 'explorer') {
      fetchJobs();
    }
  }, [viewMode, queueFilter, statusFilter, batchFilter, currentPage, refreshTrigger]);

  // Fetch individual job details when selected
  useEffect(() => {
    if (selectedJobId) {
      const fetchJobDetails = async () => {
        try {
          const resp = await api.get(`/jobs/${selectedJobId}`);
          if (resp.data.success) {
            setInspectedJob(resp.data.job);
            setExpandedAttempt(0); // expand first attempt by default
          }
        } catch (err) {
          setError('Failed to fetch job details');
        }
      };
      fetchJobDetails();
    } else {
      setInspectedJob(null);
    }
  }, [selectedJobId, refreshTrigger]);

  const getPayloadObject = () => {
    if (subType === 'HTTP') {
      return { type: 'HTTP', url: httpUrl, method: httpMethod, body: httpBody };
    }
    if (subType === 'EMAIL') {
      return { type: 'EMAIL', to: emailTo, subject: emailSubject, body: emailBody };
    }
    if (subType === 'COMPUTE') {
      return { type: 'COMPUTE', steps: Number(computeSteps) };
    }
    return { type: 'GENERIC', duration: Number(genericDuration) };
  };

  const handleJobSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const payload = getPayloadObject();
    const dependsOnArray = subDependsOn
      ? subDependsOn.split(',').map(id => id.trim()).filter(id => id.length > 0)
      : [];

    try {
      const resp = await api.post('/jobs/', {
        queue_id: subQueueId,
        priority: parseInt(subPriority),
        payload: payload,
        delay_seconds: subDelay ? Number(subDelay) : null,
        depends_on: dependsOnArray
      });
      if (resp.data.success) {
        setSuccess(`Job successfully enqueued. ID: ${resp.data.job.id}`);
        setSubDelay('');
        setSubDependsOn('');
        setViewMode('explorer');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Job submission failed');
    }
  };

  const handleCronSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!cronName || !cronExpression) return;

    const payload = getPayloadObject();

    try {
      const resp = await api.post('/jobs/recurring', {
        name: cronName,
        queue_id: subQueueId,
        cron_expression: cronExpression,
        payload: payload,
        priority: subPriority
      });
      if (resp.data.success) {
        setSuccess(`Cron definition "${cronName}" registered successfully.`);
        setCronName('');
        fetchRecurringJobs();
        setViewMode('recurring');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Cron job registration failed');
    }
  };

  const handleToggleCron = async (cronId) => {
    try {
      const resp = await api.post(`/jobs/recurring/${cronId}/toggle`);
      if (resp.data.success) fetchRecurringJobs();
    } catch (err) {
      setError('Failed to toggle cron schedule');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A]';
      case 'RUNNING':
      case 'CLAIMED':
        return 'bg-[#2563EB]/10 border border-[#2563EB]/30 text-[#2563EB]';
      case 'QUEUED':
        return 'bg-[#374151]/50 border border-[#374151] text-[#9CA3AF]';
      case 'SCHEDULED':
      case 'BLOCKED':
        return 'bg-[#D97706]/10 border border-[#D97706]/30 text-[#D97706]';
      case 'FAILED':
      case 'FAILED_DLQ':
      case 'FAILED_DEPENDENCY':
      default:
        return 'bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-[#374151] pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#F9FAFB]">Job Explorer</h2>
          <p className="text-xs text-[#9CA3AF]">Inspect historical logs, verify dependencies, and dispatch manual runs</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => { setViewMode('explorer'); setSelectedJobId(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              viewMode === 'explorer' && !selectedJobId
                ? 'bg-[#2563EB] text-[#F9FAFB] border-[#2563EB]'
                : 'text-[#9CA3AF] border-[#374151] hover:bg-[#2D3748]'
            }`}
          >
            Explorer Logs
          </button>
          <button 
            onClick={() => { setViewMode('submit'); setSelectedJobId(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              viewMode === 'submit'
                ? 'bg-[#2563EB] text-[#F9FAFB] border-[#2563EB]'
                : 'text-[#9CA3AF] border-[#374151] hover:bg-[#2D3748]'
            }`}
          >
            Dispatch Job
          </button>
          <button 
            onClick={() => { setViewMode('recurring'); setSelectedJobId(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              viewMode === 'recurring'
                ? 'bg-[#2563EB] text-[#F9FAFB] border-[#2563EB]'
                : 'text-[#9CA3AF] border-[#374151] hover:bg-[#2D3748]'
            }`}
          >
            Cron Schedules
          </button>
        </div>
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

      {/* 1. Job Details View */}
      {selectedJobId && inspectedJob && (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedJobId(null)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#1F2937] border border-[#374151] text-[#9CA3AF] hover:text-[#F9FAFB] text-xs font-semibold rounded transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Explorer</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: General Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Job Metadata details grid */}
              <div className="bg-[#1F2937] border border-[#374151] p-5 rounded space-y-4">
                <div className="border-b border-[#374151] pb-3">
                  <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold">Job ID</span>
                  <span className="text-sm font-bold font-mono text-[#F9FAFB] block mt-0.5 select-all">{inspectedJob.id}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-[#9CA3AF] block font-semibold uppercase">Queue</span>
                    <span className="text-xs font-semibold text-[#F9FAFB] mt-0.5 block">{inspectedJob.queue_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#9CA3AF] block font-semibold uppercase">Status</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block mt-0.5 ${getStatusBadgeClass(inspectedJob.status)}`}>
                      {inspectedJob.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#9CA3AF] block font-semibold uppercase">Priority</span>
                    <span className="text-xs font-semibold text-[#F9FAFB] mt-0.5 block">{inspectedJob.priority}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#9CA3AF] block font-semibold uppercase">Retries</span>
                    <span className="text-xs font-semibold text-[#F9FAFB] mt-0.5 block">{inspectedJob.retry_count} / {inspectedJob.max_retries}</span>
                  </div>
                </div>

                {inspectedJob.batch_id && (
                  <div className="border-t border-[#374151] pt-3">
                    <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold">Batch Assignment ID</span>
                    <span className="text-xs font-mono text-[#F9FAFB] block mt-0.5 select-all">{inspectedJob.batch_id}</span>
                  </div>
                )}
                
                {inspectedJob.depends_on && inspectedJob.depends_on.length > 0 && (
                  <div className="border-t border-[#374151] pt-3">
                    <span className="text-[10px] text-[#9CA3AF] uppercase font-semibold block mb-1">Parent Job Dependencies (Blocked On)</span>
                    <div className="flex flex-wrap gap-1">
                      {inspectedJob.depends_on.map(id => (
                        <span 
                          key={id} 
                          onClick={() => setSelectedJobId(id)}
                          className="px-2 py-0.5 bg-[#111827] border border-[#374151] hover:border-[#2563EB] text-[#9CA3AF] hover:text-[#F9FAFB] rounded text-[10px] font-mono cursor-pointer transition-colors"
                          title="Click to inspect parent"
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Execution log history */}
              <div className="bg-[#1F2937] border border-[#374151] p-5 rounded space-y-4">
                <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Attempt history & logging</h3>
                
                {inspectedJob.history?.length === 0 ? (
                  <div className="text-center py-6 text-[#9CA3AF] font-mono text-xs border border-[#374151] bg-[#111827] rounded">
                    Job is queued. Waiting for worker processing...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inspectedJob.history.map((attempt, index) => (
                      <div key={attempt.id} className="border border-[#374151] rounded overflow-hidden bg-[#111827]">
                        <button 
                          onClick={() => setExpandedAttempt(expandedAttempt === index ? null : index)}
                          className="w-full px-4 py-2.5 bg-[#1F2937]/50 border-b border-[#374151] text-xs font-mono flex items-center justify-between text-[#F9FAFB] hover:bg-[#2D3748] transition-colors"
                        >
                          <div className="flex items-center space-x-2">
                            {expandedAttempt === index ? <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />}
                            <span className="font-semibold">Attempt #{index + 1} - Worker Node [{attempt.worker_id}]</span>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-[#9CA3AF]">{attempt.duration_ms || 0}ms</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              attempt.status === 'COMPLETED' ? 'bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A]' : 'bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626]'
                            }`}>
                              {attempt.status}
                            </span>
                          </div>
                        </button>

                        {expandedAttempt === index && (
                          <div className="p-4 bg-[#111827] space-y-1.5 font-mono text-[11px] overflow-x-auto text-[#9CA3AF] max-h-[300px]">
                            {attempt.logs?.length === 0 ? (
                              <div className="text-slate-600 italic select-none">No execution steps logged by worker thread.</div>
                            ) : (
                              attempt.logs.map((log) => (
                                <div key={log.id} className="flex items-start">
                                  <span className="text-[#9CA3AF] select-none mr-3 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold select-none mr-2.5 shrink-0 ${
                                    log.log_level === 'ERROR' ? 'bg-[#DC2626]/10 text-[#DC2626]' : 'bg-[#2563EB]/10 text-[#2563EB]'
                                  }`}>
                                    {log.log_level}
                                  </span>
                                  <span className={log.log_level === 'ERROR' ? 'text-[#DC2626]' : 'text-[#F9FAFB]'}>{log.message}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Payload Context */}
            <div className="bg-[#1F2937] border border-[#374151] p-5 rounded h-fit space-y-4">
              <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Payload config</h3>
              <pre className="p-4 bg-[#111827] border border-[#374151] rounded text-[11px] font-mono text-[#9CA3AF] overflow-x-auto whitespace-pre-wrap select-all">
                {JSON.stringify(JSON.parse(inspectedJob.payload), null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* 2. Explorer Logs Table View */}
      {viewMode === 'explorer' && !selectedJobId && (
        <div className="space-y-4">
          {/* Filters card */}
          <div className="bg-[#1F2937] border border-[#374151] p-4 rounded flex flex-col md:flex-row md:items-end gap-3 select-none text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Queue Filter</label>
              <select 
                value={queueFilter} 
                onChange={e => { setQueueFilter(e.target.value); setCurrentPage(1); }}
                className="bg-[#111827] border border-[#374151] rounded px-3 py-1.5 text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] w-48"
              >
                <option value="">All Queues</option>
                {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Status Filter</label>
              <select 
                value={statusFilter} 
                onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="bg-[#111827] border border-[#374151] rounded px-3 py-1.5 text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] w-40"
              >
                <option value="">All Statuses</option>
                <option value="QUEUED">QUEUED</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="CLAIMED">CLAIMED</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
                <option value="FAILED_DLQ">FAILED_DLQ</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Batch ID Filter</label>
              <input 
                type="text" 
                placeholder="UUID"
                value={batchFilter}
                onChange={e => { setBatchFilter(e.target.value); setCurrentPage(1); }}
                className="bg-[#111827] border border-[#374151] rounded px-3 py-1.5 text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono w-64"
              />
            </div>

            <button 
              onClick={() => { setQueueFilter(''); setStatusFilter(''); setBatchFilter(''); setCurrentPage(1); }}
              className="px-3 py-1.5 border border-[#374151] hover:bg-[#2D3748] text-xs font-semibold rounded text-[#9CA3AF] transition-colors h-fit md:mb-0.5"
            >
              Reset Filters
            </button>
          </div>

          {/* Table list */}
          <div className="bg-[#1F2937] border border-[#374151] rounded overflow-hidden">
            {loading && jobs.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="h-4 w-4 animate-spin text-[#2563EB] mr-2" />
                <span className="text-xs text-[#9CA3AF]">Querying execution logs...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#374151] bg-[#111827] text-[#9CA3AF] uppercase tracking-wider font-semibold text-[10px] sticky top-0 z-10 select-none">
                      <th className="p-3">Job ID</th>
                      <th className="p-3">Queue</th>
                      <th className="p-3">Logic Type</th>
                      <th className="p-3 text-center">Priority</th>
                      <th className="p-3 text-center">Attempts</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#374151] text-[#F9FAFB]">
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-6 text-center text-[#9CA3AF] font-mono text-[11px]">
                          No jobs matching filters found.
                        </td>
                      </tr>
                    ) : (
                      jobs.map((j) => {
                        let payloadType = 'GENERIC';
                        try {
                          payloadType = JSON.parse(j.payload).type || 'GENERIC';
                        } catch {}

                        return (
                          <tr 
                            key={j.id} 
                            onClick={() => setSelectedJobId(j.id)}
                            className="hover:bg-[#2D3748] transition-colors cursor-pointer"
                          >
                            <td className="p-3 font-mono font-semibold text-[#2563EB] max-w-[120px] truncate" title={j.id}>
                              {j.id}
                            </td>
                            <td className="p-3 font-mono text-xs">{j.queue_name}</td>
                            <td className="p-3">
                              <span className="px-1.5 py-0.5 bg-[#111827] border border-[#374151] rounded text-[10px] font-bold font-mono">
                                {payloadType}
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono">{j.priority}</td>
                            <td className="p-3 text-center font-mono">{j.retry_count} / {j.max_retries}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono inline-block ${getStatusBadgeClass(j.status)}`}>
                                {j.status}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono text-[#9CA3AF]">
                              {new Date(j.created_at).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-3 bg-[#111827] border-t border-[#374151] select-none">
                <span className="text-[10px] text-[#9CA3AF] font-mono">
                  Showing Page {currentPage} of {totalPages} ({totalJobsCount} total logged records)
                </span>
                
                <div className="flex items-center space-x-1.5">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-2 py-1 bg-[#1F2937] border border-[#374151] hover:bg-[#2D3748] rounded text-xs font-semibold text-[#9CA3AF] disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-2 py-1 bg-[#1F2937] border border-[#374151] hover:bg-[#2D3748] rounded text-xs font-semibold text-[#9CA3AF] disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Manual Job Dispatch Form View */}
      {viewMode === 'submit' && !selectedJobId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Form Parameters */}
          <div className="lg:col-span-2 bg-[#1F2937] border border-[#374151] p-5 rounded space-y-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider flex items-center">
              <Send className="h-4 w-4 mr-1.5 shrink-0 text-[#2563EB]" /> Dispatch Parameter Specifications
            </h3>
            
            <form onSubmit={handleJobSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Target Queue</label>
                  <select 
                    value={subQueueId}
                    onChange={e => setSubQueueId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#9CA3AF] focus:outline-none focus:border-[#2563EB]"
                  >
                    {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Job Priority (1-10)</label>
                  <input 
                    type="number"
                    min="1"
                    max="10"
                    value={subPriority}
                    onChange={e => setSubPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#374151] pt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Job Execution Type</label>
                  <select 
                    value={subType}
                    onChange={e => setSubType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#9CA3AF] focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="GENERIC">GENERIC (Background timer)</option>
                    <option value="COMPUTE">COMPUTE (Mock CPU simulation)</option>
                    <option value="HTTP">HTTP (Webhook callback)</option>
                    <option value="EMAIL">EMAIL (SMTP notification)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Execution Delay (optional seconds)</label>
                  <input 
                    type="number"
                    placeholder="seconds (empty for immediate)"
                    value={subDelay}
                    onChange={e => setSubDelay(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Parent Job Dependencies (optional)</label>
                <input 
                  type="text"
                  placeholder="Parent Job UUIDs (comma-separated, e.g. uuid-1, uuid-2)"
                  value={subDependsOn}
                  onChange={e => setSubDependsOn(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>

              {/* Conditional Payload parameters */}
              <div className="border-t border-[#374151] pt-4 mt-2">
                <span className="text-[11px] font-semibold text-[#9CA3AF] block mb-3">Payload Task Parameters</span>
                
                {subType === 'GENERIC' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Simulation Sleep Duration (seconds)</label>
                    <input 
                      type="number"
                      value={genericDuration}
                      onChange={e => setGenericDuration(e.target.value)}
                      className="w-48 px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                    />
                  </div>
                )}

                {subType === 'COMPUTE' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Number of computation steps</label>
                    <input 
                      type="number"
                      min="1"
                      value={computeSteps}
                      onChange={e => setComputeSteps(e.target.value)}
                      className="w-48 px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                    />
                  </div>
                )}

                {subType === 'HTTP' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Webhook URL</label>
                        <input 
                          type="url"
                          required
                          placeholder="https://api.domain.com/webhook"
                          value={httpUrl}
                          onChange={e => setHttpUrl(e.target.value)}
                          className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">HTTP Method</label>
                        <select 
                          value={httpMethod}
                          onChange={e => setHttpMethod(e.target.value)}
                          className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#9CA3AF] focus:outline-none focus:border-[#2563EB]"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Request Body (optional JSON)</label>
                      <textarea 
                        placeholder="{}"
                        value={httpBody}
                        onChange={e => setHttpBody(e.target.value)}
                        className="w-full h-20 px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                      />
                    </div>
                  </div>
                )}

                {subType === 'EMAIL' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Recipient Address</label>
                        <input 
                          type="email"
                          required
                          placeholder="user@domain.com"
                          value={emailTo}
                          onChange={e => setEmailTo(e.target.value)}
                          className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Email Subject</label>
                        <input 
                          type="text"
                          required
                          placeholder="Notification Alert"
                          value={emailSubject}
                          onChange={e => setEmailSubject(e.target.value)}
                          className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Body Text</label>
                      <textarea 
                        required
                        placeholder="Type email body message..."
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        className="w-full h-20 px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button 
                type="submit" 
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#2563EB]/90 text-white font-semibold text-xs rounded transition-colors"
              >
                Enqueue Job
              </button>
            </form>
          </div>

          {/* SRE Instructions Card */}
          <div className="bg-[#1F2937] border border-[#374151] p-4 rounded h-fit text-xs space-y-3">
            <h4 className="font-bold text-[#F9FAFB]">Operations Notice</h4>
            <p className="text-[#9CA3AF] leading-relaxed">
              Manually enqueued jobs will be placed at the tail of the selected queue. 
              Execution depends on current queue limits, priority queues, and concurrency slots configured on active nodes.
            </p>
            <div className="p-3 bg-[#111827] border border-[#374151] rounded">
              <span className="font-bold text-[10px] text-[#9CA3AF] uppercase block mb-1">Priority Hierarchy:</span>
              <span className="text-[#9CA3AF] leading-snug">
                10 represents the highest scheduler priority. Jobs in Priority 10 are claimed before Priority 1.
              </span>
            </div>
          </div>

        </div>
      )}

      {/* 4. Cron Schedules list view */}
      {viewMode === 'recurring' && !selectedJobId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List of Schedules */}
          <div className="lg:col-span-2 bg-[#1F2937] border border-[#374151] rounded flex flex-col justify-between overflow-hidden h-fit">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#374151] bg-[#111827] text-[#9CA3AF] uppercase tracking-wider font-semibold text-[10px] select-none">
                    <th className="p-3">Schedule Name</th>
                    <th className="p-3">Queue</th>
                    <th className="p-3 text-center">Cron Pattern</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Next Run</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#374151] text-[#F9FAFB]">
                  {recurringJobs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-[#9CA3AF] font-mono text-[11px]">
                        No recurring cron jobs configured. Define one using the panel on the right.
                      </td>
                    </tr>
                  ) : (
                    recurringJobs.map((rJob) => (
                      <tr key={rJob.id} className="hover:bg-[#2D3748] transition-colors">
                        <td className="p-3 font-semibold text-xs text-[#2563EB]">{rJob.name}</td>
                        <td className="p-3 font-mono">{rJob.queue_id}</td>
                        <td className="p-3 text-center font-mono text-[#F9FAFB]">{rJob.cron_expression}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono ${
                            rJob.is_active 
                              ? 'bg-[#16A34A]/10 border border-[#16A34A]/30 text-[#16A34A]' 
                              : 'bg-[#374151]/50 border border-[#374151] text-[#9CA3AF]'
                          }`}>
                            {rJob.is_active ? 'ACTIVE' : 'PAUSED'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-[#9CA3AF]">
                          {rJob.is_active ? new Date(rJob.next_run_at).toLocaleString() : 'Suspended'}
                        </td>
                        <td className="p-3 text-right">
                          <button 
                            onClick={() => handleToggleCron(rJob.id)}
                            className={`p-1.5 border rounded transition-colors ${
                              rJob.is_active
                                ? 'bg-[#D97706]/10 border-[#D97706]/30 text-[#D97706] hover:bg-[#D97706]/20'
                                : 'bg-[#16A34A]/10 border-[#16A34A]/30 text-[#16A34A] hover:bg-[#16A34A]/20'
                            }`}
                            title={rJob.is_active ? 'Pause schedule' : 'Activate schedule'}
                          >
                            {rJob.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cron Creator Form */}
          <div className="bg-[#1F2937] border border-[#374151] p-4 rounded h-fit">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider mb-4 flex items-center">
              <Plus className="h-4 w-4 mr-1 shrink-0 text-[#2563EB]" /> Define Recurring Schedule
            </h3>
            
            <form onSubmit={handleCronSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Schedule Identifier Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. hourly-db-purge"
                  value={cronName}
                  onChange={e => setCronName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Cron Pattern</label>
                <input 
                  type="text" 
                  required
                  placeholder="*/5 * * * *"
                  value={cronExpression}
                  onChange={e => setCronExpression(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                />
                <span className="text-[9px] text-[#9CA3AF] mt-1 block">5-field pattern: min hour day-of-month month day-of-week</span>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-[#374151] pt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Target Queue</label>
                  <select 
                    value={subQueueId}
                    onChange={e => setSubQueueId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#9CA3AF] focus:outline-none focus:border-[#2563EB]"
                  >
                    {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#9CA3AF] mb-1">Priority</label>
                  <input 
                    type="number"
                    min="1"
                    max="10"
                    value={subPriority}
                    onChange={e => setSubPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-2 bg-[#2563EB] hover:bg-[#2563EB]/90 text-white font-semibold text-xs rounded transition-colors"
              >
                Deploy Recurring Job
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
