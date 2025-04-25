// src/tools/memoryMaintenance.ts
import { Db } from "mongodb";
import { MemoryModel } from "../model/memory.js";

/**
 * Memory系统维护工具
 * 用于手动管理Memory系统
 */
export class MemoryMaintenanceTool {
  private db: Db;
  private memoryModel: MemoryModel;

  constructor(db: Db) {
    this.db = db;
    this.memoryModel = new MemoryModel(db);
  }

  /**
   * 执行Memory维护操作
   * @param params 参数
   * @returns 操作结果
   */
  async execute(params: {
    action: "cleanup_expired" | "cleanup_old" | "verify" | "invalidate";
    memoryId?: string;
    confidenceThreshold?: number;
    ageInDays?: number;
  }): Promise<{
    success: boolean;
    count?: number;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        action,
        memoryId,
        confidenceThreshold = 0.5,
        ageInDays = 30,
      } = params;

      switch (action) {
        case "cleanup_expired":
          // 清理过期Memory
          const expiredCount = await this.memoryModel.cleanupExpiredMemories();
          return {
            success: true,
            count: expiredCount,
            message: `已清理 ${expiredCount} 条过期Memory`,
          };

        case "cleanup_old":
          // 清理旧Memory
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - ageInDays);

          const memoryCollection = this.db.collection("memories");
          const result = await memoryCollection.deleteMany({
            "usageStats.lastAccessed": { $lt: cutoffDate },
            "resultInfo.confidence": { $lt: confidenceThreshold },
            "classification.tier": { $ne: "long_term" }, // 不删除长期Memory
          });

          return {
            success: true,
            count: result.deletedCount,
            message: `已清理 ${result.deletedCount} 条超过 ${ageInDays} 天未使用且置信度低于 ${confidenceThreshold} 的Memory`,
          };

        case "verify":
          // 验证特定Memory
          if (!memoryId) {
            return {
              success: false,
              error: "验证Memory需要提供memoryId",
            };
          }

          await this.memoryModel.verifyMemory(memoryId);
          return {
            success: true,
            message: `已验证Memory ID: ${memoryId}`,
          };

        case "invalidate":
          // 使特定Memory失效
          if (!memoryId) {
            return {
              success: false,
              error: "使Memory失效需要提供memoryId",
            };
          }

          await this.memoryModel.invalidateMemory(memoryId);
          return {
            success: true,
            message: `已使Memory ID: ${memoryId} 失效`,
          };

        default:
          return {
            success: false,
            error: `未知操作: ${action}`,
          };
      }
    } catch (error) {
      console.error("执行Memory维护操作时出错:", error);
      return {
        success: false,
        error: `执行Memory维护操作时出错: ${error}`,
      };
    }
  }
}
