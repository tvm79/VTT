import { useState, useMemo } from 'react';
import { Icon } from './Icon';
import type { ColorScheme } from '../../../shared/src/index';

interface Journal {
  id: string;
  sessionId: string;
  title: string;
  type: string;
  content: string;
  layout: string;
  color?: string;
  icon?: string;
  tags: string[];
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

interface JournalPanelProps {
  journals: Journal[];
  selectedJournal: Journal | null;
  isEditing: boolean;
  onSelect: (journal: Journal) => void;
  onCreate: (journal: Partial<Journal>) => void;
  onUpdate: (id: string, updates: Partial<Journal>) => void;
  onDelete: (id: string) => void;
  onEdit: (edit: boolean) => void;
  journalTypes: { value: string; label: string; icon: string }[];
  journalLayouts: { value: string; label: string }[];
  filterType?: string;
  onFilterChange?: (filter: string) => void;
  colorScheme?: ColorScheme;
}

export function JournalPanel({
  journals,
  selectedJournal,
  isEditing,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onEdit,
  journalTypes,
  journalLayouts,
  filterType = 'all',
  onFilterChange,
  colorScheme,
}: JournalPanelProps) {
  const [editForm, setEditForm] = useState<Partial<Journal>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Get all unique tags from journals
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    journals.forEach(j => j.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [journals]);

  const handleFilterChange = onFilterChange || (() => {});

  const filteredJournals = useMemo(() => {
    let result = filterType === 'all' 
      ? journals 
      : journals.filter(j => j.type === filterType);
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(j => 
        j.title.toLowerCase().includes(query) ||
        j.content.toLowerCase().includes(query) ||
        j.tags?.some(t => t.toLowerCase().includes(query))
      );
    }
    
    // Filter by selected tag
    if (selectedTag) {
      result = result.filter(j => j.tags?.includes(selectedTag));
    }
    
    return result;
  }, [journals, filterType, searchQuery, selectedTag]);

  const handleCreate = () => {
    const newJournal = {
      title: 'New Journal Entry',
      type: 'general',
      content: '',
      layout: 'standard',
    };
    onCreate(newJournal);
    setIsCreating(false);
  };

  const handleSave = () => {
    if (selectedJournal) {
      onUpdate(selectedJournal.id, editForm);
      onEdit(false);
    }
  };

  const handleCancel = () => {
    onEdit(false);
    setEditForm({});
  };

  const startEdit = (journal: Journal) => {
    setEditForm(journal);
    onEdit(true);
  };

  const renderLayout = (journal: Journal) => {
    const layout = journal.layout || 'standard';
    
    switch (layout) {
      case 'timeline':
        return (
          <div className="journal-timeline">
            <div className="timeline-line"></div>
            <div className="timeline-content">
              {journal.content.split('\n').map((line, i) => (
                <div key={i} className="timeline-entry">
                  <div className="timeline-dot"></div>
                  <p>{line}</p>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'grid':
        return (
          <div className="journal-grid">
            {journal.content.split('\n\n').map((section, i) => (
              <div key={i} className="grid-section">
                <h4>{section.split('\n')[0]}</h4>
                <p>{section.split('\n').slice(1).join('\n')}</p>
              </div>
            ))}
          </div>
        );
      
      case 'map':
        return (
          <div className="journal-map">
            <div className="map-notes">
              {journal.content.split('## ').map((section, i) => (
                <div key={i} className="map-note">
                  {section}
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'character':
        return (
          <div className="journal-character">
            <div className="character-header">
              <h3>{journal.title}</h3>
              <span className="character-type">{journal.type}</span>
            </div>
            <div className="character-stats">
              {journal.content.split('\n').map((line, i) => (
                <div key={i} className="stat-row">
                  {line}
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'codex':
        return (
          <div className="journal-codex">
            <div className="codex-chapters">
              {journal.content.split('# ').map((chapter, i) => (
                <div key={i} className="codex-chapter">
                  <h3>{chapter.split('\n')[0]}</h3>
                  <div className="chapter-content">
                    {chapter.split('\n').slice(1).join('\n')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      
      default:
        return (
          <div className="journal-standard">
            <div className="journal-content">
              {journal.content.split('\n').map((line, i) => (
                <p key={i}>{line || <br />}</p>
              ))}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="journals-panel" style={{ display: 'flex', height: '100%', gap: '12px', padding: '12px', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Left Sidebar - Journal List */}
      <div className="journals-sidebar" style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="journals-sidebar-header" style={{ marginBottom: '12px' }}>
          <button 
            className="btn-create"
            onClick={handleCreate}
            style={{ width: '100%', padding: '8px', background: colorScheme?.accent || '#4a6fa5', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            <Icon name="plus" /> New Journal
          </button>
        </div>
        
        {/* Search Input */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ position: 'relative' }}>
            <Icon name="search" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search journals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 8px 8px 28px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px' }}
            />
          </div>
        </div>
        
        {/* Tags Filter */}
        {allTags.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <button
                onClick={() => setSelectedTag(null)}
                style={{
                  padding: '2px 6px',
                  fontSize: '10px',
                  background: selectedTag === null ? (colorScheme?.accent || '#4a6fa5') : 'var(--bg-secondary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    background: selectedTag === tag ? (colorScheme?.accent || '#4a6fa5') : 'var(--bg-secondary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="journals-list" style={{ overflowY: 'auto', flex: 1 }}>
          {filteredJournals.map(journal => (
            <div
              key={journal.id}
              className={`journal-item ${selectedJournal?.id === journal.id ? 'active' : ''}`}
              onClick={() => onSelect(journal)}
              style={{
                padding: '10px',
                marginBottom: '6px',
                background: selectedJournal?.id === journal.id ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                borderRadius: '4px',
                cursor: 'pointer',
                borderLeft: `3px solid ${journal.color || (colorScheme?.accent || '#6b8aff')}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Icon name={journalTypes.find(t => t.value === journal.type)?.icon || 'file-alt'} size="sm" />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{journal.type}</span>
                {journal.isPrivate && <Icon name="lock" size="xs" />}
              </div>
              <div style={{ fontWeight: 500, marginBottom: '4px' }}>{journal.title}</div>
              {journal.tags && journal.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '4px' }}>
                  {journal.tags.slice(0, 3).map(tag => (
                    <span key={tag} style={{ fontSize: '9px', padding: '1px 4px', background: 'var(--bg-tertiary)', borderRadius: '2px', color: 'var(--text-secondary)' }}>
                      {tag}
                    </span>
                  ))}
                  {journal.tags.length > 3 && <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>+{journal.tags.length - 3}</span>}
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {new Date(journal.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Side - Journal Content */}
      <div className="journal-viewer" style={{ flex: 1, overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '16px' }}>
        {selectedJournal ? (
          <>
            {isEditing ? (
              /* Edit Mode */
              <div className="journal-edit">
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px' }}>Title</label>
                  <input
                    type="text"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px' }}>Type</label>
                    <select
                      value={editForm.type || 'general'}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    >
                      {journalTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px' }}>Layout</label>
                    <select
                      value={editForm.layout || 'standard'}
                      onChange={(e) => setEditForm({ ...editForm, layout: e.target.value })}
                      style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    >
                      {journalLayouts.map(layout => (
                        <option key={layout.value} value={layout.value}>{layout.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px' }}>Color</label>
                    <input
                      type="color"
                      value={editForm.color || '#2d2d2d'}
                      onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      style={{ width: '100%', height: '36px', padding: 0, border: 'none', cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px' }}>Private (GM Only)</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <input
                        type="checkbox"
                        checked={editForm.isPrivate || false}
                        onChange={(e) => setEditForm({ ...editForm, isPrivate: e.target.checked })}
                      />
                      <span>Private</span>
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px' }}>Tags (comma separated)</label>
                  <input
                    type="text"
                    value={editForm.tags?.join(', ') || ''}
                    onChange={(e) => setEditForm({ ...editForm, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
                    placeholder="important, quest, npc"
                    style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px' }}>Content (Markdown supported)</label>
                  <textarea
                    value={editForm.content || ''}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    rows={15}
                    style={{ width: '100%', padding: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'monospace', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleSave}
                    style={{ padding: '8px 16px', background: '#4a9055', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    <Icon name="save" /> Save
                  </button>
                  <button
                    onClick={handleCancel}
                    style={{ padding: '8px 16px', background: '#666', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onDelete(selectedJournal.id)}
                    style={{ padding: '8px 16px', background: '#904545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: 'auto' }}
                  >
                    <Icon name="trash" /> Delete
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <>
                <div className="journal-header" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>{selectedJournal.title}</h2>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ background: selectedJournal.color || 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          {journalTypes.find(t => t.value === selectedJournal.type)?.label}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {selectedJournal.layout} layout
                        </span>
                        {selectedJournal.isPrivate && <Icon name="lock" size="xs" />}
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(selectedJournal)}
                      style={{ padding: '6px 12px', background: colorScheme?.accent || '#4a6fa5', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      <Icon name="edit" /> Edit
                    </button>
                  </div>
                </div>
                <div className="journal-body" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  {renderLayout(selectedJournal)}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            <div style={{ textAlign: 'center' }}>
              <Icon name="book-open" size="3x" />
              <p style={{ marginTop: '12px' }}>Select a journal to view or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
