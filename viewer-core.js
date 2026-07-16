import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

// container内に3Dビューアを構築する。戻り値のdispose()で描画ループとWebGLコンテキストを破棄する。
export function initViewer(container, url, { onStatus } = {}) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
  camera.position.set(0, 1, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const splat = new SplatMesh({ url });
  splat.quaternion.set(1, 0, 0, 0);
  scene.add(splat);

  onStatus?.("読み込み中...");
  const ready = splat.initialized.then(() => {
    onStatus?.("表示成功");
  }).catch((err) => {
    onStatus?.("読み込み失敗：ファイルURLを確認してください");
    console.error(err);
    throw err;
  });

  const handleResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", handleResize);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    ready,
    canvas: renderer.domElement,
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
