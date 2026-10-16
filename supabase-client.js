import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";

export const SUPABASE_URL = "https://dgekjzkrybrswsxlcbvh.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_zRR5iAFLHHLvtGW5AECNnQ_GLiGemGb";
export const BUCKET = "splat-files";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Microsoft 365 ログイン（m365-login.js。完全移行後はログインしないと閲覧できない）
window.M365Login?.init(supabase, { appName: '3Dモデルビューア', mountAfter: '#themeToggleBtn' });
