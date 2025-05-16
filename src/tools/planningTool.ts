import { Db, ObjectId } from "mongodb";
import {
  IntelligentPlanner,
  SchedulingConstraints,
  CurrentUserContext,
  TimeSlot,
} from "../features/planning/intelligentPlanner.js"; // 调整路径
import { LearnParams } from "../features/reminisce/proReminisceManager.js";
import {
  ensureObjectId,
  Task,
  ScheduledEvent,
  MemoryPattern,
} from "../model/types.js"; // 确保导入

// 定义 learnSchedulingPreference 方法的参数类型
export interface LearnSchedulingPreferenceParams {
  userId?: string; // 可选，如果您的系统是多用户的
  preferenceType:
    | "timing"
    | "task_grouping"
    | "energy_matching"
    | "general_note"
    | string; // 偏好类型
  description: string; // 用户对偏好的自然语言描述
  pattern?: any; // (可选) 更结构化的模式，用于 Reminisce
  details?: any; // (可选) 关于偏好的具体细节
  importance?: number; // (可选) 用户定义的偏好重要性 (0-1)
}

/**
 * PlanningTool 类
 * 作为MCP工具，提供与 IntelligentPlanner 交互的接口，用于任务调度和日程规划。
 */
export class PlanningTool {
  private intelligentPlanner: IntelligentPlanner;
  private db: Db; // db 传递给 IntelligentPlanner

  constructor(db: Db) {
    this.db = db;
    this.intelligentPlanner = new IntelligentPlanner(db);
  }

  /**
   * MCP工具方法：为指定任务提议一个或多个执行时间段。
   * @param params 参数对象
   * @returns 操作结果，包含提议或错误信息。
   */
  async proposeTaskSchedule(params: {
    taskId: string | ObjectId;
    constraints?: SchedulingConstraints;
  }): Promise<any> {
    // 返回类型可以更具体，例如 ScheduleProposal
    try {
      if (!params.taskId) {
        return { success: false, error: "提议任务调度时，'taskId' 是必需的。" };
      }
      const result = await this.intelligentPlanner.proposeTaskSchedule(
        params.taskId,
        params.constraints
      );
      return result; // IntelligentPlanner.proposeTaskSchedule 已经返回了 {success, ...} 结构
    } catch (error: any) {
      console.error("PlanningTool: Error in proposeTaskSchedule():", error);
      return {
        success: false,
        error: `提议任务调度时发生错误: ${error.message || error}`,
      };
    }
  }

  /**
   * MCP工具方法：根据当前上下文，建议用户接下来应该执行的任务。
   * @param params 参数对象，包含 CurrentUserContext
   * @returns 操作结果，包含建议的任务或错误信息。
   */
  async suggestNextTask(params: { context: CurrentUserContext }): Promise<any> {
    // 返回类型可以更具体，例如 SuggestedTask | null
    try {
      if (!params.context || !params.context.currentTime) {
        return {
          success: false,
          error: "建议下一个任务时，'context.currentTime' 是必需的。",
        };
      }
      const result = await this.intelligentPlanner.suggestNextTask(
        params.context
      );
      if (result) {
        return { success: true, suggestion: result };
      } else {
        return {
          success: true,
          suggestion: null,
          message: "目前没有特别建议的任务。",
        };
      }
    } catch (error: any) {
      console.error("PlanningTool: Error in suggestNextTask():", error);
      return {
        success: false,
        error: `建议下一个任务时发生错误: ${error.message || error}`,
      };
    }
  }

  /**
   * MCP工具方法：为指定日期生成每日议程。
   * @param params 参数对象
   * @returns 操作结果，包含每日议程或错误信息。
   */
  async generateDailyAgenda(params: {
    date: string | Date; // 接受字符串或Date对象
    userId?: string;
  }): Promise<any> {
    // 返回类型可以更具体，例如 DailyAgenda
    try {
      if (!params.date) {
        return { success: false, error: "生成每日议程时，'date' 是必需的。" };
      }
      const dateObj =
        typeof params.date === "string" ? new Date(params.date) : params.date;
      if (isNaN(dateObj.getTime())) {
        return { success: false, error: "无效的日期格式。" };
      }
      const result = await this.intelligentPlanner.generateDailyAgenda(
        dateObj,
        params.userId
      );
      return { success: true, agenda: result };
    } catch (error: any) {
      console.error("PlanningTool: Error in generateDailyAgenda():", error);
      return {
        success: false,
        error: `生成每日议程时发生错误: ${error.message || error}`,
      };
    }
  }

  /**
   * MCP工具方法：重新调度一个已安排的事件/任务。
   * @param params 参数对象
   * @returns 操作结果，指示是否成功。
   */
  async rescheduleEvent(params: {
    eventOrTaskId: string | ObjectId;
    newTime?: { startTime: string | Date; endTime: string | Date };
    reason?: string;
  }): Promise<any> {
    // 返回类型可以更具体，例如 { success: boolean; message?: string; error?: string }
    try {
      if (!params.eventOrTaskId) {
        return {
          success: false,
          error: "重新调度事件时，'eventOrTaskId' 是必需的。",
        };
      }
      let newTimeParsed;
      if (params.newTime) {
        const startTime =
          typeof params.newTime.startTime === "string"
            ? new Date(params.newTime.startTime)
            : params.newTime.startTime;
        const endTime =
          typeof params.newTime.endTime === "string"
            ? new Date(params.newTime.endTime)
            : params.newTime.endTime;
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          return { success: false, error: "无效的新时间格式。" };
        }
        if (endTime <= startTime) {
          return { success: false, error: "结束时间必须晚于开始时间。" };
        }
        newTimeParsed = { startTime, endTime };
      }

      const success = await this.intelligentPlanner.rescheduleEvent(
        params.eventOrTaskId,
        newTimeParsed,
        params.reason
      );
      if (success) {
        return { success: true, message: "事件已成功重新调度。" };
      } else {
        // IntelligentPlanner.rescheduleEvent 内部可能会打印更具体的错误日志
        return {
          success: false,
          error: "重新调度事件失败，可能是时间冲突或事件未找到。",
        };
      }
    } catch (error: any) {
      console.error("PlanningTool: Error in rescheduleEvent():", error);
      return {
        success: false,
        error: `重新调度事件时发生错误: ${error.message || error}`,
      };
    }
  }

  /**
   * MCP工具方法：查找指定时长和日期范围内的可用时间段。
   * @param params 参数对象
   * @returns 操作结果，包含可用时间段列表或错误信息。
   */
  async findAvailableTimeSlots(params: {
    durationMinutes: number;
    dateRange?: { start: string | Date; end: string | Date };
    constraints?: Pick<
      SchedulingConstraints,
      "preferredTimeOfDay" | "preferredDaysOfWeek"
    > & {
      workingHours?: {
        startHour: number;
        endHour: number;
        daysOfWeek?: number[];
      };
      minGapMinutes?: number;
    };
  }): Promise<any> {
    // 返回类型可以更具体，例如 { success: boolean; slots?: TimeSlot[]; error?: string }
    try {
      if (!params.durationMinutes || params.durationMinutes <= 0) {
        return {
          success: false,
          error: "查找可用时间段时，'durationMinutes' 必须是正数。",
        };
      }
      let dateRangeParsed;
      if (params.dateRange) {
        const start =
          typeof params.dateRange.start === "string"
            ? new Date(params.dateRange.start)
            : params.dateRange.start;
        const end =
          typeof params.dateRange.end === "string"
            ? new Date(params.dateRange.end)
            : params.dateRange.end;
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return { success: false, error: "无效的日期范围格式。" };
        }
        if (end <= start) {
          return {
            success: false,
            error: "日期范围的结束时间必须晚于开始时间。",
          };
        }
        dateRangeParsed = { start, end };
      }

      const slots = await this.intelligentPlanner.findAvailableTimeSlots(
        params.durationMinutes,
        dateRangeParsed,
        params.constraints
      );
      return { success: true, slots: slots, count: slots.length };
    } catch (error: any) {
      console.error("PlanningTool: Error in findAvailableTimeSlots():", error);
      return {
        success: false,
        error: `查找可用时间段时发生错误: ${error.message || error}`,
      };
    }
  }

  /**
   * MCP工具方法：学习用户的日程安排偏好。
   * 这些偏好将被存储到Reminisce系统中，以供IntelligentPlanner在未来规划时参考。
   * @param params 包含偏好描述等信息的对象。
   * @returns 操作结果。
   */
  async learnSchedulingPreference(
    params: LearnSchedulingPreferenceParams
  ): Promise<{
    success: boolean;
    memoryId?: string;
    message?: string;
    error?: string;
  }> {
    try {
      if (!params.preferenceType || !params.description) {
        return {
          success: false,
          error: "学习日程偏好时，'preferenceType' 和 'description' 是必需的。",
        };
      }

      const pattern: MemoryPattern = params.pattern || {
        type: "user_scheduling_preference",
        intent: `record_${params.preferenceType}_preference`,
        keywords: params.description.toLowerCase().split(/\s+/).slice(0, 5), // 简单提取关键词
      };

      const resultData = {
        preferenceType: params.preferenceType,
        description: params.description,
        details: params.details, // 用户提供的具体细节
        // 可以添加更多结构化数据，如果 preferenceType 是已知的几种
      };

      const learnParams: LearnParams = {
        pattern: pattern,
        result: resultData,
        summary: `用户日程偏好 (${
          params.preferenceType
        }): ${params.description.substring(0, 50)}...`,
        entities: params.userId
          ? [
              {
                id: ensureObjectId(params.userId),
                type: "user",
                role: "subject_of_preference",
              },
            ]
          : [],
        importance: params.importance !== undefined ? params.importance : 0.7, // 用户偏好通常比较重要
        confidence: 1.0, // 用户直接陈述的，可信度高
        tier: "long", // 用户偏好应该是长期记忆
        context: {
          sourceTool: "PlanningTool.learnSchedulingPreference",
          userInput: params.description,
          userId: params.userId,
        },
      };

      // 调用 ProReminisceManager 的 learn 方法
      const learnedMemory = await this.intelligentPlanner[
        "reminisceManager"
      ].learn(learnParams); // Accessing via planner

      if (learnedMemory) {
        return {
          success: true,
          memoryId: learnedMemory._id.toString(),
          message: "成功学习了新的日程安排偏好。",
        };
      } else {
        return {
          success: false,
          error: "学习日程偏好失败，未能存储到记忆系统。",
        };
      }
    } catch (error: any) {
      console.error(
        "PlanningTool: Error in learnSchedulingPreference():",
        error
      );
      return {
        success: false,
        error: `学习日程偏好时发生错误: ${error.message || error}`,
      };
    }
  }
}
