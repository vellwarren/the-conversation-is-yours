# 从 CC-first 系统补建独立 API 生命线

不要先写 provider switch。先把对话所有权从 Claude Code transcript 中拿回来。

## 第 1 步：建立权威消息表

从下一轮开始，在应用数据库保存每条成功的用户消息与可见助手回复。不要把 CLI transcript 文件直接当数据库。

如果要导入旧 transcript：

- 先在离线副本上解析；
- 区分可见消息、工具过程、系统事件和取消轮次；
- 不导入 token、MCP 配置、环境变量或凭证；
- 给导入结果保留 provenance，允许人工检查。

## 第 2 步：定义 provider-neutral 事件

UI 和业务生命周期只依赖规范化事件，不直接依赖 `stream-json` 或 Messages SSE。至少统一 text、thinking、tool、usage、done 与 error。

## 第 3 步：让 CC 每轮都可重建

保留 `--resume` 作为性能优化，但加入一条可测试的 fresh path：只依赖应用历史也能完成下一轮。如果 fresh path 不成立，就还没有真正解除 transcript 锁定。

## 第 4 步：实现 API adapter

先完成纯文字，再逐项补齐：

1. system prompt；
2. 流式正文；
3. thinking；
4. tools 与 tool results；
5. 图片和附件；
6. cache breakpoints；
7. usage 与错误归一。

每补一项，都用同一输入分别运行两条线路并比较用户可见结果和副作用，而不是只检查 HTTP 200。

## 第 5 步：给工具增加第二种协议出口

不要复制两套业务实现。保留一个 tool registry：MCP handler 与 API tool loop 都调用同一组后端函数。授权必须在真正执行前再次检查。

## 第 6 步：shadow

在不执行写工具、不保存第二份回复的条件下，把真实请求镜像到备用 adapter，记录：

- 是否成功；
- 首 token 延迟；
- 最终文本是否为空；
- 工具名称集合是否一致；
- cache read/create；
- token 水位；
- 错误类别。

不要把私人正文写入诊断日志。

## 第 7 步：人工 canary

只允许少量会话显式切换。重点验证：

- CC → API 后能否自然承接；
- API → CC 是否强制 fresh；
- 修改旧消息或 regenerate 是否会污染旧 session；
- 工具副作用是否重复；
- 长会话是否触发压缩；
- 切换是否意外开始计费。

## 第 8 步：灾备演练

演练认证失败、额度耗尽、resume 损坏和 provider 5xx。成功标准不是“自动换了一条线路”，而是：失败被正确分类、没有半截回复拼接、没有重复副作用，并且人工可以用明确动作接管。
