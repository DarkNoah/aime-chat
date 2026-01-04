---
sidebar_position: 7
---

# RAG (检索增强生成)

AIME Chat 内置强大的 RAG (Retrieval-Augmented Generation) 能力，让 AI 能够基于知识库进行智能问答。

## 什么是 RAG？

RAG 是一种结合检索和生成的 AI 技术，它通过以下步骤工作：

1. **检索**：从知识库中检索相关文档
2. **增强**：将检索到的文档作为上下文
3. **生成**：基于上下文生成回答

### RAG 工作流程

```
用户问题
    ↓
[向量化] - 将问题转换为向量
    ↓
[检索] - 在向量数据库中搜索
    ↓
[排序] - 对结果进行相关性排序
    ↓
[增强] - 将相关文档作为上下文
    ↓
[生成] - AI 基于上下文生成回答
    ↓
返回结果
```

## 知识库管理

### 创建知识库

1. 进入 **知识库** 页面
2. 点击 **创建知识库**
3. 填写知识库信息：
   - **名称**：知识库名称
   - **描述**：知识库描述
   - **嵌入模型**：选择嵌入模型
   - **向量存储**：选择向量数据库

### 上传文档

支持多种文档格式：

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| 文本文件 | `.txt` | 纯文本文档 |
| Markdown | `.md`, `.mdx` | Markdown 文档 |
| PDF | `.pdf` | PDF 文档 |
| Word | `.docx` | Word 文档 |

**上传步骤**：
1. 选择知识库
2. 点击 **上传文档**
3. 选择文件
4. 等待处理完成

### 文档处理流程

```
文档上传
    ↓
[解析] - 提取文本内容
    ↓
[分块] - 切分成适当大小的片段
    ↓
[向量化] - 转换为向量
    ↓
[存储] - 存储到向量数据库
    ↓
完成
```

## 文档分块

### 分块策略

AIME Chat 支持多种分块策略：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **固定大小** | 按固定字符数分块 | 通用文档 |
| **段落** | 按段落分块 | 结构化文档 |
| **语义** | 按语义边界分块 | 复杂文档 |
| **递归** | 递归分割 | 长文档 |

### 分块配置

```typescript
{
  "chunking": {
    "strategy": "semantic",
    "chunkSize": 512,
    "chunkOverlap": 50,
    "separators": ["\n\n", "\n", " ", ""]
  }
}
```

### 分块最佳实践

- **块大小**：512-1024 字符
- **重叠**：50-100 字符
- **分隔符**：使用自然分隔符
- **语义边界**：保持语义完整性

## 向量化

### 嵌入模型

AIME Chat 使用 **FastEmbed** 进行文本向量化：

**特点**：
- 多语言支持
- 本地运行
- 高效快速
- 准确的语义表示

**支持的模型**：
- `fastembed-multilingual`：多语言模型
- `fastembed-english`：英文专用模型
- `fastembed-chinese`：中文优化模型

### 向量维度

| 模型 | 维度 | 说明 |
|------|------|------|
| fastembed-multilingual | 384 | 通用多语言 |
| fastembed-english | 384 | 英文优化 |
| fastembed-chinese | 768 | 中文优化 |

### 向量化配置

```typescript
{
  "embedding": {
    "model": "fastembed-multilingual",
    "dimension": 384,
    "normalize": true
  }
}
```

## 向量存储

### LibSQL 向量数据库

AIME Chat 使用 **LibSQL** 作为向量数据库：

**特点**：
- 本地存储，保护隐私
- 支持向量相似度搜索
- 高效的索引机制
- 可扩展的存储容量

### 存储配置

```typescript
{
  "vectorStore": {
    "type": "libsql",
    "path": "~/.aime-chat/vector.db",
    "indexType": "HNSW",
    "efConstruction": 200,
    "M": 16
  }
}
```

### 索引优化

- **HNSW 索引**：高效的近似最近邻搜索
- **efConstruction**：构建时的搜索范围（100-400）
- **M**：每个节点的连接数（8-32）

## 检索

### 相似度搜索

使用余弦相似度进行检索：

```typescript
{
  "retrieval": {
    "method": "cosine",
    "topK": 5,
    "scoreThreshold": 0.7
  }
}
```

### 检索参数

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `topK` | 返回结果数量 | 3-10 |
| `scoreThreshold` | 相似度阈值 | 0.6-0.8 |
| `method` | 相似度计算方法 | cosine |

### 检索优化

- **增加 topK**：提高召回率
- **提高阈值**：提高精确率
- **混合检索**：结合关键词和向量检索
- **重排序**：使用重排序模型

## 生成

### 上下文构建

将检索到的文档构建为上下文：

```typescript
const context = retrievedDocs.map((doc, index) => {
  return `[文档 ${index + 1}]\n${doc.content}\n`;
}).join('\n');
```

### 提示词模板

```markdown
基于以下文档回答问题：

{context}

问题：{question}

回答：
```

### 生成配置

```typescript
{
  "generation": {
    "model": "gpt-4o",
    "temperature": 0.7,
    "maxTokens": 1000,
    "systemPrompt": "你是一个专业的问答助手..."
  }
}
```

## RAG 最佳实践

### 文档准备

✅ **推荐做法**：
- 使用清晰的标题和段落结构
- 确保文档内容准确完整
- 避免过多的格式和特殊字符
- 定期更新文档

❌ **避免**：
- 上传纯图片的扫描件
- 包含过时或错误的信息
- 文档格式混乱
- 内容重复冗余

### 知识库组织

- 按主题或领域创建不同的知识库
- 定期更新和维护文档
- 删除过时或错误的内容
- 使用标签分类文档

### 提问技巧

- 问题要具体明确
- 可以要求 AI 引用来源
- 如果回答不准确，尝试换个问法
- 使用关键词提高检索准确度

### 性能优化

- 合理设置分块大小
- 使用合适的嵌入模型
- 优化向量索引
- 启用缓存机制

## 高级功能

### 混合检索

结合关键词检索和向量检索：

```typescript
{
  "retrieval": {
    "method": "hybrid",
    "keywordWeight": 0.3,
    "vectorWeight": 0.7
  }
}
```

### 重排序

使用重排序模型优化结果：

```typescript
{
  "reranking": {
    "enabled": true,
    "model": "cross-encoder",
    "topN": 3
  }
}
```

### 多知识库检索

同时从多个知识库检索：

```typescript
{
  "knowledgeBases": ["kb1", "kb2", "kb3"],
  "retrieval": {
    "topK": 5,
    "strategy": "merge"
  }
}
```

## 常见问题

### 检索结果不准确

**可能原因**：
1. 文档分块不当
2. 嵌入模型不合适
3. 检索参数不当
4. 文档内容与问题不相关

**解决方案**：
1. 调整分块策略
2. 尝试不同的嵌入模型
3. 优化检索参数
4. 上传更多相关文档

### 回答质量差

**可能原因**：
1. 检索到的文档不相关
2. 上下文构建不当
3. 模型能力不足
4. 提示词设计不佳

**解决方案**：
1. 提高检索准确度
2. 优化上下文构建
3. 使用更强大的模型
4. 改进提示词设计

### 性能问题

**可能原因**：
1. 知识库过大
2. 索引未优化
3. 检索参数不当
4. 硬件限制

**解决方案**：
1. 分割知识库
2. 优化向量索引
3. 调整检索参数
4. 升级硬件配置

## 技术细节

### RAG 数据流

```
文档 → 解析 → 分块 → 向量化 → 存储
  ↓
用户问题 → 向量化 → 检索 → 排序 → 上下文构建 → 生成 → 回答
```

### 向量相似度计算

```typescript
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitude1 * magnitude2);
}
```

### 与 Mastra 框架集成

AIME Chat 的 RAG 系统完全基于 Mastra 框架：

- Mastra RAG API
- Mastra Vector Store
- Mastra Embedding
- Mastra Retrieval

详细技术文档请参考 [Mastra 官方文档](https://mastra.ai/docs)。
