---
sidebar_position: 6
---

# 记忆系统

AIME Chat 基于 Mastra 框架提供强大的记忆管理能力，让 AI Agent 能够记住和利用历史信息。

## 记忆系统概述

记忆系统是 AI Agent 的核心能力之一，它允许 Agent：

- 记住对话历史
- 积累长期知识
- 跟踪任务状态
- 跨会话保持上下文

### 记忆架构

```
┌──────────────────────────────────────┐
│         AI Agent                     │
├──────────────────────────────────────┤
│         Memory System                │
├──────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │Session  │ │Semantic │ │Working │ │
│  │ Memory  │ │ Memory  │ │ Memory │ │
│  └─────────┘ └─────────┘ └────────┘ │
├──────────────────────────────────────┤
│         Storage Layer                │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │LibSQL   │ │Vector   │ │Cache   │ │
│  │Database │ │Database │ │        │ │
│  └─────────┘ └─────────┘ └────────┘ │
└──────────────────────────────────────┘
```

## 记忆类型

### 会话记忆 (Session Memory)

会话记忆保存当前对话的上下文，支持多轮对话。

**特点**：
- 临时存储
- 自动清理
- 快速访问
- 上下文保持

**使用场景**：
- 多轮对话
- 上下文理解
- 任务延续

**配置**：
```typescript
{
  "type": "session",
  "maxMessages": 50,
  "retention": "session"
}
```

### 语义记忆 (Semantic Memory)

语义记忆基于向量存储，实现长期知识积累。

**特点**：
- 持久化存储
- 语义检索
- 跨会话访问
- 智能匹配

**使用场景**：
- 知识积累
- 经验学习
- 个性化记忆
- 长期上下文

**配置**：
```typescript
{
  "type": "semantic",
  "vectorStore": "libsql",
  "embeddingModel": "fastembed",
  "maxEntries": 10000
}
```

### 工作记忆 (Working Memory)

工作记忆用于跟踪任务执行中的临时状态。

**特点**：
- 任务相关
- 临时存储
- 自动清理
- 状态管理

**使用场景**：
- 复杂任务分解
- 状态跟踪
- 进度管理
- 临时数据

**配置**：
```typescript
{
  "type": "working",
  "maxSize": "10MB",
  "ttl": 3600
}
```

## 记忆配置

### Agent 级别配置

在 Agent 设置中配置记忆：

```typescript
{
  "name": "My Agent",
  "memory": {
    "session": {
      "enabled": true,
      "maxMessages": 100
    },
    "semantic": {
      "enabled": true,
      "vectorStore": "libsql"
    },
    "working": {
      "enabled": true,
      "maxSize": "5MB"
    }
  }
}
```

### 全局配置

在应用设置中配置默认记忆设置：

```typescript
{
  "memory": {
    "defaultType": "session",
    "semantic": {
      "enabled": true,
      "vectorStore": "libsql",
      "embeddingModel": "fastembed"
    }
  }
}
```

## 记忆管理

### 查看记忆

在 Agent 管理页面可以查看：

- 会话历史
- 语义记忆条目
- 工作记忆状态

### 清理记忆

**自动清理**：
- 会话记忆：会话结束自动清理
- 工作记忆：任务完成自动清理
- 语义记忆：定期清理过期条目

**手动清理**：
1. 进入 Agent 管理
2. 选择记忆类型
3. 点击清理按钮

### 导出/导入记忆

支持导出和导入记忆数据：

```bash
# 导出记忆
aime-chat export-memory --agent my-agent --type semantic

# 导入记忆
aime-chat import-memory --agent my-agent --file memory.json
```

## 记忆最佳实践

### 选择合适的记忆类型

| 场景 | 推荐记忆类型 | 原因 |
|------|--------------|------|
| 简单对话 | 会话记忆 | 快速、轻量 |
| 知识积累 | 语义记忆 | 持久化、可检索 |
| 复杂任务 | 工作记忆 | 状态跟踪 |
| 个性化 | 语义记忆 | 长期记忆 |

### 记忆容量管理

- **会话记忆**：限制消息数量（50-100条）
- **语义记忆**：限制条目数量（1000-10000条）
- **工作记忆**：限制存储大小（5-10MB）

### 记忆清理策略

- 定期清理过期记忆
- 删除不相关的记忆
- 压缩重复的记忆
- 归档重要的记忆

### 性能优化

- 使用缓存加速访问
- 批量操作减少IO
- 异步处理避免阻塞
- 索引优化检索速度

## 技术细节

### 记忆数据结构

```typescript
interface MemoryEntry {
  id: string;
  type: 'session' | 'semantic' | 'working';
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  timestamp: number;
  ttl?: number;
}
```

### 向量存储

AIME Chat 使用 **LibSQL** 作为向量数据库：

- 本地存储，保护隐私
- 支持向量相似度搜索
- 高效的索引机制
- 可扩展的存储容量

### 嵌入模型

使用 **FastEmbed** 进行文本向量化：

- 多语言支持
- 本地运行
- 高效快速
- 准确的语义表示

## 常见问题

### 记忆占用过多空间

**解决方案**：
1. 减少记忆容量限制
2. 定期清理记忆
3. 压缩记忆数据
4. 使用更高效的嵌入模型

### 语义检索不准确

**可能原因**：
1. 嵌入模型不合适
2. 记忆数据质量差
3. 检索参数不当

**解决方案**：
1. 尝试不同的嵌入模型
2. 优化记忆内容
3. 调整检索参数
4. 增加相关记忆

### 记忆丢失

**可能原因**：
1. 存储故障
2. 配置错误
3. 意外清理

**解决方案**：
1. 检查存储配置
2. 启用记忆备份
3. 恢复备份记忆
4. 检查日志定位问题

## 与 Mastra 框架集成

AIME Chat 的记忆系统完全基于 Mastra 框架：

- Mastra Memory API
- Mastra Vector Store
- Mastra Embedding
- Mastra Memory Processors

详细技术文档请参考 [Mastra 官方文档](https://mastra.ai/docs)。
