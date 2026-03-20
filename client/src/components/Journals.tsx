import { Icon } from './Icon';
import { JournalPanel } from './JournalPanel';

interface JournalsProps {
  journalFilterType: string;
  setJournalFilterType: (value: string) => void;
  journalTypes: Array<{ value: string; label: string; icon: string }>;
  journals: any[];
  selectedJournal: any;
  isEditingJournal: boolean;
  setSelectedJournal: (journal: any) => void;
  createJournal: (journal: any) => void;
  updateJournal: (id: string, updates: any) => void;
  deleteJournal: (id: string) => void;
  setIsEditingJournal: (editing: boolean) => void;
  journalLayouts: Array<{ value: string; label: string }>;
  colorScheme: any;
}

export function Journals({
  journalFilterType,
  setJournalFilterType,
  journalTypes,
  journals,
  selectedJournal,
  isEditingJournal,
  setSelectedJournal,
  createJournal,
  updateJournal,
  deleteJournal,
  setIsEditingJournal,
  journalLayouts,
  colorScheme,
}: JournalsProps) {
  return (
    <div className="journals-view" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #444', background: '#222', padding: '0 12px' }}>
        <button
          onClick={() => setJournalFilterType('all')}
          style={{
            padding: '10px 16px',
            background: journalFilterType === 'all' ? '#333' : 'transparent',
            border: 'none',
            color: journalFilterType === 'all' ? '#fff' : '#aaa',
            cursor: 'pointer',
            borderBottom: journalFilterType === 'all' ? '2px solid #6b8aff' : '2px solid transparent',
          }}
        >
          All
        </button>
        {journalTypes.map((type) => (
          <button
            key={type.value}
            onClick={() => setJournalFilterType(type.value)}
            style={{
              padding: '10px 16px',
              background: journalFilterType === type.value ? '#333' : 'transparent',
              border: 'none',
              color: journalFilterType === type.value ? '#fff' : '#aaa',
              cursor: 'pointer',
              borderBottom: journalFilterType === type.value ? '2px solid #6b8aff' : '2px solid transparent',
            }}
          >
            <Icon name={type.icon} /> {type.label}
          </button>
        ))}
      </div>
      <JournalPanel
        journals={journals}
        selectedJournal={selectedJournal}
        isEditing={isEditingJournal}
        onSelect={setSelectedJournal}
        onCreate={createJournal}
        onUpdate={updateJournal}
        onDelete={deleteJournal}
        onEdit={setIsEditingJournal}
        journalTypes={journalTypes}
        journalLayouts={journalLayouts}
        filterType={journalFilterType}
        onFilterChange={setJournalFilterType}
        colorScheme={colorScheme}
      />
    </div>
  );
}
