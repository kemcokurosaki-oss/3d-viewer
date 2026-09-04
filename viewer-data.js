import { supabase, BUCKET } from "./supabase-client.js";
import { initViewer } from "./viewer-core.js";
import { listMachineFiles } from "./sharepoint-client.js";

// 拡張子からSparkのSplatFileType文字列を判定する
// SharePointのdownloadUrlは拡張子を含まない不透明なURLのため、明示的に渡す必要がある
const EXTENSION_TO_SPLAT_FILE_TYPE = {
  splat: "splat",
  ply: "ply",
  ksplat: "ksplat",
  spz: "spz",
  sog: "pcsogszip",
};
export function splatFileTypeFromFileName(fileName) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return EXTENSION_TO_SPLAT_FILE_TYPE[ext];
}

// 工程表アプリ導入前に完了しtasksに存在しない案件を一時的に補うための特例リスト
// 恒久的な仕組みではない。該当が増えた場合の対応は都度検討すること
const LEGACY_PROJECTS = [
  { num: "2817", customer: "Tenaris Saudi", machines: ["MC"] },
];

// 工程表アプリのtasksテーブルから「工事番号→機械名」の階層データを取得する
export async function fetchProjectMachineTree() {
  const { data, error } = await supabase
    .from("tasks")
    .select("project_number, customer_name, machine")
    .not("project_number", "is", null);

  if (error) throw error;

  const projects = new Map();
  (data || []).forEach((row) => {
    const num = (row.project_number || "").toString().trim();
    if (!num) return;
    if (!projects.has(num)) {
      projects.set(num, { customer: row.customer_name || "", machines: new Set() });
    }
    const entry = projects.get(num);
    if (!entry.customer && row.customer_name) entry.customer = row.customer_name;
    const machine = (row.machine || "").toString().trim();
    // カンマ区切りは複数機械にまたがるタスクのため、単一機械名として扱わず除外する
    if (machine && !machine.includes(",")) entry.machines.add(machine);
  });

  LEGACY_PROJECTS.forEach(({ num, customer, machines }) => {
    if (!projects.has(num)) {
      projects.set(num, { customer, machines: new Set(machines) });
    }
  });

  const tree = [...projects.entries()].map(([num, { customer, machines }]) => ({
    num,
    customer,
    machines: [...machines].sort(),
  }));

  // 工程表アプリの一覧と同じ並び順（工事番号の日本語ロケール比較）に合わせる
  tree.sort((a, b) => a.num.localeCompare(b.num, "ja"));

  return tree;
}

// 拡張子を除いたファイル名を、表示名が未設定の場合のデフォルトとして使う
function labelFromFileName(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

// driveItemIdの配列に対応するメタ情報（表示名・サムネイル・並び順）をまとめて取得する
async function fetchMetaMap(driveItemIds) {
  if (driveItemIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("sharepoint_file_meta")
    .select("drive_item_id, part_label, thumbnail_url, sort_order")
    .in("drive_item_id", driveItemIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.drive_item_id, row]));
}

// 画面外にビューアを一時生成してその場の描画をPNG Blobとして撮影する
async function captureThumbnail(url, fileType) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute; left:-9999px; top:-9999px; width:320px; height:240px;";
  document.body.appendChild(container);

  const viewer = initViewer(container, url, { hint: false, fileType });
  try {
    await viewer.ready;
    // readyの直後は実際の描画がまだ追いついておらず、1フレームだけの待機だと
    // 真っ黒な画像になることがあるため、複数フレーム分待って描画を安定させる
    for (let i = 0; i < 10; i++) {
      await new Promise(requestAnimationFrame);
    }
    return await new Promise((resolve, reject) => {
      viewer.canvas.toBlob((blob) => {
        blob ? resolve(blob) : reject(new Error("サムネイル画像の生成に失敗しました"));
      }, "image/png");
    });
  } finally {
    viewer.dispose();
    container.remove();
  }
}

// PNG BlobをStorageのthumbnails/以下にアップロードし、公開URLを返す
// ファイル名は毎回一意にする（upsertがStorageのポリシー上使えないため、同名上書きを避ける）
async function uploadThumbnailBlob(blob, driveItemId) {
  const thumbName = `thumbnails/${driveItemId}_${Date.now()}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(thumbName, blob, { cacheControl: "3600", upsert: false, contentType: "image/png" });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(thumbName);
  return data.publicUrl;
}

// ページ読み込み直後は3D描画ライブラリ（Spark）のワーカー初期化が間に合わず、
// 撮影の1回目だけ失敗することがあるため、間隔を空けて数回リトライする
async function captureThumbnailWithRetry(url, fileType, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await captureThumbnail(url, fileType);
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastErr;
}

// バックグラウンドでのサムネイル生成を直列化するキュー
// （同時に複数のWebGLコンテキストを作ると不安定になるため、1件ずつ順番に処理する）
let thumbnailQueue = Promise.resolve();
function enqueueThumbnail(task) {
  thumbnailQueue = thumbnailQueue.then(task, task);
}

// サムネイルを撮影してStorageに保存し、メタ情報のthumbnail_urlを更新する
// 一覧の表示はこの完了を待たないため、完了後にonThumbnailReadyで呼び出し元へ個別に通知する
async function generateThumbnailInBackground(file, onThumbnailReady) {
  try {
    const blob = await captureThumbnailWithRetry(file.downloadUrl, splatFileTypeFromFileName(file.name));
    const thumbnailUrl = await uploadThumbnailBlob(blob, file.id);
    const { error } = await supabase
      .from("sharepoint_file_meta")
      .update({ thumbnail_url: thumbnailUrl })
      .eq("drive_item_id", file.id);
    if (error) throw error;
    onThumbnailReady?.(file.id, thumbnailUrl);
  } catch (err) {
    console.error("サムネイル自動生成に失敗しました", err);
  }
}

// 指定した機械のSharePoint上のファイル一覧を取得し、Supabaseのメタ情報（表示名・サムネイル・並び順）と統合する
// 表示名はアプリ側でカスタマイズしていなければ、SharePoint上の実際のファイル名がそのまま使われる（リネームが自動反映される）
// サムネイル未生成のファイルがあれば、一覧はすぐ返しつつ裏側で撮影を進め、完了ごとにonThumbnailReadyで通知する
export async function fetchMachineFiles(project, machineName, onThumbnailReady) {
  const files = await listMachineFiles(project.num, project.customer, machineName);
  if (files.length === 0) return [];

  const metaMap = await fetchMetaMap(files.map((f) => f.id));
  let nextSortOrder = metaMap.size
    ? Math.max(...[...metaMap.values()].map((m) => m.sort_order)) + 1
    : 0;

  const merged = [];
  for (const file of files) {
    let meta = metaMap.get(file.id);
    if (!meta) {
      const sortOrder = nextSortOrder++;
      const { error } = await supabase
        .from("sharepoint_file_meta")
        .upsert({ drive_item_id: file.id, sort_order: sortOrder }, { onConflict: "drive_item_id" });
      if (error) throw error;
      meta = { part_label: null, thumbnail_url: null, sort_order: sortOrder };
    }
    if (!meta.thumbnail_url) {
      enqueueThumbnail(() => generateThumbnailInBackground(file, onThumbnailReady));
    }
    merged.push({
      id: file.id,
      name: file.name,
      downloadUrl: file.downloadUrl,
      part_label: meta.part_label || labelFromFileName(file.name),
      thumbnail_url: meta.thumbnail_url,
      sort_order: meta.sort_order,
      lastModifiedDateTime: file.lastModifiedDateTime,
    });
  }

  merged.sort((a, b) => a.sort_order - b.sort_order);
  return merged;
}

// 表示名を変更する。空にするとSharePoint上の実ファイル名を使う自動表示に戻る
export async function updatePartLabel(driveItemId, label) {
  const { error } = await supabase
    .from("sharepoint_file_meta")
    .update({ part_label: label || null })
    .eq("drive_item_id", driveItemId);
  if (error) throw error;
}

// サムネイル画像を手動で差し替える
export async function updateThumbnail(driveItemId, thumbnailFile) {
  const ext = (thumbnailFile.name.split(".").pop() || "jpg").toLowerCase();
  const thumbName = `thumbnails/${driveItemId}_${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(thumbName, thumbnailFile, { cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(thumbName);

  const { error } = await supabase
    .from("sharepoint_file_meta")
    .update({ thumbnail_url: data.publicUrl })
    .eq("drive_item_id", driveItemId);
  if (error) throw error;

  return data.publicUrl;
}

// パーツの並び順を、指定した並び順（driveItemIdの配列）の通りに更新する
export async function reorderParts(orderedDriveItemIds) {
  await Promise.all(
    orderedDriveItemIds.map((id, index) =>
      supabase.from("sharepoint_file_meta").update({ sort_order: index }).eq("drive_item_id", id)
    )
  );
}
