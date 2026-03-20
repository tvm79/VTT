import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

interface FloatingPanelsLayerProps<TPanel> {
  panels: TPanel[];
  themeClass: string;
  themeStyle: CSSProperties;
  renderPanel: (panel: TPanel) => ReactNode;
}

export function FloatingPanelsLayer<TPanel>({
  panels,
  themeClass,
  themeStyle,
  renderPanel,
}: FloatingPanelsLayerProps<TPanel>) {
  if (panels.length === 0) return null;

  return createPortal(
    <div className={`portal-wrapper ${themeClass}`} style={themeStyle}>
      {panels.map((panel) => renderPanel(panel))}
    </div>,
    document.body
  );
}
