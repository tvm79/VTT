import type { Application } from 'pixi.js';
import { initPixiApplicationWebGL2First } from '../../utils/pixiRenderer';
import type { ParticlePreset } from './particleSchema';
import { ParticleSystem } from '../runtime/ParticleSystem';

export class ParticlePreview {
  private app: Application | null = null;
  private system: ParticleSystem | null = null;
  private container: HTMLDivElement | null = null;
  private width: number = 280;
  private height: number = 180;
  private resizeObserver: ResizeObserver | null = null;
  private currentMountId: number = 0;
  
  // Zoom/pan state
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private stageContainer: any = null;

  async mount(container: HTMLDivElement): Promise<void> {
    const mountId = ++this.currentMountId;
    
    // Prevent double mounting
    if (this.app) {
      return;
    }
    
    this.container = container;
    // Clear any existing content first to prevent duplicate canvases
    container.innerHTML = '';
    const { app } = await initPixiApplicationWebGL2First({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      sharedTicker: false,
    });
    
    // Check if this mount is still valid (not cancelled)
    if (mountId !== this.currentMountId) {
      // Stop the ticker first to prevent rendering during destroy
      app.ticker.stop();
      app.destroy(true);
      return;
    }
    
    this.app = app;
    container.appendChild(app.canvas);
    this.syncSize();
    this.system = new ParticleSystem({
      app,
      boardWidth: this.width,
      boardHeight: this.height,
    });
    await this.system.init();
    
    // Create a container for zoom/pan
    this.stageContainer = new (app.stage.constructor as any)();
    app.stage.addChild(this.stageContainer);
    
    // Move particle root to stage container for zoom/pan to work
    const particleRoot = this.system.getParticleRoot();
    if (particleRoot) {
      app.stage.removeChild(particleRoot);
      this.stageContainer.addChild(particleRoot);
    }

    // Add zoom/pan event handlers
    const canvas = app.canvas;
    canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
    
    this.resizeObserver = new ResizeObserver(() => {
      this.syncSize();
      // Only update bounds, don't resize the renderer
      this.system?.setBounds(this.width, this.height);
    });
    this.resizeObserver.observe(container);
    requestAnimationFrame(() => {
      this.syncSize();
      this.system?.setBounds(this.width, this.height);
    });
  }

  setPresets(presets: ParticlePreset[]): void {
    this.system?.setPresets(presets);
  }

  playPreset(presetId: string): void {
    if (!this.system) return;
    this.syncSize();
    if (this.width <= 0 || this.height <= 0) {
      requestAnimationFrame(() => this.playPreset(presetId));
      return;
    }
    // Stop any currently playing particles before playing the new preset
    this.system.stopAll();
    this.system.setBounds(this.width, this.height);
    this.system.playPreset(presetId, {
      x: this.width / 2,
      y: this.height / 2,
    });
  }

  triggerResize(): void {
    // Just update the bounds, don't resize the renderer
    this.syncSize();
    this.system?.setBounds(this.width, this.height);
  }

  stop(): void {
    this.system?.stopAll();
  }

  cancelMount(): void {
    this.currentMountId++; // Cancel any pending mounts
  }

  destroy(): void {
    // First cancel any pending mounts
    this.cancelMount();
    
    // Disconnect resize observer first
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    
    // Stop the ticker to prevent further rendering
    if (this.app) {
      this.app.ticker.stop();
    }
    
    // Destroy particle system first (removes all particles)
    if (this.system) {
      this.system.stopAll();
      this.system.destroy();
      this.system = null;
    }

    // Then destroy the app
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true });
      this.app = null;
    }
    
    // Clear container last
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
  }

  private syncSize(): void {
    if (this.app?.screen) {
      const width = this.app.screen.width;
      const height = this.app.screen.height;
      if (width > 0 && height > 0) {
        this.width = width;
        this.height = height;
        return;
      }
    }
    if (this.app) {
      const renderer = this.app.renderer as { width?: number; height?: number; resolution?: number };
      const resolution = renderer.resolution ?? 1;
      const width = (renderer.width ?? 0) / resolution;
      const height = (renderer.height ?? 0) / resolution;
      if (width > 0 && height > 0) {
        this.width = width;
        this.height = height;
        return;
      }
    }
    if (!this.container) return;
    this.width = this.container.clientWidth || 280;
    this.height = this.container.clientHeight || 180;
  }

  // Force resize the renderer to match container size
  resize(): void {
    if (!this.app || !this.container) return;
    
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    
    if (containerWidth > 0 && containerHeight > 0) {
      this.app.renderer.resize(containerWidth, containerHeight);
      this.syncSize();
      this.system?.setBounds(this.width, this.height);
    }
  }
  
  // Zoom with mouse wheel
  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    this.scale = Math.max(0.1, Math.min(5, this.scale + delta));
    this.updateTransform();
  }
  
  // Start dragging
  private handleMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }
  
  // Pan while dragging
  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.offsetX += dx;
    this.offsetY += dy;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.updateTransform();
  }
  
  // Stop dragging
  private handleMouseUp(): void {
    this.isDragging = false;
  }
  
  // Apply zoom/pan transform
  private updateTransform(): void {
    if (!this.stageContainer) return;
    this.stageContainer.scale.set(this.scale);
    this.stageContainer.position.set(this.offsetX, this.offsetY);
  }
}
