/**
 * Hollywood Cut — 图像生成服务（KIE API 版本）
 *
 * 模型：nano-banana-2（Google Gemini 2.5 Flash Image，单端点，
 *       传入 image_input 即为"图生图/编辑"模式）。
 *
 * KIE 为异步任务模型，流程：
 *   上传参考图 → POST /jobs/createTask → 轮询 GET /jobs/recordInfo
 *   → 成功后下载结果图并转为 base64。
 *
 * API key 由用户在首页输入框运行时提供，**不写入源码**。
 */

const KIE_BASE = 'https://api.kie.ai/api/v1';
const KIE_UPLOAD = 'https://kieai.redpandaai.co/api/file-stream-upload';
const IMAGE_MODEL = 'nano-banana-2';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 240000; // 单任务最长等待 4 分钟

const authHeaders = (apiKey: string): HeadersInit => ({
  'Authorization': `Bearer ${apiKey}`,
});

/** data URL(base64) → Blob */
function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/** Blob → data URL(base64) */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 上传一张 base64 图片到 KIE，返回可访问的 URL（有效期 3 天） */
async function uploadImage(apiKey: string, dataUrl: string): Promise<string> {
  const blob = dataURLtoBlob(dataUrl);
  const formData = new FormData();
  formData.append('file', blob, 'reference.png');
  formData.append('uploadPath', 'hollycut/sources');
  formData.append('fileName', 'reference.png');

  const resp = await fetch(KIE_UPLOAD, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: formData,
  });
  const json = await resp.json();
  if (json.code !== 200 || !json.data?.downloadUrl) {
    throw new Error('参考图上传失败：' + (json.msg || resp.status));
  }
  return json.data.downloadUrl as string;
}

/**
 * 创建生成任务并轮询至完成，返回结果图的 base64 data URL。
 * input 形如 { prompt, image_input?, aspect_ratio?, resolution?, output_format? }
 */
async function createTaskAndPoll(
  apiKey: string,
  input: Record<string, unknown>
): Promise<string> {
  // 1. 创建任务
  const createResp = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: IMAGE_MODEL, input }),
  });
  const createJson = await createResp.json();
  if (createJson.code !== 200 || !createJson.data?.taskId) {
    // 401/402 等业务错误统一抛出
    throw new Error('创建生成任务失败：' + (createJson.msg || createResp.status));
  }
  const taskId: string = createJson.data.taskId;

  // 2. 轮询状态
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let resultUrl: string | null = null;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const pollResp = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: authHeaders(apiKey),
    });
    const pollJson = await pollResp.json();
    const state = pollJson.data?.state;

    if (state === 'success') {
      try {
        const parsed = JSON.parse(pollJson.data.resultJson);
        resultUrl = parsed?.resultUrls?.[0] ?? null;
      } catch {
        resultUrl = null;
      }
      break;
    }
    if (state === 'fail') {
      throw new Error('生成失败：' + (pollJson.data?.failMsg || '请稍后重试'));
    }
    // waiting / queuing / generating → 继续轮询
  }

  if (!resultUrl) {
    throw new Error('生成超时，请稍后重试。');
  }

  // 3. 下载结果并转为 base64（结果 URL 有效期 20 分钟，落盘为 base64 后可长期保存）
  const imgResp = await fetch(resultUrl);
  if (!imgResp.ok) throw new Error('结果图下载失败');
  const imgBlob = await imgResp.blob();
  return blobToDataURL(imgBlob);
}

/**
 * 生成好莱坞片场探访照（图生图）。
 * 模型 nano-banana-2，支持 1~2 张并行生成。
 */
export const generateSetPhoto = async (
  apiKey: string,
  prompt: string,
  referenceImageBase64: string,
  aspectRatio: string,
  imageCount: number = 1
): Promise<string[]> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  // 上传参考图一次，多张任务复用同一 URL
  const referenceUrl = await uploadImage(apiKey, referenceImageBase64);

  const input: Record<string, unknown> = {
    prompt,
    image_input: [referenceUrl],
    aspect_ratio: aspectRatio, // '9:16' / '3:4' / '4:3' / '16:9'，与 KIE 取值一致
    resolution: '2K',
    output_format: 'png',
  };

  const tasks = Array.from({ length: imageCount }, () =>
    createTaskAndPoll(apiKey, input)
  );
  return Promise.all(tasks);
};

/**
 * 编辑现有图片（nano-banana-2 编辑模式）。
 */
export const editSetPhoto = async (
  apiKey: string,
  originalImageBase64: string,
  editInstruction: string
): Promise<string> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const referenceUrl = await uploadImage(apiKey, originalImageBase64);

  return createTaskAndPoll(apiKey, {
    prompt: editInstruction,
    image_input: [referenceUrl],
    aspect_ratio: 'auto',
    output_format: 'png',
  });
};

/**
 * 根据电影名生成海报印象背景（文生图，快速）。
 */
export const getMoviePosterImpression = async (
  apiKey: string,
  movieName: string
): Promise<string | null> => {
  if (!apiKey || !movieName) return null;

  try {
    return await createTaskAndPoll(apiKey, {
      prompt: `A cinematic, iconic movie poster for the movie "${movieName}". High resolution, official art style.`,
      aspect_ratio: '9:16',
      resolution: '1K',
      output_format: 'png',
    });
  } catch (error) {
    console.error("Background Generation Error:", error);
    return null;
  }
};
