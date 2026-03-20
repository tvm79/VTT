import { DataManager } from './DataManager';
import { useGameStore } from '../store/gameStore';

export function SheetLayer() {
  const { activeSheet, closeSheet } = useGameStore();

  return <DataManager sheetLayerOnly requestedSheet={activeSheet} onSheetHandled={closeSheet} />;
}
