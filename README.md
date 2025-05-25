# serverless-hono

一个简洁高效的 Hono 框架云函数适配器，专为微信云开发/云函数环境设计。

## 特性

- ✅ 简洁的 API 设计，类似 serverless-http
- ✅ 完整的 TypeScript 类型支持
- ✅ 自动处理二进制响应
- ✅ 内置 CORS 支持
- ✅ 超时处理
- ✅ 请求路径前缀支持
- ✅ 详细的日志记录
- ✅ 错误处理和状态码映射

## 快速开始

### 安装依赖

```bash
npm install hono
# 或
pnpm add hono
```

### 基本用法

```typescript
import { Hono } from 'hono'
import { serverlessHono } from './adapter'

// 创建 Hono 应用实例
const app = new Hono()

// 定义路由
app.get('/', (c) => {
  return c.json({
    message: 'Hello from Hono!'
  })
})

app.get('/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({
    id,
    name: `User ${id}`
  })
})

// 导出云函数入口
export const main = serverlessHono(app)
```

### 高级配置

```typescript
export const main = serverlessHono(app, {
  logging: true,        // 启用详细日志
  timeout: 30000,       // 请求处理超时时间，单位毫秒
  basePath: '/api',     // 如果部署在自定义路径下，需要设置
  cors: {               // 自定义 CORS 配置
    origin: ['https://example.com', 'https://www.example.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  },
  binaryMimeTypes: [    // 自定义二进制MIME类型
    'application/octet-stream',
    'image/jpeg',
    'image/png',
    'application/pdf'
  ]
})
```

## API 参考

### serverlessHono(app, options)

将 Hono 应用转换为云函数处理函数

#### 参数

- `app`: Hono 应用实例
- `options`: 配置选项 (可选)
  - `logging`: 是否启用详细日志 (默认: `true`)
  - `timeout`: 请求处理超时时间，单位毫秒 (默认: `30000`)
  - `basePath`: 请求基础路径前缀 (默认: `''`)
  - `cors`: CORS 配置 (默认: `false`)
    - 设置为 `true` 时使用默认配置
    - 设置为对象时使用自定义配置
      - `origin`: 允许的来源
      - `methods`: 允许的 HTTP 方法
      - `allowHeaders`: 允许的请求头
      - `exposeHeaders`: 暴露的响应头
      - `credentials`: 是否允许凭证
      - `maxAge`: 预检请求缓存时间
  - `binaryMimeTypes`: 二进制 MIME 类型列表

## 注意事项

- 云函数环境下不支持真正的 WebSocket，如需实时通信建议使用长轮询或云开发提供的实时数据库
- 大文件上传/下载建议使用云存储 API
- 对于超过云函数执行时间限制的长任务，建议使用异步任务处理模式
