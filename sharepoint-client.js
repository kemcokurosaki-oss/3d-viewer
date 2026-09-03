import * as msal from "https://cdn.jsdelivr.net/npm/@azure/msal-browser@3/+esm";

const MSAL_CONFIG = {
  auth: {
    clientId: "a947a172-1208-4f57-8960-1a1956240adb",
    authority: "https://login.microsoftonline.com/b825147d-5f85-4b12-bda8-8e3108196121",
    redirectUri: "https://kemcokurosaki-oss.github.io/3d-viewer/",
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

// 委任アクセス許可。Sites.Selectedで対象サイトのみに絞る場合はここを変更する
const GRAPH_SCOPES = ["Files.Read.All"];

const SITE_HOST = "kemcojp.sharepoint.com";
const SITE_PATH = "/sites/portal";
// ライブラリ内の3Dモデル格納フォルダへのパス（フォルダ名変更時はここだけ直せばよい）
const LIBRARY_PATH = "写真・動画/★3Dモデル";

const msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
const msalReady = msalInstance.initialize();

let cachedSiteId = null;

// 未サインインならポップアップでログインし、サインイン済みアカウントを返す
export async function ensureSignedIn() {
  await msalReady;
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
    return accounts[0];
  }
  const result = await msalInstance.loginPopup({ scopes: GRAPH_SCOPES });
  msalInstance.setActiveAccount(result.account);
  return result.account;
}

// Graph API呼び出し用のアクセストークンを取得する（サイレント取得優先、失敗時はポップアップ）
async function getAccessToken() {
  await msalReady;
  const account = msalInstance.getActiveAccount() || (await ensureSignedIn());
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
    return result.accessToken;
  } catch (err) {
    const result = await msalInstance.acquireTokenPopup({ scopes: GRAPH_SCOPES });
    return result.accessToken;
  }
}

// 社内ポータルサイトのdrive IDを取得する（初回のみ呼び出し、以降はキャッシュ）
async function getSiteId(token) {
  if (cachedSiteId) return cachedSiteId;
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${SITE_HOST}:${SITE_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`SharePointサイトの取得に失敗しました (${res.status})`);
  const data = await res.json();
  cachedSiteId = data.id;
  return cachedSiteId;
}

// 「工事番号_客先名/機械名」のパスでフォルダのdriveItemを取得する（未作成なら null）
async function getMachineFolderItem(token, siteId, projectNumber, customerName, machineName) {
  const folderName = `${projectNumber}_${customerName}`;
  const path = [LIBRARY_PATH, folderName, machineName].join("/");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SharePointフォルダの取得に失敗しました (${res.status})`);
  return res.json();
}

// 指定した工事番号・客先名・機械名のフォルダ配下にあるファイル一覧を取得する
// 工事番号・客先名はSupabase（工程表）から取得したものをそのまま渡す想定
// 戻り値: [{ id, name, downloadUrl, size, lastModifiedDateTime }]
export async function listMachineFiles(projectNumber, customerName, machineName) {
  const token = await getAccessToken();
  const siteId = await getSiteId(token);
  const folder = await getMachineFolderItem(token, siteId, projectNumber, customerName, machineName);
  if (!folder) return []; // フォルダ未作成・命名規則違反は空扱い（一覧に出さない）

  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${folder.id}/children`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`SharePointファイル一覧の取得に失敗しました (${res.status})`);
  const data = await res.json();

  return (data.value || [])
    .filter((item) => item.file)
    .map((item) => ({
      id: item.id,
      name: item.name,
      downloadUrl: item["@microsoft.graph.downloadUrl"],
      size: item.size,
      lastModifiedDateTime: item.lastModifiedDateTime,
    }));
}

// 「SharePointを開く」ボタン用に、機械フォルダのWeb UI URLを取得する（未作成なら null）
export async function getMachineFolderWebUrl(projectNumber, customerName, machineName) {
  const token = await getAccessToken();
  const siteId = await getSiteId(token);
  const folder = await getMachineFolderItem(token, siteId, projectNumber, customerName, machineName);
  return folder?.webUrl || null;
}
