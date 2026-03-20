import type { CSSProperties } from 'react';
import { Icon } from './Icon';

interface CompendiumProps {
  activeTab: 'compendium' | 'modules' | 'import' | 'journals' | 'characters';
  activeBrowseTab: string;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  fetchItemsByType: (type: string) => void;
  loadingTypeItems: boolean;
  cardSizeScale: number;
  setCardSizeScale: (value: number) => void;
  setActiveBrowseTab: (value: string) => void;
  modules: any[];
  sessionModules: any[];
  isGM: boolean;
  handleToggleModule: (moduleId: string) => void;
  handleDeleteModule: (moduleId: string) => void;
  setActiveTab: (tab: 'compendium' | 'modules' | 'import' | 'journals' | 'characters') => void;
  fetchAvailableFiles: () => void;
  typeItems: any[];
  floatingPanels: Array<{ item: any }>;
  openItemPanel: (item: any) => void;
  duplicateItem: (item: any) => void;
  deleteItem: (item: any) => void;
  autoResolveBestImageForItem: (item: any) => void;
  getItemCardVisual: (type?: string, crValue?: unknown) => { icon: string; accent: string };
  extractMonsterChallengeRating: (item: any) => unknown;
  getEntryDisplayImage: (item: any, preferToken?: boolean) => string;
  selectedItem: any;
  setSelectedItem: (item: any | null) => void;
  renderSystemFields: (item: any, mode?: 'summary' | 'full') => JSX.Element | null;
  availableFiles: any[];
  selectedFile: any;
  setSelectedFile: (file: any) => void;
  importName: string;
  setImportName: (value: string) => void;
  importSystem: string;
  setImportSystem: (value: string) => void;
  importVersion: string;
  setImportVersion: (value: string) => void;
  importDescription: string;
  setImportDescription: (value: string) => void;
  handleFileImport: () => void;
  fiveEToolsCategory: string;
  setFiveEToolsCategory: (value: string) => void;
  fiveEToolsDataset: string;
  setFiveEToolsDataset: (value: string) => void;
  fiveEToolsName: string;
  setFiveEToolsName: (value: string) => void;
  fiveEToolsSystem: string;
  setFiveEToolsSystem: (value: string) => void;
  fiveEToolsVersion: string;
  setFiveEToolsVersion: (value: string) => void;
  fiveEToolsDescription: string;
  setFiveEToolsDescription: (value: string) => void;
  fiveEToolsCategories: Array<{ value: string; label: string }>;
  fiveEToolsOptions: Array<{ key: string; category: string; defaultName: string }>;
  fiveEToolsSources: Array<{ key: string; sourceLabel: string }>;
  handle5eToolsImport: () => void;
  importType: string;
  setImportType: (value: string) => void;
  importJson: string;
  setImportJson: (value: string) => void;
  loading: boolean;
  quickImport: () => void;
  imageBackfillLimit: string;
  setImageBackfillLimit: (value: string) => void;
  imageBackfillRunning: boolean;
  imageBackfillResult: string | null;
  runImageBackfill: (type: string | null) => void;
  imageFetcherConfig: {
    flags?: {
      enabled?: boolean;
      providers?: Record<string, boolean>;
      searchApiEnabled?: boolean;
    };
  } | null;
}

export function Compendium({
  activeTab,
  activeBrowseTab,
  searchQuery,
  setSearchQuery,
  fetchItemsByType,
  loadingTypeItems,
  cardSizeScale,
  setCardSizeScale,
  setActiveBrowseTab,
  modules,
  sessionModules,
  isGM,
  handleToggleModule,
  handleDeleteModule,
  setActiveTab,
  fetchAvailableFiles,
  typeItems,
  floatingPanels,
  openItemPanel,
  duplicateItem,
  deleteItem,
  autoResolveBestImageForItem,
  getItemCardVisual,
  extractMonsterChallengeRating,
  getEntryDisplayImage,
  selectedItem,
  setSelectedItem,
  renderSystemFields,
  availableFiles,
  selectedFile,
  setSelectedFile,
  importName,
  setImportName,
  importSystem,
  setImportSystem,
  importVersion,
  setImportVersion,
  importDescription,
  setImportDescription,
  handleFileImport,
  fiveEToolsCategory,
  setFiveEToolsCategory,
  fiveEToolsDataset,
  setFiveEToolsDataset,
  fiveEToolsName,
  setFiveEToolsName,
  fiveEToolsSystem,
  setFiveEToolsSystem,
  fiveEToolsVersion,
  setFiveEToolsVersion,
  fiveEToolsDescription,
  setFiveEToolsDescription,
  fiveEToolsCategories,
  fiveEToolsOptions,
  fiveEToolsSources,
  handle5eToolsImport,
  importType,
  setImportType,
  importJson,
  setImportJson,
  loading,
  quickImport,
  imageBackfillLimit,
  setImageBackfillLimit,
  imageBackfillRunning,
  imageBackfillResult,
  runImageBackfill,
  imageFetcherConfig,
}: CompendiumProps) {
  return (
    <>
      {activeTab === 'compendium' && (
        <>
          <div className="type-filter-bar">
            <div className="type-tabs">
              {['spell', 'monster', 'item', 'feat', 'class', 'race', 'background', 'condition'].map((type) => (
                <button
                  key={type}
                  className={`type-tab ${activeBrowseTab === type ? 'active' : ''}`}
                  onClick={() => setActiveBrowseTab(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}s
                </button>
              ))}
            </div>
          </div>

          <div className="search-section">
            <input
              type="text"
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeBrowseTab}s...`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  fetchItemsByType(activeBrowseTab);
                }
              }}
            />
            <button className="btn-search" onClick={() => fetchItemsByType(activeBrowseTab)} disabled={loadingTypeItems}>
              <Icon name="search" />
            </button>
          </div>
        </>
      )}

      {(activeTab === 'compendium' || activeTab === 'modules') && (
        <div className="compendium-view">
          <div className="card-size-slider">
            <span className="slider-label">Card Size:</span>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={cardSizeScale}
              onChange={(e) => setCardSizeScale(parseFloat(e.target.value))}
              className="size-slider"
            />
            <span className="slider-value">{Math.round(cardSizeScale * 100)}%</span>
          </div>

          <div className="items-grid" style={{ '--card-size-scale': cardSizeScale } as CSSProperties}>
            {activeTab === 'modules' ? (
              <>
                <div className="module-header">
                  <h3>Available Modules</h3>
                  <button
                    className="btn-create"
                    onClick={() => {
                      setActiveTab('import');
                      fetchAvailableFiles();
                    }}
                  >
                    <Icon name="plus" /> New Module
                  </button>
                </div>
                {modules.length === 0 ? (
                  <div className="empty">
                    <p>No modules available.</p>
                    <p className="empty-hint">Import data to get started.</p>
                  </div>
                ) : (
                  <div className="module-grid">
                    {modules.map((module) => {
                      const sessionModule = sessionModules.find((sm) => sm.moduleId === module.id);
                      const isEnabled = sessionModule?.enabled || false;

                      return (
                        <div key={module.id} className={`module-card ${isEnabled ? 'enabled' : ''}`}>
                          <div className="module-info">
                            <div className="module-name">{module.name}</div>
                            <div className="module-meta">
                              {module.system}
                              {module.version && ` • ${module.version}`}
                            </div>
                            <div className="module-items">{module.itemCount} items</div>
                          </div>
                          {isGM && (
                            <div className="module-actions">
                              <button
                                className={`toggle-btn ${isEnabled ? 'active' : ''}`}
                                onClick={() => handleToggleModule(module.id)}
                                title={isEnabled ? 'Disable for session' : 'Enable for session'}
                              >
                                <Icon name={isEnabled ? 'toggle-on' : 'toggle-off'} />
                              </button>
                              <button
                                className="btn-icon btn-danger"
                                onClick={() => handleDeleteModule(module.id)}
                                title="Delete module"
                              >
                                <Icon name="trash" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                {loadingTypeItems ? (
                  <div className="loading">Loading...</div>
                ) : typeItems.length > 0 ? (
                  typeItems.map((item: any) => {
                    const visual = getItemCardVisual(item.type, extractMonsterChallengeRating(item));
                    const cardStyle = {
                      cursor: 'grab',
                      '--card-accent': visual.accent,
                    } as CSSProperties;

                    return (
                      <div
                        key={item.id}
                        className={`item-card ${floatingPanels.some((panel) => panel.item.id === item.id) ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedItem(item);
                          openItemPanel(item);
                        }}
                        draggable
                        onDragStart={(e) => {
                          const payload = JSON.stringify(item);
                          e.dataTransfer.setData('application/json', payload);
                          e.dataTransfer.setData('text/plain', payload);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        style={cardStyle}
                      >
                        <div className="card-art">
                          <img
                            className="card-art-image"
                            src={getEntryDisplayImage(item, String(item?.type || '').toLowerCase() === 'monster')}
                            alt={item?.name || 'Compendium entry image'}
                            loading="lazy"
                          />
                          <span className="card-type-overlay">
                            {item.type}
                          </span>
                          <div className="card-name-overlay">{item.name}</div>
                          <div className="card-meta-overlay">
                            {item.book || item.source || 'Unknown source'}
                          </div>
                        </div>
                        <img
                          className="card-bg-image"
                          src={getEntryDisplayImage(item, String(item?.type || '').toLowerCase() === 'monster')}
                          alt=""
                        />
                        <div className="card-header">
                          <div className="card-actions">
                            <button
                              className="card-action-btn"
                              onClick={(e) => { e.stopPropagation(); openItemPanel(item); }}
                              title="Open"
                            >
                              <Icon name="external-link-alt" />
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={(e) => { e.stopPropagation(); duplicateItem(item); }}
                              title="Duplicate"
                            >
                              <Icon name="copy" />
                            </button>
                            <button
                              className="card-action-btn"
                              onClick={(e) => { e.stopPropagation(); autoResolveBestImageForItem(item); }}
                              title="Auto retrieve best image"
                            >
                              <Icon name="image" />
                            </button>
                            <button
                              className="card-action-btn card-action-btn-danger"
                              onClick={(e) => { e.stopPropagation(); deleteItem(item); }}
                              title="Delete"
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                        {(item.description || item.system?.description) && (
                          <div className="card-desc">
                            {typeof (item.description || item.system?.description) === 'string'
                              ? (item.description || item.system?.description).slice(0, 100) + ((item.description || item.system?.description).length > 100 ? '...' : '')
                              : JSON.stringify(item.description || item.system?.description).slice(0, 100)}
                          </div>
                        )}
                        <div className="card-footer">
                          <Icon name="hand-pointer" />
                          Drag to canvas
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty">
                    <p>No {activeBrowseTab}s found.</p>
                    <p className="empty-hint">Enable modules in the Modules panel first.</p>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}

      {activeTab === 'import' && (
        <div className="import-form">
          <div className="import-header">
            <button className="btn-back" onClick={() => setActiveTab('compendium')}>
              <Icon name="arrow-left" /> Back to Compendium
            </button>
          </div>
          <h3>Import from Server Files</h3>
          {availableFiles.length > 0 ? (
            <>
              <div className="file-list">
                {availableFiles.map((file) => (
                  <div
                    key={file.filename}
                    className={`file-item ${selectedFile?.filename === file.filename ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedFile(file);
                      const baseName = file.filename.replace('.json', '').replace(/-/g, ' ');
                      setImportName(baseName.charAt(0).toUpperCase() + baseName.slice(1));
                    }}
                  >
                    <div className="file-info">
                      <div className="file-name">{file.filename}</div>
                      <div className="file-meta">
                        <span className="file-type">{file.type}</span>
                        <span className="file-count">{file.itemCount} items</span>
                      </div>
                    </div>
                    <div className="file-check">
                      {selectedFile?.filename === file.filename && <Icon name="check" />}
                    </div>
                  </div>
                ))}
              </div>

              {selectedFile && (
                <div className="import-details">
                  <h4>Module Details</h4>
                  <div className="form-group">
                    <label>Module Name *</label>
                    <input type="text" value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="e.g., D&D 2024 SRD" />
                  </div>
                  <div className="form-group">
                    <label>System *</label>
                    <input type="text" value={importSystem} onChange={(e) => setImportSystem(e.target.value)} placeholder="e.g., dnd2024, pf2e, coc" />
                  </div>
                  <div className="form-group">
                    <label>Version (optional)</label>
                    <input type="text" value={importVersion} onChange={(e) => setImportVersion(e.target.value)} placeholder="e.g., 2024, SRD" />
                  </div>
                  <div className="form-group">
                    <label>Description (optional)</label>
                    <textarea value={importDescription} onChange={(e) => setImportDescription(e.target.value)} placeholder="Brief description of this module" rows={2} />
                  </div>
                  <button className="btn-create" onClick={handleFileImport} disabled={!importName || !importSystem || loading}>
                    <Icon name="download" /> Import {selectedFile.itemCount} Items
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              <p>No data files available on server.</p>
              <p className="empty-hint">Place JSON files in server/src/data/schemas/</p>
            </div>
          )}

          <h3 style={{ marginTop: '24px' }}>Import from 5eTools</h3>
          <div className="form-group">
            <label>Content Type *</label>
            <select
              value={fiveEToolsCategory}
              onChange={(e) => {
                const category = e.target.value;
                setFiveEToolsCategory(category);
                const firstForCategory = fiveEToolsOptions.find((opt) => opt.category === category);
                if (firstForCategory) {
                  setFiveEToolsDataset(firstForCategory.key);
                  setFiveEToolsName(firstForCategory.defaultName);
                } else {
                  setFiveEToolsDataset('');
                }
              }}
            >
              {fiveEToolsCategories.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Source Book *</label>
            <select value={fiveEToolsDataset} onChange={(e) => setFiveEToolsDataset(e.target.value)}>
              {fiveEToolsSources.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.sourceLabel}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Module Name *</label>
            <input type="text" value={fiveEToolsName} onChange={(e) => setFiveEToolsName(e.target.value)} placeholder="e.g., 5eTools Spells" />
          </div>
          <div className="form-group">
            <label>System *</label>
            <input type="text" value={fiveEToolsSystem} onChange={(e) => setFiveEToolsSystem(e.target.value)} placeholder="e.g., dnd5e" />
          </div>
          <div className="form-group">
            <label>Version</label>
            <input type="text" value={fiveEToolsVersion} onChange={(e) => setFiveEToolsVersion(e.target.value)} placeholder="e.g., 5etools" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={fiveEToolsDescription} onChange={(e) => setFiveEToolsDescription(e.target.value)} rows={2} placeholder="Brief description of this module" />
          </div>
          <button
            className="btn-create"
            onClick={handle5eToolsImport}
            disabled={!fiveEToolsDataset || !fiveEToolsName || !fiveEToolsSystem || loading}
          >
            <Icon name="download" /> Import from 5eTools
          </button>

          <h3 style={{ marginTop: '24px' }}>Manual JSON Import</h3>
          <div className="form-group">
            <label>Item Type</label>
            <select value={importType} onChange={(e) => setImportType(e.target.value)}>
              <option value="item">Generic Item</option>
              <option value="spell">Spell</option>
              <option value="monster">Monster</option>
              <option value="weapon">Weapon</option>
              <option value="armor">Armor</option>
              <option value="feat">Feat</option>
              <option value="class">Class</option>
              <option value="race">Race</option>
              <option value="background">Background</option>
              <option value="condition">Condition</option>
            </select>
          </div>
          <div className="form-group">
            <label>JSON Data</label>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={'{"name": "Fireball", "level": 3, ...} or [{"name": "Fireball"}, {"name": "Lightning Bolt"}]'}
              rows={6}
            />
          </div>
          <button className="btn-import" onClick={quickImport} disabled={!importJson || loading}>
            Import JSON
          </button>

          <h3 style={{ marginTop: '24px' }}>Image Tools</h3>
          <div className="form-group">
            <label>Fetcher Status</label>
            <div className="detail-field">
              <span className="field-label">Enabled:</span> {imageFetcherConfig?.flags?.enabled ? 'Yes' : 'No'}
            </div>
            <div className="detail-field">
              <span className="field-label">Providers:</span>{' '}
              {Object.entries(imageFetcherConfig?.flags?.providers || {})
                .filter(([, enabled]) => Boolean(enabled))
                .map(([id]) => id)
                .join(', ') || 'None'}
            </div>
          </div>
          <div className="form-group">
            <label>Backfill Batch Size</label>
            <input
              type="number"
              min={1}
              max={2000}
              value={imageBackfillLimit}
              onChange={(e) => setImageBackfillLimit(e.target.value)}
              placeholder="250"
            />
          </div>
          <div className="panel-actions-center" style={{ marginTop: '8px', marginBottom: '8px' }}>
            <button
              className="btn-create"
              onClick={() => runImageBackfill(null)}
              disabled={imageBackfillRunning}
              title="Backfill all visible compendium types"
            >
              <Icon name="image" /> {imageBackfillRunning ? 'Running…' : 'Backfill All'}
            </button>
            <button
              className="btn-create"
              onClick={() => runImageBackfill(activeBrowseTab)}
              disabled={imageBackfillRunning}
              title="Backfill current type"
            >
              <Icon name="filter" /> Backfill {activeBrowseTab}
            </button>
          </div>
          {imageBackfillResult ? <div className="detail-field">{imageBackfillResult}</div> : null}
        </div>
      )}
    </>
  );
}
