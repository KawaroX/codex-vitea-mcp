// src/utils/scheduler.ts
import { MemoryModel } from "../model/memory.js";
import { Db } from "mongodb";

/**
 * 定时任务间隔配置（毫秒）
 */
const INTERVALS = {
  CLEANUP_EXPIRED_MEMORIES: 3600000, // 1小时
  CLEANUP_OLD_MEMORIES: 86400000, // 24小时
  STATS_UPDATE: 300000, // 5分钟
};

/**
 * 定时任务管理器
 */
export class SchedulerManager {
  private memoryModel: MemoryModel;
  private db: Db;
  private memoryCollection: any;
  private schedulers: Map<string, NodeJS.Timeout> = new Map();
  private memoryStats: {
    total: number;
    shortTerm: number;
    midTerm: number;
    longTerm: number;
    expired: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    validated: number;
    hitCount: number;
    lastCleanup: Date | null;
    lastStatsUpdate: Date | null;
    toolBreakdown?: any[];
    entityBreakdown?: any[];
    toolDistribution?: any[];
    performance?: {
      hitRate: string;
      averageConfidence: string;
      cacheSavings: string;
    };
  } = {
    total: 0,
    shortTerm: 0,
    midTerm: 0,
    longTerm: 0,
    expired: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    validated: 0,
    hitCount: 0,
    lastCleanup: null,
    lastStatsUpdate: null,
  };

  constructor(db: Db) {
    this.db = db;
    this.memoryModel = new MemoryModel(db);
    this.memoryCollection = db.collection("memories");
  }

  /**
   * 启动定时任务
   */
  startSchedulers() {
    // 清理过期Memory的定时任务
    this.schedulers.set(
      "cleanupExpiredMemories",
      setInterval(
        () => this.cleanupExpiredMemories(),
        INTERVALS.CLEANUP_EXPIRED_MEMORIES
      )
    );

    // 清理长期未使用的旧Memory
    this.schedulers.set(
      "cleanupOldMemories",
      setInterval(
        () => this.cleanupOldMemories(),
        INTERVALS.CLEANUP_OLD_MEMORIES
      )
    );

    // 更新Memory统计信息
    this.schedulers.set(
      "updateMemoryStats",
      setInterval(() => this.updateMemoryStats(), INTERVALS.STATS_UPDATE)
    );

    // 立即执行一次统计更新
    this.updateMemoryStats();

    console.warn("Memory系统定时任务已启动");
  }

  /**
   * 停止所有定时任务
   */
  stopSchedulers() {
    this.schedulers.forEach((scheduler) => {
      clearInterval(scheduler);
    });
    this.schedulers.clear();
    console.warn("Memory系统定时任务已停止");
  }

  /**
   * 清理过期的Memory
   */
  // 更新 cleanupExpiredMemories 方法
  async cleanupExpiredMemories() {
    try {
      console.warn("正在清理过期Memory...");

      // 1. 清理已过期且置信度低的Memory
      const deleteResult = await this.memoryCollection.deleteMany({
        $or: [
          // 过期且置信度低于0.3的直接删除
          {
            "classification.expiresAt": { $lt: new Date() },
            "resultInfo.confidence": { $lt: 0.3 },
          },
          // 长期未访问且不是长期缓存
          {
            "usageStats.lastAccessed": {
              $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30天前
            },
            "classification.tier": { $ne: "long_term" },
            "resultInfo.confidence": { $lt: 0.5 },
          },
        ],
      });

      console.warn(`已删除 ${deleteResult.deletedCount} 条过期Memory`);

      // 2. 将过期但置信度高的记录降低置信度而非删除
      const updateResult = await this.memoryCollection.updateMany(
        {
          "classification.expiresAt": { $lt: new Date() },
          "resultInfo.confidence": { $gte: 0.3 },
        },
        {
          $set: {
            "resultInfo.confidence": 0.3,
            "classification.tier": "short_term", // 降级为短期记忆
            "classification.expiresAt": new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ), // 延长7天
          },
        }
      );

      console.warn(
        `已降级 ${updateResult.modifiedCount} 条过期但高置信度的Memory`
      );

      // 更新最后清理时间
      this.memoryStats.lastCleanup = new Date();

      // 更新统计信息
      await this.updateMemoryStats();
    } catch (error) {
      console.error("清理过期Memory时出错:", error);
    }
  }

  /**
   * 清理长期未使用的旧Memory
   */
  async cleanupOldMemories() {
    try {
      console.warn("正在清理长期未使用的Memory...");

      // 设置截止日期：90天前
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      // 查找长期未访问的Memory
      const memoryCollection = this.db.collection("memories");
      const result = await memoryCollection.deleteMany({
        "usageStats.lastAccessed": { $lt: cutoffDate },
        "resultInfo.confidence": { $lt: 0.5 },
        "classification.tier": { $ne: "long_term" }, // 不删除长期Memory
      });

      console.warn(`已清理 ${result.deletedCount} 条长期未使用的Memory`);
    } catch (error) {
      console.error("清理旧Memory时出错:", error);
    }
  }

  /**
   * 更新Memory统计信息
   */
  async updateMemoryStats() {
    try {
      const memoryCollection = this.db.collection("memories");

      // 获取总数
      this.memoryStats.total = await memoryCollection.countDocuments();

      // 获取各层级数量
      this.memoryStats.shortTerm = await memoryCollection.countDocuments({
        "classification.tier": "short_term",
      });
      this.memoryStats.midTerm = await memoryCollection.countDocuments({
        "classification.tier": "mid_term",
      });
      this.memoryStats.longTerm = await memoryCollection.countDocuments({
        "classification.tier": "long_term",
      });

      // 获取过期数量
      this.memoryStats.expired = await memoryCollection.countDocuments({
        "classification.expiresAt": { $lt: new Date() },
      });

      // 获取置信度信息
      this.memoryStats.highConfidence = await memoryCollection.countDocuments({
        "resultInfo.confidence": { $gte: 0.8 },
      });
      this.memoryStats.mediumConfidence = await memoryCollection.countDocuments(
        {
          "resultInfo.confidence": { $gte: 0.5, $lt: 0.8 },
        }
      );
      this.memoryStats.lowConfidence = await memoryCollection.countDocuments({
        "resultInfo.confidence": { $lt: 0.5 },
      });

      // 获取已验证数量
      this.memoryStats.validated = await memoryCollection.countDocuments({
        "resultInfo.validated": true,
      });

      // 获取命中次数信息
      this.memoryStats.hitCount = await memoryCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalHits: { $sum: "$usageStats.accessCount" },
            },
          },
        ])
        .toArray()
        .then((result) => result[0]?.totalHits || 0);

      // 获取每个工具的缓存数量
      this.memoryStats.toolDistribution = await memoryCollection
        .aggregate([
          { $group: { _id: "$queryInfo.toolName", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray();

      // 更新最后统计时间
      this.memoryStats.lastStatsUpdate = new Date();

      console.warn("Memory统计信息已更新");
    } catch (error) {
      console.error("更新Memory统计信息时出错:", error);
    }
  }

  /**
   * 获取Memory统计信息
   */
  getMemoryStats() {
    return {
      ...this.memoryStats,
      now: new Date(),
    };
  }
}
