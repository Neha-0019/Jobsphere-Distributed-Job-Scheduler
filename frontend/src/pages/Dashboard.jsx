import React, { useState, useEffect } from 'react';
import { 
  Activity, Layers, CheckCircle, AlertTriangle, Clock, Cpu, RefreshCw, BarChart2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from 'recharts';
import { useApp } from '../contexts/AppContext';

export default function Dashboard() {
  const { api, refreshTrigger } = useApp();
  const [stats, setStats] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [throughput, setThroughput] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const statsResp = await api.get('/metrics/overview');
      if (statsResp.data.success) {
        setStats(statsResp.data.stats);
        setWorkers(statsResp.data.workers || []);
      }

      const tpResp = await api.get('/metrics/throughput');
      if (tpResp.data.success) {
        setThroughput(tpResp.data.data || []);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching telemetry data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  if (loading && !stats) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#1F2937] border border-[#374151] rounded">
        <div className="flex items-center space-x-2 text-[#9CA3AF]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#2563EB]" />
          <span className="text-xs">Fetching telemetry...</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-4 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] text-xs rounded">
        Failed to fetch stats: {error}
      </div>
    );
  }

  const { status_counts = {}, active_workers = 0, avg_execution_time_ms = 0, success_rate_percent = 100 } = stats || {};

  const totalJobs = Object.values(status_counts).reduce((a, b) => a + b, 0);
  const queuedCount = (status_counts.QUEUED || 0) + (status_counts.SCHEDULED || 0);
  const runningCount = (status_counts.RUNNING || 0) + (status_counts.CLAIMED || 0);
  const completedCount = status_counts.COMPLETED || 0;
  const failedCount = (status_counts.FAILED || 0) + (status_counts.FAILED_DLQ || 0);
  const activeWorkersCount = active_workers;

  // Format iso timestamp into browser-local hour-minute string
  const formatTimeLabel = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return isoString;
    }
  };

  const chartData = throughput.map(d => ({
    time: formatTimeLabel(d.time),
    completed: d.completed,
    failed: d.failed,
    total: d.completed + d.failed
  }));

  const kpis = [
    { title: 'Total Jobs', value: totalJobs, sub: 'All-time log entries' },
    { title: 'Queued', value: queuedCount, sub: 'Scheduled & Pending' },
    { title: 'Running', value: runningCount, sub: 'Active Executions' },
    { title: 'Completed', value: completedCount, sub: 'Processed successfully' },
    { title: 'Failed', value: failedCount, sub: 'Exhausted & DLQ' },
  ];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-[#F9FAFB] tracking-tight">OPERATIONS OVERVIEW</h2>
        <p className="text-xs text-[#9CA3AF]">Real-time queue analytics and engine telemetry</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
        {/* Hero Card: Active Workers (spans 2 columns on medium/large screens) */}
        <div className="bg-[#1F2937] border border-[#374151] border-l-4 border-l-[#8b7fc4] p-5 rounded flex flex-col justify-between md:col-span-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F9FAFB]">Active Workers</span>
            <Cpu className="h-5 w-5 text-[#8b7fc4]" />
          </div>
          <div className="flex items-baseline space-x-2 mt-3">
            <span className="text-4xl font-extrabold text-[#F9FAFB] font-mono tracking-tight">{activeWorkersCount}</span>
            <span className="text-[10px] text-[#7a9b6e] font-mono font-bold uppercase tracking-wider animate-pulse">online</span>
          </div>
          <span className="text-[10px] text-[#9CA3AF] mt-2">Active daemon threads polling and claiming tasks</span>
        </div>

        {/* Other 5 standard cards with subtle dividers */}
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-[#1F2937]/40 border-b border-[#374151] p-4 rounded flex flex-col justify-between">
            <span className="text-xs font-medium text-[#9CA3AF]">{kpi.title}</span>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-2xl font-bold text-[#F9FAFB] font-mono tracking-tight">{kpi.value}</span>
            </div>
            <span className="text-[9px] text-[#9CA3AF] mt-1">{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Queue Throughput */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Queue Throughput (Last 60m)</h3>
            <p className="text-[10px] text-[#9CA3AF]">Completed vs failed jobs in 5-minute intervals</p>
          </div>
          <div className="h-64 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5fb87a" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#5fb87a" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e15456" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#e15456" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Area type="monotone" dataKey="completed" name="Success" stroke="#5fb87a" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCompleted)" />
                <Area type="monotone" dataKey="failed" name="Failed" stroke="#e15456" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFailed)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Jobs per Minute */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Jobs Dispatched Trend</h3>
            <p className="text-[10px] text-[#9CA3AF]">Aggregated task processing rates</p>
          </div>
          <div className="h-64 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }}
                />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Bar dataKey="total" name="Total Executions" fill="#d9a94f" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Avg Execution Time / Latency */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Engine Performance Metrics</h3>
              <p className="text-[10px] text-[#9CA3AF]">
                Average process duration: <span className="font-mono">{(avg_execution_time_ms / 1000).toFixed(2)}s</span> | Success Rate: <span className="font-mono">{success_rate_percent}%</span>
              </p>
            </div>
            <div className="text-[11px] text-[#5fb87a] font-mono">
              ✓ All systems operational
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#111827]/40 border-b border-[#374151] rounded">
              <span className="text-xs font-medium text-[#9CA3AF] block mb-2">Average Latency</span>
              <div className="text-2xl font-bold text-[#F9FAFB] font-mono tracking-tight">
                {avg_execution_time_ms >= 1000 
                  ? `${(avg_execution_time_ms / 1000).toFixed(2)}s` 
                  : `${avg_execution_time_ms.toFixed(0)}ms`}
              </div>
              <span className="text-[9px] text-[#9CA3AF] block mt-1">Average execution loop latency across all active queues</span>
            </div>
            
            <div className="p-4 bg-[#111827]/40 border-b border-[#374151] rounded">
              <span className="text-xs font-medium text-[#9CA3AF] block mb-2">Success Rate</span>
              <div className="text-2xl font-bold text-[#5fb87a] font-mono tracking-tight">{success_rate_percent}%</div>
              <span className="text-[9px] text-[#9CA3AF] block mt-1">Percentage of executions ending in completed status vs DLQ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
