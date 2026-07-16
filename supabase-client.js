import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://dgekjzkrybrswsxlcbvh.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_zRR5iAFLHHLvtGW5AECNnQ_GLiGemGb";
export const BUCKET = "splat-files";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
