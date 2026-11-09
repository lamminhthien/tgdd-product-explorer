// Express app: serves the static page and proxies whitelisted TGDD product APIs.
//
// Local:  npm start  -> open http://localhost:8000
// Vercel: deployed as a serverless function (api/ folder), no listen() call.
//
// The browser cannot call api.thegioididong.com directly (CORS), so requests go
// through /api/tgdd/<endpoint>, which forwards them with the headers the
// thegioididong.com web client sends.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM = 'https://api.thegioididong.com/gw/bus-tgdd-tmdt/api';
const PORT = Number(process.env.PORT) || 8000;
const PREFIX = '/api/tgdd/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Endpoints this app uses, and the HTTP method each one expects.
const ALLOWED = {
  'Cate/GetproductCateV2': 'POST',     // danh sách sản phẩm theo danh mục
  'Product/GetProductExtend': 'GET',   // chi tiết sản phẩm: mô tả, thông số kỹ thuật
  'Product/GetGalleryProduct': 'GET',  // chi tiết sản phẩm: ảnh
  'Product/GetOldProductInfo': 'POST', // chi tiết sản phẩm: tên, giá, thumbnail
  'Comment/Product/Code': 'POST',      // đánh giá: danh sách + thống kê
  'Comment/GetComentImages': 'GET',    // đánh giá: ảnh khách hàng
};

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.thegioididong.com',
  'Referer': 'https://www.thegioididong.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'os': 'WebTGDD',
  'platform': '1',
  'siteid': '1',
  'isverify': '0',
  'deviceid': '52e53efc-aebb-460a-bfbe-17906ba198d8',
};

const app = express();

app.use(express.static(ROOT));

async function proxy(req, res) {
  const endpoint = req.path.slice(PREFIX.length);
  if (!Object.hasOwn(ALLOWED, endpoint)) {
    return res.status(404).json({ error: `Endpoint not allowed: ${endpoint}` });
  }

  const method = ALLOWED[endpoint];
  const search = req.originalUrl.indexOf('?');
  const target = `${UPSTREAM}/${endpoint}${search === -1 ? '' : req.originalUrl.slice(search)}`;
  const body = method === 'POST' ? (req.body?.length ? req.body : Buffer.from('{}')) : undefined;

  try {
    const upstream = await fetch(target, {
      method,
      headers: HEADERS,
      body,
      signal: AbortSignal.timeout(20000),
    });
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).type('application/json; charset=utf-8').send(payload);
  } catch (err) {  // network errors, timeouts
    res.status(502).json({ error: err.message });
  }
}

app.get(`${PREFIX}*splat`, proxy);
app.post(`${PREFIX}*splat`, express.raw({ type: '*/*', limit: '1mb' }), proxy);

if (!process.env.VERCEL) {
  app.listen(PORT, '127.0.0.1', () => console.log(`Open http://localhost:${PORT}`));
}

export default app;
