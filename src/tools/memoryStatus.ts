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

      // 获取Memory统计信息
      const stats = this.schedulerManager.getMemoryStats();

      // 如果需要详细信息，添加内存使用情况
      if (detailed) {
        const memoryCollection = this.db.collection("memories");

        // 获取按工具分组的统计
        const toolStats = await memoryCollection
          .aggregate([
            { $group: { _id: "$queryInfo.toolName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ])
          .toArray();

        // 获取按实体类型分组的统计
        const entityStats = await memoryCollection
          .aggregate([
            { $unwind: "$entityDependencies" },
            {
              $group: {
                _id: "$entityDependencies.entityType",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ])
          .toArray();

        // 添加到统计信息
        stats.toolBreakdown = toolStats;
        stats.entityBreakdown = entityStats;
      }

      // 构建状态消息
      let statusMessage = `Memory系统状态:\n`;
      statusMessage += `- 总记录数: ${stats.total}\n`;
      statusMessage += `- 层级分布: 短期=${stats.shortTerm}, 中期=${stats.midTerm}, 长期=${stats.longTerm}\n`;
      statusMessage += `- 置信度: 高(>0.8)=${stats.highConfidence}, 低(<0.5)=${stats.lowConfidence}\n`;
      statusMessage += `- 已验证: ${stats.validated}\n`;
      statusMessage += `- 已过期: ${stats.expired}\n`;

      if (stats.lastCleanup) {
        statusMessage += `- 最后清理: ${stats.lastCleanup.toLocaleString()}\n`;
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
}
