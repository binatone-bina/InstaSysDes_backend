import React, { useState } from 'react';
import { MessageSquare, User, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

interface AuthProps {
  onBackToHome: () => void;
  onSuccess: () => void;
}

export default function Auth({ onBackToHome, onSuccess }: AuthProps) {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (activeTab === 'signin') {
        await login(email, password);
      } else {
        if (!username.trim()) {
          throw new Error('Username is required');
        }
        await signUp(username, email, password);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTabChange = (tab: 'signin' | 'signup') => {
    setActiveTab(tab);
    setError(null);
    setUsername('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className="auth-container">
      {/* Decorative Glow elements */}
      <div className="bg-glow glow-1"></div>
      <div className="bg-glow glow-2"></div>

      <a href="#" className="auth-logo-link" onClick={(e) => { e.preventDefault(); onBackToHome(); }}>
        <MessageSquare size={30} style={{ color: 'var(--accent-primary)' }} />
        <span>ConnectSphere</span>
      </a>

      <div className="auth-card glass">
        <div className="auth-tabs">
          <button 
            className={`auth-tab ${activeTab === 'signin' ? 'active' : ''}`}
            onClick={() => handleTabChange('signin')}
            disabled={submitting}
          >
            Sign In
          </button>
          <button 
            className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => handleTabChange('signup')}
            disabled={submitting}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {activeTab === 'signup' && (
            <div className="form-group">
              <label className="form-label">Username</label>
              <div className="input-field-wrapper">
                <User size={18} style={{ color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="Type a unique username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-field-wrapper">
              <Mail size={18} style={{ color: 'var(--text-secondary)' }} />
              <input 
                type="email" 
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-field-wrapper">
              <Lock size={18} style={{ color: 'var(--text-secondary)' }} />
              <input 
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary auth-submit-btn"
            disabled={submitting}
          >
            {submitting ? 'Please wait...' : activeTab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer-text">
          {activeTab === 'signin' ? (
            <>
              Don't have an account?{' '}
              <span onClick={() => handleTabChange('signup')}>Sign Up</span>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <span onClick={() => handleTabChange('signin')}>Sign In</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
