// src/model/memory.ts
import { ObjectId, Collection, Db } from "mongodb";
import { processEntityEvent as processEvent } from "../utils/eventSystem.js";
import {
  abstractQueryParameters,
  calculateExpiryTime,
  calculateInitialConfidence,
  calculateParameterSimilarity,
  calculateStorageTier,
  extractEntityDependencies,
  generateTags,
  generateTemplateHash,
} from "../utils/memoryUtils.js";
import { ensureObjectId } from "./types.js";

/**
 * Memory 存储层级
 */
export enum MemoryTier {
  SHORT_TERM = "short_term", // 短期记忆（默认1天）
  MID_TERM = "mid_term", // 中期记忆（默认2周）
  LONG_TERM = "long_term", // 长期记忆（默认无限期）
}

/**
 * 实体依赖关系类型
 */
export enum EntityRelationshipType {
  PRIMARY = "primary", // 主要依赖
  SECONDARY = "secondary", // 次要依赖
  REFERENCE = "reference", // 引用关系
}

/**
 * 匹配查询结果
 */
async function findMatchingMemory(
  toolName: string,
  params: any,
  memoryCollection: any,
  confidenceThreshold: number = 0.7
): Promise<Memory | null> {
  // 1. 抽象查询参数
  const abstractParams = abstractQueryParameters(toolName, params);

  // 2. 生成模板哈希
  const templateHash = generateTemplateHash(toolName, abstractParams);

  // 3. 根据工具名称和模板哈希进行精确查询
  const exactMatches = await memoryCollection
    .find({
      "queryInfo.toolName": toolName,
      "queryInfo.templateHash": templateHash,
      "resultInfo.confidence": { $gte: confidenceThreshold },
    })
    .sort({ "resultInfo.confidence": -1 })
    .toArray();

  // 4. 检查是否有过期的匹配
  const validMatches = exactMatches.filter(
    (memory: Memory) =>
      !memory.classification.expiresAt ||
      memory.classification.expiresAt > new Date()
  );

  // 5. 如果没有有效匹配，返回 null
  if (validMatches.length === 0) {
    return null;
  }

  // 6. 计算参数相似度并排序
  const rankedMatches = validMatches
    .map((memory: Memory) => ({
      memory,
      similarity: calculateParameterSimilarity(
        params,
        memory.queryInfo.originalParameters
      ),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  // 7. 返回最佳匹配
  return rankedMatches[0].memory;
}

/**
 * Memory 数据模型接口
 */
export interface Memory {
  _id: ObjectId;
  // 查询信息
  queryInfo: {
    toolName: string; // 工具名称
    templateHash: string; // 查询模板哈希
    originalParameters: any; // 原始参数
    abstractParameters: any; // 抽象后的参数
  };
  // 结果信息
  resultInfo: {
    result: any; // 查询结果
    timestamp: Date; // 查询时间
    validated: boolean; // 是否已验证
    confidence: number; // 置信度(0-1)
  };
  // 关联实体
  entityDependencies: Array<{
    entityType: string; // 实体类型(item, location, contact, task, biodata)
    entityId: ObjectId; // 实体ID
    relationshipType: EntityRelationshipType; // 关系类型
  }>;
  // 使用统计
  usageStats: {
    accessCount: number; // 访问次数
    lastAccessed: Date; // 最后访问时间
    createdAt: Date; // 创建时间
  };
  // 分类信息
  classification: {
    tier: MemoryTier; // 存储层级
    expiresAt: Date | null; // 过期时间
    tags: string[]; // 标签
  };
}

/**
 * 实体变更事件类型
 */
export enum EntityEvent {
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",
  TRANSFERRED = "transferred", // 物品特有
  STATUS_CHANGED = "statusChanged", // 任务特有
  NOTE_ADDED = "noteAdded", // 通用
}

/**
 * 实体变更事件接口
 */
export interface EntityChangeEvent {
  entityType: string; // 实体类型
  entityId: ObjectId; // 实体ID
  eventType: EntityEvent; // 事件类型
  timestamp: Date; // 事件时间
  details?: any; // 事件详情
}

/**
 * Memory 管理类
 */
export class MemoryModel {
  private memoryCollection: Collection<Memory>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.memoryCollection = db.collection<Memory>("memories");
  }

  /**
   * 创建索引，确保性能
   */
  async createIndexes(): Promise<void> {
    // 创建查询模板哈希索引
    await this.memoryCollection.createIndex({ "queryInfo.templateHash": 1 });

    // 创建工具名称索引
    await this.memoryCollection.createIndex({ "queryInfo.toolName": 1 });

    // 创建实体依赖复合索引
    await this.memoryCollection.createIndex({
      "entityDependencies.entityType": 1,
      "entityDependencies.entityId": 1,
    });

    // 创建过期时间索引
    await this.memoryCollection.createIndex({ "classification.expiresAt": 1 });

    // 创建置信度索引
    await this.memoryCollection.createIndex({ "resultInfo.confidence": 1 });

    // 创建层级索引
    await this.memoryCollection.createIndex({ "classification.tier": 1 });

    // 创建最后访问时间索引
    await this.memoryCollection.createIndex({ "usageStats.lastAccessed": 1 });
  }

  /**
   * 存储查询结果到 Memory
   */
  async storeMemory(
    toolName: string,
    parameters: any,
    result: any
  ): Promise<Memory> {
    // 1. 抽象查询参数
    const abstractParams = abstractQueryParameters(toolName, parameters);

    // 2. 提取实体依赖
    const dependencies = extractEntityDependencies(toolName, parameters);

    // 3. 计算初始置信度和过期时间
    const tier = calculateStorageTier(toolName, parameters);
    const initialConfidence = calculateInitialConfidence(toolName);
    const expiresAt = calculateExpiryTime(tier as MemoryTier, toolName);

    // 4. 生成模板哈希
    const templateHash = generateTemplateHash(toolName, abstractParams);

    // 5. 生成标签
    const tags = generateTags(toolName, parameters);

    // 6. 创建 Memory 记录
    const memory: Partial<Memory> = {
      queryInfo: {
        toolName,
        templateHash,
        originalParameters: parameters,
        abstractParameters: abstractParams,
      },
      resultInfo: {
        result,
        timestamp: new Date(),
        validated: false,
        confidence: initialConfidence,
      },
      entityDependencies: dependencies,
      usageStats: {
        accessCount: 1,
        lastAccessed: new Date(),
        createdAt: new Date(),
      },
      classification: {
        tier: tier as MemoryTier,
        expiresAt,
        tags,
      },
    };

    // 7. 插入记录
    const insertResult = await this.memoryCollection.insertOne(
      memory as Memory
    );

    return { ...memory, _id: insertResult.insertedId } as Memory;
  }

  /**
   * 查找匹配的 Memory
   */
  async findMemory(
    toolName: string,
    parameters: any,
    confidenceThreshold: number = 0.7
  ): Promise<Memory | null> {
    return findMatchingMemory(
      toolName,
      parameters,
      this.memoryCollection,
      confidenceThreshold
    );
  }

  /**
   * 更新 Memory 的访问信息
   */
  async updateAccessInfo(memoryId: ObjectId | string): Promise<void> {
    const id = typeof memoryId === "string" ? new ObjectId(memoryId) : memoryId;

    await this.memoryCollection.updateOne(
      { _id: id },
      {
        $inc: { "usageStats.accessCount": 1 },
        $set: { "usageStats.lastAccessed": new Date() },
      }
    );

    // 更新置信度和层级（频繁访问的记忆可能升级）
    await this.updateTierBasedOnUsage(id);
  }

  /**
   * 基于使用频率更新 Memory 层级
   */
  private async updateTierBasedOnUsage(memoryId: ObjectId): Promise<void> {
    const memory = await this.memoryCollection.findOne({ _id: memoryId });

    if (!memory) return;

    // 判断是否应该升级层级
    const { accessCount, createdAt } = memory.usageStats;
    const ageInDays =
      (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // 简单的升级逻辑示例
    let newTier = memory.classification.tier;

    if (
      memory.classification.tier === MemoryTier.SHORT_TERM &&
      (accessCount > 5 || ageInDays > 3)
    ) {
      newTier = MemoryTier.MID_TERM;
    } else if (
      memory.classification.tier === MemoryTier.MID_TERM &&
      (accessCount > 20 || ageInDays > 30)
    ) {
      newTier = MemoryTier.LONG_TERM;
    }

    // 如果层级变更，更新过期时间
    if (newTier !== memory.classification.tier) {
      const newExpiresAt = calculateExpiryTime(
        newTier,
        memory.queryInfo.toolName
      );

      await this.memoryCollection.updateOne(
        { _id: memoryId },
        {
          $set: {
            "classification.tier": newTier,
            "classification.expiresAt": newExpiresAt,
          },
        }
      );
    }
  }

  /**
   * 验证 Memory
   */
  async verifyMemory(memoryId: ObjectId | string): Promise<void> {
    const id = typeof memoryId === "string" ? new ObjectId(memoryId) : memoryId;

    await this.memoryCollection.updateOne(
      { _id: id },
      {
        $set: {
          "resultInfo.validated": true,
          "resultInfo.confidence": 1.0,
        },
      }
    );
  }

  /**
   * 使 Memory 失效
   */
  async invalidateMemory(memoryId: ObjectId | string): Promise<void> {
    const id = typeof memoryId === "string" ? new ObjectId(memoryId) : memoryId;

    await this.memoryCollection.updateOne(
      { _id: id },
      {
        $set: {
          "classification.expiresAt": new Date(),
          "resultInfo.confidence": 0,
        },
      }
    );
  }

  /**
   * 清理过期 Memory
   */
  async cleanupExpiredMemories(olderThan: Date = new Date()): Promise<number> {
    const result = await this.memoryCollection.deleteMany({
      "classification.expiresAt": { $lt: olderThan },
      "resultInfo.confidence": { $lt: 0.2 },
    });

    return result.deletedCount;
  }

  /**
   * 处理实体变更事件
   */
  async processEntityEvent(event: EntityChangeEvent): Promise<number> {
    return processEvent(event, this.memoryCollection);
  }
}
