import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [resetToken, setResetToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Authentication failed');
        }

        localStorage.setItem('vtt_token', data.token);
        useGameStore.getState().setUser(data.user, data.token);
        socketService.authenticate(data.token);
      } else if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Registration failed');
        }

        localStorage.setItem('vtt_token', data.token);
        useGameStore.getState().setUser(data.user, data.token);
        socketService.authenticate(data.token);
      } else if (mode === 'forgot-password') {
        const res = await fetch('/api/auth/reset-password-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to request password reset');
        }

        // In development, auto-switch to reset form with token
        if (data.devToken) {
          setResetToken(data.devToken);
          setMode('reset-password');
          setSuccessMessage('Enter the reset token and your new password');
        } else {
          setSuccessMessage('If an account exists with this email, a reset link has been sent');
        }
      } else if (mode === 'reset-password') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }

        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, newPassword: password }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to reset password');
        }

        setSuccessMessage('Password has been reset successfully! You can now login.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setResetToken('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setSuccessMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div 
      className="auth-screen"
      style={{
        backgroundImage: 'url(/Background.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="auth-backdrop" />
      <div className="auth-container">
        {/* Logo / Title */}
        <div className="auth-logo">
          <div className="auth-logo-icon">⚔️</div>
          <h1 className="auth-title">Realm VTT</h1>
          <p className="auth-subtitle">Virtual Tabletop Adventure</p>
        </div>

        {mode === 'login' || mode === 'register' ? (
          <>
            <div className="auth-tabs">
              <button
                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => handleModeChange('login')}
              >
                Sign In
              </button>
              <button
                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => handleModeChange('register')}
              >
                Create Account
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message">{successMessage}</div>}

              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={50}
                  placeholder="Enter your username"
                />
              </div>

              {mode === 'register' && (
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? (
                  <span className="btn-loading">Loading...</span>
                ) : mode === 'login' ? (
                  <span>Enter Realm</span>
                ) : (
                  <span>Begin Adventure</span>
                )}
              </button>

              {mode === 'login' && (
                <div className="auth-links">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleModeChange('forgot-password')}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}
            </form>
          </>
        ) : mode === 'forgot-password' ? (
          <>
            <div className="auth-form-header">
              <h2>Reset Password</h2>
              <p className="auth-description">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message" style={{ whiteSpace: 'pre-wrap' }}>{successMessage}</div>}

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                />
              </div>

              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="auth-links">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleModeChange('login')}
                >
                  ← Back to Login
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="auth-form-header">
              <h2>New Password</h2>
              <p className="auth-description">
                Enter the reset token from your email and create a new password.
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message">{successMessage}</div>}

              <div className="form-group">
                <label>Reset Token</label>
                <input
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                  placeholder="Enter the token from your email"
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <div className="auth-links">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleModeChange('login')}
                >
                  ← Back to Login
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
