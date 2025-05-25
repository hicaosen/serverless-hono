import { Hono } from 'hono';
import { TcbEventFunction } from '@cloudbase/functions-typings';

/**
 * HTTP 事件类型定义
 */
export interface HttpEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string>;
  isBase64Encoded?: boolean;
  body?: string;
  queryStringParameters?: Record<string, string>;
  pathParameters?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * 云函数响应类型
 */
export interface CloudFunctionResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

/**
 * 适配器配置选项
 */
export interface ServerlessHonoOptions {
  /** 是否打印请求响应日志 */
  logging?: boolean;
  /** 超时时间(毫秒) */
  timeout?: number;
  /** 请求路径前缀 */
  basePath?: string;
  /** 二进制MIME类型列表 */
  binaryMimeTypes?: string[];
  /** 是否处理跨域 */
  cors?: boolean | {
    origin?: string | string[];
    methods?: string | string[];
    allowHeaders?: string | string[];
    exposeHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
  };
}

// 默认二进制MIME类型
const DEFAULT_BINARY_MIME_TYPES = [
  'application/octet-stream',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'video/mp4',
  'font/woff',
  'font/woff2',
];

/**
 * Hono 云函数适配器
 * 将 Hono 应用转换为云函数处理程序
 * 
 * @param app Hono 应用实例
 * @param options 适配器配置选项
 * @returns 云函数处理函数
 */
export const serverlessHono = (app: Hono, options: ServerlessHonoOptions = {}): TcbEventFunction => {
  const {
    logging = true,
    timeout = 30000,
    basePath = '',
    binaryMimeTypes = DEFAULT_BINARY_MIME_TYPES,
    cors = false,
  } = options;

  // 如果启用了CORS，将CORS中间件添加到Hono应用
  if (cors) {
    if (typeof cors === 'boolean') {
      app.use('*', async (c, next) => {
        // 简单CORS配置
        c.header('Access-Control-Allow-Origin', '*');
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        // 处理OPTIONS请求
        if (c.req.method === 'OPTIONS') {
          return new Response(null, { status: 204 });
        }
        
        await next();
      });
    } else {
      // 高级CORS配置
      app.use('*', async (c, next) => {
        const origin = Array.isArray(cors.origin) ? cors.origin.join(',') : (cors.origin || '*');
        const methods = Array.isArray(cors.methods) ? cors.methods.join(',') : (cors.methods || 'GET, POST, PUT, DELETE, OPTIONS');
        const allowHeaders = Array.isArray(cors.allowHeaders) ? cors.allowHeaders.join(',') : (cors.allowHeaders || 'Content-Type, Authorization');
        
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Methods', methods);
        c.header('Access-Control-Allow-Headers', allowHeaders);
        
        if (cors.credentials) {
          c.header('Access-Control-Allow-Credentials', 'true');
        }
        
        if (cors.exposeHeaders) {
          const exposeHeaders = Array.isArray(cors.exposeHeaders) ? cors.exposeHeaders.join(',') : cors.exposeHeaders;
          c.header('Access-Control-Expose-Headers', exposeHeaders);
        }
        
        if (cors.maxAge) {
          c.header('Access-Control-Max-Age', cors.maxAge.toString());
        }
        
        // 处理OPTIONS请求
        if (c.req.method === 'OPTIONS') {
          return new Response(null, { status: 204 });
        }
        
        await next();
      });
    }
  }

  return async (event: any, context?: any) => {
    // 请求开始时间
    const startTime = Date.now();
    
    // 设置超时处理
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<CloudFunctionResponse>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`请求处理超时，超过 ${timeout}ms`));
      }, timeout);
    });
    
    // 确保 event 是 HTTP 类型
    if (!event || typeof event.httpMethod !== 'string') {
      return buildErrorResponse(400, '仅支持HTTP请求');
    }

    const httpEvent = event as HttpEvent;
    
    try {
      // 特殊路径处理
      if (httpEvent.path === '/favicon.ico') {
        return {
          statusCode: 204,
          headers: {},
          body: '',
        };
      }

      // 日志记录请求信息
      if (logging) {
        console.log(`[REQUEST] ${httpEvent.httpMethod} ${httpEvent.path}`, {
          queryParams: httpEvent.queryStringParameters,
          headers: httpEvent.headers,
          context: context || {},
        });
      }
      
      // 构建标准请求对象
      const req = buildRequest(httpEvent, basePath);
      
      // 并发处理请求和超时
      const responsePromise = app.fetch(req);
      
      // 等待响应或超时
      const response = await Promise.race([responsePromise, timeoutPromise])
        .then(async (res) => {
          if (res instanceof Response) {
            return await buildResponse(res, binaryMimeTypes);
          }
          return res;
        })
        .finally(() => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        });
      
      // 计算请求处理时间
      const processTime = Date.now() - startTime;
      
      // 记录响应状态
      if (logging) {
        console.log(`[RESPONSE] Status: ${response.statusCode}, Duration: ${processTime}ms`);
      }
      
      return response;
    } catch (error) {
      console.error('[ERROR] 请求处理错误:', error);
      
      // 尝试从错误中获取状态码
      const statusCode = error instanceof Error && 'status' in error ? (error as any).status : 500;
      
      return buildErrorResponse(
        statusCode,
        error instanceof Error ? error.message : '内部服务器错误'
      );
    }
  };
};

/**
 * 构建请求对象
 * 
 * @param event HTTP 事件
 * @param basePath 请求路径前缀
 * @returns 标准 Request 对象
 */
function buildRequest(event: HttpEvent, basePath: string = ''): Request {
  const path = typeof event.path === 'string' ? event.path : '/';
  const method = typeof event.httpMethod === 'string' ? event.httpMethod : 'GET';
  const headers = typeof event.headers === 'object' && event.headers !== null ? event.headers : {};
  const isBase64Encoded = Boolean(event.isBase64Encoded);
  
  // 处理请求体
  let body: string | ArrayBuffer | null = null;
  if (method !== 'GET' && method !== 'HEAD' && event.body) {
    if (isBase64Encoded) {
      body = Buffer.from(event.body, 'base64');
    } else {
      body = event.body;
    }
  }
  
  // 确定请求基础 URL
  const baseUrl = headers.referer ? new URL(headers.referer).origin : 'https://cloudbase.local';
  
  // 处理路径前缀
  let normalizedPath = path;
  if (basePath && normalizedPath.startsWith(basePath)) {
    normalizedPath = normalizedPath.substring(basePath.length) || '/';
  }
  
  // 处理查询参数
  let queryParams = new URLSearchParams();
  if (event.queryStringParameters) {
    Object.entries(event.queryStringParameters).forEach(([key, value]) => {
      queryParams.append(key, value);
    });
  }
  
  // 构建完整URL
  const url = new URL(normalizedPath, baseUrl);
  queryParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  
  // 创建请求对象
  return new Request(url.toString(), {
    method,
    headers: new Headers(headers),
    body,
  });
}

/**
 * 构建云函数响应
 * 
 * @param res Hono 响应对象
 * @param binaryMimeTypes 二进制MIME类型列表
 * @returns 云函数响应对象
 */
async function buildResponse(res: Response, binaryMimeTypes: string[] = []): Promise<CloudFunctionResponse> {
  const contentType = res.headers.get('content-type') || '';
  const isBinary = binaryMimeTypes.some(type => contentType.includes(type));
  
  let body: string;
  let isBase64Encoded = false;
  
  if (isBinary) {
    // 二进制响应处理
    const buffer = await res.arrayBuffer();
    body = Buffer.from(buffer).toString('base64');
    isBase64Encoded = true;
  } else {
    // 文本响应处理
    body = await res.text();
  }
  
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body,
    isBase64Encoded,
  };
}

/**
 * 构建错误响应
 * 
 * @param statusCode HTTP 状态码
 * @param errorMessage 错误消息
 * @returns 云函数响应对象
 */
function buildErrorResponse(statusCode: number, errorMessage: string): CloudFunctionResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: errorMessage }),
  };
}
