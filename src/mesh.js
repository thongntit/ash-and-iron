import * as T from 'three';

const geometries = {
  box: new T.BoxGeometry(1, 1, 1),
  round: new T.SphereGeometry(0.5, 12, 8),
  cut: new T.IcosahedronGeometry(0.5, 0),
  boulder: new T.IcosahedronGeometry(0.5, 1),
  cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 10),
  taper: new T.CylinderGeometry(0.25, 0.5, 1, 7),
  cone: new T.ConeGeometry(0.5, 1, 7),
  blade: new T.OctahedronGeometry(0.5),
  ring: new T.RingGeometry(0.91, 1, 46).rotateX(-Math.PI / 2),
  disc: new T.CircleGeometry(1, 46).rotateX(-Math.PI / 2),
};

const finishes = new Map();

export function material(color, style = 'matte') {
  const key = `${color}:${style}`;
  if (!finishes.has(key)) {
    const settings = {
      matte: { roughness: 0.89 },
      metal: { metalness: 0.43, roughness: 0.45 },
      ember: { emissive: color, emissiveIntensity: 1.9, roughness: 0.58 },
      light: { emissive: color, emissiveIntensity: 0.65, roughness: 0.64 },
    }[style];
    finishes.set(key, new T.MeshStandardMaterial({ color, ...settings }));
  }
  return finishes.get(key);
}

export function part(target, shape, color, position, scale, options = {}) {
  const geometry = geometries[shape];
  const finish = typeof color === 'string' || typeof color === 'number' ? material(color, options.style) : color;
  const mesh = new T.Mesh(geometry, finish);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.shadow ?? true;
  mesh.receiveShadow = options.receive ?? true;
  target.add(mesh);
  return mesh;
}

const up = new T.Vector3(0, 1, 0);
export function beam(target, from, to, width, color, shape = 'taper', depth = width) {
  const a = new T.Vector3(...from);
  const b = new T.Vector3(...to);
  const direction = b.clone().sub(a);
  const body = part(target, shape, color, a.addScaledVector(direction, 0.5).toArray(), [width, direction.length(), depth]);
  body.quaternion.setFromUnitVectors(up, direction.normalize());
  return body;
}

export function combineStatic(group, scene) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const key = `${mesh.geometry.id}:${mesh.material.id}:${mesh.castShadow}:${mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  });
  for (const instances of batches.values()) {
    const sample = instances[0];
    const combined = new T.InstancedMesh(sample.geometry, sample.material, instances.length);
    instances.forEach((mesh, index) => combined.setMatrixAt(index, mesh.matrixWorld));
    combined.castShadow = sample.castShadow;
    combined.receiveShadow = sample.receiveShadow;
    combined.instanceMatrix.needsUpdate = true;
    scene.add(combined);
  }
}

export function effectMaterial(color, opacity = 1) {
  return new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide, toneMapped: false });
}
