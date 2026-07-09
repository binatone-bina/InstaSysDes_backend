import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAccessToken } from '../services/api';

interface User {
  id: string;
  username: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if we already have an active session (by calling refresh)
  useEffect(() => {
    const initAuth = async () => {
      try {
        const response = await api.post('/api/v1/auth/refresh');
        if (response.ok) {
          const data = await response.json();
          setAccessToken(data.accessToken);
          
          // Get user details
          const profileResponse = await api.get('/api/v1/profiles/me');
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            setUser({
              id: profileData.user_id,
              username: profileData.username,
              email: profileData.email || ''
            });
          }
        }
      } catch (err) {
        console.error('Failed to restore authentication session:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth failures (e.g. token expired and refresh failed)
    const handleAuthFailed = () => {
      setUser(null);
      setAccessToken(null);
    };

    window.addEventListener('auth-failed', handleAuthFailed);
    return () => {
      window.removeEventListener('auth-failed', handleAuthFailed);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post('/api/v1/auth/login', { email, password });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }
    const data = await response.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const signUp = async (username: string, email: string, password: string) => {
    const response = await api.post('/api/v1/auth/signup', { username, email, password });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Signup failed');
    }
    const data = await response.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
