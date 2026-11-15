# The Conversation Is Yours

## 对话属于你

### Claude Code × Messages API Dual-Runtime Continuity

> **Providers do not own the conversation. The application does.**
> **对话不属于 provider，对话属于你的应用。**

A long-lived AI assistant should not stop being itself because one runtime becomes unavailable.

这是一个最小、可运行的双运行时参考架构：应用自己持有历史、人格、记忆与业务状态，**Claude Code** 和 **Messages API** 只是两个可以独立运行、独立缓存、相互接替的生成执行器。

Claude Code 可以保留自己的 transcript、resume 链、MCP 工具和缓存；Messages API 可以保留自己的 SSE、原生 tool loop 与 prompt cache。它们都不拥有这段对话。

```text
                      application-owned state
           history · memory · persona · business data
                                |
                      explicit runtime selection
                       /                     \
              Claude Code                Messages API
          stream-json + resume          SSE + tool loop
               MCP tools                   tools[]
               own cache                  own cache
                       \                     /
                        canonical events
```

如果 Claude Code runtime 消失，API 可以从应用历史重建下一轮。对话在 API 上进行几轮后回到 Claude Code，旧 resume 链会被废弃，再从同一份权威历史建立新 session。

缓存不必迁移，session 不必幸存。

> **The caches do not need to migrate.**
> **The session does not need to survive.**
> **The conversation does.**

## What makes this different / 它为什么不同

这不是账号池、endpoint proxy，也不是把付费 API 藏在订阅线路后的静默 fallback。它演示的是：

- **双向连续，而不是单向迁移**：Claude Code → API 不依赖 transcript；API → Claude Code 会废弃过期 resume 链并从权威历史重建；
- **应用拥有权威历史**：provider transcript 是可以丢弃和重建的派生状态，不是助手的记忆本体；
- **两套真正独立的 runtime**：它们使用不同协议、不同工具出口和不同缓存生命周期；
- **同一组应用工具，两种协议出口**：Claude Code 走 MCP，Messages API 走 `tools[] + tool loop`；
- **不静默烧 API 钱**：每一个付费 API turn 都必须显式选择，Claude Code 失败不会偷偷开始计费；
- **只在 turn 边界恢复**：不假装半截生成可以跨 provider 魔法般续写，也不把两段半截回复拼在一起；
- **无需账号即可验证**：fake runtimes 与连续性测试不调用模型、不消耗额度；
- **来自真实运行模式**：公开仓库全部使用合成数据，但这套架构提炼自一个私人长期运行助手，并已实际完成 Claude Code ↔ Messages API 双向切换。

如果一个助手的人格、记忆和工具目前都锁在 Claude Code session 里，这个仓库展示了如何把所有权拿回它真正应该在的地方：**你的应用**。

## 为什么需要两套运行时

很多长期助手最初围绕 `claude -p`、MCP 和 `--resume` 构建。随着人格、工具和记忆越来越深地依赖 Claude Code，本地 transcript 也容易被误当成唯一历史。一旦认证、额度、CLI 协议或账号状态发生变化，整个应用就会落入同一个故障域。

本仓库把状态拆成两类：

- **权威状态**：应用数据库中的用户消息、助手回复、人格、记忆和业务数据；
- **派生状态**：Claude Code transcript、resume session、provider prompt cache。

派生状态可以失效、轮换和重建，权威状态不能只存在于 provider 内部。

## 这个示例包含什么

- JSON 文件形式的最小权威对话存储；
- provider-neutral 的规范化事件协议；
- 显式 runtime router；
- 默认安全的两个 fake runtime；
- 真实 Claude Code `stream-json` adapter；
- 真实 Messages API SSE + tool loop adapter；
- 同一组玩具工具的 MCP 与 `tools[]` 两种出口；
- API → Claude Code 时废弃旧 resume 链并重建；
- 两条线路各自独立的缓存配置；
- 禁止隐式付费 fallback 的测试；
- 跨线路连续性、工具循环和协议解析测试。

## 默认运行：不需要账号，不消耗额度

```bash
npm install
npm test
npm start
```

另开终端：

```bash
curl -N http://127.0.0.1:8787/chat \
  -H 'content-type: application/json' \
  -d '{"conversationId":"demo","text":"hello","runtime":"fake-claude-code"}'

curl -N http://127.0.0.1:8787/chat \
  -H 'content-type: application/json' \
  -d '{"conversationId":"demo","text":"continue","runtime":"fake-api"}'
```

第二个 fake runtime 会明确报告它收到了第一个 runtime 写入的应用历史。这条测试不依赖任何模型“配合演出”。

查看权威历史：

```bash
curl http://127.0.0.1:8787/conversations/demo
```

## 启用真实 Messages API

先在当前 shell 设置变量；不要把密钥写进仓库：

```bash
export ANTHROPIC_API_KEY='your-key'
export ANTHROPIC_MODEL='your-model-id'
npm start
```

请求时必须显式选择 `api`：

```bash
curl -N http://127.0.0.1:8787/chat \
  -H 'content-type: application/json' \
  -d '{"conversationId":"demo","text":"save a note about oat milk","runtime":"api"}'
```

即使 `DEFAULT_RUNTIME=api`，router 也会拒绝隐式付费请求。应用必须在每个付费 turn 上明确选择 `api`。

## 启用真实 Claude Code

准备一个与 API 密钥隔离的 Claude Code 配置目录，并显式提供模型：

```bash
export CLAUDE_MODEL='your-claude-code-model-id'
export CLAUDE_CONFIG_DIR='/absolute/path/to/isolated-config'
export CLAUDE_HOME_DIR='/absolute/path/to/isolated-home'
export CLAUDE_SPAWN_CWD='/absolute/path/to/neutral-empty-directory'
export MCP_TOKEN='replace-with-a-long-random-value'
export CLAUDE_MCP_TOKEN="$MCP_TOKEN"
npm start
```

随后显式选择：

```bash
curl -N http://127.0.0.1:8787/chat \
  -H 'content-type: application/json' \
  -d '{"conversationId":"demo","text":"continue our conversation","runtime":"claude-code"}'
```

Claude Code 子进程使用环境白名单，不继承 `ANTHROPIC_API_KEY`。认证失败时 turn 失败，不会偷偷进入付费线路。

## 切换语义

### Claude Code → API

API 从权威历史重建完整 Messages 输入，不读取 Claude Code transcript。

### API → Claude Code

旧 Claude Code transcript 不包含 API 期间新增的消息，因此 router 把本轮标记为 `switched`。Claude Code adapter 丢弃旧 session id，从权威历史创建新链。

### 正在生成的 turn

本示例不尝试把半截生成跨 provider 续写。切换发生在 turn 边界。这样不会把两个 provider 的半截回复拼在一起。

## 缓存原则

- Claude Code 使用自己的 transcript/resume/cache；
- Messages API 在 system 与最后一个 tool definition 上设置 1h cache breakpoint；
- 切换线路时不搬运缓存；
- cache miss 是性能事件，不是对话丢失；
- tool schema、system、thinking 配置变化都可能使 provider cache 失效。

## 目录

```text
src/core/       权威存储、规范化事件与显式路由
src/runtimes/   fake、Claude Code、Messages API adapters
src/tools/      三个无业务含义的玩具工具
src/mcp/        loopback-only toy MCP endpoint
docs/           架构、迁移、故障演练与安全说明
test/           连续性、工具和协议契约测试
```

## 生产化之前必须补什么

这个仓库是教学参考，不是直接部署模板。生产系统至少还需要：

- PostgreSQL 或其他事务数据库；
- 多进程/多实例 session lease；
- 用户认证和每用户工具授权；
- 数据保留、删除与审计策略；
- 上下文压缩与 token 水位控制；
- provider/model/system/tool fingerprints；
- 断线、取消、半截输出和幂等保护；
- 真实 CLI 版本锁定与升级契约测试；
- 指标、告警和人工切换 runbook。

详见 [架构说明](docs/architecture.md)、[CC-first 迁移教程](docs/migration-from-cc-first.md)、[故障演练](docs/failover-runbook.md) 和 [安全模型](docs/security-model.md)。

## 协议依据

以下官方文档用于核对本仓库中的 Messages API 协议实现：

- [Claude Messages streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Claude prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Tool use with prompt caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)

## 致谢与项目渊源

本项目最初受到 [`api-to-claude-code-p`](https://github.com/tsuru0805/api-to-claude-code-p) 的直接启发。该项目展示了从 API 接入 Claude Code `-p` 的可行路径，也为我们早期的 API → CC 实践提供了重要参考。

在此基础上，本仓库进一步探索由应用持有权威会话状态、Claude Code ↔ Messages API 双向切换，以及长期会话连续性与故障生存能力。

特别感谢 [`tsuru0805`](https://github.com/tsuru0805) 的公开分享。当前仓库的示例代码围绕上述双运行时目标独立实现；“独立实现”仅说明没有复制其代码，并不抹去它对本项目起点和思路的重要启发。

## 隐私声明

仓库中的人物、消息、笔记、工具、路径和凭证均为合成示例。它不包含任何私人助手项目的提示词、记忆、数据库 schema、生产日志、工具清单、域名、IP 或 Git 历史。

## License

本项目采用 [PolyForm Noncommercial License 1.0.0](LICENSE)，仅授权非商业用途。商业使用需要版权所有者另行书面授权。
