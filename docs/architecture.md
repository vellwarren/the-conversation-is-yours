# 架构：让应用拥有对话

## 三层状态

### 1. 应用权威状态

至少包含：

- conversation id；
- 按顺序保存的 user/assistant 消息；
- 每条消息使用的 runtime；
- 产品所需的业务状态。

它必须在 provider 之外持久化，并且能单独重建下一轮请求。

### 2. Runtime adapter

每个 adapter 接收同一个输入合同：

```js
runtime.run({ conversationId, conversation, switched, store, onEvent })
```

输出统一为 `text`，过程事件统一为：

```text
runtime_start / text / thinking / tool_use / tool_result / usage / done / error
```

上层不需要理解 Claude Code `stream-json` 或 Messages SSE 的每一种原始事件。

### 3. Provider 派生状态

例如：

- Claude Code session id；
- CLI transcript；
- API prompt cache；
- provider usage window。

这些状态可以优化延迟和成本，但不能成为恢复对话所必需的唯一数据。

## 为什么 API → CC 必须重建

假设 CC transcript 包含 A、B 两轮，随后应用切到 API 完成 C、D。如果直接 `--resume` 旧 CC session，模型看不到 C、D。正确做法是作废旧 CC session，从应用历史 A、B、C、D 创建新链。

这就是 `switched` 标志的意义。

## 为什么 CC → API 不需要导出 transcript

只要每个成功的可见回复都已经保存到权威历史，API 可以直接从应用数据库构造 Messages 请求。Claude Code transcript 里可能还有工具过程和内部事件，但产品需要明确决定哪些是下一轮必须看到的语义，而不是无条件复制 provider 私有记录。

## 工具双出口

工具注册表是业务能力的抽象层：

```text
tool registry
├── MCP tools/list + tools/call  -> Claude Code
└── tools[] + local tool loop    -> Messages API
```

生产系统必须在两条出口都执行身份验证、输入验证、授权、幂等与审计，不能只依赖模型看到的 tool schema。

## 明确不做自动付费 fallback

自动 fallback 把“服务暂时不可用”悄悄变成“开始计费”。示例 router 要求 `api` 在本轮请求中被明确选择。更成熟的产品可以加入预算批准或运维开关，但不应只靠捕获 429 就切换。
