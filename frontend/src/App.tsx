import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import './App.css';

function MainAppContent() {
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-heading)'
      } as any}>
        <div className="typing-indicator" style={{ scale: '1.5' }}>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Securing connection to ConnectSphere...</p>
      </div>
    );
  }

  // If user is authenticated, render the Profile Workspace Dashboard
  if (user) {
    return (
      <Profile />
    );
  }

  // Guest view selection
  if (view === 'auth') {
    return (
      <Auth 
        onBackToHome={() => setView('landing')} 
        onSuccess={() => setView('landing')} 
      />
    );
  }

  return (
    <Home onAuthRequest={() => setView('auth')} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
