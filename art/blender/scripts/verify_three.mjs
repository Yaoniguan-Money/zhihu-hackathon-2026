import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer, Box3 } from 'three';

for (const filename of process.argv.slice(2)) {
  const bytes = await fs.readFile(filename);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const meshes = [];
  gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
  assert(meshes.length > 0);
  for (const mesh of meshes) {
    const positions = mesh.geometry.attributes.position.array;
    assert([...positions].every(Number.isFinite), `${mesh.name}: nonfinite position`);
    if (mesh.isSkinnedMesh) {
      assert(mesh.skeleton.bones.some(bone => bone.name === 'Root'));
      const weights = mesh.geometry.attributes.skinWeight;
      for (let i = 0; i < weights.count; i++) {
        const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
        assert(Math.abs(sum - 1) < 0.002, `${mesh.name}: unnormalized skin weights`);
      }
    }
  }
  const mixer = new AnimationMixer(gltf.scene);
  const clips = [];
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset().play();
    mixer.setTime(clip.name === 'Blink' ? 12 / 24 : clip.name === 'TalkMouth' ? 19 / 24 : clip.duration / 4);
    gltf.scene.updateMatrixWorld(true);
    for (const mesh of meshes) {
      assert(mesh.matrixWorld.elements.every(Number.isFinite));
      if (mesh.isSkinnedMesh) assert(mesh.skeleton.boneMatrices.every(Number.isFinite));
    }
    if (clip.name === 'Blink' || clip.name === 'TalkMouth') {
      assert(meshes.some(mesh => mesh.morphTargetInfluences?.some(weight => weight > 0.3)), `${clip.name}: no real morph deformation`);
    }
    if (['Nod', 'ShakeHead', 'HeadTurn'].includes(clip.name)) {
      const head = gltf.scene.getObjectByName('Head');
      assert(head && Math.abs(head.quaternion.w) < 0.999, `${clip.name}: head movement too small`);
    }
    clips.push({ name: clip.name, tracks: clip.tracks.length, evaluated: true });
    action.stop();
  }
  mixer.stopAllAction();
  gltf.scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(gltf.scene);
  assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  const result = { file: filename, meshes: meshes.length, clips, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, status: 'passed' };
  await fs.writeFile(filename.replace(/\.glb$/, '.three-validation.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
