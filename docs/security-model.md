# 安全与隐私模型

## 本示例的边界

HTTP 服务只监听 loopback，但没有用户认证，因此不能直接暴露到公网。JSON 文件存储也只适合单进程教学。

## 凭证隔离

Claude Code 子进程从环境白名单重建环境，只显式接受 Claude Code 认证，不继承 `ANTHROPIC_API_KEY`。这保证订阅线路配置错误时 fail closed。

Messages API key 只由 API adapter 使用。MCP 使用单独的 bearer token，且只监听 loopback。

## 日志

生产日志不应记录：

- 用户正文；
- system prompt；
- tool input/output；
- API key、OAuth token 或 Authorization header；
- 完整 conversation/session id；
- 原始 provider error body。

推荐只记录短哈希、错误分类、耗时、token 数、runtime 和切换原因。

## 工具安全

模型看到工具不代表模型获授权执行工具。至少需要：

- `tools/list` 按身份裁剪；
- `tools/call` 再次授权；
- schema 验证；
- 写操作幂等键；
- 超时与输出上限；
- 结构化、脱敏错误；
- 审计记录。

## 发布前审计

```bash
npm run audit:private
git grep -nE 'BEGIN .*PRIVATE KEY|sk-ant-|Bearer [A-Za-z0-9._-]{24,}'
git log --all --stat
```

仅扫描当前文件还不够；公开前必须扫描完整 Git 历史和最终打包内容。不要先提交秘密再删除，因为 Git 历史仍会保留它。
