import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './contexts/AppContext';
import Auth from './components/Auth';
import Layout from './layouts/Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Queues from './pages/Queues';
import Jobs from './pages/Jobs';
import Workers from './pages/Workers';
import RetryPolicies from './pages/RetryPolicies';
import DLQ from './pages/DLQ';
import Metrics from './pages/Metrics';
import Settings from './pages/Settings';

export default function App() {
  const { token, login, apiUrl } = useApp();

  if (!token) {
    return <Auth onAuthSuccess={login} api_url={apiUrl} />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/queues" element={<Queues />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/retry-policies" element={<RetryPolicies />} />
          <Route path="/dlq" element={<DLQ />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
