import { Db, ObjectId, UpdateFilter } from "mongodb"; // Added UpdateFilter
// Ensure these are correctly exported from proReminisceManager.ts
import {
  ProReminisceManager,
  LearnParams,
  RecallParams,
  EntityReference, // Assuming EntityReference is also exported
} from "../features/reminisce/proReminisceManager.js";
import { EnhancedMemoryUnit, ensureObjectId } from "../model/types.js";

/**
 * ReminisceTool 类
 * 作为MCP工具，提供与 ProReminisceManager 交互的接口，用于学习和回忆记忆。
 */
export class ReminisceTool {
  private proReminisceManager: ProReminisceManager;
  private db: Db; // db is kept for now, though ProReminisceManager handles model interaction

  constructor(db: Db) {
    this.db = db;
    this.proReminisceManager = new ProReminisceManager(db);
  }

  /**
   * MCP工具方法：学习新的信息并存为记忆。
   * @param params 参数对象，符合 LearnParams 接口
   * @returns 操作结果
   */
  async learn(params: LearnParams): Promise<{
    success: boolean;
    memoryId?: string;
    message?: string;
    error?: string;
    memory?: EnhancedMemoryUnit;
  }> {
    try {
      if (!params.pattern || !params.result) {
        return {
          success: false,
          error: "学习记忆时，'pattern' 和 'result' 参数是必需的。",
        };
      }
      const newMemory = await this.proReminisceManager.learn(params);
      if (newMemory) {
        return {
          success: true,
          memoryId: newMemory._id.toString(),
          message: `成功学习并存储了新的记忆 (ID: ${newMemory._id.toString()}).`,
          memory: newMemory,
        };
      } else {
        return {
          success: false,
          error: "学习记忆失败，未能存储到Reminisce系统。",
        };
      }
    } catch (error: any) {
      console.error("ReminisceTool: Error in learn():", error);
      return {
        success: false,
        error: `学习记忆时发生错误: ${error.message || error}`,
      };
    }
  }

  /**
   * MCP工具方法：根据提供的参数回忆相关的记忆。
   * @param params 参数对象，符合 RecallParams 接口
   * @returns 操作结果
   */
  async recall(params: RecallParams): Promise<{
    success: boolean;
    memories?: EnhancedMemoryUnit[];
    count?: number;
    message?: string;
    error?: string;
  }> {
    try {
      if (
        !params.pattern &&
        !params.textQuery &&
        (!params.entities || params.entities.length === 0)
      ) {
        return {
          success: false,
          error:
            "回忆记忆时，至少需要提供 'pattern', 'textQuery', 或 'entities' 中的一个参数。",
        };
      }
      const recalledMemories = await this.proReminisceManager.recall(params);
      // ProReminisceManager.recall now returns an array, so recalledMemories will not be null/undefined itself
      return {
        success: true,
        memories: recalledMemories,
        count: recalledMemories.length,
        message:
          recalledMemories.length > 0
            ? `成功回忆起 ${recalledMemories.length} 条相关记忆.`
            : "未能回忆起任何相关记忆，但查询成功执行。",
      };
    } catch (error: any) {
      console.error("ReminisceTool: Error in recall():", error);
      return {
        success: false,
        error: `回忆记忆时发生错误: ${error.message || error}`,
        memories: [], // Return empty array on error
        count: 0,
      };
    }
  }

  /**
   * MCP工具方法：管理特定记忆的元数据。
   * @param params 参数对象
   */
  async manageMemory(params: {
    memoryId: string | ObjectId;
    action:
      | "update_importance"
      | "update_confidence"
      | "change_tier"
      | "add_tag"
      | "remove_tag"
      | "archive"
      | "unarchive";
    value?: any;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    memory?: EnhancedMemoryUnit;
  }> {
    try {
      const { memoryId, action, value } = params;
      const id = ensureObjectId(memoryId);
      let result: {
        success: boolean;
        memory?: EnhancedMemoryUnit | null;
        message?: string;
        error?: string;
      };

      switch (action) {
        case "update_importance":
          if (typeof value !== "number" || value < 0 || value > 1) {
            return {
              success: false,
              error: "重要性评分必须是0到1之间的数字。",
            };
          }
          result = await this.proReminisceManager.updateMemoryImportance(
            id,
            value
          );
          break;
        case "update_confidence":
          if (typeof value !== "number" || value < 0 || value > 1) {
            return {
              success: false,
              error: "可信度评分必须是0到1之间的数字。",
            };
          }
          result = await this.proReminisceManager.updateMemoryConfidence(
            id,
            value
          );
          break;
        case "change_tier":
          if (
            typeof value !== "string" ||
            !["short", "medium", "long", "archived"].includes(value)
          ) {
            return { success: false, error: "无效的记忆层级。" };
          }
          result = await this.proReminisceManager.changeMemoryTier(id, value);
          break;
        case "add_tag":
          if (typeof value !== "string" || !value.trim()) {
            return { success: false, error: "标签不能为空字符串。" };
          }
          result = await this.proReminisceManager.addTagToMemory(
            id,
            value.trim()
          );
          break;
        case "remove_tag":
          if (typeof value !== "string" || !value.trim()) {
            return { success: false, error: "标签不能为空字符串。" };
          }
          result = await this.proReminisceManager.removeTagFromMemory(
            id,
            value.trim()
          );
          break;
        case "archive":
          result = await this.proReminisceManager.archiveMemory(id);
          break;
        case "unarchive":
          result = await this.proReminisceManager.unarchiveMemory(
            id,
            (value as string) || "medium"
          ); // value can be the target tier
          break;
        default:
          return { success: false, error: `未知的记忆管理操作: ${action}` };
      }

      if (result.success) {
        return {
          success: true,
          message:
            result.message ||
            `记忆 (ID: ${id.toString()}) 已成功执行操作: ${action}.`,
          memory: result.memory || undefined,
        };
      } else {
        return {
          success: false,
          error: result.error || `执行记忆管理操作 '${action}' 失败。`,
        };
      }
    } catch (error: any) {
      console.error("ReminisceTool: Error in manageMemory():", error);
      return {
        success: false,
        error: `管理记忆时发生错误: ${error.message || error}`,
      };
    }
  }

  // Removed the private get reminisceModel() accessor
}
