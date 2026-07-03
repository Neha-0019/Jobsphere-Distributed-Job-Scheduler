import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { RefreshCw, BarChart2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Metrics() {
  const { api, refreshTrigger } = useApp();
  const [throughput, setThroughput] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMetrics = async () => {
    try {
      const tpResp = await api.get('/metrics/throughput');
      if (tpResp.data.success) {
        setThroughput(tpResp.data.data || []);
      }
      setError('');
    } catch (err) {
      setError('Failed to fetch detailed telemetry metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [refreshTrigger]);

  if (loading && throughput.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#1F2937] border border-[#374151] rounded">
        <div className="flex items-center space-x-2 text-[#9CA3AF]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#2563EB]" />
          <span className="text-xs">Loading detailed metrics...</span>
        </div>
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-[#F9FAFB]">Detailed System Metrics</h2>
        <p className="text-xs text-[#9CA3AF]">SRE Observability telemetry: throughput rates, processing latency, and execution reliability</p>
      </div>

      {error && (
        <div className="p-3 bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#DC2626] rounded text-xs">
          {error}
        </div>
      )}

      {/* Grid of charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Queue Throughput Area */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Queue Throughput Rate</h3>
            <p className="text-[10px] text-[#9CA3AF]">Active completions vs failures (Last 60m)</p>
          </div>
          <div className="h-64 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }} />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Area type="monotone" dataKey="completed" name="Success" stroke="#16A34A" fill="#16A34A" fillOpacity={0.1} />
                <Area type="monotone" dataKey="failed" name="Failed" stroke="#DC2626" fill="#DC2626" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Jobs per minute Line */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Jobs Dispatched per Minute</h3>
            <p className="text-[10px] text-[#9CA3AF]">Frequency of claimed jobs processed by workers</p>
          </div>
          <div className="h-64 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }} />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Line type="monotone" dataKey="total" name="Total Dispatch Volume" stroke="#2563EB" strokeWidth={2} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Failure Rate Bar */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Failure Rate Analysis</h3>
            <p className="text-[10px] text-[#9CA3AF]">Comparison of failed attempts vs successful processed executions</p>
          </div>
          <div className="h-64 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }} />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Bar dataKey="completed" name="Success runs" fill="#16A34A" stackId="a" />
                <Bar dataKey="failed" name="Failed runs" fill="#DC2626" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
