---
sidebar_position: 2
---

# 开发自定义工具

AIME Chat 支持开发自定义工具，扩展 Agent 的能力。

## 工具开发基础

### 工具接口

自定义工具需要实现以下接口：

```typescript
interface Tool {
  name: string;              // 工具名称
  description: string;      // 工具描述
  parameters: ToolParameter[]; // 参数定义
  execute: (params: any) => Promise<ToolResult>; // 执行函数
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
```

### 简单工具示例

创建一个简单的计算工具：

```typescript
const calculateTool: Tool = {
  name: 'calculate',
  description: '执行数学计算',
  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: '数学表达式，如 "1 + 2 * 3"',
      required: true
    }
  ],
  execute: async (params) => {
    try {
      const result = eval(params.expression);
      return {
        success: true,
        data: { result }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

## 工具类型

### 内置工具

内置工具是应用自带的工具，直接在代码中实现：

```typescript
// src/tools/builtin/my-tool.ts
export const myBuiltinTool: Tool = {
  name: 'my-builtin-tool',
  description: '我的内置工具',
  parameters: [],
  execute: async (params) => {
    // 工具逻辑
    return { success: true, data: {} };
  }
};
```

### MCP 工具

MCP 工具通过 MCP 协议提供：

```typescript
// MCP 工具自动发现和注册
// 配置 MCP 服务器后自动可用
```

### 自定义工具

自定义工具可以动态注册：

```typescript
// 注册自定义工具
import { registerTool } from '@/services/tool-registry';

registerTool({
  name: 'my-custom-tool',
  description: '我的自定义工具',
  parameters: [],
  execute: async (params) => {
    // 工具逻辑
    return { success: true, data: {} };
  }
});
```

## 工具开发最佳实践

### 参数验证

始终验证输入参数：

```typescript
const validateTool: Tool = {
  name: 'validate',
  description: '参数验证示例',
  parameters: [
    {
      name: 'email',
      type: 'string',
      description: '邮箱地址',
      required: true
    }
  ],
  execute: async (params) => {
    // 验证参数
    if (!params.email) {
      return {
        success: false,
        error: '邮箱地址不能为空'
      };
    }

    // 验证格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(params.email)) {
      return {
        success: false,
        error: '邮箱格式不正确'
      };
    }

    // 执行逻辑
    return {
      success: true,
      data: { valid: true }
    };
  }
};
```

### 错误处理

完善的错误处理：

```typescript
const robustTool: Tool = {
  name: 'robust',
  description: '错误处理示例',
  parameters: [],
  execute: async (params) => {
    try {
      // 尝试执行
      const result = await riskyOperation();

      return {
        success: true,
        data: result
      };
    } catch (error) {
      // 记录错误
      console.error('Tool execution failed:', error);

      // 返回错误信息
      return {
        success: false,
        error: error.message || '未知错误'
      };
    }
  }
};
```

### 异步操作

支持异步操作：

```typescript
const asyncTool: Tool = {
  name: 'async',
  description: '异步操作示例',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: '请求的 URL',
      required: true
    }
  ],
  execute: async (params) => {
    try {
      // 异步请求
      const response = await fetch(params.url);
      const data = await response.json();

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

### 进度反馈

长时间操作提供进度反馈：

```typescript
const progressTool: Tool = {
  name: 'progress',
  description: '进度反馈示例',
  parameters: [],
  execute: async (params, onProgress) => {
    const total = 100;

    for (let i = 0; i < total; i++) {
      // 执行操作
      await processItem(i);

      // 报告进度
      onProgress({
        current: i + 1,
        total,
        percentage: ((i + 1) / total) * 100
      });
    }

    return {
      success: true,
      data: { completed: total }
    };
  }
};
```

## 工具注册

### 注册内置工具

在应用启动时注册：

```typescript
// src/main/tools/index.ts
import { registerTool } from '@/services/tool-registry';
import { myBuiltinTool } from './my-tool';

// 注册工具
registerTool(myBuiltinTool);
```

### 动态注册

运行时动态注册工具：

```typescript
// 动态注册工具
import { registerTool } from '@/services/tool-registry';

const customTool = {
  name: 'dynamic-tool',
  description: '动态注册的工具',
  parameters: [],
  execute: async (params) => {
    return { success: true, data: {} };
  }
};

registerTool(customTool);
```

### 工具配置

工具可以包含配置：

```typescript
interface ToolConfig {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: any) => Promise<ToolResult>;
  config?: {
    timeout?: number;      // 超时时间
    retry?: number;         // 重试次数
    cache?: boolean;        // 是否缓存
    permissions?: string[];  // 所需权限
  };
}

const configuredTool: ToolConfig = {
  name: 'configured',
  description: '带配置的工具',
  parameters: [],
  execute: async (params) => {
    return { success: true, data: {} };
  },
  config: {
    timeout: 5000,
    retry: 3,
    cache: true,
    permissions: ['network']
  }
};
```

## 工具测试

### 单元测试

使用 Jest 进行单元测试：

```typescript
// __tests__/tools/my-tool.test.ts
import { myTool } from '@/tools/my-tool';

describe('myTool', () => {
  it('should execute successfully', async () => {
    const result = await myTool.execute({ param: 'value' });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should handle errors', async () => {
    const result = await myTool.execute({ invalid: 'param' });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### 集成测试

测试工具与 Agent 的集成：

```typescript
describe('Tool Integration', () => {
  it('should work with Agent', async () => {
    const agent = new Agent({
      name: 'test-agent',
      tools: [myTool]
    });

    const response = await agent.execute('使用 myTool');

    expect(response).toContain('tool result');
  });
});
```

## 工具示例

### 文件操作工具

```typescript
const fileTool: Tool = {
  name: 'read-file',
  description: '读取文件内容',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件路径',
      required: true
    }
  ],
  execute: async (params) => {
    try {
      const content = await fs.readFile(params.path, 'utf-8');
      return {
        success: true,
        data: { content }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

### API 调用工具

```typescript
const apiTool: Tool = {
  name: 'call-api',
  description: '调用 REST API',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'API URL',
      required: true
    },
    {
      name: 'method',
      type: 'string',
      description: 'HTTP 方法',
      default: 'GET'
    },
    {
      name: 'body',
      type: 'object',
      description: '请求体',
      required: false
    }
  ],
  execute: async (params) => {
    try {
      const response = await fetch(params.url, {
        method: params.method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: params.body ? JSON.stringify(params.body) : undefined
      });

      const data = await response.json();

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

### 数据处理工具

```typescript
const dataTool: Tool = {
  name: 'process-data',
  description: '处理数据',
  parameters: [
    {
      name: 'data',
      type: 'array',
      description: '要处理的数据数组',
      required: true
    },
    {
      name: 'operation',
      type: 'string',
      description: '操作类型：sum, avg, max, min',
      required: true
    }
  ],
  execute: async (params) => {
    try {
      const { data, operation } = params;

      let result;
      switch (operation) {
        case 'sum':
          result = data.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          result = data.reduce((a, b) => a + b, 0) / data.length;
          break;
        case 'max':
          result = Math.max(...data);
          break;
        case 'min':
          result = Math.min(...data);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        success: true,
        data: { result }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

## 工具发布

### 打包工具

将工具打包为 npm 包：

```bash
# 1. 初始化项目
npm init -y

# 2. 安装依赖
npm install @mastra/core

# 3. 编写工具代码
# (参考上面的示例)

# 4. 导出工具
export { myTool } from './my-tool';

# 5. 发布到 npm
npm publish
```

### 使用外部工具

在 AIME Chat 中使用外部工具：

```typescript
// 安装工具包
npm install my-custom-tools

// 导入并注册
import { myTool } from 'my-custom-tools';
import { registerTool } from '@/services/tool-registry';

registerTool(myTool);
```

## 调试工具

### 日志记录

添加详细的日志：

```typescript
const debugTool: Tool = {
  name: 'debug',
  description: '调试工具',
  parameters: [],
  execute: async (params) => {
    console.log('[Tool] Starting execution');
    console.log('[Tool] Parameters:', params);

    try {
      const result = await doSomething();

      console.log('[Tool] Execution successful');
      console.log('[Tool] Result:', result);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[Tool] Execution failed:', error);

      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

### 性能监控

监控工具性能：

```typescript
const monitoredTool: Tool = {
  name: 'monitored',
  description: '性能监控工具',
  parameters: [],
  execute: async (params) => {
    const startTime = Date.now();

    try {
      const result = await doSomething();

      const duration = Date.now() - startTime;
      console.log(`[Tool] Execution time: ${duration}ms`);

      return {
        success: true,
        data: result,
        metadata: { duration }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

## 常见问题

### 工具无法注册

**检查清单**：
- [ ] 工具接口实现正确
- [ ] 工具名称唯一
- [ ] 参数定义完整
- [ ] 执行函数返回正确格式

### 工具执行失败

**调试步骤**：
1. 检查参数是否正确
2. 查看错误日志
3. 验证工具逻辑
4. 测试工具独立运行

### 性能问题

**优化建议**：
1. 减少不必要的计算
2. 使用缓存机制
3. 优化异步操作
4. 考虑使用 Worker

## 相关资源

- [Mastra 工具文档](https://mastra.ai/docs/tools)
- [MCP 协议文档](https://modelcontextprotocol.io/)
- [Electron IPC 文档](https://www.electronjs.org/docs/latest/tutorial/ipc)
