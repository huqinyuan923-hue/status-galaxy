# 星图 status-galaxy 🌌

> 把 16 个项目变成一片星系：博客=恒星，项目=行星。**大小∝代码量，转速∝提交热度，光晕∝健康状态，环=有独立域名**，AI 小镇带 12 颗居民卫星。

线上：**https://status.adcakeyuan.top**

## 架构

- Cloudflare Worker（`src/`）：Cron 每 15 分钟采集 → 探活 14 站点（状态+延迟）+ GitHub 仓库遥测（token 防限流）+ 小镇专属探针（`town/api/status`）→ 快照入 D1（留 200 份历史，前端画延迟趋势）
- three.js 前端（`webapp/`）：星场/星云/恒星脉冲/公转/触控轨道控制，点击星球出信息卡（状态、技术栈、代码量、Star、最近提交、访问/仓库链接、延迟 sparkline）
- 出网安全：探测 URL 白名单（自家天体域 + api.github.com），SSRF 防护有专项测试

## 开发

```bash
npm install && npm --prefix webapp run install
npm run db:migrate:local   # 本地 D1
npm run dev                # 构建前端 + wrangler dev（8787）
# 手动采集（token 在 .dev.vars）：
curl -X POST localhost:8787/api/collect -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 部署要点

- Secrets：`ADMIN_TOKEN`（手动采集）、`GITHUB_TOKEN`（gh auth token，防匿名限流）
- 自定义域 `status.adcakeyuan.top` 由 wrangler routes custom_domain 自动接管
- 新项目入图：改 `src/bodies.ts` 和 `webapp/src/main.ts` 里的 BODIES（两处同源维护），redeploy

## 测试

`npm test`：SSRF 守卫、采集快照（含失败容错）、目录完整性。

## 🪐 行星贴图版权

行星表面贴图来自 [Solar System Scope](https://www.solarsystemscope.com/textures/)（CC BY 4.0），已做本地托管（`webapp/public/textures/`），运行时零外链。
