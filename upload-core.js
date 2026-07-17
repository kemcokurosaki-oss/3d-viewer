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
    if (machine) entry.machines.add(machine);
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
    .select("id, part_label, file_url, thumbnail_url, created_at")
    .eq("machine_id", machine.id);
  if (error) throw error;

  return files || [];
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

// パーツファイルをアップロードし、splat_projects / splat_machines / splat_files に登録する
export async function uploadPart({ projectNumber, machineName, partLabel, file, thumbnailFile }, onStatus) {
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
  } else {
    onStatus?.("サムネイルを生成中...");
    thumbnailUrl = await generateAndUploadThumbnail(fileUrl, safeName);
  }

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
