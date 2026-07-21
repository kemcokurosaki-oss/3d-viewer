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
  style.textContent = `
    @keyframes viewer-core-spin { to { transform: rotate(360deg); } }
    @keyframes viewer-core-drag { 0%, 100% { transform: translateX(-16px); } 50% { transform: translateX(16px); } }
  `;
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
  hint.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(10,10,14,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;pointer-events:none;transition:opacity .5s ease;z-index:5;";

  const iconWrap = document.createElement("div");
  iconWrap.style.cssText = "width:56px;height:56px;animation:viewer-core-drag 1.6s ease-in-out infinite;";
  iconWrap.innerHTML = ICON_HAND;
  iconWrap.firstElementChild.style.cssText = "width:100%;height:100%;";

  const label = document.createElement("div");
  label.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(255,255,255,.12);padding:10px 18px;border-radius:16px;font-size:13px;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,.25);";
  label.innerHTML = `
    <span>左ドラッグ：回転</span>
    <span>右ドラッグ：移動</span>
    <span>スクロール：ズーム</span>
  `;

  hint.appendChild(iconWrap);
  hint.appendChild(label);
  return hint;
}

// container内に3Dビューアを構築する。戻り値のdispose()で描画ループとWebGLコンテキストを破棄する。
export function initViewer(container, url, { onStatus, hint = true, background = DEFAULT_BACKGROUND, fileType } = {}) {
  ensureStylesInjected();

  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
  let initialCameraPosition = new THREE.Vector3(0, 1, 3);
  camera.position.copy(initialCameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  let initialTarget = controls.target.clone();

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const splat = new SplatMesh({ url, fileType });
  splat.quaternion.set(1, 0, 0, 0);
  scene.add(splat);

  const spinner = buildSpinner();
  container.appendChild(spinner);

  let hintEl = null;
  let hintTimer = null;
  const hideHint = () => {
    if (!hintEl) return;
    clearTimeout(hintTimer);
    hintEl.style.opacity = "0";
    const el = hintEl;
    hintEl = null;
    setTimeout(() => el.remove(), 500);
  };
  const showHint = () => {
    if (!hint) return;
    hintEl = buildHint();
    container.appendChild(hintEl);
    hintTimer = setTimeout(hideHint, 3500);
    controls.addEventListener("start", hideHint);
  };

  // 読み込んだモデルの実際のバウンディングボックスに合わせてカメラを配置し直す
  // （モデル原点が(0,0,0)から離れている/サイズが想定と違う場合に、固定カメラだと対象が画面外になるのを防ぐ）
  function frameToObject() {
    try {
      splat.updateMatrixWorld(true);
      const box = splat.getBoundingBox().applyMatrix4(splat.matrixWorld);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const boundingRadius = size.length() / 2;
      if (!Number.isFinite(boundingRadius) || boundingRadius <= 0) return;
      const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
      const distance = (boundingRadius / Math.sin(halfFovRad)) * 1.15;
      initialTarget = center.clone();
      initialCameraPosition = new THREE.Vector3(center.x, center.y + distance * 0.33, center.z + distance);
      camera.position.copy(initialCameraPosition);
      controls.target.copy(initialTarget);
      camera.lookAt(initialTarget);
      controls.update();
    } catch (err) {
      console.error("バウンディングボックスの取得に失敗しました", err);
    }
  }

  onStatus?.("読み込み中...");
  const ready = splat.initialized.then(() => {
    frameToObject();
    onStatus?.("表示成功");
    spinner.remove();
    showHint();
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
    // 初期カメラと同じ距離・高さを保ったまま、Y軸周りの角度だけ変えてカメラを配置する（サムネイル候補撮影用）
    setCameraAngle(angleDeg) {
      const radius = Math.hypot(initialCameraPosition.x, initialCameraPosition.z);
      const rad = (angleDeg * Math.PI) / 180;
      camera.position.set(
        initialTarget.x + radius * Math.sin(rad),
        initialCameraPosition.y,
        initialTarget.z + radius * Math.cos(rad)
      );
      controls.target.copy(initialTarget);
      camera.lookAt(initialTarget);
      controls.update();
    },
    setBackground(color) {
      scene.background = new THREE.Color(color);
    },
    dispose() {
      clearTimeout(hintTimer);
      controls.removeEventListener("start", hideHint);
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
