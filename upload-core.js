import { supabase, BUCKET } from "./supabase-client.js";
import { initViewer } from "./viewer-core.js";

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

  const viewer = initViewer(container, url);
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

// サムネイルを撮影してStorageにアップロードし、公開URLを返す（失敗時はnull）
async function generateAndUploadThumbnail(fileUrl, safeName) {
  try {
    const blob = await captureThumbnail(fileUrl);
    const thumbName = "thumbnails/" + safeName.replace(/\.[^.]+$/, "") + ".png";
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(thumbName, blob, { cacheControl: "3600", upsert: false, contentType: "image/png" });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(thumbName);
    return data.publicUrl;
  } catch (err) {
    console.error("サムネイル生成に失敗しました", err);
    return null;
  }
}

// パーツファイルをアップロードし、splat_projects / splat_machines / splat_files に登録する
export async function uploadPart({ projectNumber, machineName, partLabel, file }, onStatus) {
  onStatus?.("アップロード中...");
  const safeName = buildSafeFileName(machineName, partLabel, file.name);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(safeName, file, { cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
  const fileUrl = urlData.publicUrl;

  onStatus?.("サムネイルを生成中...");
  const thumbnailUrl = await generateAndUploadThumbnail(fileUrl, safeName);

  onStatus?.("案件情報を登録中...");
  const projectId = await findOrCreateProject(projectNumber);

  onStatus?.("機械情報を登録中...");
  const machineId = await findOrCreateMachine(projectId, machineName);

  onStatus?.("ファイル情報を登録中...");
  const { error: insertError } = await supabase
    .from("splat_files")
    .insert({
      machine_id: machineId,
      part_label: partLabel || null,
      file_url: fileUrl,
      thumbnail_url: thumbnailUrl,
    });
  if (insertError) throw insertError;

  return fileUrl;
}
