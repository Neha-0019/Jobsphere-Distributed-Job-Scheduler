import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AppContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function AppProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
  const [project, setProject] = useState(JSON.parse(localStorage.getItem('project')));
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');

  // Create configured Axios instance
  const api = axios.create({
    baseURL: API_URL
  });

  // Attach token interceptor
  api.interceptors.request.use((config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }, (error) => {
    return Promise.reject(error);
  });

  const login = (newToken, newUser, newProject) => {
    setToken(newToken);
    setUser(newUser);
    setProject(newProject);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('project', JSON.stringify(newProject));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setProject(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('project');
  };

  const updateProject = (updatedProj) => {
    setProject(updatedProj);
    localStorage.setItem('project', JSON.stringify(updatedProj));
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // WebSocket Live Updates Connection
  useEffect(() => {
    if (!token) {
      setConnectionStatus('DISCONNECTED');
      return;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${wsProto}//localhost:5000/ws`;
    
    if (API_URL.startsWith('http')) {
      const parsedUrl = new URL(API_URL);
      wsUrl = `${parsedUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsedUrl.host}/ws`;
    }

    let socket;
    let reconnectTimeout;

    function connect() {
      setConnectionStatus('CONNECTING');
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setConnectionStatus('CONNECTED');
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event) {
            triggerRefresh();
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      socket.onclose = () => {
        setConnectionStatus('DISCONNECTED');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        setConnectionStatus('ERROR');
      };
    }

    connect();

    return () => {
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, [token]);

  return (
    <AppContext.Provider value={{
      token,
      user,
      project,
      api,
      apiUrl: API_URL,
      refreshTrigger,
      connectionStatus,
      login,
      logout,
      updateProject,
      triggerRefresh
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
