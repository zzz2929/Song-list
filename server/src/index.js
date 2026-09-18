import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, HOST, STATIC_DIR } from './config.js';
import apiRouter from './api.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

app.use('/api', apiRouter);
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 统一错误处理: 业务异常带 status,其余按 500 返回
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  app.use(express.static(STATIC_DIR));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.type('text/plain; charset=utf-8').send(
      'Song-list 服务端运行中。\n前端尚未构建: 在 web 目录执行 npm install && npm run build 后重启服务。'
    );
  });
}

app.listen(PORT, HOST, () => {
  console.log(`[songlist] 已启动: http://localhost:${PORT} (数据目录 ${process.env.DATA_DIR || 'server/data'})`);
});
