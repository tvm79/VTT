import { useState } from 'react';
import { socketService } from '../../services/socket';
import './LoginPanel.css';

interface LoginPanelProps {
  onSettingsClick?: () => void;
}

/**
 * LoginPanel - DOM-based login UI component
 * 
 * Contains:
 * - Title
 * - Create session button
 * - Join session input
 * - Join session button
 * - Settings button
 */
export function LoginPanel({ onSettingsClick }: LoginPanelProps) {
  const [sessionName, setSessionName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createMode, setCreateMode] = useState(false);
  const [joinMode, setJoinMode] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) return;
    
    setLoading(true);
    setError('');
    socketService.createSession(sessionName);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    
    setLoading(true);
    setError('');
    socketService.joinSession(roomCode.toUpperCase());
  };

  const toggleCreate = () => {
    setCreateMode(!createMode);
    setJoinMode(false);
    setSessionName('');
    setError('');
  };

  const toggleJoin = () => {
    setJoinMode(!joinMode);
    setCreateMode(false);
    setRoomCode('');
    setError('');
  };

  return (
    <div className="login-panel">
      {/* Title */}
      <div className="login-panel-header">
        <h1 className="login-title">Virtual Tabletop</h1>
        <p className="login-subtitle">Create or join an adventure</p>
      </div>

      {error && <div className="login-error">{error}</div>}

      {/* Create Session Section */}
      <div className={`login-section ${createMode ? 'active' : ''}`}>
        {!createMode ? (
          <button 
            className="login-button login-button-primary" 
            onClick={toggleCreate}
          >
            <span className="login-button-icon">+</span>
            <span>Create Session</span>
          </button>
        ) : (
          <form className="login-form" onSubmit={handleCreate}>
            <input
              type="text"
              className="login-input"
              placeholder="Enter session name..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              required
              autoFocus
            />
            <div className="login-form-actions">
              <button 
                type="button" 
                className="login-button login-button-secondary"
                onClick={toggleCreate}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="login-button login-button-primary"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Join Session Section */}
      <div className={`login-section ${joinMode ? 'active' : ''}`}>
        {!joinMode ? (
          <button 
            className="login-button login-button-secondary" 
            onClick={toggleJoin}
          >
            <span className="login-button-icon">🔗</span>
            <span>Join Session</span>
          </button>
        ) : (
          <form className="login-form" onSubmit={handleJoin}>
            <input
              type="text"
              className="login-input"
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={8}
              required
              autoFocus
            />
            <div className="login-form-actions">
              <button 
                type="button" 
                className="login-button login-button-secondary"
                onClick={toggleJoin}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="login-button login-button-primary"
                disabled={loading}
              >
                {loading ? 'Joining...' : 'Join'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Settings Button */}
      <div className="login-settings">
        <button 
          className="login-button login-button-settings" 
          onClick={onSettingsClick}
        >
          <span className="login-button-icon">⚙️</span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}

export default LoginPanel;
