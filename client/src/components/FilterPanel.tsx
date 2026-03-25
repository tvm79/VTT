import { useState, useEffect } from 'react';

export interface FilterState {
  // Spell filters
  level?: string;
  school?: string;
  sourceClass?: string;
  concentration?: boolean;
  ritual?: boolean;
  verbal?: boolean;
  somatic?: boolean;
  material?: boolean;
  source?: string;
  
  // Monster filters
  crMin?: string;
  crMax?: string;
  creatureType?: string;
  size?: string;
  speedFly?: boolean;
  speedSwim?: boolean;
  speedBurrow?: boolean;
  speedClimb?: boolean;
  
  // Item filters
  itemType?: string;
  weaponCategory?: string;
  equipmentType?: string;
  rarity?: string;
  magical?: boolean;
  attunement?: string;
  priceMin?: string;
  priceMax?: string;
  tattooType?: string;
  
  // Class filters
  hasSpellcasting?: boolean;
  classSource?: string;
  
  // Race filters
  hasDarkvision?: boolean;
  raceSource?: string;
}

export interface FilterOptions {
  schools?: { value: string; label: string }[];
  classes?: { value: string; label: string }[];
  sources?: { value: string; label: string }[];
  levels?: { value: string; label: string }[];
  creatureTypes?: { value: string; label: string }[];
  sizes?: { value: string; label: string }[];
  challengeRatings?: { value: string; label: string }[];
  itemTypes?: { value: string; label: string }[];
  weaponCategories?: { value: string; label: string }[];
  equipmentTypes?: { value: string; label: string }[];
  rarities?: { value: string; label: string }[];
  attunementTypes?: { value: string; label: string }[];
  tattooTypes?: { value: string; label: string }[];
}

interface FilterPanelProps {
  type: 'spell' | 'monster' | 'item' | 'class' | 'feat' | 'background' | 'race' | 'species' | 'condition';
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClose: () => void;
}

export function FilterPanel({ type, filters, onFiltersChange, onClose }: FilterPanelProps) {
  const [options, setOptions] = useState<FilterOptions>({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch filter options
    async function fetchOptions() {
      try {
        const res = await fetch(`/api/data/compendium/filters/${type}`);
        const data = await res.json();
        setOptions(data);
      } catch (error) {
        console.error('Failed to fetch filter options:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchOptions();
  }, [type]);
  
  const updateFilter = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters };
    if (value === '' || value === undefined || value === null) {
      delete newFilters[key];
    } else {
      (newFilters as any)[key] = value;
    }
    // Clear weaponCategory when itemType changes from 'WPN' to something else
    if (key === 'itemType' && value !== 'WPN' && filters.weaponCategory) {
      delete newFilters.weaponCategory;
    }
    // Clear equipmentType when itemType changes from 'EQP' to something else
    if (key === 'itemType' && value !== 'EQP' && filters.equipmentType) {
      delete newFilters.equipmentType;
    }
    // Clear tattooType when itemType changes from 'tattoo' to something else
    if (key === 'itemType' && value !== 'tattoo' && (filters as any).tattooType) {
      delete (newFilters as any).tattooType;
    }
    onFiltersChange(newFilters);
  };
  
  const clearFilters = () => {
    onFiltersChange({});
  };
  
  const activeFilterCount = Object.keys(filters).length;
  
  const renderSpellFilters = () => (
    <div className="filter-section">
      {/* Level Filter */}
      <div className="filter-group">
        <label>Level</label>
        <select
          value={filters.level || ''}
          onChange={(e) => updateFilter('level', e.target.value)}
        >
          <option value="">All Levels</option>
          {options.levels?.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
      
      {/* School Filter */}
      <div className="filter-group">
        <label>School</label>
        <select
          value={filters.school || ''}
          onChange={(e) => updateFilter('school', e.target.value)}
        >
          <option value="">All Schools</option>
          {options.schools?.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      
      {/* Class Filter */}
      <div className="filter-group">
        <label>Class</label>
        <select
          value={filters.sourceClass || ''}
          onChange={(e) => updateFilter('sourceClass', e.target.value)}
        >
          <option value="">All Classes</option>
          {options.classes?.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      
      {/* Source Filter */}
      <div className="filter-group">
        <label>Source</label>
        <select
          value={filters.source || ''}
          onChange={(e) => updateFilter('source', e.target.value)}
        >
          <option value="">All Sources</option>
          {options.sources?.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      
      {/* Properties */}
      <div className="filter-group">
        <label>Properties</label>
        <div className="filter-checkboxes">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.concentration || false}
              onChange={(e) => updateFilter('concentration', e.target.checked ? 'true' : undefined)}
            />
            Concentration
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.ritual || false}
              onChange={(e) => updateFilter('ritual', e.target.checked ? 'true' : undefined)}
            />
            Ritual
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.verbal || false}
              onChange={(e) => updateFilter('verbal', e.target.checked ? 'true' : undefined)}
            />
            Verbal (V)
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.somatic || false}
              onChange={(e) => updateFilter('somatic', e.target.checked ? 'true' : undefined)}
            />
            Somatic (S)
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.material || false}
              onChange={(e) => updateFilter('material', e.target.checked ? 'true' : undefined)}
            />
            Material (M)
          </label>
        </div>
      </div>
    </div>
  );
  
  const renderMonsterFilters = () => (
    <div className="filter-section">
      {/* Challenge Rating Range */}
      <div className="filter-group">
        <label>Challenge Rating</label>
        <div className="filter-range">
          <select
            value={filters.crMin || ''}
            onChange={(e) => updateFilter('crMin', e.target.value)}
          >
            <option value="">Min CR</option>
            {options.challengeRatings?.map((cr) => (
              <option key={cr.value} value={cr.value}>{cr.label}</option>
            ))}
          </select>
          <span>to</span>
          <select
            value={filters.crMax || ''}
            onChange={(e) => updateFilter('crMax', e.target.value)}
          >
            <option value="">Max CR</option>
            {options.challengeRatings?.map((cr) => (
              <option key={cr.value} value={cr.value}>{cr.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Creature Type Filter */}
      <div className="filter-group">
        <label>Type</label>
        <select
          value={filters.creatureType || ''}
          onChange={(e) => updateFilter('creatureType', e.target.value)}
        >
          <option value="">All Types</option>
          {options.creatureTypes?.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      
      {/* Size Filter */}
      <div className="filter-group">
        <label>Size</label>
        <select
          value={filters.size || ''}
          onChange={(e) => updateFilter('size', e.target.value)}
        >
          <option value="">All Sizes</option>
          {options.sizes?.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      
      {/* Source Filter */}
      <div className="filter-group">
        <label>Source</label>
        <select
          value={filters.source || ''}
          onChange={(e) => updateFilter('source', e.target.value)}
        >
          <option value="">All Sources</option>
          {options.sources?.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      
      {/* Movement Filters */}
      <div className="filter-group">
        <label>Movement</label>
        <div className="filter-checkboxes">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.speedFly || false}
              onChange={(e) => updateFilter('speedFly', e.target.checked ? 'true' : undefined)}
            />
            Flying
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.speedSwim || false}
              onChange={(e) => updateFilter('speedSwim', e.target.checked ? 'true' : undefined)}
            />
            Swimming
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.speedBurrow || false}
              onChange={(e) => updateFilter('speedBurrow', e.target.checked ? 'true' : undefined)}
            />
            Burrowing
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.speedClimb || false}
              onChange={(e) => updateFilter('speedClimb', e.target.checked ? 'true' : undefined)}
            />
            Climbing
          </label>
        </div>
      </div>
    </div>
  );
  
  const renderItemFilters = () => (
    <div className="filter-section">
      {/* Item Type Filter */}
      <div className="filter-group">
        <label>Item Type</label>
        <select
          value={filters.itemType || ''}
          onChange={(e) => updateFilter('itemType', e.target.value)}
        >
          <option value="">All Types</option>
          {options.itemTypes?.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      
      {/* Weapon Category Filter - shows when "Weapons" is selected */}
      {filters.itemType === 'WPN' && (
        <div className="filter-group">
          <label>Weapon Category</label>
          <select
            value={filters.weaponCategory || ''}
            onChange={(e) => updateFilter('weaponCategory', e.target.value)}
          >
            <option value="">All Categories</option>
            {options.weaponCategories?.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
      )}
      
      {/* Equipment Type Filter - shows when "Equipment" is selected */}
      {filters.itemType === 'EQP' && (
        <div className="filter-group">
          <label>Equipment Type</label>
          <select
            value={filters.equipmentType || ''}
            onChange={(e) => updateFilter('equipmentType', e.target.value)}
          >
            <option value="">All Equipment Types</option>
            {options.equipmentTypes?.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
      )}
      
      {/* Rarity Filter */}
      <div className="filter-group">
        <label>Rarity</label>
        <select
          value={filters.rarity || ''}
          onChange={(e) => updateFilter('rarity', e.target.value)}
        >
          <option value="">All Rarities</option>
          <option value="mundane">Mundane</option>
          {options.rarities?.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      
      {/* Attunement Filter */}
      <div className="filter-group">
        <label>Attunement</label>
        <select
          value={filters.attunement || ''}
          onChange={(e) => updateFilter('attunement', e.target.value)}
        >
          <option value="">Any</option>
          <option value="required">Required</option>
          <option value="not required">Not Required</option>
        </select>
      </div>
      
      {/* Tattoo Type Filter */}
      {filters.itemType === 'tattoo' && (
        <div className="filter-group">
          <label>Tattoo Type</label>
          <select
            value={filters.tattooType || ''}
            onChange={(e) => updateFilter('tattooType', e.target.value)}
          >
            <option value="">All</option>
            <option value="permanent">Permanent</option>
            <option value="spellwrought">Spellwrought</option>
          </select>
        </div>
      )}
      
      {/* Price Range */}
      <div className="filter-group">
        <label>Price (gp)</label>
        <div className="filter-range">
          <input
            type="number"
            placeholder="Min"
            value={filters.priceMin || ''}
            onChange={(e) => updateFilter('priceMin', e.target.value)}
          />
          <span>to</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.priceMax || ''}
            onChange={(e) => updateFilter('priceMax', e.target.value)}
          />
        </div>
      </div>
      
      {/* Magical Filter */}
      <div className="filter-group">
        <label>Properties</label>
        <div className="filter-checkboxes">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.magical || false}
              onChange={(e) => updateFilter('magical', e.target.checked ? 'true' : undefined)}
            />
            Magical
          </label>
        </div>
      </div>
      
      {/* Source Filter */}
      <div className="filter-group">
        <label>Source</label>
        <select
          value={filters.source || ''}
          onChange={(e) => updateFilter('source', e.target.value)}
        >
          <option value="">All Sources</option>
          {options.sources?.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
  
  const renderSourceOnlyGroup = (title: string) => (
    <div className="filter-group">
      <label>{title}</label>
      <select
        value={filters.source || ''}
        onChange={(e) => updateFilter('source', e.target.value)}
      >
        <option value="">All Sources</option>
        {options.sources?.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );

  const renderClassFilters = () => (
    <div className="filter-section">
      <div className="filter-group">
        <label>Features</label>
        <div className="filter-checkboxes">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.hasSpellcasting || false}
              onChange={(e) => updateFilter('hasSpellcasting', e.target.checked ? 'true' : undefined)}
            />
            Has Spellcasting
          </label>
        </div>
      </div>
      {renderSourceOnlyGroup('Source')}
    </div>
  );

  const renderFeatFilters = () => (
    <div className="filter-section">
      {renderSourceOnlyGroup('Source')}
    </div>
  );

  const renderBackgroundFilters = () => (
    <div className="filter-section">
      {renderSourceOnlyGroup('Source')}
    </div>
  );

  const renderRaceFilters = () => (
    <div className="filter-section">
      {/* Has Darkvision Filter */}
      <div className="filter-group">
        <label>Traits</label>
        <div className="filter-checkboxes">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={filters.hasDarkvision || false}
              onChange={(e) => updateFilter('hasDarkvision', e.target.checked ? 'true' : undefined)}
            />
            Has Darkvision
          </label>
        </div>
      </div>
      {renderSourceOnlyGroup('Source')}
    </div>
  );
  
  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>Filters {activeFilterCount > 0 && <span className="filter-count">({activeFilterCount})</span>}</h3>
        <button className="filter-close" onClick={onClose}>×</button>
      </div>
      
      {loading ? (
        <div className="filter-loading">Loading options...</div>
      ) : (
        <>
          {type === 'spell' && renderSpellFilters()}
          {type === 'monster' && renderMonsterFilters()}
          {type === 'item' && renderItemFilters()}
          {type === 'class' && renderClassFilters()}
          {type === 'feat' && renderFeatFilters()}
          {type === 'background' && renderBackgroundFilters()}
          {type === 'race' && renderRaceFilters()}
          {type === 'species' && renderRaceFilters()}
        </>
      )}
      
      <div className="filter-actions">
        <button className="filter-clear" onClick={clearFilters}>
          Clear All
        </button>
        <button className="filter-apply" onClick={onClose}>
          Apply
        </button>
      </div>
    </div>
  );
}

// Active filters display component
export function ActiveFilters({ 
  filters, 
  onRemove, 
  options 
}: { 
  filters: FilterState; 
  onRemove: (key: keyof FilterState) => void;
  options: FilterOptions;
}) {
  const getFilterLabel = (key: keyof FilterState, value: any): string => {
    switch (key) {
      case 'level':
        return `Level: ${options.levels?.find(l => l.value === value)?.label || value}`;
      case 'school':
        return `School: ${value}`;
      case 'sourceClass':
        return `Class: ${value}`;
      case 'source':
        return `Source: ${value}`;
      case 'classSource':
        return `Source: ${value}`;
      case 'raceSource':
        return `Source: ${value}`;
      case 'concentration':
        return 'Concentration';
      case 'ritual':
        return 'Ritual';
      case 'verbal':
        return 'Verbal (V)';
      case 'somatic':
        return 'Somatic (S)';
      case 'material':
        return 'Material (M)';
      case 'crMin':
        return `CR: ${value}+`;
      case 'crMax':
        return `CR: ≤${value}`;
      case 'creatureType':
        return `Type: ${value}`;
      case 'size':
        return `Size: ${value}`;
      case 'speedFly':
        return 'Flying';
      case 'speedSwim':
        return 'Swimming';
      case 'speedBurrow':
        return 'Burrowing';
      case 'speedClimb':
        return 'Climbing';
      case 'itemType':
        return `Type: ${value}`;
      case 'rarity':
        return `Rarity: ${value}`;
      case 'attunement':
        return `Attunement: ${value}`;
      case 'tattooType':
        return `Tattoo: ${value}`;
      case 'priceMin':
        return `Price: ${value}+ gp`;
      case 'priceMax':
        return `Price: ≤${value} gp`;
      case 'magical':
        return 'Magical';
      case 'hasSpellcasting':
        return 'Has Spellcasting';
      case 'hasDarkvision':
        return 'Has Darkvision';
      default:
        return `${key}: ${value}`;
    }
  };
  
  const filterKeys = Object.keys(filters) as (keyof FilterState)[];
  
  if (filterKeys.length === 0) return null;
  
  return (
    <div className="active-filters">
      {filterKeys.map((key) => {
        const value = filters[key];
        if (value === undefined || value === null || value === '') return null;
        return (
          <button
            key={key}
            className="active-filter-chip"
            onClick={() => onRemove(key)}
          >
            {getFilterLabel(key, value)}
            <span className="filter-remove">×</span>
          </button>
        );
      })}
    </div>
  );
}
