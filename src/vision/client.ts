// S39O-cs-llmclient: DeepSeek 调用的唯一 HTTP 实现，识别与建议共用。
// 实现 封装 OpenAI 兼容的 chat/completions 请求，统一处理超时、错误分类、JSON 解析与密钥读取。
// 原理 思考模式默认开启会让延迟翻数倍，因此每次请求都必须显式 thinking.disabled；
// 集中在一处才能保证没有任何调用点漏关。
import type { ApiErrorKind } from './types';

const BASE = 'https://api.deepseek.com';
export const MODEL = 'deepseek-flash';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  constructor(kind: ApiErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export interface ChatRequest {
  system: string;
  user: ContentPart[];
  /** 是否要求 JSON 输出。 */
  json: boolean;
  maxTokens: number;
  signal?: AbortSignal;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/** 把 HTTP 状态码归类为可给用户看的错误类型。 */
function classify(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'balance';
  if (status === 429) return 'rate';
  if (status >= 500) return 'server';
  return 'request';
}

const KIND_TEXT: Record<ApiErrorKind, string> = {
  auth: 'API key 无效或已失效',
  balance: '账户余额不足',
  rate: '请求过于频繁，请稍后再试',
  server: '服务端暂时不可用',
  timeout: '请求超时',
  offline: '网络不可用',
  request: '请求被拒绝',
  parse: '返回内容无法解析',
};

export function apiErrorText(kind: ApiErrorKind): string {
  return KIND_TEXT[kind];
}

/**
 * 发起一次对话请求，返回模型输出的纯文本。
 * 所有错误都归一化为 ApiError，调用方只需按 kind 分支。
 */
export async function chat(apiKey: string, req: ChatRequest): Promise<string> {
  if (!apiKey.trim()) throw new ApiError('auth', '未配置 API key');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const onOuterAbort = () => controller.abort();
  req.signal?.addEventListener('abort', onOuterAbort);

  const body = {
    model: MODEL,
    // 思考模式必须显式关闭，否则默认开启、延迟翻数倍。
    thinking: { type: 'disabled' as const },
    max_tokens: req.maxTokens,
    ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError(req.signal?.aborted ? 'timeout' : 'timeout', '请求超时');
    }
    throw new ApiError('offline', '网络请求失败');
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!res.ok) {
    throw new ApiError(classify(res.status), `HTTP ${res.status}`, res.status);
  }

  let data: ChatResponse;
  try {
    data = (await res.json()) as ChatResponse;
  } catch {
    throw new ApiError('parse', '响应不是合法 JSON');
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    // JSON 模式下非 JSON 内容会被上游替换成空格，此处即该情况。
    throw new ApiError('parse', '模型返回为空');
  }
  return content;
}

/** 从可能带 ```json 围栏的文本中提取 JSON 并解析。 */
export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // 尝试截取第一个 { 到最后一个 }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        /* fallthrough */
      }
    }
    throw new ApiError('parse', '无法解析为 JSON');
  }
}
