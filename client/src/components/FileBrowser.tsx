import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';

interface FileItem {
  name: string;
  type: 'image' | 'audio' | 'video' | 'other';
  url: string;
  thumb?: string;
  size?: number;
  created?: string;
}

interface AssetFolder {
  id: string;
  name: string;
  path: string;
  icon: string;
  accepts: string;
}

interface FileBrowserProps {
  onFileSelect?: (fileUrl: string) => void;
}

const DEFAULT_ASSET_FOLDERS: AssetFolder[] = [
  { id: 'tokens', name: 'Tokens', path: '/tokens', icon: 'theater-masks', accepts: 'image/*' },
  { id: 'maps', name: 'Maps', path: '/maps', icon: 'map', accepts: 'image/*,video/*' },
  { id: 'portraits', name: 'Portraits', path: '/portraits', icon: 'user', accepts: 'image/*' },
  { id: 'items', name: 'Items', path: '/items', icon: 'cube', accepts: 'image/*' },
  { id: 'audio', name: 'Audio', path: '/audio', icon: 'music', accepts: 'audio/*' },
  { id: 'handouts', name: 'Handouts', path: '/handouts', icon: 'file', accepts: 'image/*,video/*,.pdf,.json,.txt' },
];

function normalizeAssetPath(path: string): string {
  if (!path) return '/';
  let next = path.replace(/\\/g, '/').trim();
  if (!next.startsWith('/')) next = `/${next}`;
  next = next.replace(/\/+/g, '/');
  if (next.length > 1 && next.endsWith('/')) next = next.slice(0, -1);
  return next;
}

function assetUrlToApiPath(url: string): string {
  return normalizeAssetPath(url.replace(/^\/assets/, ''));
}

function getFolderIdFromPath(pathOrUrl: string): string {
  const value = pathOrUrl.toLowerCase();

  if (value.includes('/tokens')) return 'tokens';
  if (value.includes('/maps')) return 'maps';
  if (value.includes('/portraits')) return 'portraits';
  if (value.includes('/items')) return 'items';
  if (value.includes('/audio')) return 'audio';
  if (value.includes('/handouts')) return 'handouts';

  return 'unknown';
}

function getPayloadKind(file: FileItem, sourceFolder: string): string {
  if (sourceFolder === 'tokens') return 'token';
  if (sourceFolder === 'maps') return 'map';
  if (sourceFolder === 'audio') return 'audio';
  if (sourceFolder === 'portraits') return 'portrait';
  if (sourceFolder === 'items') return 'item-image';
  if (sourceFolder === 'handouts') return 'handout';
  return file.type;
}

function formatBytes(bytes?: number): string {
  if (!bytes || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Check if a file is compatible with a folder's accepts string
 */
function isFileCompatibleWithFolder(file: File, accepts: string): boolean {
  const acceptsList = accepts.split(',').map((a) => a.trim());

  for (const accept of acceptsList) {
    // Handle wildcard patterns like "image/*"
    if (accept.endsWith('/*')) {
      const typePrefix = accept.slice(0, -2); // "image" from "image/*"
      if (file.type.startsWith(typePrefix)) return true;
    }
    // Handle extensions like ".pdf"
    if (accept.startsWith('.')) {
      const ext = accept.toLowerCase();
      if (file.name.toLowerCase().endsWith(ext)) return true;
    }
    // Exact match
    if (file.type === accept) return true;
  }

  return false;
}

/**
 * Find the first folder that accepts the given file type
 */
function findCompatibleFolder(file: File): AssetFolder | null {
  for (const folder of DEFAULT_ASSET_FOLDERS) {
    if (isFileCompatibleWithFolder(file, folder.accepts)) {
      return folder;
    }
  }
  return null;
}

export function FileBrowser({ onFileSelect }: FileBrowserProps) {
  const {
    token,
    isGM,
    colorScheme,
    panelFocus,
    setPanelFocus,
    setFileBrowserVisible,
    fileBrowserPosition,
    fileBrowserSize,
    setFileBrowserPosition,
    setFileBrowserSize,
  } = useGameStore();

  const [position, setPosition] = useState(fileBrowserPosition);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('/tokens');
  const [selectedFolder, setSelectedFolder] = useState<AssetFolder>(DEFAULT_ASSET_FOLDERS[0]);

  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);

  const dragRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async (folderPath: string) => {
    const normalizedPath = normalizeAssetPath(folderPath);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/assets?path=${encodeURIComponent(normalizedPath)}`);

      if (!res.ok) {
        throw new Error(`Failed to fetch assets (${res.status})`);
      }

      const data = await res.json();
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      console.error('Failed to fetch files:', err);
      setError('Failed to load assets');
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  const handleSelectFolder = (folder: AssetFolder) => {
    setSelectedFolder(folder);
    setCurrentPath(folder.path);
    setSearch('');
    setPreviewItem(null);
  };

  const navigateToFolder = (folderName: string) => {
    setCurrentPath((prev) => normalizeAssetPath(`${prev}/${folderName}`));
    setPreviewItem(null);
  };

  const navigateUp = () => {
    const normalized = normalizeAssetPath(currentPath);
    if (normalized === selectedFolder.path) return;

    const parts = normalized.split('/').filter(Boolean);
    const rootParts = selectedFolder.path.split('/').filter(Boolean);

    if (parts.length <= rootParts.length) {
      setCurrentPath(selectedFolder.path);
      return;
    }

    parts.pop();
    setCurrentPath(`/${parts.join('/')}`);
    setPreviewItem(null);
  };

  const handleItemClick = (item: FileItem) => {
    setPreviewItem(item);
    onFileSelect?.(item.url);
  };

  const handleFileDragStart = (e: React.DragEvent, item: FileItem) => {
    const sourceFolder = getFolderIdFromPath(item.url);

    // Token drags should use a readable default token name:
    // 1) remove file extension
    // 2) convert common filename separators to spaces
    // 3) collapse duplicate spaces
    const normalizedTokenName = item.name
      .replace(/\.[^/.]+$/, '')
      .replace(/\d+/g, ' ')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tokenName = normalizedTokenName
      ? normalizedTokenName.charAt(0).toUpperCase() + normalizedTokenName.slice(1)
      : 'Token';

    const payload = {
      type: 'asset',
      kind: getPayloadKind(item, sourceFolder),
      assetType: item.type,
      sourceFolder,
      sourcePath: currentPath,
      url: item.url,
      thumb: item.thumb,
      name: sourceFolder === 'tokens' ? tokenName : item.name,
      gridUnits: sourceFolder === 'tokens' ? { w: 1, h: 1 } : undefined,
    };

    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/uri-list', item.url);
    e.dataTransfer.setData('text/plain', item.url);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handlePanelDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, audio, .file-browser-resize')) return;

    setIsDraggingPanel(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    if (!isDraggingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newPos = {
        x: Math.max(8, e.clientX - dragOffset.x),
        y: Math.max(8, e.clientY - dragOffset.y),
      };
      setPosition(newPos);
      setFileBrowserPosition(newPos);
    };

    const handleMouseUp = () => {
      setIsDraggingPanel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPanel, dragOffset, setFileBrowserPosition]);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isGM) return;
    e.stopPropagation();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(600, e.clientX - position.x);
      const newHeight = Math.max(400, e.clientY - position.y);
      const newSize = { width: newWidth, height: newHeight };
      setFileBrowserSize(newSize);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, position, setFileBrowserSize]);

  const uploadFiles = useCallback(
    async (selectedFiles: FileList | File[]) => {
      if (!isGM || !selectedFiles || selectedFiles.length === 0) return;

      setIsUploading(true);
      setError(null);

      try {
        console.log('=== NEW UPLOAD LOGIC ===');
        console.log('currentPath:', currentPath);
        
        // Get the root folder from current path (e.g., /audio/music -> /audio)
        const pathParts = currentPath.split('/').filter(Boolean);
        const rootFolderId = pathParts[0];
        console.log('rootFolderId:', rootFolderId);
        
        const selectedFolder = DEFAULT_ASSET_FOLDERS.find(f => f.id === rootFolderId) || DEFAULT_ASSET_FOLDERS[0];
        console.log('selectedFolder:', selectedFolder);
        
        // Validate each file is compatible with selected folder
        for (const file of Array.from(selectedFiles)) {
          if (!isFileCompatibleWithFolder(file, selectedFolder.accepts)) {
            throw new Error(`${file.name} is not compatible with ${selectedFolder.name} folder (accepts: ${selectedFolder.accepts})`);
          }
        }
        
        // Upload to the selected folder's path
        const uploadPath = selectedFolder.path;
        console.log('Uploading to:', uploadPath);

        for (const file of Array.from(selectedFiles)) {
          const formData = new FormData();
          formData.append('file', file);

          // Also pass path as URL parameter as backup
          const res = await fetch(`/api/assets/upload?path=${encodeURIComponent(uploadPath)}`, {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();

          console.log('Server response:', data);

          if (!res.ok || !data.success) {
            throw new Error(data?.error || `Upload failed for ${file.name}`);
          }
        }

        // Refresh the folder we uploaded to, not currentPath
        await fetchFiles(uploadPath);
      } catch (err) {
        console.error('Upload error:', err);
        setError(err instanceof Error ? err.message : 'Failed to upload file(s)');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [isGM, fetchFiles, currentPath]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await uploadFiles(e.target.files);
  };

  const handleDeleteFile = async (file: FileItem) => {
    if (!isGM) return;
    if (!window.confirm(`Delete ${file.name}?`)) return;

    try {
      const res = await fetch('/api/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: assetUrlToApiPath(file.url) }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Delete failed');
      }

      if (previewItem?.url === file.url) {
        setPreviewItem(null);
      }

      await fetchFiles(currentPath);
    } catch (err) {
      console.error('Delete error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  const getBreadcrumbs = useCallback(() => {
    const selectedRoot = normalizeAssetPath(selectedFolder.path);
    const current = normalizeAssetPath(currentPath);

    const rootParts = selectedRoot.split('/').filter(Boolean);
    const currentParts = current.split('/').filter(Boolean);

    const crumbs: { name: string; path: string }[] = [
      { name: selectedFolder.name, path: selectedRoot },
    ];

    if (current === selectedRoot) return crumbs;

    let acc = selectedRoot;
    for (let i = rootParts.length; i < currentParts.length; i += 1) {
      acc = normalizeAssetPath(`${acc}/${currentParts[i]}`);
      crumbs.push({
        name: currentParts[i],
        path: acc,
      });
    }

    return crumbs;
  }, [selectedFolder, currentPath]);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return 'image';
      case 'audio':
        return 'music';
      case 'video':
        return 'video';
      default:
        return 'file';
    }
  };

  const isInSubfolder = normalizeAssetPath(currentPath) !== normalizeAssetPath(selectedFolder.path);

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((folder) => folder.toLowerCase().includes(q));
  }, [folders, search]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) => file.name.toLowerCase().includes(q));
  }, [files, search]);

  const acceptValue = selectedFolder.accepts || 'image/*,audio/*,video/*';

  return (
    <div
      ref={dragRef}
      className="file-browser"
      onClick={() => setPanelFocus('fileBrowser')}
      onDragOver={(e) => {
        if (!isGM) return;
        
        // Only show upload drop zone when dragging actual files from computer
        // Check if there are files in the drag - if not, it's an internal drag (from Asset Browser)
        const hasFiles = e.dataTransfer.types.includes('Files') || e.dataTransfer.files.length > 0;
        
        if (hasFiles) {
          e.preventDefault();
          setDragOverUpload(true);
        }
      }}
      onDragLeave={(e) => {
        if (!isGM) return;
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOverUpload(false);
      }}
      onDrop={async (e) => {
        if (!isGM) return;
        e.preventDefault();
        setDragOverUpload(false);

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
          await uploadFiles(droppedFiles);
        }
      }}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: fileBrowserSize.width,
        maxWidth: 'calc(100vw - 24px)',
        height: fileBrowserSize.height,
        maxHeight: 'calc(100vh - 24px)',
        display: 'flex',
        flexDirection: 'column',
        background: colorScheme?.id === 'custom' ? colorScheme.surface : undefined,
        border: `1px solid ${colorScheme?.id === 'custom' ? colorScheme.accent : 'var(--panel-border, rgba(255,255,255,0.12))'}`,
        borderRadius: 12,
        boxShadow: panelFocus === 'fileBrowser'
          ? '0 16px 42px rgba(0,0,0,0.42)'
          : '0 10px 28px rgba(0,0,0,0.28)',
        overflow: 'hidden',
        zIndex: panelFocus === 'fileBrowser' ? 5000 : 1000,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        className="file-browser-header"
        onMouseDown={handlePanelDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 0.9rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="folder" />
          <div>
            <div style={{ fontWeight: 700, lineHeight: 1 }}>Asset Browser</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.65 }}>{currentPath}</div>
          </div>
        </div>

        <div className="file-browser-actions" style={{ display: 'flex', gap: 8 }}>
          <button
            className="tool-btn"
            onClick={() => fetchFiles(currentPath)}
            title="Refresh"
          >
            <Icon name="rotate" />
          </button>

          {isGM && (
            <button
              className="tool-btn"
              onClick={() => setShowSettings((prev) => !prev)}
              title="Settings"
            >
              <Icon name="cog" />
            </button>
          )}

          <button
            className="tool-btn"
            onClick={() => setFileBrowserVisible(false)}
            title="Close"
          >
            <Icon name="times" />
          </button>
        </div>
      </div>

      {showSettings && isGM ? (
        <div
          className="file-browser-settings"
          style={{
            padding: '1rem',
            overflow: 'auto',
            display: 'grid',
            gap: '0.8rem',
          }}
        >
          <div style={{ opacity: 0.8, lineHeight: 1.45 }}>
            Assets are server-backed. Uploads go to the currently open folder, including subfolders.
            Dragging from the browser sends structured metadata so the canvas/audio systems can route files correctly.
          </div>

          <div
            className="folder-list"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.7rem',
            }}
          >
            {DEFAULT_ASSET_FOLDERS.map((folder) => {
              const active = selectedFolder.id === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    handleSelectFolder(folder);
                    setShowSettings(false);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '0.8rem',
                    borderRadius: 10,
                    border: active ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
                    background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Icon name={folder.icon as any} />
                    <strong>{folder.name}</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', opacity: 0.75 }}>{folder.path}</div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.55, marginTop: 4 }}>{folder.accepts}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div
            className="folder-tabs"
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              padding: '0.65rem 0.8rem',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {DEFAULT_ASSET_FOLDERS.map((folder) => {
              const active = selectedFolder.id === folder.id;
              return (
                <button
                  key={folder.id}
                  className={`folder-tab ${active ? 'active' : ''}`}
                  onClick={() => handleSelectFolder(folder)}
                  title={folder.path}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0.45rem 0.75rem',
                    borderRadius: 999,
                    border: active ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.08)',
                    background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name={folder.icon as any} />
                  <span>{folder.name}</span>
                </button>
              );
            })}
          </div>

          <div
            className="file-browser-toolbar"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 10,
              alignItems: 'center',
              padding: '0.75rem 0.8rem',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              className="file-browser-breadcrumbs"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {isInSubfolder && (
                <button className="breadcrumb-btn" onClick={navigateUp} title="Go up">
                  <Icon name="arrow-up" />
                </button>
              )}

              {getBreadcrumbs().map((crumb, index) => (
                <span key={crumb.path} style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                  {index > 0 && <span style={{ margin: '0 0.25rem', opacity: 0.45 }}>/</span>}
                  <button
                    className="breadcrumb-btn"
                    onClick={() => setCurrentPath(crumb.path)}
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 160,
                    }}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search folder..."
              style={{
                minWidth: 180,
                padding: '0.45rem 0.65rem',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: 'inherit',
              }}
            />

            {isGM && (
              <div className="upload-controls" style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptValue}
                  multiple
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <button
                  className="tool-btn upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title={`Upload to ${currentPath}`}
                >
                  <Icon name="upload" />
                  <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                </button>
              </div>
            )}
          </div>

          {error && (
            <div
              className="file-browser-error"
              style={{
                margin: '0.75rem 0.8rem 0',
                padding: '0.65rem 0.8rem',
                borderRadius: 8,
                background: 'rgba(180,40,40,0.14)',
                border: '1px solid rgba(180,40,40,0.22)',
              }}
            >
              {error}
            </div>
          )}

          <div
            className="file-browser-main"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 260px',
              gap: 0,
            }}
          >
            <div
              className="file-browser-content"
              style={{
                minHeight: 0,
                overflow: 'auto',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
              }}
            >
              {dragOverUpload && isGM && (
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    margin: 12,
                    padding: '0.85rem 1rem',
                    borderRadius: 10,
                    border: '1px dashed rgba(255,255,255,0.28)',
                    background: 'rgba(255,255,255,0.06)',
                    textAlign: 'center',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  Drop files to upload into <strong>{currentPath}</strong>
                </div>
              )}

              {loading ? (
                <div style={{ padding: '1rem' }}>Loading...</div>
              ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
                <div style={{ padding: '1rem', opacity: 0.7 }}>
                  {search ? 'No matches in this folder' : 'No files in this folder'}
                </div>
              ) : (
                <div
                  className="file-browser-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: 12,
                    padding: 12,
                  }}
                >
                  {filteredFolders.map((folder) => (
                    <button
                      key={`folder:${folder}`}
                      className="file-browser-item directory"
                      onClick={() => navigateToFolder(folder)}
                      title={`Open ${folder}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 110,
                        padding: 10,
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 52,
                          height: 52,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: 12,
                          background: 'rgba(255,255,255,0.05)',
                        }}
                      >
                        <Icon name="folder" />
                      </div>
                      <span
                        className="file-name"
                        style={{
                          textAlign: 'center',
                          wordBreak: 'break-word',
                          fontSize: '0.85rem',
                        }}
                      >
                        {folder}
                      </span>
                    </button>
                  ))}

                  {filteredFiles.map((item) => (
                    <div
                      key={item.url}
                      className={`file-browser-item file ${item.type}`}
                      onClick={() => handleItemClick(item)}
                      draggable
                      onDragStart={(e) => handleFileDragStart(e, item)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (isGM) handleDeleteFile(item);
                      }}
                      title={
                        isGM
                          ? `Drag to use • Click to preview • Right-click to delete`
                          : `Drag to use • Click to preview`
                      }
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        minHeight: 150,
                        padding: 0,
                        borderRadius: 12,
                        border: previewItem?.url === item.url
                          ? '1px solid rgba(255,255,255,0.24)'
                          : '1px solid rgba(255,255,255,0.08)',
                        background: previewItem?.url === item.url
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '1 / 1',
                          overflow: 'hidden',
                          background: 'rgba(255,255,255,0.04)',
                          display: 'grid',
                          placeItems: 'center',
                          position: 'relative',
                        }}
                      >
                        {/* Delete button overlay */}
                        {isGM && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(item);
                            }}
                            title="Delete asset"
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 4,
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.15)',
                              background: 'rgba(0,0,0,0.6)',
                              color: '#fff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0,
                              transition: 'opacity 0.15s ease, background 0.15s ease',
                              zIndex: 5,
                            }}
                            className="file-item-delete-btn"
                          >
                            <Icon name="times" />
                          </button>
                        )}

                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt={item.name}
                            className="file-thumb"
                            loading="lazy"
                            style={{
                              width: '80%',
                              height: '80%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <Icon name={getFileIcon(item.type) as any} />
                        )}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          className="file-name"
                          style={{
                            fontSize: '0.84rem',
                            lineHeight: 1.25,
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.name}
                        </div>
                        <div style={{ marginTop: 4, fontSize: '0.74rem', opacity: 0.6 }}>
                          {item.type}{item.size ? ` • ${formatBytes(item.size)}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="file-browser-preview"
              style={{
                minHeight: 0,
                overflow: 'auto',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8rem',
              }}
            >
              <div style={{ fontWeight: 700, opacity: 0.9 }}>Preview</div>

              {!previewItem ? (
                <div style={{ opacity: 0.65, lineHeight: 1.5 }}>
                  Select an asset to preview it. Drag assets into the canvas, portrait fields, or audio systems.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)',
                      minHeight: 180,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {previewItem.type === 'image' ? (
                      <img
                        src={previewItem.url}
                        alt={previewItem.name}
                        style={{
                          maxWidth: '100%',
                          maxHeight: 260,
                          display: 'block',
                          objectFit: 'contain',
                        }}
                      />
                    ) : previewItem.type === 'audio' ? (
                      <div style={{ width: '100%', padding: '1rem' }}>
                        <audio controls src={previewItem.url} style={{ width: '100%' }} />
                      </div>
                    ) : previewItem.type === 'video' ? (
                      <video
                        controls
                        src={previewItem.url}
                        style={{ width: '100%', maxHeight: 260, display: 'block' }}
                      />
                    ) : (
                      <Icon name="file" />
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{previewItem.name}</div>
                    <div style={{ marginTop: 6, fontSize: '0.8rem', opacity: 0.65 }}>
                      Type: {previewItem.type}
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.8rem', opacity: 0.65 }}>
                      Folder: {getFolderIdFromPath(previewItem.url)}
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.8rem', opacity: 0.65, wordBreak: 'break-all' }}>
                      URL: {previewItem.url}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      className="tool-btn"
                      onClick={() => onFileSelect?.(previewItem.url)}
                    >
                      Use Asset
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            className="file-browser-hint"
            style={{
              padding: '0.65rem 0.8rem',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: '0.8rem',
              opacity: 0.72,
            }}
          >
            {isGM
              ? 'Drag assets into the VTT • Upload goes to the current folder • Token drags send 1x1 grid metadata'
              : 'Drag assets into supported targets'}
          </div>
        </>
      )}

      {/* Resize handle */}
      <div
        className="file-browser-resize"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '15px',
          height: '15px',
          cursor: 'se-resize',
          background: 'transparent',
        }}
      />
    </div>
  );
}