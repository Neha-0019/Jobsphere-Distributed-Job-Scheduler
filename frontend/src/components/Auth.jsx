import React, { useState } from 'react';
import { Activity, Mail, Lock, Building, Layers } from 'lucide-react';

export default function Auth({ onAuthSuccess, api_url }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const body = isLogin 
      ? { email, password }
      : { email, password, organization_name: orgName, project_name: projectName };

    try {
      const resp = await fetch(`${api_url}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const resData = await resp.json();
      if (!resp.ok || !resData.success) {
        throw new Error(resData.message || 'Authentication failed');
      }

      onAuthSuccess(resData.token, resData.user, resData.project);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#111827] text-[#F9FAFB] select-none">
      <div className="w-full max-w-sm p-6 bg-[#1F2937] border border-[#374151] rounded m-4">
        
        {/* Header Logo */}
        <div className="flex flex-col items-center justify-center text-center mb-6">
          <div className="p-2 bg-[#2563EB]/10 text-[#2563EB] rounded border border-[#2563EB]/20 mb-2">
            <Activity className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-[#F9FAFB]">JobSphere Operations</h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Production Distributed Job Scheduling Platform</p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#DC2626] text-center font-semibold font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#9CA3AF]" />
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operator@domain.com"
                className="w-full pl-10 pr-4 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] placeholder-slate-600 focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#9CA3AF]" />
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] placeholder-slate-600 focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          {!isLogin && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Organization Name</label>
                <div className="relative">
                  <Building className="absolute left-3 top-2.5 h-4 w-4 text-[#9CA3AF]" />
                  <input 
                    type="text" 
                    required
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="e.g. SRE Department"
                    className="w-full pl-10 pr-4 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] placeholder-slate-600 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Default Project Name</label>
                <div className="relative">
                  <Layers className="absolute left-3 top-2.5 h-4 w-4 text-[#9CA3AF]" />
                  <input 
                    type="text" 
                    required
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="e.g. Production Cluster"
                    className="w-full pl-10 pr-4 py-2 bg-[#111827] border border-[#374151] rounded text-xs text-[#F9FAFB] placeholder-slate-600 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>
            </>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-2 bg-[#2563EB] hover:bg-[#2563EB]/90 disabled:opacity-50 text-white font-semibold text-xs rounded transition-colors mt-2"
          >
            {loading ? 'Authenticating...' : isLogin ? 'Sign In to Console' : 'Register Operator'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-[#374151] text-center">
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-xs text-[#9CA3AF] hover:text-[#F9FAFB] font-semibold transition-colors"
          >
            {isLogin ? 'Create new operator account' : 'Sign in with existing credentials'}
          </button>
        </div>

      </div>
    </div>
  );
}
