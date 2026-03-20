import { Icon } from '../Icon';

interface AudioSourceSettingsProps {
  isGM: boolean;
  isUploading: boolean;
  colorScheme?: { accent?: string };
  onUpload: (files: FileList | null) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function AudioSourceSettings({
  isGM,
  isUploading,
  colorScheme,
  onUpload,
  isExpanded = true,
  onToggleExpand,
}: AudioSourceSettingsProps) {
  if (!isGM) return null;

  return (
    <div style={{ padding: '12px 16px', borderTop: `1px solid ${colorScheme?.accent || '#4a5568'}` }}>
      {/* Collapsible Header */}
      <button
        onClick={onToggleExpand}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0',
          marginBottom: isExpanded ? '8px' : '0',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
          Audio Upload
        </div>
        <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} style={{ color: 'var(--text-secondary)', fontSize: '12px' }} />
      </button>
      
      {/* Collapsible Content - Upload button only */}
      {isExpanded && (
        <div>
          <label
            style={{
              display: 'block',
              padding: '8px 12px',
              background: isUploading ? '#4a5568' : (colorScheme?.accent || '#6b8aff'),
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: isUploading ? 'default' : 'pointer',
              fontSize: '11px',
              textAlign: 'center',
              marginBottom: '4px',
            }}
          >
            {isUploading ? 'Uploading...' : '📤 Upload Audio Files'}
            <input
              type="file"
              accept="audio/*,.ogg,.mp3,.wav,.flac,.m4a,.aac,.webm"
              multiple
              onChange={(e) => onUpload(e.target.files)}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
          </label>
          <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
            Upload audio files to the server (music, ambience, SFX)
          </div>
        </div>
      )}
    </div>
  );
}
