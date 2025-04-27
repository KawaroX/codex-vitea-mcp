// src/tools/memoryStatus.ts
import { Db } from "mongodb";
import { SchedulerManager } from "../utils/scheduler.js";

/**
 * Memory系统状态工具
 * 用于检查Memory系统的健康状态和统计信息
 */
export class MemoryStatusTool {
  private db: Db;
  private schedulerManager: SchedulerManager;

  constructor(db: Db, schedulerManager: SchedulerManager) {
    this.db = db;
    this.schedulerManager = schedulerManager;
  }

  /**
   * 执行Memory状态检查
   * @param params 参数
   * @returns 状态结果
   */
  async execute(params: { detailed?: boolean }): Promise<{
    success: boolean;
    stats?: any;
    message?: string;
  }> {
    try {
      const { detailed = false } = params;

      // 获取基本统计信息
      const stats = this.schedulerManager.getMemoryStats();

      // 附加性能指标
      const hitCount = stats.hitCount || 0;
      const hitRate =
        stats.total > 0 ? (hitCount / (stats.total * 2)) * 100 : 0;

      stats.performance = {
        hitRate: `${hitRate.toFixed(2)}%`,
        averageConfidence: await this.calculateAverageConfidence(),
        cacheSavings: await this.estimateCacheSavings(),
      };

      // Add necessary properties to avoid TypeScript errors
      const statsWithExtras = {
        ...stats,
        topMemories: [] as any[],
        recentMemories: [] as any[],
        usageTrend: { dailyAccess: [], totalLastWeek: 0 },
      };

      // If needed, add more detail
      if (detailed) {
        // Get top memories
        statsWithExtras.topMemories = await this.getTopMemories(10);

        // Get recent memories
        statsWithExtras.recentMemories = await this.getRecentMemories(5);

        // Get usage trend
        statsWithExtras.usageTrend = await this.getUsageTrend();
      }

      // 构建状态消息
      let statusMessage = `Memory系统状态:\n`;
      statusMessage += `- 总记录数: ${stats.total}\n`;
      statusMessage += `- 层级分布: 短期=${stats.shortTerm}, 中期=${stats.midTerm}, 长期=${stats.longTerm}\n`;
      statusMessage += `- 置信度: 高(>0.8)=${stats.highConfidence}, 中(0.5-0.8)=${stats.mediumConfidence}, 低(<0.5)=${stats.lowConfidence}\n`;
      statusMessage += `- 已验证: ${stats.validated}, 已过期: ${stats.expired}\n`;
      statusMessage += `- 性能: 命中率=${stats.performance.hitRate}, 平均置信度=${stats.performance.averageConfidence}\n`;

      if (stats.lastCleanup) {
        statusMessage += `- 最后清理: ${new Date(
          stats.lastCleanup
        ).toLocaleString()}\n`;
      }

      return {
        success: true,
        stats,
        message: statusMessage,
      };
    } catch (error) {
      console.error("获取Memory状态时出错:", error);
      return {
        success: false,
        message: `获取Memory状态时出错: ${error}`,
      };
    }
  }

  /**
   * 计算平均置信度
   */
  private async calculateAverageConfidence(): Promise<string> {
    try {
      const memoryCollection = this.db.collection("memories");
      const result = await memoryCollection
        .aggregate([
          {
            $group: {
              _id: null,
              avgConfidence: { $avg: "$resultInfo.confidence" },
            },
          },
        ])
        .toArray();

      if (result.length > 0 && result[0].avgConfidence !== null) {
        return result[0].avgConfidence.toFixed(2);
      }

      return "0.00";
    } catch (error) {
      console.error("计算平均置信度时出错:", error);
      return "未知";
    }
  }

  /**
   * 估算缓存节省的时间/资源
   */
  private async estimateCacheSavings(): Promise<string> {
    try {
      const memoryCollection = this.db.collection("memories");

      // 获取总访问次数
      const accessResult = await memoryCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalAccess: { $sum: "$usageStats.accessCount" },
            },
          },
        ])
        .toArray();

      const totalAccess = accessResult[0]?.totalAccess || 0;

      // 假设每次API调用平均耗时200ms
      const savedMilliseconds = totalAccess * 200;

      // 转换为更易读的形式
      if (savedMilliseconds < 60000) {
        return `${Math.round(savedMilliseconds / 1000)}秒`;
      } else if (savedMilliseconds < 3600000) {
        return `${Math.round(savedMilliseconds / 60000)}分钟`;
      } else {
        return `${Math.round(savedMilliseconds / 3600000)}小时`;
      }
    } catch (error) {
      console.error("估算缓存节省时出错:", error);
      return "未知";
    }
  }

  /**
   * 获取最常用的记忆
   */
  private async getTopMemories(limit: number): Promise<any[]> {
    try {
      const memoryCollection = this.db.collection("memories");

      return await memoryCollection
        .find({})
        .sort({ "usageStats.accessCount": -1 })
        .limit(limit)
        .project({
          "queryInfo.toolName": 1,
          "queryInfo.originalParameters": 1,
          "usageStats.accessCount": 1,
          "usageStats.lastAccessed": 1,
          "resultInfo.confidence": 1,
          "classification.tier": 1,
        })
        .toArray();
    } catch (error) {
      console.error("获取最常用记忆时出错:", error);
      return [];
    }
  }

  /**
   * 获取最近添加的记忆
   */
  private async getRecentMemories(limit: number): Promise<any[]> {
    try {
      const memoryCollection = this.db.collection("memories");

      return await memoryCollection
        .find({})
        .sort({ "usageStats.createdAt": -1 })
        .limit(limit)
        .project({
          "queryInfo.toolName": 1,
          "queryInfo.originalParameters": 1,
          "usageStats.createdAt": 1,
          "resultInfo.confidence": 1,
          "classification.tier": 1,
        })
        .toArray();
    } catch (error) {
      console.error("获取最近添加记忆时出错:", error);
      return [];
    }
  }

  /**
   * 获取记忆使用趋势
   */
  private async getUsageTrend(): Promise<any> {
    try {
      const memoryCollection = this.db.collection("memories");

      // 按天统计访问次数
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const dailyAccess = await memoryCollection
        .aggregate([
          {
            $match: {
              "usageStats.lastAccessed": { $gte: lastWeek },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$usageStats.lastAccessed",
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray();

      return {
        dailyAccess,
        totalLastWeek: dailyAccess.reduce((sum, day) => sum + day.count, 0),
      };
    } catch (error) {
      console.error("获取使用趋势时出错:", error);
      return { dailyAccess: [], totalLastWeek: 0 };
    }
  }
}
