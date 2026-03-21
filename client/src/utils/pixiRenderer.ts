import { Application } from 'pixi.js';

type PixiInitOptions = NonNullable<Parameters<Application['init']>[0]>;

export type PixiRendererKind = 'webgl2' | 'webgl' | 'canvas' | 'unknown';

type PixiInitWithoutPreference = Omit<PixiInitOptions, 'preference'>;

export function browserSupportsWebGL2(): boolean {
  if (typeof document === 'undefined') return false;

  const testCanvas = document.createElement('canvas');
  return !!testCanvas.getContext('webgl2');
}

export function getPixiRendererKind(app: Application | null | undefined): PixiRendererKind {
  const renderer = app?.renderer as {
    type?: string | number;
    gl?: unknown;
    context?: { gl?: unknown; webGLVersion?: number };
  } | undefined;

  const gl = renderer?.gl ?? renderer?.context?.gl;

  if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
    return 'webgl2';
  }

  if (typeof WebGLRenderingContext !== 'undefined' && gl instanceof WebGLRenderingContext) {
    return 'webgl';
  }

  if (renderer?.context?.webGLVersion === 2 || renderer?.type === 'webgl2') {
    return 'webgl2';
  }

  if (renderer?.context?.webGLVersion === 1 || renderer?.type === 'webgl') {
    return 'webgl';
  }

  if (renderer?.type === 'canvas') {
    return 'canvas';
  }

  return 'unknown';
}

export function isPixiWebGLRenderer(app: Application | null | undefined): boolean {
  const rendererKind = getPixiRendererKind(app);
  return rendererKind === 'webgl' || rendererKind === 'webgl2';
}

async function initCanvasApplication(
  options: PixiInitWithoutPreference
): Promise<{ app: Application; rendererKind: PixiRendererKind }> {
  const app = new Application();
  await app.init({ ...options, preference: 'canvas',antialias: true } as PixiInitOptions);

  const rendererKind = getPixiRendererKind(app);
  return {
    app,
    rendererKind: rendererKind === 'unknown' ? 'canvas' : rendererKind,
  };
}

export async function initPixiApplicationWebGL2First(
  options: PixiInitWithoutPreference
): Promise<{
  app: Application;
  rendererKind: PixiRendererKind;
  webgl2Supported: boolean;
}> {
  const webgl2Supported = browserSupportsWebGL2();

  if (!webgl2Supported) {
    console.log('[PixiRenderer] WebGL2 unavailable, using canvas renderer');
    const canvasResult = await initCanvasApplication(options);
    return { ...canvasResult, webgl2Supported };
  }

  const webglApp = new Application();

  try {
    await webglApp.init({ ...options, preference: 'webgl' } as PixiInitOptions);

    const rendererKind = getPixiRendererKind(webglApp);
    if (rendererKind === 'webgl2') {
      console.log('[PixiRenderer] WebGL2 renderer initialized successfully');
      return { app: webglApp, rendererKind, webgl2Supported };
    }

    console.warn('[PixiRenderer] Expected WebGL2 but received', rendererKind, '- falling back to canvas');
  } catch (error) {
    console.warn('[PixiRenderer] WebGL2 initialization failed, falling back to canvas:', error);
  }

  webglApp.destroy(true);

  const canvasResult = await initCanvasApplication(options);
  return { ...canvasResult, webgl2Supported };
}
