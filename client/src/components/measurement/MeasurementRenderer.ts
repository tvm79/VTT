import * as PIXI from 'pixi.js';
import type { Measurement, MeasurementPreview, MeasurementShape, MeasurementPoint } from './MeasurementTypes';
import { calculateCircleRadius, calculateRectangleBounds, calculateConeVertices, calculateDirection } from './MeasurementUtils';

/**
 * MeasurementRenderer - Handles drawing measurements using PixiJS Graphics
 * Note: This renderer is provided for future use. Currently the measurement drawing
 * is done directly in GameBoard.tsx using the existing pattern.
 */
export class MeasurementRenderer {
  private container: PIXI.Container;
  private graphics: PIXI.Graphics;
  private previewGraphics: PIXI.Graphics | null = null;
  private labelsContainer: PIXI.Container;
  
  constructor(parentContainer: PIXI.Container) {
    // Create measurement layer container
    this.container = new PIXI.Container();
    this.container.label = 'measurementLayer';
    this.container.sortableChildren = true;
    this.container.zIndex = 100; // Between tokens and fog
    
    // Create graphics object for measurements
    this.graphics = new PIXI.Graphics();
    this.graphics.name = 'measurementGraphics';
    this.container.addChild(this.graphics);
    
    // Create labels container
    this.labelsContainer = new PIXI.Container();
    this.labelsContainer.label = 'measurementLabels';
    this.container.addChild(this.labelsContainer);
    
    // Add to parent
    parentContainer.addChild(this.container);
  }
  
  /**
   * Get the measurement layer container
   */
  getLayer(): PIXI.Container {
    return this.container;
  }
  
  /**
   * Clear all measurements
   */
  clear(): void {
    this.graphics.clear();
    this.clearLabels();
  }
  
  /**
   * Clear preview graphics
   */
  clearPreview(): void {
    if (this.previewGraphics) {
      this.previewGraphics.clear();
    }
  }
  
  /**
   * Clear all labels
   */
  clearLabels(): void {
    this.labelsContainer.removeChildren();
  }
  
  /**
   * Create or get preview graphics
   */
  private getPreviewGraphics(): PIXI.Graphics {
    if (!this.previewGraphics) {
      this.previewGraphics = new PIXI.Graphics();
      this.previewGraphics.name = 'measurementPreview';
      this.container.addChild(this.previewGraphics);
    }
    return this.previewGraphics;
  }
  
  /**
   * Draw a measurement based on shape
   */
  drawMeasurement(measurement: Measurement): void {
    const { shape, start, end, color, thickness, direction, coneAngle } = measurement;
    
    switch (shape) {
      case 'ray':
        this.drawRay(start, end, color, thickness);
        break;
      case 'circle':
        this.drawCircle(start, end, color, thickness);
        break;
      case 'rectangle':
        this.drawRectangle(start, end, color, thickness);
        break;
      case 'cone':
        this.drawCone(start, end, direction, coneAngle, color, thickness);
        break;
    }
  }
  
  /**
   * Draw ray (line) from start to end
   */
  drawRay(start: MeasurementPoint, end: MeasurementPoint, color: number, thickness: number): void {
    this.graphics.moveTo(start.x, start.y);
    this.graphics.lineTo(end.x, end.y);
    this.graphics.stroke({ width: thickness, color: color, alpha: 0.8 });
  }
  
  /**
   * Draw circle with center at start and radius to end
   */
  drawCircle(start: MeasurementPoint, end: MeasurementPoint, color: number, thickness: number): void {
    const radius = calculateCircleRadius(start, end);
    this.graphics.drawCircle(start.x, start.y, radius);
    this.graphics.stroke({ width: thickness, color: color, alpha: 0.8 });
  }
  
  /**
   * Draw rectangle from start to end
   */
  drawRectangle(start: MeasurementPoint, end: MeasurementPoint, color: number, thickness: number): void {
    const bounds = calculateRectangleBounds(start, end);
    this.graphics.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.graphics.stroke({ width: thickness, color: color, alpha: 0.8 });
  }
  
  /**
   * Draw cone from origin through end point with specified angle
   */
  drawCone(start: MeasurementPoint, end: MeasurementPoint, direction?: number, coneAngle: number = Math.PI / 3, color: number = 0xffffff, thickness: number = 3): void {
    const dir = direction ?? calculateDirection(start, end);
    const length = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    const vertices = calculateConeVertices(start, dir, length, coneAngle);
    
    // Draw the cone as a triangle/polygon
    if (vertices.length >= 3) {
      this.graphics.moveTo(vertices[0].x, vertices[0].y);
      this.graphics.lineTo(vertices[1].x, vertices[1].y);
      this.graphics.lineTo(vertices[2].x, vertices[2].y);
      this.graphics.closePath();
      this.graphics.stroke({ width: thickness, color: color, alpha: 0.8 });
    }
  }
  
  /**
   * Draw preview of measurement during drag
   */
  drawPreview(preview: MeasurementPreview, color: number, thickness: number = 3): void {
    const graphics = this.getPreviewGraphics();
    graphics.clear();
    
    const { shape, start, end, direction, coneAngle } = preview;
    
    // Draw based on shape
    switch (shape) {
      case 'ray':
        this.drawPreviewRay(graphics, start, end, color, thickness);
        break;
      case 'circle':
        this.drawPreviewCircle(graphics, start, end, color, thickness);
        break;
      case 'rectangle':
        this.drawPreviewRectangle(graphics, start, end, color, thickness);
        break;
      case 'cone':
        this.drawPreviewCone(graphics, start, end, direction, coneAngle, color, thickness);
        break;
    }
  }
  
  /**
   * Draw preview ray
   */
  private drawPreviewRay(graphics: PIXI.Graphics, start: MeasurementPoint, end: MeasurementPoint, color: number, thickness: number): void {
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke({ width: thickness, color: color, alpha: 0.6 });
  }
  
  /**
   * Draw preview circle
   */
  private drawPreviewCircle(graphics: PIXI.Graphics, start: MeasurementPoint, end: MeasurementPoint, color: number, thickness: number): void {
    const radius = calculateCircleRadius(start, end);
    graphics.drawCircle(start.x, start.y, radius);
    graphics.stroke({ width: thickness, color: color, alpha: 0.6 });
  }
  
  /**
   * Draw preview rectangle
   */
  private drawPreviewRectangle(graphics: PIXI.Graphics, start: MeasurementPoint, end: MeasurementPoint, color: number, thickness: number): void {
    const bounds = calculateRectangleBounds(start, end);
    graphics.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
    graphics.stroke({ width: thickness, color: color, alpha: 0.6 });
  }
  
  /**
   * Draw preview cone
   */
  private drawPreviewCone(
    graphics: PIXI.Graphics,
    start: MeasurementPoint,
    end: MeasurementPoint,
    direction?: number,
    coneAngle: number = Math.PI / 3,
    color: number = 0xffffff,
    thickness: number = 3
  ): void {
    const dir = direction ?? calculateDirection(start, end);
    const length = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    const vertices = calculateConeVertices(start, dir, length, coneAngle);
    
    if (vertices.length >= 3) {
      graphics.moveTo(vertices[0].x, vertices[0].y);
      graphics.lineTo(vertices[1].x, vertices[1].y);
      graphics.lineTo(vertices[2].x, vertices[2].y);
      graphics.closePath();
      graphics.stroke({ width: thickness, color: color, alpha: 0.6 });
    }
  }
  
  /**
   * Add a label at a specific position
   */
  addLabel(text: string, x: number, y: number, color: number): PIXI.Text {
    const label = new PIXI.Text(text, {
      fontFamily: 'Arial',
      fontSize: 14,
      fill: 0xffffff,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 2 },
    });
    label.x = x + 5;
    label.y = y + 5;
    label.zIndex = 200; // Above other measurement graphics
    
    this.labelsContainer.addChild(label);
    return label;
  }
  
  /**
   * Update visibility
   */
  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }
  
  /**
   * Destroy the renderer
   */
  destroy(): void {
    this.graphics.destroy();
    if (this.previewGraphics) {
      this.previewGraphics.destroy();
    }
    this.labelsContainer.destroy();
    this.container.destroy();
  }
}

/**
 * Create a new MeasurementRenderer instance
 */
export function createMeasurementRenderer(parentContainer: PIXI.Container): MeasurementRenderer {
  return new MeasurementRenderer(parentContainer);
}
