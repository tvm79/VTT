import * as PIXI from 'pixi.js';
import { getMeasurementCells } from './MeasurementDispatcher';
import { getCellPolygonPoints } from './MeasurementUtils';
import type { MeasurementPreview, PersistedMeasurement } from './MeasurementTypes';

type RendererMeasurement = PersistedMeasurement | MeasurementPreview;

type RendererConfig = {
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
};

export class MeasurementRenderer {
  private container: PIXI.Container;
  private graphics: PIXI.Graphics;
  private previewGraphics: PIXI.Graphics | null = null;
  private config: RendererConfig;

  constructor(parentContainer: PIXI.Container, config: RendererConfig) {
    this.container = new PIXI.Container();
    this.container.label = 'measurementLayer';
    this.container.sortableChildren = true;
    this.container.zIndex = 100;
    this.config = config;

    this.graphics = new PIXI.Graphics();
    this.graphics.label = 'measurementGraphics';
    this.container.addChild(this.graphics);

    parentContainer.addChild(this.container);
  }

  getLayer(): PIXI.Container {
    return this.container;
  }

  clear(): void {
    this.graphics.clear();
  }

  clearPreview(): void {
    if (this.previewGraphics) {
      this.previewGraphics.clear();
    }
  }

  drawMeasurement(measurement: RendererMeasurement): void {
    this.graphics.clear();
    this.drawCells(this.graphics, measurement, measurement.color);
  }

  drawPreview(preview: MeasurementPreview, color: number): void {
    const graphics = this.getPreviewGraphics();
    graphics.clear();
    this.drawCells(graphics, preview, color);
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  destroy(): void {
    this.graphics.destroy();
    if (this.previewGraphics) {
      this.previewGraphics.destroy();
    }
    this.container.destroy();
  }

  private getPreviewGraphics(): PIXI.Graphics {
    if (!this.previewGraphics) {
      this.previewGraphics = new PIXI.Graphics();
      this.previewGraphics.label = 'measurementPreview';
      this.container.addChild(this.previewGraphics);
    }
    return this.previewGraphics;
  }

  private drawCells(graphics: PIXI.Graphics, measurement: RendererMeasurement, color: number): void {
    const result = getMeasurementCells(measurement);

    for (const cell of result.cells) {
      const points = getCellPolygonPoints(
        cell,
        this.config.gridSize,
        this.config.gridOffsetX,
        this.config.gridOffsetY,
        measurement.gridKind,
      );

      if (points.length === 0) continue;

      graphics.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y);
      }
      graphics.closePath();
      graphics.fill({ color, alpha: 0.3 });
      graphics.stroke({ width: 2, color, alpha: 0.9 });
    }
  }
}

export function createMeasurementRenderer(parentContainer: PIXI.Container, config: RendererConfig): MeasurementRenderer {
  return new MeasurementRenderer(parentContainer, config);
}
