---
sidebar_position: 2
---

# 扩展工具

AIME Chat 的工具来源是内置工具、MCP 和 Skill。当前没有可在 Renderer 中动态注册任意 JavaScript `Tool` 对象的公开插件 API；旧文档中的 `@/services/tool-registry` 并不存在。

## 选择扩展方式

| 目标 | 推荐方式 |
| --- | --- |
| 不修改 AIME Chat 源码，接入已有本地/远程服务 | [MCP 服务器](../features/mcp) |
| 提供提示、脚本和领域工作流 | Skill |
| 与主进程、数据库或应用运行时深度集成 | 修改源码，新增内置 Tool 或 Toolkit |

MCP 与 Skill 更适合独立分发。只有确实需要应用内部 API、统一配置界面或随安装包发布时，才应新增内置工具。

## 内置 Tool 的真实接口

单个工具继承 `src/main/tools/base-tool.ts` 中的 `BaseTool`。最小实现需要 `id`、`description`、`inputSchema` 和 `execute`：

```typescript
import z from 'zod';
import BaseTool from '../base-tool';

export class Echo extends BaseTool {
  static readonly toolName = 'Echo';
  id = 'Echo';
  description = 'Return the provided text.';

  inputSchema = z.strictObject({
    text: z.string().describe('Text to return'),
  });

  execute = async (input: z.infer<typeof this.inputSchema>) => {
    return { text: input.text };
  };
}
```

`inputSchema` 是模型可见参数和运行时验证的共同来源。应使用严格、可描述的 Zod schema，不要在 `execute` 中依赖模型生成的未验证对象。

根据需要，Tool 还可以提供：

- `outputSchema` 或 `toModelOutput`：约束结果或转换模型看到的内容；
- `configSchema` 与 `config`：声明工具级配置；
- `suspendSchema` / `resumeSchema`：暂停执行并等待交互数据；
- `requireApproval`：声明审批意图；最终是否等待审批还取决于调用路径；
- `tags`、`doc`、示例和隐藏状态等元数据；
- `ToolExecutionContext`：读取请求上下文、取消信号或 Agent 暂停/恢复数据。

需要上下文时可在 `execute` 的第二个参数接收 `ToolExecutionContext`。访问可选字段前应检查其是否存在，并沿调用链保留 `abortSignal`。

## 注册内置 Tool

在 `src/main/tools/index.ts` 中导入类，并在 `registerBuiltInTools()` 中注册：

```typescript
import { Echo } from './common/echo';

// registerBuiltInTools()
await this.registerBuiltInTool(Echo);
```

注册器会把 `BaseTool` 转换为 Mastra Tool，并用 `build-in:<id>` 保存启用状态。只创建文件而不注册，工具不会出现在工具页或 Agent 选择器中。

内置类型只有 `build-in`、`mcp` 和 `skill`；不存在旧文档所写的 `CUSTOM` ToolType。对无需随应用编译的扩展，请使用 MCP 或 Skill。

## 创建 Toolkit

一组相关工具可以继承 `BaseToolkit`：

```typescript
import BaseToolkit from '../base-toolkit';
import { Echo } from './echo';
import { ReverseText } from './reverse-text';

export class TextToolkit extends BaseToolkit {
  static readonly toolName = 'TextToolkit';
  id = 'TextToolkit';
  description = 'Text transformation tools.';

  constructor() {
    super([new Echo(), new ReverseText()]);
  }
}
```

Toolkit 自身和子工具都会进入工具数据库。子工具 ID 必须稳定且彼此唯一，否则已有 Agent 配置和启用状态可能失效。

## 配置与模型依赖

需要 Provider、运行库或环境变量的工具，应复用现有 Manager 和配置 schema：

- Provider/模型通过 `providersManager` 获取，不要在工具中硬编码 API Key；
- Secret 只在执行需要时注入，禁止写入返回值和日志；
- 文件或进程操作放在主进程，Renderer 只通过已有的 preload/IPC 边界调用；
- 可选运行库必须在未安装、安装失败和取消时返回可理解错误；
- 执行结果面向模型时保持有界，超长内容使用分页、保存文件或摘要。

## 验证清单

新增工具至少应验证：

1. 输入 schema 接受有效数据并拒绝无效数据。
2. 成功、业务失败、异常和取消路径都有确定结果。
3. 工具注册后能在 **工具** 页面显示，并可加入 Agent。
4. 不会在日志或模型输出中泄露 Secret。
5. 文件、命令、网络和数据库副作用有清晰说明与范围限制。
6. 运行目标 Jest 测试、TypeScript/ESLint 检查和生产构建。

对文件删除、Shell、数据库写入或远程发布等高风险能力，不要把聊天审批开关当作唯一安全边界；工具本身仍需校验目标、路径、参数和调用上下文。
