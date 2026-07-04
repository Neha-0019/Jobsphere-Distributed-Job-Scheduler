import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { RefreshCw, BarChart2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Metrics() {
  const { api, refreshTrigger } = useApp();
  const [throughput, setThroughput] = useState([]);
  const [latency, setLatency] = useState({ p50: 0, p95: 0, p99: 0 });
  const [queueDepth, setQueueDepth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMetrics = async () => {
    try {
      const [tpResp, latResp, qdResp] = await Promise.all([
        api.get('/metrics/throughput'),
        api.get('/metrics/latency'),
        api.get('/metrics/queue-depth')
      ]);
      
      if (tpResp.data.success) {
        setThroughput(tpResp.data.data || []);
      }
      if (latResp.data.success) {
        setLatency(latResp.data || { p50: 0, p95: 0, p99: 0 });
      }
      if (qdResp.data.success) {
        setQueueDepth(qdResp.data.data || []);
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

  // Format queue depth snapshots grouped by timestamp
  const formatQueueDepthData = () => {
    const timeBuckets = {};
    queueDepth.forEach(snapshot => {
      const timeLabel = formatTimeLabel(snapshot.timestamp);
      if (!timeBuckets[timeLabel]) {
        timeBuckets[timeLabel] = { time: timeLabel };
      }
      timeBuckets[timeLabel][snapshot.queue_name] = snapshot.depth;
    });
    return Object.values(timeBuckets);
  };
  
  const queueDepthChartData = formatQueueDepthData();
  const uniqueQueueNames = Array.from(new Set(queueDepth.map(s => s.queue_name)));
  const LINE_COLORS = ['#5fb87a', '#8b7fc4', '#d9a94f', '#e15456', '#3da8e8', '#e85da3'];
  
  const latencyChartData = [
    { name: 'P50 (Median)', latency: latency.p50, fill: '#5fb87a' },
    { name: 'P95 (Tail)', latency: latency.p95, fill: '#d9a94f' },
    { name: 'P99 (Worst Case)', latency: latency.p99, fill: '#e15456' }
  ];

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
                <defs>
                  <linearGradient id="colorCompletedMetrics" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5fb87a" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#5fb87a" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailedMetrics" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e15456" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#e15456" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }} />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Area type="monotone" dataKey="completed" name="Success" stroke="#5fb87a" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCompletedMetrics)" />
                <Area type="monotone" dataKey="failed" name="Failed" stroke="#e15456" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFailedMetrics)" />
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
                <Line type="monotone" dataKey="total" name="Total Dispatch Volume" stroke="#d9a94f" strokeWidth={2.5} activeDot={{ r: 4 }} />
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
                <Bar dataKey="completed" name="Success runs" fill="#5fb87a" stackId="a" />
                <Bar dataKey="failed" name="Failed runs" fill="#e15456" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Queue Depth over Time */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Queue Depth Over Time</h3>
            <p className="text-[10px] text-[#9CA3AF]">Sampled backlog depths per queue (Last 6h)</p>
          </div>
          <div className="h-64 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={queueDepthChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }} />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                {uniqueQueueNames.map((name, idx) => (
                  <Line 
                    key={name}
                    type="monotone"
                    dataKey={name}
                    name={name}
                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                    strokeWidth={2}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Percentile Latency */}
        <div className="bg-[#1F2937] border border-[#374151] p-4 rounded">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#F9FAFB] uppercase tracking-wider">Execution Latency Percentiles</h3>
            <p className="text-[10px] text-[#9CA3AF]">P50, P95, and P99 completed latencies (ms)</p>
          </div>
          <div className="h-64 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9CA3AF" tickLine={false} />
                <YAxis stroke="#9CA3AF" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F9FAFB' }} />
                <Bar dataKey="latency" name="Latency (ms)" fill="#3B82F6">
                  {latencyChartData.map((entry, index) => (
                    <Bar key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
