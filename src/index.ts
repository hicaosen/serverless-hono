import { Hono } from 'hono'
import { serverlessHono } from './serverless-hono'

/**
 * 创建 Hono 应用实例
 */
const app = new Hono()

/**
 * 定义路由
 */
app.get('/', (c) => {
  return c.json({
    message: 'Hello from Hono!'
  })
})

app.get('/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({
    id,
    name: `用户${id}`
  })
})

app.post('/api/data', async (c) => {
  const body = await c.req.json()
  return c.json({
    success: true,
    data: body
  })
})

/**
 * 二进制数据示例
 */
app.get('/binary', async (c) => {
  // 返回二进制图片数据示例
  return new Response('Binary data would go here', {
    headers: {
      'Content-Type': 'application/octet-stream'
    }
  })
})

/**
 * 导出云函数入口
 * 使用 serverlessHono 适配器将 Hono 应用转换为云函数处理程序
 */
export const main = serverlessHono(app, {
  logging: true,        // 启用日志
  timeout: 30000,       // 请求处理超时时间，单位毫秒
  basePath: '',         // 如果部署在自定义路径下，需要设置
  cors: true,           // 启用CORS支持
  binaryMimeTypes: [    // 自定义二进制MIME类型
    'application/octet-stream',
    'image/jpeg',
    'image/png',
    'application/pdf'
  ]
});