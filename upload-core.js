import { supabase, BUCKET } from "./supabase-client.js";

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
    });
  if (insertError) throw insertError;

  return fileUrl;
}
