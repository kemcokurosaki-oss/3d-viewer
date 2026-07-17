import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { ICON_HAND } from "./icons.js";

const DEFAULT_BACKGROUND = 0x1a1a1a;

// スピナー/ヒントのCSSアニメーションはホストページに依存せず自前で1度だけ注入する
let stylesInjected = false;
function ensureStylesInjected() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `@keyframes viewer-core-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

function buildSpinner() {
  const spinner = document.createElement("div");
  spinner.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5;";
  const ring = document.createElement("div");
  ring.style.cssText = "width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:viewer-core-spin .8s linear infinite;";
  spinner.appendChild(ring);
  return spinner;
}

function buildHint() {
  const hint = document.createElement("div");
  hint.style.cssText = "position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.6);color:#fff;padding:8px 16px;border-radius:20px;font-size:12px;white-space:nowrap;pointer-events:none;transition:opacity .6s ease;z-index:5;";
  hint.innerHTML = `${ICON_HAND}<span>ドラッグ：回転／スクロール：ズーム</span>`;
  return hint;
}

// container内に3Dビューアを構築する。戻り値のdispose()で描画ループとWebGLコンテキストを破棄する。
export function initViewer(container, url, { onStatus, hint = true, background = DEFAULT_BACKGROUND } = {}) {
  ensureStylesInjected();

  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
  const initialCameraPosition = new THREE.Vector3(0, 1, 3);
  camera.position.copy(initialCameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const initialTarget = controls.target.clone();

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const splat = new SplatMesh({ url });
  splat.quaternion.set(1, 0, 0, 0);
  scene.add(splat);

  const spinner = buildSpinner();
  container.appendChild(spinner);

  let hintEl = null;
  let hintTimer = null;
  if (hint) {
    hintEl = buildHint();
    container.appendChild(hintEl);
    hintTimer = setTimeout(() => {
      if (!hintEl) return;
      hintEl.style.opacity = "0";
      setTimeout(() => hintEl?.remove(), 600);
    }, 3500);
  }

  onStatus?.("読み込み中...");
  const ready = splat.initialized.then(() => {
    onStatus?.("表示成功");
    spinner.remove();
  }).catch((err) => {
    onStatus?.("読み込み失敗：ファイルURLを確認してください");
    console.error(err);
    spinner.remove();
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
    resetView() {
      camera.position.copy(initialCameraPosition);
      controls.target.copy(initialTarget);
      controls.update();
    },
    setBackground(color) {
      scene.background = new THREE.Color(color);
    },
    dispose() {
      clearTimeout(hintTimer);
      hintEl?.remove();
      spinner.remove();
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
