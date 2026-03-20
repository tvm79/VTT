import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { socketService } from '../services/socket';

interface ProfilePanelProps {
  onClose?: () => void;
}

export function ProfilePanel({ onClose }: ProfilePanelProps) {
  const {
    user,
    token,
    isGM,
    session,
    players,
    profilePanelPosition,
    profilePanelSize,
    setProfilePanelPosition,
    setProfilePanelSize,
    setProfilePanelVisible,
    logout,
    colorScheme,
    userProfileImage,
    setUserProfileImage,
    setPlayerProfileImage,
    playerColor,
    setPlayerColor,
    centerProfilePanel,
  } = useGameStore();

  // Force re-render when playerColor changes externally
  const [, setForceUpdate] = useState(0);
  useEffect(() => {
    // This effect runs when playerColor changes in the store
    setForceUpdate(n => n + 1);
  }, [playerColor]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [activeTab, setActiveTab] = useState<'profile' | 'session' | 'settings'>('profile');
  const panelRef = useRef<HTMLDivElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  // Get the current user's player info from the session
  const currentPlayer = session?.players.find(p => p.userId === user?.id);

  // Center panel on first open
  useEffect(() => {
    centerProfilePanel();
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - profilePanelPosition.x,
        y: e.clientY - profilePanelPosition.y,
      });
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: profilePanelSize.width,
      height: profilePanelSize.height,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setProfilePanelPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
      if (isResizing) {
        const newWidth = Math.max(320, resizeStart.width + (e.clientX - resizeStart.x));
        const newHeight = Math.max(400, resizeStart.height + (e.clientY - resizeStart.y));
        setProfilePanelSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart, setProfilePanelPosition, setProfilePanelSize]);

  const handleClose = () => {
    setProfilePanelVisible(false);
    onClose?.();
  };

  const handleLogout = () => {
    logout();
    handleClose();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.url) {
        setUserProfileImage(data.url);
        // Also update player profile images for chat
        if (user?.id) {
          setPlayerProfileImage(user.id, data.url);
          // Broadcast to other players via socket
          socketService.sendProfileImageUpdate(user.id, data.url);
        }
        // Store in localStorage for persistence (current user's own image)
        localStorage.setItem('vtt_profileImage', data.url);
        // Also store in shared storage for other players
        const stored = JSON.parse(localStorage.getItem('vtt_playerProfileImages') || '{}');
        if (user?.id) {
          stored[user.id] = data.url;
          localStorage.setItem('vtt_playerProfileImages', JSON.stringify(stored));
        }
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }

    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = '';
    }
  };

  const handlePlayerColorChange = (color: string) => {
    setPlayerColor(color);
    localStorage.setItem('vtt_playerColor', color);
    // Update the session player color if in a session
    // Note: Socket update would go here if needed
  };

  // Load profile image and player color from localStorage on mount
  useEffect(() => {
    const savedImage = localStorage.getItem('vtt_profileImage');
    if (savedImage) {
      setUserProfileImage(savedImage);
      // Also update player profile images for chat
      if (user?.id) {
        setPlayerProfileImage(user.id, savedImage);
      }
    }
    const savedColor = localStorage.getItem('vtt_playerColor');
    if (savedColor) {
      setPlayerColor(savedColor);
    }
  }, [user]);

  if (!user) return null;

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: profilePanelPosition.x,
    top: profilePanelPosition.y,
    width: profilePanelSize.width,
    height: profilePanelSize.height,
    background: colorScheme?.id === 'custom' ? colorScheme.surface : '#2d3748',
    border: '1px solid #4a5568',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 1000,
  };

  return (
    <div ref={panelRef} style={panelStyle} onMouseDown={handleMouseDown}>
      {/* Header */}
      <div
        className="panel-header"
        style={{
          padding: '16px 20px',
          background: colorScheme?.id === 'custom' ? colorScheme.primary : '#4a5568',
          cursor: 'move',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon name="user" />
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>Profile</span>
        </div>
        <button
          onClick={handleClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="times" />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #4a5568',
          flexShrink: 0,
        }}
      >
        {(['profile', 'session', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === tab 
                ? (colorScheme?.id === 'custom' ? colorScheme.accent : '#ed8936') 
                : 'transparent',
              border: 'none',
              color: activeTab === tab ? '#fff' : '#a0aec0',
              cursor: 'pointer',
              fontSize: '13px',
              textTransform: 'capitalize',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
        }}
      >
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Profile Image */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <label
                htmlFor="profile-image-upload"
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <div
                  style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: userProfileImage 
                      ? `url(${userProfileImage}) center/cover` 
                      : (currentPlayer?.playerColor || playerColor),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '40px',
                    color: '#fff',
                    fontWeight: 'bold',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                  }}
                >
                  {!userProfileImage && user.username.charAt(0).toUpperCase()}
                </div>
                {/* Camera overlay icon */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: colorScheme?.id === 'custom' ? colorScheme.accent : '#ed8936',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #fff',
                  }}
                >
                  <Icon name="pen" style={{ fontSize: '12px', color: '#fff' }} />
                </div>
              </label>
              <input
                ref={profileImageInputRef}
                id="profile-image-upload"
                type="file"
                accept="image/*"
                onChange={handleProfileImageUpload}
                style={{ display: 'none' }}
              />
              <span style={{ color: '#a0aec0', fontSize: '12px' }}>Click to change photo</span>
            </div>

            {/* User Info */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold' }}>
                {user.username}
              </div>
              <div style={{ color: '#a0aec0', fontSize: '13px' }}>
                {user.email}
              </div>
            </div>

            {/* Access Type */}
            <div
              style={{
                padding: '14px',
                background: isGM ? 'rgba(237, 137, 54, 0.2)' : 'rgba(72, 187, 120, 0.2)',
                borderRadius: '8px',
                border: `1px solid ${isGM ? '#ed8936' : '#48bb78'}`,
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Icon name={isGM ? 'crown' : 'user'} />
                <span style={{ color: isGM ? '#ed8936' : '#48bb78', fontWeight: 'bold', fontSize: '15px' }}>
                  {isGM ? 'Game Master (GM)' : 'Player'}
                </span>
              </div>
            </div>

            {/* User ID */}
            <div>
              <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                User ID
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#1a202c',
                  padding: '10px',
                  borderRadius: '6px',
                }}
              >
                <span style={{ color: '#718096', fontSize: '11px', flex: 1, wordBreak: 'break-all' }}>
                  {user.id}
                </span>
                <button
                  onClick={() => copyToClipboard(user.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a0aec0',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                  title="Copy ID"
                >
                  <Icon name="copy" />
                </button>
              </div>
            </div>

            {/* Auth Token */}
            <div>
              <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                Auth Token
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#1a202c',
                  padding: '10px',
                  borderRadius: '6px',
                }}
              >
                <span style={{ color: '#718096', fontSize: '11px', flex: 1, wordBreak: 'break-all' }}>
                  {token ? `${token.substring(0, 25)}...` : 'No token'}
                </span>
                {token && (
                  <button
                    onClick={() => copyToClipboard(token)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#a0aec0',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                    title="Copy Token"
                  >
                    <Icon name="copy" />
                  </button>
                )}
              </div>
            </div>

            {/* Account Created */}
            <div>
              <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                Account Created
              </label>
              <span style={{ color: '#fff', fontSize: '14px' }}>
                {new Date(user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              style={{
                padding: '14px',
                background: '#e53e3e',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                marginTop: '12px',
              }}
            >
              <Icon name="sign-out-alt" />
              Logout
            </button>
          </div>
        )}

        {activeTab === 'session' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {session ? (
              <>
                {/* Session Info */}
                <div>
                  <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                    Session Name
                  </label>
                  <span style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>
                    {session.name}
                  </span>
                </div>

                {/* Room Code */}
                <div>
                  <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                    Room Code
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        color: '#fff',
                        fontSize: '22px',
                        fontWeight: 'bold',
                        letterSpacing: '3px',
                        background: '#1a202c',
                        padding: '12px 20px',
                        borderRadius: '8px',
                      }}
                    >
                      {session.roomCode}
                    </span>
                    <button
                      onClick={() => copyToClipboard(session.roomCode)}
                      style={{
                        background: colorScheme?.id === 'custom' ? colorScheme.accent : '#ed8936',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        padding: '12px',
                        borderRadius: '8px',
                      }}
                      title="Copy Room Code"
                    >
                      <Icon name="copy" />
                    </button>
                  </div>
                </div>

                {/* Your Role in Session */}
                <div>
                  <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                    Your Role
                  </label>
                  <span
                    style={{
                      color: currentPlayer?.role === 'gm' ? '#ed8936' : '#48bb78',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      textTransform: 'capitalize',
                    }}
                  >
                    {currentPlayer?.role || 'Unknown'}
                  </span>
                </div>

                {/* Controlled Tokens */}
                <div>
                  <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                    Controlled Tokens ({currentPlayer?.controlledTokens.length || 0})
                  </label>
                  {currentPlayer?.controlledTokens.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {currentPlayer.controlledTokens.map((tokenId) => (
                        <span
                          key={tokenId}
                          style={{
                            background: '#4a5568',
                            color: '#fff',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        >
                          {tokenId.substring(0, 10)}...
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#718096', fontSize: '13px' }}>No tokens controlled</span>
                  )}
                </div>

                {/* Online Status */}
                <div>
                  <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                    Online Status
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: currentPlayer?.isOnline ? '#48bb78' : '#e53e3e',
                      }}
                    />
                    <span style={{ color: currentPlayer?.isOnline ? '#48bb78' : '#e53e3e', fontSize: '14px' }}>
                      {currentPlayer?.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>

                {/* Session ID */}
                <div>
                  <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                    Session ID
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#1a202c',
                      padding: '10px',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ color: '#718096', fontSize: '11px', flex: 1, wordBreak: 'break-all' }}>
                      {session.id}
                    </span>
                    <button
                      onClick={() => copyToClipboard(session.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#a0aec0',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title="Copy ID"
                    >
                      <Icon name="copy" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: '#a0aec0' }}>
                <Icon name="info-circle" style={{ fontSize: '40px', marginBottom: '16px' }} />
                <p style={{ fontSize: '15px', marginBottom: '8px' }}>You are not currently in a session.</p>
                <p style={{ fontSize: '12px' }}>
                  Join or create a session to see session details.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Panel Position */}
            <div>
              <label style={{ color: '#a0aec0', fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                Panel Position
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#718096', fontSize: '10px' }}>X</span>
                  <input
                    type="number"
                    value={Math.round(profilePanelPosition.x)}
                    onChange={(e) => setProfilePanelPosition({ ...profilePanelPosition, x: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#1a202c',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#718096', fontSize: '10px' }}>Y</span>
                  <input
                    type="number"
                    value={Math.round(profilePanelPosition.y)}
                    onChange={(e) => setProfilePanelPosition({ ...profilePanelPosition, y: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#1a202c',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Panel Size */}
            <div>
              <label style={{ color: '#a0aec0', fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                Panel Size
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#718096', fontSize: '10px' }}>Width</span>
                  <input
                    type="number"
                    value={Math.round(profilePanelSize.width)}
                    onChange={(e) => setProfilePanelSize({ ...profilePanelSize, width: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#1a202c',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#718096', fontSize: '10px' }}>Height</span>
                  <input
                    type="number"
                    value={Math.round(profilePanelSize.height)}
                    onChange={(e) => setProfilePanelSize({ ...profilePanelSize, height: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#1a202c',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <label style={{ color: '#a0aec0', fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                Quick Actions
              </label>
              <button
                onClick={() => centerProfilePanel()}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#4a5568',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  marginBottom: '8px',
                }}
              >
                Center Panel
              </button>
              <button
                onClick={() => setProfilePanelSize({ width: 400, height: 850 })}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#4a5568',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Reset Size
              </button>
            </div>

            {/* Debug Info */}
            <div>
              <label style={{ color: '#a0aec0', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                Debug Info
              </label>
              <div
                style={{
                  background: '#1a202c',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#718096',
                  fontFamily: 'monospace',
                }}
              >
                <div>Position: {Math.round(profilePanelPosition.x)}, {Math.round(profilePanelPosition.y)}</div>
                <div>Size: {Math.round(profilePanelSize.width)} x {Math.round(profilePanelSize.height)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        className="profile-panel-resize"
        onMouseDown={handleResizeMouseDown}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          style={{ position: 'absolute', bottom: '6px', right: '6px', opacity: 0.5 }}
        >
          <path
            d="M18 18L12 18M18 18L18 12M18 18L8 8M12 18L18 12"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
