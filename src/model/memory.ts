// 完全重写的Memory模型

import { ObjectId, Collection, Db } from "mongodb";
import {
  analyzeQuery,
  calculateParameterSimilarity,
  generateQueryFingerprint,
} from "../utils/memoryUtils.js";

// 记忆存储层级
export enum MemoryTier {
  SHORT_TERM = "short_term", // 短期记忆
  MID_TERM = "mid_term", // 中期记忆
  LONG_TERM = "long_term", // 长期记忆
}

// 记忆数据结构
export interface Memory {
  _id: ObjectId;

  _similarityScore?: number;

  // 查询信息
  query: {
    toolName: string; // 工具名称
    fingerprint: string; // 查询指纹
    originalParams: any; // 原始参数
    complexityScore: number; // 复杂度分数
    isCompound: boolean; // 是否是复合查询
    contextId?: string; // 上下文ID (仅复合查询)
    metadata: any; // 元数据
  };

  // 结果信息
  result: {
    data: any; // 结果数据
    timestamp: Date; // 查询时间
    confidence: number; // 置信度
    validated: boolean; // 是否已验证
  };

  // 使用统计
  stats: {
    accessCount: number; // 访问次数
    hitCount: number; // 命中次数
    lastAccessed: Date; // 最后访问时间
    createdAt: Date; // 创建时间
  };

  // 存储信息
  storage: {
    tier: MemoryTier; // 存储层级
    expiresAt: Date | null; // 过期时间
    tags: string[]; // 标签
  };

  // 实体依赖
  dependencies: Array<{
    entityType: string; // 实体类型
    entityId: ObjectId; // 实体ID
    relationship: string; // 关系类型
  }>;
}

// Memory管理器
export class MemoryManager {
  private memoryCollection: Collection<Memory>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.memoryCollection = db.collection<Memory>("memories");
  }

  /**
   * 创建索引
   */
  async createIndexes(): Promise<void> {
    // 指纹索引
    await this.memoryCollection.createIndex({ "query.fingerprint": 1 });

    // 工具名索引
    await this.memoryCollection.createIndex({ "query.toolName": 1 });

    // 复杂度索引
    await this.memoryCollection.createIndex({ "query.complexityScore": 1 });

    // 上下文索引
    await this.memoryCollection.createIndex({ "query.contextId": 1 });

    // 过期时间索引
    await this.memoryCollection.createIndex({ "storage.expiresAt": 1 });

    // 置信度索引
    await this.memoryCollection.createIndex({ "result.confidence": 1 });

    // 实体依赖索引
    await this.memoryCollection.createIndex({
      "dependencies.entityType": 1,
      "dependencies.entityId": 1,
    });
  }

  /**
   * 存储记忆
   */
  async storeMemory(
    toolName: string,
    params: any,
    result: any,
    options: {
      contextId?: string;
      isCompound?: boolean;
      dependencies?: Array<{
        entityType: string;
        entityId: ObjectId;
        relationship: string;
      }>;
      // 添加这些新参数
      complexityScore?: number;
      tier?: string;
      expiryDays?: number | null;
      initialConfidence?: number;
    } = {}
  ): Promise<Memory> {
    // 分析查询
    const analysis = analyzeQuery(toolName, params);

    // 如果提供了复杂度，使用提供的值覆盖分析结果
    if (options.complexityScore !== undefined) {
      analysis.complexityScore = options.complexityScore;
    }

    // 如果提供了存储层级，使用提供的值
    if (options.tier) {
      analysis.cacheTier = options.tier;
    }

    // 如果提供了过期天数，使用提供的值
    if (options.expiryDays !== undefined) {
      analysis.expiryDays = options.expiryDays;
    }

    // 如果提供了初始置信度，使用提供的值
    if (options.initialConfidence !== undefined) {
      analysis.initialConfidence = options.initialConfidence;
    }

    // 如果不应缓存，直接返回null
    if (!analysis.shouldCache && !options.isCompound) {
      throw new Error("Query should not be cached");
    }

    // 生成查询指纹
    const fingerprint = generateQueryFingerprint(toolName, params);

    // 计算过期时间
    let expiresAt: Date | null = null;
    if (analysis.expiryDays !== null) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + analysis.expiryDays);
    }

    // 处理依赖关系
    const dependencies = options.dependencies || [];

    // 处理标签
    const tags = [toolName];
    if (analysis.metadata.itemCategory) {
      tags.push(`item:${analysis.metadata.itemCategory}`);
    }
    if (analysis.metadata.routeType) {
      tags.push(`route:${analysis.metadata.routeType}`);
    }

    // 创建记忆对象
    const memory: Partial<Memory> = {
      query: {
        toolName,
        fingerprint: generateQueryFingerprint(toolName, params),
        originalParams: params,
        complexityScore: analysis.complexityScore, // 使用可能被覆盖的值
        isCompound: options.isCompound || false,
        metadata: analysis.metadata,
      },
      result: {
        data: result,
        timestamp: new Date(),
        confidence: analysis.initialConfidence, // 使用可能被覆盖的值
        validated: false,
      },
      stats: {
        accessCount: 1,
        hitCount: 0,
        lastAccessed: new Date(),
        createdAt: new Date(),
      },
      storage: {
        tier: analysis.cacheTier as MemoryTier, // 使用可能被覆盖的值
        expiresAt,
        tags: [toolName, ...generateTags(analysis)],
      },
      dependencies: dependencies.map((dep) => ({
        entityType: dep.entityType,
        entityId:
          typeof dep.entityId === "string" &&
          /^[0-9a-fA-F]{24}$/.test(dep.entityId)
            ? new ObjectId(dep.entityId)
            : dep.entityId,
        relationship: dep.relationship,
      })),
    };

    // 如果是复合查询，添加上下文ID
    if (options.contextId) {
      memory.query!.contextId = options.contextId;
    }

    // 插入记忆
    const result2 = await this.memoryCollection.insertOne(memory as Memory);

    return { ...memory, _id: result2.insertedId } as Memory;
  }

  /**
   * 查找记忆
   */
  async findMemory(
    toolName: string,
    params: any,
    options: {
      confidenceThreshold?: number;
      contextId?: string;
    } = {}
  ): Promise<Memory | null> {
    try {
      // 默认置信度阈值
      const confidenceThreshold = options.confidenceThreshold || 0.7;

      // 分析查询
      const analysis = analyzeQuery(toolName, params);
      console.log(`查询复杂度: ${analysis.complexityScore} (${toolName})`);

      // 如果有上下文ID，我们允许低复杂度查询
      const minComplexity = options.contextId ? 0 : 3;

      // 1. 如果复杂度不足且没有上下文，不使用记忆
      if (analysis.complexityScore < minComplexity) {
        console.log(
          `跳过记忆查询: 复杂度不足 (${analysis.complexityScore} < ${minComplexity})`
        );
        return null;
      }

      // 2. 生成查询指纹
      const fingerprint = generateQueryFingerprint(toolName, params);

      // 3. 尝试精确匹配 - 根据指纹
      const exactMatch = await this.memoryCollection.findOne({
        "query.fingerprint": fingerprint,
        "result.confidence": { $gte: confidenceThreshold },
        $or: [
          { "storage.expiresAt": null },
          { "storage.expiresAt": { $gt: new Date() } },
        ],
      });

      if (exactMatch) {
        console.log(`精确匹配成功: ${exactMatch._id}`);
        // 更新统计信息
        await this.updateMemoryStats(exactMatch._id);
        return exactMatch;
      }

      // 4. 如果有上下文ID，查找相关记忆
      if (options.contextId) {
        console.log(`尝试查找上下文 ${options.contextId} 相关记忆`);

        // 查找上下文相关记忆
        const contextMatches = await this.memoryCollection
          .find({
            "query.contextId": options.contextId,
            "result.confidence": { $gte: confidenceThreshold },
            $or: [
              { "storage.expiresAt": null },
              { "storage.expiresAt": { $gt: new Date() } },
            ],
          })
          .toArray();

        console.log(`找到 ${contextMatches.length} 个上下文相关记忆`);

        if (contextMatches.length > 0) {
          // 返回最相关的上下文匹配
          // 优先返回完全匹配的复合记忆
          // 改进复合记忆匹配逻辑
          for (const match of contextMatches) {
            if (match.query.isCompound && match.query.originalParams?.steps) {
              const steps = match.query.originalParams.steps;
              
              // 1. 检查精确匹配步骤
              const exactMatch = steps.find(
                step => step.toolName === toolName && 
                       step.fingerprint === generateQueryFingerprint(toolName, params)
              );
              if (exactMatch) {
                console.log(`找到精确匹配的复合记忆步骤: ${match._id}`);
                await this.updateMemoryStats(match._id);
                return match;
              }

              // 2. 检查相似参数步骤
              const similarSteps = steps
                .filter(step => step.toolName === toolName)
                .map(step => ({
                  step,
                  similarity: calculateParameterSimilarity(step.params, params)
                }))
                .filter(item => item.similarity > 0.7)
                .sort((a, b) => b.similarity - a.similarity);

              if (similarSteps.length > 0) {
                console.log(`找到相似参数步骤 (相似度: ${similarSteps[0].similarity.toFixed(2)})`);
                await this.updateMemoryStats(match._id);
                return match;
              }

              // 3. 检查关键参数匹配
              const hasKeyParamMatch = steps.some(step => {
                if (step.toolName !== toolName) return false;
                
                // 物品查询匹配物品名称
                if (toolName === 'find_item' && step.params.itemName === params.itemName) {
                  return true;
                }
                // 时间估算匹配起终点
                if (toolName === 'estimate_time' && 
                    step.params.origin === params.origin && 
                    step.params.destination === params.destination) {
                  return true;
                }
                return false;
              });

              if (hasKeyParamMatch) {
                console.log(`找到关键参数匹配的复合记忆: ${match._id}`);
                await this.updateMemoryStats(match._id);
                return match;
              }
            }
          }

          // 如果没有完全匹配，返回最新的上下文记忆
          const latestMatch = contextMatches.sort(
            (a, b) =>
              b.stats.lastAccessed.getTime() - a.stats.lastAccessed.getTime()
          )[0];

          console.log(`返回最新的上下文记忆: ${latestMatch._id}`);
          await this.updateMemoryStats(latestMatch._id);
          return latestMatch;
        }
      }

      // 5. 宽松查询条件，尝试模糊匹配
      // 使用更宽松的条件找到潜在匹配
      console.log(`尝试模糊匹配...`);

      const potentialMatches = await this.memoryCollection
        .find({
          "query.toolName": toolName,
          "result.confidence": { $gte: confidenceThreshold * 0.8 },
          $or: [
            { "storage.expiresAt": null },
            { "storage.expiresAt": { $gt: new Date() } },
          ],
        })
        .limit(10)
        .toArray();

      console.log(`找到 ${potentialMatches.length} 个潜在匹配`);

      if (potentialMatches.length === 0) {
        return null;
      }

      // 6. 改进相似度计算
      const rankedMatches = potentialMatches
        .map((memory) => {
          // 基础参数相似度
          let paramSimilarity = calculateParameterSimilarity(
            params,
            memory.query.originalParams
          );

          // 添加元数据相似度奖励
          let metadataSimilarity = 0;

          // 对于物品查询，比较物品类别
          if (
            toolName === "find_item" &&
            analysis.metadata.itemCategory &&
            memory.query.metadata.itemCategory
          ) {
            if (
              analysis.metadata.itemCategory ===
              memory.query.metadata.itemCategory
            ) {
              metadataSimilarity += 0.1;
            }
          }

          // 对于时间估算，比较路线类型
          if (
            toolName === "estimate_time" &&
            analysis.metadata.routeType &&
            memory.query.metadata.routeType
          ) {
            if (
              analysis.metadata.routeType === memory.query.metadata.routeType
            ) {
              metadataSimilarity += 0.1;
            }
          }

          // 计算总相似度
          const totalSimilarity = paramSimilarity + metadataSimilarity;

          return {
            memory,
            similarity: totalSimilarity,
            details: {
              paramSimilarity,
              metadataSimilarity,
            },
          };
        })
        // 使用更低的相似度阈值
        .filter((item) => item.similarity > 0.7)
        .sort((a, b) => b.similarity - a.similarity);

      if (rankedMatches.length === 0) {
        console.log(`没有超过相似度阈值的匹配`);
        return null;
      }

      // 7. 返回最佳匹配
      const bestMatch = rankedMatches[0];
      console.log(
        `找到最佳匹配: ${
          bestMatch.memory._id
        }, 相似度: ${bestMatch.similarity.toFixed(3)}`
      );
      console.log(`相似度详情:`, bestMatch.details);

      // 将相似度添加到记忆对象
      bestMatch.memory._similarityScore = bestMatch.similarity;

      await this.updateMemoryStats(bestMatch.memory._id);
      return bestMatch.memory;
    } catch (error) {
      console.error("查找记忆时出错:", error);
      return null;
    }
  }

  async findMemoryById(memoryId: ObjectId | string): Promise<Memory | null> {
    try {
      const id =
        typeof memoryId === "string" ? new ObjectId(memoryId) : memoryId;
      return await this.memoryCollection.findOne({ _id: id });
    } catch (error) {
      console.error("根据ID查找记忆时出错:", error);
      return null;
    }
  }

  /**
   * 更新记忆统计信息
   */
  async updateMemoryStats(memoryId: ObjectId): Promise<void> {
    try {
      await this.memoryCollection.updateOne(
        { _id: memoryId },
        {
          $inc: {
            "stats.accessCount": 1,
            "stats.hitCount": 1,
          },
          $set: {
            "stats.lastAccessed": new Date(),
          },
        }
      );
    } catch (error) {
      console.error("更新记忆统计信息时出错:", error);
    }
  }

  /**
   * 存储复合记忆
   */
  async storeCompoundMemory(
    contextId: string,
    steps: Array<{
      toolName: string;
      params: any;
      result: any;
    }>,
    dependencies: Array<{
      entityType: string;
      entityId: ObjectId;
      relationship: string;
    }> = []
  ): Promise<Memory | null> {
    try {
      // 计算总复杂度
      let totalComplexity = 0;
      const keyEntities = new Set();

      console.log(`计算复合查询复杂度，步骤数: ${steps.length}`);

      // 计算每个步骤的复杂度并加总
      for (const step of steps) {
        const analysis = analyzeQuery(step.toolName, step.params);
        console.log(
          `步骤 ${step.toolName} 复杂度: ${analysis.complexityScore}`
        );
        totalComplexity += analysis.complexityScore;

        // 收集关键实体ID
        if (step.result && step.result.entityId) {
          keyEntities.add(step.result.entityId.toString());
        }
      }

      // 添加上下文奖励 - 相关步骤之间的关联性增加复杂度
      // 相关步骤越多，奖励越高
      const contextBonus = Math.min(steps.length * 0.5, 2);
      totalComplexity += contextBonus;

      console.log(`复合查询原始复杂度: ${totalComplexity - contextBonus}`);
      console.log(`上下文奖励: ${contextBonus}`);
      console.log(`最终复杂度: ${totalComplexity}`);

      // 确定存储层级 - 复杂度高的复合记忆应该保存更长时间
      let tier = "short_term";
      let expiryDays = 1;
      let initialConfidence = 0.7;

      if (totalComplexity >= 12) {
        tier = "long_term";
        expiryDays = null;
        initialConfidence = 0.9;
      } else if (totalComplexity >= 8) {
        tier = "mid_term";
        expiryDays = 14;
        initialConfidence = 0.8;
      }

      // 创建复合查询参数
      const compoundParams = {
        _isCompound: true,
        contextId,
        entityIds: Array.from(keyEntities),
        querySignature: this.generateCompoundSignature(steps),
        steps: steps.map((s) => ({
          toolName: s.toolName,
          params: s.params,
          fingerprint: generateQueryFingerprint(s.toolName, s.params),
        })),
      };

      // 创建复合结果
      const compoundResult = {
        results: steps.map((step) => step.result),
      };

      // 存储复合记忆
      return await this.storeMemory(
        "compound_query",
        compoundParams,
        compoundResult,
        {
          contextId,
          isCompound: true,
          dependencies,
          complexityScore: totalComplexity,
          tier,
          expiryDays,
          initialConfidence,
        }
      );
    } catch (error) {
      console.error("存储复合记忆时出错:", error);
      return null;
    }
  }

  private generateCompoundSignature(steps: any[]): string {
    // 提取步骤中的关键参数
    const keyParams = steps
      .map((step) => {
        const toolName = step.toolName;
        const params = step.params;

        // 针对不同工具提取关键信息
        switch (toolName) {
          case "query_contact":
            return params.contactName || params.relationship || "";
          case "estimate_time":
            return `${params.origin}-${params.destination}`;
          default:
            return "";
        }
      })
      .filter((p) => p !== "");

    // 生成签名
    return keyParams.join("|");
  }

  /**
   * 验证记忆
   */
  async validateMemory(memoryId: ObjectId | string): Promise<boolean> {
    try {
      const id =
        typeof memoryId === "string" ? new ObjectId(memoryId) : memoryId;

      const result = await this.memoryCollection.updateOne(
        { _id: id },
        {
          $set: {
            "result.validated": true,
            "result.confidence": 1.0,
          },
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error("验证记忆时出错:", error);
      return false;
    }
  }

  /**
   * 使记忆失效
   */
  async invalidateMemory(memoryId: ObjectId | string): Promise<boolean> {
    try {
      const id =
        typeof memoryId === "string" ? new ObjectId(memoryId) : memoryId;

      const result = await this.memoryCollection.updateOne(
        { _id: id },
        {
          $set: {
            "result.confidence": 0,
            "storage.expiresAt": new Date(),
          },
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error("使记忆失效时出错:", error);
      return false;
    }
  }

  /**
   * 处理实体更新事件
   */
  async handleEntityUpdate(
    entityType: string,
    entityId: ObjectId | string,
    updateType: "created" | "updated" | "deleted"
  ): Promise<number> {
    try {
      const id =
        typeof entityId === "string" ? new ObjectId(entityId) : entityId;

      // 获取所有相关记忆及其关系类型
      const relatedMemories = await this.memoryCollection
        .find({
          "dependencies.entityType": entityType,
          "dependencies.entityId": id,
        })
        .toArray();

      let modifiedCount = 0;

      // 区分不同关系类型的影响程度
      for (const memory of relatedMemories) {
        let update: any;
        const dependency = memory.dependencies.find(
          (d) =>
            d.entityType === entityType &&
            d.entityId.toString() === id.toString()
        );

        if (!dependency) continue;

        switch (updateType) {
          case "deleted":
            // 实体被删除，记忆失效
            update = {
              $set: {
                "result.confidence": 0,
                "storage.expiresAt": new Date(),
              },
            };
            break;

          case "updated":
            // 实体更新，根据关系类型降低置信度
            const confidenceMultiplier =
              dependency.relationship === "primary"
                ? 0.5 // 主要依赖影响大
                : dependency.relationship === "secondary"
                ? 0.7 // 次要依赖影响中等
                : 0.9; // 引用关系影响小

            update = {
              $mul: { "result.confidence": confidenceMultiplier },
            };
            break;

          case "created":
            // 新实体创建，轻微影响同类型实体的记忆
            if (dependency.relationship === "reference") {
              update = {
                $mul: { "result.confidence": 0.95 },
              };
            } else {
              continue; // 不影响主要和次要依赖
            }
            break;
        }

        // 执行更新
        const result = await this.memoryCollection.updateOne(
          { _id: memory._id },
          update
        );

        if (result.modifiedCount > 0) {
          modifiedCount++;
        }
      }

      return modifiedCount;
    } catch (error) {
      console.error("处理实体更新事件时出错:", error);
      return 0;
    }
  }

  /**
   * 清理过期记忆
   */
  async cleanupExpiredMemories(): Promise<number> {
    try {
      // 删除过期且置信度低的记忆
      const result = await this.memoryCollection.deleteMany({
        "storage.expiresAt": { $lt: new Date() },
        "result.confidence": { $lt: 0.3 },
      });

      return result.deletedCount;
    } catch (error) {
      console.error("清理过期记忆时出错:", error);
      return 0;
    }
  }

  /**
   * 获取记忆系统统计信息
   */
  async getMemoryStats(): Promise<{
    total: number;
    byTier: Record<string, number>;
    byConfidence: {
      high: number;
      medium: number;
      low: number;
    };
    expired: number;
    validated: number;
    hitRate: number;
  }> {
    try {
      const total = await this.memoryCollection.countDocuments();

      // 按层级统计
      const shortTerm = await this.memoryCollection.countDocuments({
        "storage.tier": MemoryTier.SHORT_TERM,
      });

      const midTerm = await this.memoryCollection.countDocuments({
        "storage.tier": MemoryTier.MID_TERM,
      });

      const longTerm = await this.memoryCollection.countDocuments({
        "storage.tier": MemoryTier.LONG_TERM,
      });

      // 按置信度统计
      const highConfidence = await this.memoryCollection.countDocuments({
        "result.confidence": { $gte: 0.8 },
      });

      const mediumConfidence = await this.memoryCollection.countDocuments({
        "result.confidence": { $gte: 0.5, $lt: 0.8 },
      });

      const lowConfidence = await this.memoryCollection.countDocuments({
        "result.confidence": { $lt: 0.5 },
      });

      // 其他统计
      const expired = await this.memoryCollection.countDocuments({
        "storage.expiresAt": { $lt: new Date() },
      });

      const validated = await this.memoryCollection.countDocuments({
        "result.validated": true,
      });

      // 计算命中率
      const accessStats = await this.memoryCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalAccess: { $sum: "$stats.accessCount" },
              totalHits: { $sum: "$stats.hitCount" },
            },
          },
        ])
        .toArray();

      const hitRate =
        accessStats.length > 0 && accessStats[0].totalAccess > 0
          ? accessStats[0].totalHits / accessStats[0].totalAccess
          : 0;

      return {
        total,
        byTier: {
          short_term: shortTerm,
          mid_term: midTerm,
          long_term: longTerm,
        },
        byConfidence: {
          high: highConfidence,
          medium: mediumConfidence,
          low: lowConfidence,
        },
        expired,
        validated,
        hitRate,
      };
    } catch (error) {
      console.error("获取记忆系统统计信息时出错:", error);
      return {
        total: 0,
        byTier: {
          short_term: 0,
          mid_term: 0,
          long_term: 0,
        },
        byConfidence: {
          high: 0,
          medium: 0,
          low: 0,
        },
        expired: 0,
        validated: 0,
        hitRate: 0,
      };
    }
  }
}

// 导出单例实例
export const memoryManager = (db: Db) => new MemoryManager(db);

// 保留原来的事件类型枚举，用于兼容
export enum EntityEvent {
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",
  TRANSFERRED = "transferred",
  STATUS_CHANGED = "statusChanged",
  NOTE_ADDED = "noteAdded",
}

// 兼容性类，模拟原来的MemoryModel
export class MemoryModel {
  private db: Db;
  private memoryManagerInstance: ReturnType<typeof memoryManager>;

  constructor(db: Db) {
    this.db = db;
    this.memoryManagerInstance = memoryManager(db);
  }

  // 兼容旧的processEntityEvent方法
  async processEntityEvent(event: {
    entityType: string;
    entityId: ObjectId;
    eventType: EntityEvent;
    timestamp: Date;
    details?: any;
  }): Promise<number> {
    try {
      // 将旧的事件类型映射到新的处理方法
      let updateType: "created" | "updated" | "deleted";

      switch (event.eventType) {
        case EntityEvent.CREATED:
          updateType = "created";
          break;
        case EntityEvent.DELETED:
          updateType = "deleted";
          break;
        default:
          updateType = "updated";
          break;
      }

      // 调用新的处理方法
      return await this.memoryManagerInstance.handleEntityUpdate(
        event.entityType,
        event.entityId,
        updateType
      );
    } catch (error) {
      console.error("处理实体事件时出错:", error);
      return 0;
    }
  }

  // 兼容其他可能被调用的方法
  async findMemory(
    toolName: string,
    params: any,
    threshold?: number
  ): Promise<any> {
    return this.memoryManagerInstance.findMemory(toolName, params, {
      confidenceThreshold: threshold,
    });
  }

  async storeMemory(toolName: string, params: any, result: any): Promise<any> {
    return this.memoryManagerInstance.storeMemory(toolName, params, result);
  }

  async updateAccessInfo(memoryId: ObjectId): Promise<void> {
    return this.memoryManagerInstance.updateMemoryStats(memoryId);
  }

  // 添加清理过期记忆的方法
  async cleanupExpiredMemories(olderThan: Date = new Date()): Promise<number> {
    return this.memoryManagerInstance.cleanupExpiredMemories();
  }

  // 添加验证记忆的方法
  async verifyMemory(memoryId: ObjectId | string): Promise<boolean> {
    return this.memoryManagerInstance.validateMemory(memoryId);
  }

  // 添加使记忆失效的方法
  async invalidateMemory(memoryId: ObjectId | string): Promise<boolean> {
    return this.memoryManagerInstance.invalidateMemory(memoryId);
  }
}

// 新增函数，根据分析生成标签
function generateTags(analysis: any): string[] {
  const tags: string[] = [];

  if (analysis.metadata.itemCategory) {
    tags.push(`item:${analysis.metadata.itemCategory}`);
  }

  if (analysis.metadata.routeType) {
    tags.push(`route:${analysis.metadata.routeType}`);
  }

  // 添加复杂度标签
  if (analysis.complexityScore >= 6) {
    tags.push("high_complexity");
  } else if (analysis.complexityScore >= 3) {
    tags.push("medium_complexity");
  } else {
    tags.push("low_complexity");
  }

  return tags;
}
