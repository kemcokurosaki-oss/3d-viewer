import { supabase, BUCKET } from "./supabase-client.js";
import { initViewer } from "./viewer-core.js";

// 拡張子からSparkのSplatFileType文字列を判定する（blob URLは拡張子を持たないため、明示的に渡す必要がある）
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

// ファイル名から安全なファイル名を新規生成する（元の名前は使わない）
function buildSafeFileName(machineName, partLabel, originalFileName) {
  const ext = (originalFileName.split(".").pop() || "splat").toLowerCase();
  const base = (machineName || "machine")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 30) || "machine";
  const part = (partLabel || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 20);
  const stamp = Date.now();
  return [base, part, stamp].filter(Boolean).join("_") + "." + ext;
}

// 工程表アプリのtasksテーブルから案件一覧を取得（project_number重複は除去）
export async function fetchProjectOptions() {
  const { data, error } = await supabase
    .from("tasks")
    .select("project_number, customer_name")
    .not("project_number", "is", null);

  if (error) throw error;

  const seen = new Map();
  (data || []).forEach((row) => {
    const num = (row.project_number || "").toString().trim();
    if (!num || seen.has(num)) return;
    seen.set(num, row.customer_name || "");
  });

  return [...seen.entries()].map(([num, customer]) => ({ num, customer }));
}

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

  const tree = [...projects.entries()].map(([num, { customer, machines }]) => ({
    num,
    customer,
    machines: [...machines].sort(),
  }));

  // 工程表アプリの一覧と同じ並び順（工事番号の日本語ロケール比較）に合わせる
  tree.sort((a, b) => a.num.localeCompare(b.num, "ja"));

  return tree;
}

// 指定した案件・機械にアップロード済みの3Dファイル一覧を取得する
export async function fetchMachineFiles(projectNumber, machineName) {
  const { data: project } = await supabase
    .from("splat_projects")
    .select("id")
    .eq("name", projectNumber)
    .maybeSingle();
  if (!project) return [];

  const { data: machine } = await supabase
    .from("splat_machines")
    .select("id")
    .eq("project_id", project.id)
    .eq("name", machineName)
    .maybeSingle();
  if (!machine) return [];

  const { data: files, error } = await supabase
    .from("splat_files")
    .select("id, part_label, file_url, thumbnail_url, created_at, sort_order")
    .eq("machine_id", machine.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  return files || [];
}

// パーツの並び順を、指定した並び順（fileIdの配列）の通りに更新する
export async function reorderParts(orderedFileIds) {
  await Promise.all(
    orderedFileIds.map((id, index) =>
      supabase.from("splat_files").update({ sort_order: index }).eq("id", id)
    )
  );
}

// splat_projects に該当案件があれば取得、無ければ作成
async function findOrCreateProject(projectNumber) {
  const { data: existing } = await supabase
    .from("splat_projects")
    .select("id")
    .eq("name", projectNumber)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("splat_projects")
    .insert({ name: projectNumber })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

// splat_machines に該当機械があれば取得、無ければ作成
async function findOrCreateMachine(projectId, machineName) {
  const { data: existing } = await supabase
    .from("splat_machines")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", machineName)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("splat_machines")
    .insert({ project_id: projectId, name: machineName })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

// 画面外にビューアを一時生成してその場の描画をPNGとして撮影する
async function captureThumbnail(url) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute; left:-9999px; top:-9999px; width:320px; height:240px;";
  document.body.appendChild(container);

  const viewer = initViewer(container, url, { hint: false });
  try {
    await viewer.ready;
    await new Promise(requestAnimationFrame);
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

// 撮影した画像がほぼ単色（背景のみで対象物が写っていない）かどうかを、輝度の分散から判定する
const BLANK_LUMA_VARIANCE_THRESHOLD = 60;
async function isBlobMostlyBlank(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      sum += luma;
      sumSq += luma * luma;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return variance < BLANK_LUMA_VARIANCE_THRESHOLD;
  } finally {
    bitmap.close();
  }
}

// 画面外にビューアを一時生成し、Y軸回転させた複数アングルからサムネイル候補（PNG Blob）を撮影する
// fileType: blob URL（ローカル選択直後のファイル）は拡張子を持たないため、明示的に渡す
// 元データの撮影範囲によっては角度次第で対象物が写らない（背景のみになる）ため、そうした候補は除外して返す
export async function captureThumbnailCandidates(url, fileType, angles = [0, 60, 120, 180, 240, 300]) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute; left:-9999px; top:-9999px; width:320px; height:240px;";
  document.body.appendChild(container);

  const viewer = initViewer(container, url, { hint: false, fileType });
  try {
    await viewer.ready;
    const blobs = [];
    for (const angle of angles) {
      viewer.setCameraAngle(angle);
      // カメラ移動直後の描画が安定するまで数フレーム待つ
      for (let i = 0; i < 3; i++) {
        await new Promise(requestAnimationFrame);
      }
      const blob = await new Promise((resolve, reject) => {
        viewer.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("サムネイル候補の生成に失敗しました"))), "image/png");
      });
      blobs.push(blob);
    }
    const nonBlankBlobs = [];
    for (const blob of blobs) {
      if (!(await isBlobMostlyBlank(blob))) nonBlankBlobs.push(blob);
    }
    return nonBlankBlobs.length > 0 ? nonBlankBlobs : blobs;
  } finally {
    viewer.dispose();
    container.remove();
  }
}

// PNG BlobをStorageの thumbnails/ 以下にアップロードし、公開URLを返す
async function uploadThumbnailBlob(blob, safeName) {
  const thumbName = "thumbnails/" + safeName.replace(/\.[^.]+$/, "") + ".png";
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(thumbName, blob, { cacheControl: "3600", upsert: false, contentType: "image/png" });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(thumbName);
  return data.publicUrl;
}

// サムネイルを撮影してStorageにアップロードし、公開URLを返す（失敗時はnull）
async function generateAndUploadThumbnail(fileUrl, safeName) {
  try {
    const blob = await captureThumbnail(fileUrl);
    return await uploadThumbnailBlob(blob, safeName);
  } catch (err) {
    console.error("サムネイル生成に失敗しました", err);
    return null;
  }
}

// 画像をStorageにアップロードして公開URLを返す
async function uploadImage(imageFile, path) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, imageFile, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// 手動で選択されたサムネイル画像をStorageにアップロードし、公開URLを返す（失敗時はnull）
async function uploadThumbnailImage(thumbnailFile, safeName) {
  try {
    const ext = (thumbnailFile.name.split(".").pop() || "jpg").toLowerCase();
    const thumbName = "thumbnails/" + safeName.replace(/\.[^.]+$/, "") + "." + ext;
    return await uploadImage(thumbnailFile, thumbName);
  } catch (err) {
    console.error("サムネイル画像のアップロードに失敗しました", err);
    return null;
  }
}

// 登録済みのパーツのサムネイルを、後から指定した画像に差し替える
export async function updateThumbnail(fileId, thumbnailFile) {
  const ext = (thumbnailFile.name.split(".").pop() || "jpg").toLowerCase();
  const thumbName = "thumbnails/" + fileId + "_" + Date.now() + "." + ext;
  const thumbnailUrl = await uploadImage(thumbnailFile, thumbName);

  const { error } = await supabase
    .from("splat_files")
    .update({ thumbnail_url: thumbnailUrl })
    .eq("id", fileId);
  if (error) throw error;

  return thumbnailUrl;
}

// 登録済みのパーツのファイル名（パーツ番号）を、後から指定した名前に差し替える
export async function updatePartLabel(fileId, partLabel) {
  const { error } = await supabase
    .from("splat_files")
    .update({ part_label: partLabel || null })
    .eq("id", fileId);
  if (error) throw error;
}

// Storageの公開URLからバケット内の相対パスを取り出す
function extractStoragePath(publicUrl) {
  if (!publicUrl) return null;
  const marker = `/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

// パーツを削除する（Storage上のファイル本体・サムネイルとsplat_filesのレコードを削除）
export async function deletePart(fileId) {
  const { data: file, error: fetchError } = await supabase
    .from("splat_files")
    .select("file_url, thumbnail_url")
    .eq("id", fileId)
    .single();
  if (fetchError) throw fetchError;

  const paths = [extractStoragePath(file.file_url), extractStoragePath(file.thumbnail_url)]
    .filter(Boolean);
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) throw removeError;
  }

  const { error: deleteError } = await supabase
    .from("splat_files")
    .delete()
    .eq("id", fileId);
  if (deleteError) throw deleteError;
}

// パーツファイルをアップロードし、splat_projects / splat_machines / splat_files に登録する
export async function uploadPart({ projectNumber, machineName, partLabel, file, thumbnailFile, thumbnailBlob }, onStatus) {
  onStatus?.("アップロード中...");
  const safeName = buildSafeFileName(machineName, partLabel, file.name);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(safeName, file, { cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
  const fileUrl = urlData.publicUrl;

  let thumbnailUrl;
  if (thumbnailFile) {
    onStatus?.("サムネイル画像をアップロード中...");
    thumbnailUrl = await uploadThumbnailImage(thumbnailFile, safeName);
  } else if (thumbnailBlob) {
    onStatus?.("選択したサムネイル候補をアップロード中...");
    try {
      thumbnailUrl = await uploadThumbnailBlob(thumbnailBlob, safeName);
    } catch (err) {
      console.error("サムネイル候補のアップロードに失敗しました", err);
      thumbnailUrl = null;
    }
  } else {
    onStatus?.("サムネイルを生成中...");
    thumbnailUrl = await generateAndUploadThumbnail(fileUrl, safeName);
  }

  onStatus?.("案件情報を登録中...");
  const projectId = await findOrCreateProject(projectNumber);

  onStatus?.("機械情報を登録中...");
  const machineId = await findOrCreateMachine(projectId, machineName);

  onStatus?.("ファイル情報を登録中...");
  const { data: existing } = await supabase
    .from("splat_files")
    .select("sort_order")
    .eq("machine_id", machineId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = existing ? existing.sort_order + 1 : 0;

  const { error: insertError } = await supabase
    .from("splat_files")
    .insert({
      machine_id: machineId,
      part_label: partLabel || null,
      file_url: fileUrl,
      thumbnail_url: thumbnailUrl,
      sort_order: nextSortOrder,
    });
  if (insertError) throw insertError;

  return fileUrl;
}
