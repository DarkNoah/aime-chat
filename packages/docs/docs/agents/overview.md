---
sidebar_position: 1
---

# Agent 概览

AIME Chat 的 Agent 是一组可复用配置：模型、Instructions、工具、子 Agent、欢迎语和建议问题。你可以使用内置的 Default Agent、Code Agent，也可以创建自己的本地 Agent。

## 从哪里开始

- 想创建、启停、导入或导出 Agent：阅读 [Agent 管理](../features/agents)。
- 想完成代码阅读、编辑、命令执行和项目排查：阅读 [Code Agent](./code-agent)。
- 想了解内置、MCP 与 Skill 工具：阅读 [工具系统](../features/tools)。
- 想接入外部工具服务器：阅读 [MCP 服务器](../features/mcp)。

## 使用原则

1. 为任务选择合适的模型和 Agent。
2. 只启用完成任务所需的工具。
3. 对 Bash、文件写入、浏览器和第三方 MCP 的调用检查参数与目标。
4. 把复杂任务拆分为可验证步骤，并保留构建、测试或运行结果。

Agent 的工具审批可以由聊天设置开启，但并非所有执行路径都强制审批，也不构成操作系统级隔离。
