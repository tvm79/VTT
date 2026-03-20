import { useEffect, useRef } from "react";
import { Application, Container, Sprite, Texture, Assets } from "pixi.js";
import { initPixiApplicationWebGL2First } from '../../utils/pixiRenderer';

export default function PixiBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    let mouseX = 0;
    let mouseY = 0;
    let handleMouseMove: ((e: MouseEvent) => void) | null = null;

    const init = async () => {
      const { app } = await initPixiApplicationWebGL2First({
        resizeTo: window,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        sharedTicker: false,
      });

      appRef.current = app;
      containerRef.current?.appendChild(app.canvas);

      const stage = app.stage;

      /* ---------------- BACKGROUND ---------------- */

      let bgTexture: Texture;

      try {
        bgTexture = await Assets.load("/assets/Background.webp");
      } catch {
        bgTexture = createBackgroundTexture();
      }

      const background = new Sprite(bgTexture);
      background.anchor.set(0.5);
      background.alpha = 0.9;
      stage.addChild(background);

      /* ---------------- DEPTH FOG ---------------- */

      const fogFarContainer = new Container();
      const fogMidContainer = new Container();
      const vortexFogContainer = new Container();
      const d20BacklightContainer = new Container();
      const d20FogContainer = new Container();
      const particleContainer = new Container();
      const fogNearContainer = new Container();
      const vignetteContainer = new Container();

      stage.addChild(fogFarContainer);
      stage.addChild(fogMidContainer);
      stage.addChild(vortexFogContainer);
      stage.addChild(d20BacklightContainer);
      stage.addChild(d20FogContainer);

      const fogTexture = createFogTexture();

      const fogFar: Sprite[] = [];
      const fogMid: Sprite[] = [];
      const fogNear: Sprite[] = [];

      function createFogLayer(
        container: Container,
        count: number,
        speed: number,
        scale: number,
        alpha: number,
        list: Sprite[]
      ) {
        for (let i = 0; i < count; i++) {
          const fog = new Sprite(fogTexture);

          fog.anchor.set(0.5);
          fog.alpha = alpha;
          fog.scale.set(scale + Math.random());

          (fog as any).vx = speed * (0.6 + Math.random());
          (fog as any).vy = speed * 0.4 * Math.random();

          container.addChild(fog);
          list.push(fog);
        }
      }

      createFogLayer(fogFarContainer, 25, 0.05, 2.6, 0.09, fogFar);
      createFogLayer(fogMidContainer, 35, 0.11, 1.9, 0.12, fogMid);

      /* ---------------- TORCH LIGHTS ---------------- */

      const torchContainer = new Container();
      stage.addChild(torchContainer);

      const lightTexture = createLightTexture();
      const torchLights: Sprite[] = [];

      const torchPositions = [
        [0.25, 0.65],
        [0.75, 0.65],
        [0.5, 0.85],
      ];

      torchPositions.forEach(([px, py]) => {
        const light = new Sprite(lightTexture);

        light.anchor.set(0.5);
        light.blendMode = "add";
        light.alpha = 0.22;
        light.scale.set(3.0);

        (light as any).px = px;
        (light as any).py = py;
        (light as any).offset = Math.random() * 1000;

        torchContainer.addChild(light);
        torchLights.push(light);
      });

      /* ---------------- D20 BACKLIGHT ---------------- */

      const d20Backlight = new Sprite(createD20BacklightTexture());
      d20Backlight.anchor.set(0.5);
      d20Backlight.alpha = 0.42;
      d20BacklightContainer.addChild(d20Backlight);

      /* ---------------- D20 ---------------- */

      const d20Texture = await Assets.load({
        src: "/assets/icons/svg/d20.svg",
        data: {
          resolution: 6
        },
      });

      const d20 = new Sprite(d20Texture);
      d20.anchor.set(0.5);
      d20.scale.set(4.4);
      d20.tint = 0x111111;
      d20.alpha = 0.95;
      stage.addChild(d20);

      /* ---------------- LOCAL D20 FOG ---------------- */

      const d20FogTexture = createFogTexture();
      const d20FogParticles: Sprite[] = [];

      for (let i = 0; i < 18; i++) {
        const fog = new Sprite(d20FogTexture);

        fog.anchor.set(0.5);
        fog.scale.set(0.8 + Math.random() * 0.8);
        fog.alpha = 0.12 + Math.random() * 0.08;

        (fog as any).vx = (Math.random() - 0.5) * 0.08;
        (fog as any).vy = (Math.random() - 0.5) * 0.08;
        (fog as any).radius = 120 + Math.random() * 90;

        d20FogContainer.addChild(fog);
        d20FogParticles.push(fog);
      }

      /* ---------------- VORTEX FOG ---------------- */

      const vortexTexture = createFogTexture();
      const vortexParticles: Sprite[] = [];

      for (let i = 0; i < 30; i++) {
        const fog = new Sprite(vortexTexture);

        fog.anchor.set(0.5);
        fog.alpha = 0.12 + Math.random() * 0.1;
        fog.scale.set(0.8 + Math.random() * 0.9);

        const radius = 140 + Math.random() * 170;

        (fog as any).baseRadius = radius;
        (fog as any).radius = radius;
        (fog as any).angle = Math.random() * Math.PI * 2;
        (fog as any).speed = 0.0015 + Math.random() * 0.0025;
        (fog as any).offset = Math.random() * 1000;

        vortexFogContainer.addChild(fog);
        vortexParticles.push(fog);
      }

      /* ---------------- PARTICLES ---------------- */

      stage.addChild(particleContainer);

      let emberTexture: Texture;

      try {
        emberTexture = await Assets.load("/assets/effects/embers/ember.webp");
      } catch {
        emberTexture = createLightTexture();
      }

      const particles: Sprite[] = [];

      for (let i = 0; i < 50; i++) {
        const p = new Sprite(emberTexture);

        p.anchor.set(0.5);
        p.scale.set(0.3 + Math.random() * 0.5);
        p.alpha = 0.45;

        (p as any).vx = (Math.random() - 0.5) * 0.25;
        (p as any).vy = -0.4 - Math.random() * 0.4;

        particleContainer.addChild(p);
        particles.push(p);
      }

      /* ---------------- FOREGROUND FOG ---------------- */

      stage.addChild(fogNearContainer);
      createFogLayer(fogNearContainer, 18, 0.18, 1.25, 0.14, fogNear);

      /* ---------------- VIGNETTE ---------------- */

      const vignette = new Sprite(createVignetteTexture());
      vignette.anchor.set(0.5);
      vignette.alpha = 0.6;
      vignetteContainer.addChild(vignette);
      stage.addChild(vignetteContainer);

      /* ---------------- LAYOUT ---------------- */

      function layout() {
        const w = app.screen.width;
        const h = app.screen.height;

        background.x = w / 2;
        background.y = h / 2;

        const scale = Math.max(w / bgTexture.width, h / bgTexture.height) * 1.05;
        background.scale.set(scale);

        vignette.x = w / 2;
        vignette.y = h / 2;
        vignette.width = w;
        vignette.height = h;

        d20.x = w / 2;
        d20.y = h / 2;

        d20Backlight.x = w / 2;
        d20Backlight.y = h / 2;
        d20Backlight.scale.set(Math.min(w, h) / 900);

        torchLights.forEach((light) => {
          light.x = w * (light as any).px;
          light.y = h * (light as any).py;
        });

        [...fogFar, ...fogMid, ...fogNear].forEach((f) => {
          f.x = Math.random() * w;
          f.y = Math.random() * h;
        });

        particles.forEach((p) => {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
        });

        d20FogParticles.forEach((f) => {
          const radius = (f as any).radius;
          const angle = Math.random() * Math.PI * 2;
          f.x = d20.x + Math.cos(angle) * radius;
          f.y = d20.y + Math.sin(angle) * radius * 0.75;
        });
      }

      layout();
      app.renderer.on("resize", layout);

      /* ---------------- MOUSE PARALLAX ---------------- */

      handleMouseMove = (e: MouseEvent) => {
        mouseX = e.clientX / window.innerWidth - 0.5;
        mouseY = e.clientY / window.innerHeight - 0.5;
      };

      window.addEventListener("mousemove", handleMouseMove);

      /* ---------------- ANIMATION ---------------- */

      let time = 0;

      app.ticker.add((ticker) => {
        const delta = ticker.deltaTime;
        time += delta;

        /* D20 bob */
        d20.x = app.screen.width / 2;
        d20.y = app.screen.height / 2 + Math.sin(time * 0.012) * 18;

        d20Backlight.x = d20.x;
        d20Backlight.y = d20.y;
        d20Backlight.alpha = 0.34 + Math.sin(time * 0.01) * 0.05;

        /* vortex fog */
        for (let i = 0; i < vortexParticles.length; i++) {
          const f = vortexParticles[i];

          (f as any).angle += (f as any).speed * delta;
          (f as any).radius =
            (f as any).baseRadius + Math.sin(time * 0.008 + (f as any).offset) * 10;

          const r = (f as any).radius;
          const a = (f as any).angle;

          f.x = d20.x + Math.cos(a) * r;
          f.y = d20.y + Math.sin(a) * r * 0.62;
          f.rotation += 0.0015 * delta;
        }

        /* local d20 fog */
        for (let i = 0; i < d20FogParticles.length; i++) {
          const f = d20FogParticles[i];

          f.x += (f as any).vx * delta;
          f.y += (f as any).vy * delta;

          const dx = f.x - d20.x;
          const dy = f.y - d20.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > (f as any).radius) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 90 + Math.random() * 110;
            f.x = d20.x + Math.cos(angle) * radius;
            f.y = d20.y + Math.sin(angle) * radius * 0.75;
          }
        }

        /* background parallax */
        background.x = app.screen.width / 2 + mouseX * 25;
        background.y = app.screen.height / 2 + mouseY * 25;

        /* fog layers */
        function animateFog(list: Sprite[]) {
          for (let i = 0; i < list.length; i++) {
            const f = list[i];

            f.x += (f as any).vx * delta;
            f.y += (f as any).vy * delta;

            if (f.x > app.screen.width + 220) f.x = -220;
            if (f.y > app.screen.height + 220) f.y = -220;
          }
        }

        animateFog(fogFar);
        animateFog(fogMid);
        animateFog(fogNear);

        /* particles */
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];

          p.x += (p as any).vx * delta;
          p.y += (p as any).vy * delta;

          if (p.y < -20) {
            p.y = app.screen.height + 20;
            p.x = Math.random() * app.screen.width;
          }
        }

        /* torch flicker */
        torchLights.forEach((light) => {
          const offset = (light as any).offset;
          light.alpha = 0.18 + Math.sin((time + offset) * 0.015) * 0.06;
        });
      });
    };

    init();

    return () => {
      if (handleMouseMove) {
        window.removeEventListener("mousemove", handleMouseMove);
      }

      const app = appRef.current;
      if (!app) return;

      app.ticker.stop();

      if (app.canvas?.parentNode) {
        app.canvas.parentNode.removeChild(app.canvas);
      }

      try {
        app.destroy(true);
      } catch {}

      appRef.current = null;
    };
  }, []);

  return (
    <div
      id="pixi-login-bg"
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

/* ---------------- TEXTURES ---------------- */

function createBackgroundTexture(): Texture {
  const w = 1920;
  const h = 1080;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 1200);
  g.addColorStop(0, "#1c2a38");
  g.addColorStop(1, "#05090f");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  return Texture.from(canvas);
}

function createFogTexture(): Texture {
  const size = 512;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(215,225,235,0.28)");
  g.addColorStop(0.55, "rgba(195,205,215,0.12)");
  g.addColorStop(1, "rgba(200,210,220,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return Texture.from(canvas);
}

function createLightTexture(): Texture {
  const size = 256;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,220,180,1)");
  g.addColorStop(1, "rgba(255,150,100,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return Texture.from(canvas);
}

function createD20BacklightTexture(): Texture {
  const size = 1024;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.42);
  g.addColorStop(0, "rgba(255,245,230,0.30)");
  g.addColorStop(0.45, "rgba(210,220,235,0.12)");
  g.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return Texture.from(canvas);
}

function createVignetteTexture(): Texture {
  const size = 1024;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.4,
    size / 2,
    size / 2,
    size / 2
  );

  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.85)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return Texture.from(canvas);
}
