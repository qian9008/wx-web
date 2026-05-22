export default async function handler(req, res) {
    // 1. 从 Vercel 网页后台设置的 Environment Variables 里面动态读取你的后端大本营地址
    const backendUrl = process.env.BACKEND_URL;

    // 2. 把后端地址和你原本请求的路径（比如 /message, /admin）完美拼接在一起
    const targetUrl = `${backendUrl}${req.url}`;

    // 3. 替前端去请求你的后端，并把后端的果实原封不动端回来
    const response = await fetch(targetUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    res.status(response.status).send(await response.text());
}