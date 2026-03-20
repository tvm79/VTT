import {
  AbstractMesh,
  Color4,
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
} from '@babylonjs/core';

export function createDieMesh(scene: Scene, sides: number): Mesh {
  if (sides === 20) {
    return createD20Mesh(scene);
  }
  return createD6Mesh(scene);
}

function createD6Mesh(scene: Scene): Mesh {
  const mesh = MeshBuilder.CreateBox('dice-d6', { size: 0.95 }, scene);

  const material = new StandardMaterial('dice-d6-material', scene);
  const texture = new DynamicTexture('dice-d6-texture', { width: 512, height: 512 }, scene, true);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const faceSize = 256;

  ctx.fillStyle = '#f2f5ff';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#5b6ea6';
  ctx.lineWidth = 12;

  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.strokeRect(x * faceSize, y * faceSize, faceSize, faceSize);
    }
  }

  const numbers = ['1', '2', '3', '4'];
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  numbers.forEach((num, i) => {
    const x = (i % 2) * faceSize + faceSize / 2;
    const y = Math.floor(i / 2) * faceSize + faceSize / 2;
    ctx.fillText(num, x, y);
  });

  texture.update();
  material.diffuseTexture = texture;
  material.specularColor = new Color3(0.3, 0.3, 0.35);
  material.emissiveColor = new Color3(0.08, 0.08, 0.12);
  mesh.material = material;

  return mesh;
}

function createD20Mesh(scene: Scene): Mesh {
  const mesh = MeshBuilder.CreatePolyhedron('dice-d20', { type: 3, size: 1.05 }, scene);
  const material = new PBRMaterial('dice-d20-material', scene);
  material.albedoColor = new Color3(0.2, 0.28, 0.5);
  material.metallic = 0.2;
  material.roughness = 0.35;
  mesh.material = material;
  return mesh;
}

export function attachDieValueBadge(scene: Scene, mesh: AbstractMesh, value: number): Mesh {
  const badge = MeshBuilder.CreatePlane(`dice-badge-${mesh.name}-${value}`, { size: 0.55 }, scene);
  badge.parent = mesh;
  badge.position.y = 0.95;
  badge.billboardMode = Mesh.BILLBOARDMODE_ALL;

  const texture = new DynamicTexture(`dice-badge-tex-${mesh.name}-${value}`, { width: 256, height: 256 }, scene, true);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;

  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(15, 20, 35, 0.82)';
  ctx.beginPath();
  ctx.roundRect(24, 24, 208, 208, 36);
  ctx.fill();
  ctx.strokeStyle = 'rgba(170, 190, 255, 0.85)';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#f8fbff';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), 128, 136);
  texture.update();

  const material = new StandardMaterial(`dice-badge-mat-${mesh.name}-${value}`, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(0.8, 0.87, 1);
  material.specularColor = new Color3(0, 0, 0);
  material.backFaceCulling = false;
  material.alpha = 0.96;
  material.diffuseTexture!.hasAlpha = true;
  material.useAlphaFromDiffuseTexture = true;
  badge.material = material;

  return badge;
}
