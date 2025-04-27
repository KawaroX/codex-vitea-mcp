import { Db } from "mongodb";
import { memoryManager } from "../model/memory.js";
import { contextManager } from "../utils/ContextManager.js";

/**
 * Memory系统管理工具
 */
export class MemoryManagerTool {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * 执行Memory系统维护操作
   * @param params 参数
   * @returns 操作结果
   */
  async execute(params: {
    action: string;
    memoryId?: string;
    confidenceThreshold?: number;
    days?: number;
  }): Promise<{
    success: boolean;
    stats?: any;
    message?: string;
    error?: string;
  }> {
    try {
      const { action, memoryId, confidenceThreshold = 0.5, days = 30 } = params;

      // 获取Memory管理器
      const memory = memoryManager(this.db);

      switch (action) {
        case "get_stats":
          // 获取统计信息
          const stats = await memory.getMemoryStats();

          // 获取活跃上下文数量
          const contexts = contextManager.getAllContexts();

          return {
            success: true,
            stats: {
              ...stats,
              activeContexts: contexts.length,
            },
          };

        case "validate_memory":
          // 验证记忆
          if (!memoryId) {
            return {
              success: false,
              error: "Memory ID不能为空",
            };
          }

          const validated = await memory.validateMemory(memoryId);

          return {
            success: validated,
            message: validated
              ? `已验证Memory: ${memoryId}`
              : `验证Memory失败: ${memoryId}`,
          };

        case "invalidate_memory":
          // 使记忆失效
          if (!memoryId) {
            return {
              success: false,
              error: "Memory ID不能为空",
            };
          }

          const invalidated = await memory.invalidateMemory(memoryId);

          return {
            success: invalidated,
            message: invalidated
              ? `已使Memory失效: ${memoryId}`
              : `使Memory失效失败: ${memoryId}`,
          };

        case "cleanup_expired":
          // 清理过期记忆
          const cleaned = await memory.cleanupExpiredMemories();

          return {
            success: true,
            message: `已清理${cleaned}条过期记忆`,
          };

        default:
          return {
            success: false,
            error: `未知操作: ${action}`,
          };
      }
    } catch (error) {
      console.error("执行Memory系统维护操作时出错:", error);
      return {
        success: false,
        error: `执行Memory系统维护操作时出错: ${error}`,
      };
    }
  }
}
