import { useState } from 'react';
import { socketService } from '../services/socket';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDiceD20, faPlus, faLink } from '@fortawesome/free-solid-svg-icons';

export function SessionScreen() {
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
    <div className="session-screen">
      <div className="session-backdrop" />
      <div className="session-bg-icon">
        <FontAwesomeIcon icon={faDiceD20} />
      </div>
      <div className="session-container">
        <div className="session-title">
          <h1>Virtual Tabletop</h1>
          <p>Create a new adventure or join an existing one</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="session-actions">
          <div className={`session-card ${createMode ? 'active' : ''}`}>
            {!createMode ? (
              <button className="session-card-button" onClick={toggleCreate}>
                <span className="session-card-icon">
                  <FontAwesomeIcon icon={faPlus} />
                </span>
                <span className="session-card-text">Create Session</span>
              </button>
            ) : (
              <>
                <button className="session-card-button active" onClick={toggleCreate}>
                  <span className="session-card-icon">
                    <FontAwesomeIcon icon={faPlus} />
                  </span>
                  <span className="session-card-text">Create Session</span>
                </button>
                <form className="session-card-form" onSubmit={handleCreate}>
                  <input
                    type="text"
                    placeholder="Enter session name..."
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    required
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Creating...' : 'Create'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className={`session-card ${joinMode ? 'active' : ''}`}>
            {!joinMode ? (
              <button className="session-card-button" onClick={toggleJoin}>
                <span className="session-card-icon">
                  <FontAwesomeIcon icon={faLink} />
                </span>
                <span className="session-card-text">Join Session</span>
              </button>
            ) : (
              <>
                <button className="session-card-button active" onClick={toggleJoin}>
                  <span className="session-card-icon">
                    <FontAwesomeIcon icon={faLink} />
                  </span>
                  <span className="session-card-text">Join Session</span>
                </button>
                <form className="session-card-form" onSubmit={handleJoin}>
                  <input
                    type="text"
                    placeholder="Room Code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    required
                    autoFocus
                  />
                  <button type="submit" className="btn btn-secondary" disabled={loading}>
                    {loading ? 'Joining...' : 'Join'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
