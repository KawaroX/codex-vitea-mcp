import { Db, ObjectId } from "mongodb";
import { TasksModel } from "../model/tasks.js";
import {
  ScheduleModel,
  NewScheduledEventData,
} from "../model/scheduleModel.js";
import {
  ProReminisceManager,
  LearnParams,
} from "../features/reminisce/proReminisceManager.js"; // 调整路径
import {
  Task,
  ScheduledEvent,
  ensureObjectId,
  EnhancedMemoryUnit,
  MemoryPattern,
} from "../model/types.js";

export interface ConfirmScheduleSlotParams {
  taskId: string | ObjectId;
  startTime: string | Date; // ISO string or Date object
  endTime: string | Date; // ISO string or Date object
  title?: string; // (可选) 事件标题，默认为任务名称
  description?: string; // (可选) 事件描述，默认为任务描述
  eventType?: string; // (可选) 事件类型，默认为 "task"
  status?: ScheduledEvent["status"]; // (可选) 事件状态，默认为 "confirmed"
  userId?: string; // (可选) 用于Reminisce学习上下文
  // 可以添加更多从 ScheduleProposal.candidateSlots[n].scoreDetails.reasoning 获取的决策理由
  schedulingReasoning?: string[];
}

/**
 * PlanConfirmScheduleSlotTool 类
 * 用于确认并创建一个之前由 proposeTaskSchedule 提议的日程时段。
 */
export class PlanConfirmScheduleSlotTool {
  private tasksModel: TasksModel;
  private scheduleModel: ScheduleModel;
  private reminisceManager: ProReminisceManager;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.tasksModel = new TasksModel(db);
    this.scheduleModel = new ScheduleModel(db);
    this.reminisceManager = new ProReminisceManager(db);
  }

  /**
   * 执行确认并创建日程事件的操作。
   * @param params 确认日程时段所需的参数。
   * @returns 操作结果，包含新创建的日程事件。
   */
  async execute(params: ConfirmScheduleSlotParams): Promise<{
    success: boolean;
    scheduledEvent?: ScheduledEvent;
    taskUpdated?: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        taskId: rawTaskId,
        startTime: rawStartTime,
        endTime: rawEndTime,
        title,
        description,
        eventType,
        status,
        userId,
        schedulingReasoning,
      } = params;

      if (!rawTaskId || !rawStartTime || !rawEndTime) {
        return {
          success: false,
          error: "缺少必需参数：taskId, startTime, 或 endTime。",
        };
      }

      const taskId = ensureObjectId(rawTaskId);
      const task = await this.tasksModel.getTaskById(taskId);
      if (!task) {
        return { success: false, error: `未找到任务 ID: ${taskId.toString()}` };
      }

      const startTime = new Date(rawStartTime);
      const endTime = new Date(rawEndTime);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return { success: false, error: "无效的开始或结束时间格式。" };
      }
      if (endTime <= startTime) {
        return { success: false, error: "结束时间必须晚于开始时间。" };
      }

      // 检查时间冲突 (可选，因为 proposeTaskSchedule 可能已经做过初步筛选)
      // 但最终确认时再检查一次是更安全的做法
      const conflict = await this.scheduleModel.hasTimeConflict(
        startTime,
        endTime
      );
      if (conflict) {
        // LLM/AI 客户端可以根据此错误决定是否尝试 reschedule 或选择其他方案
        return {
          success: false,
          error: `选定时间段 ${startTime.toLocaleString()} - ${endTime.toLocaleString()} 与现有日程冲突。`,
        };
      }

      const eventData: NewScheduledEventData = {
        title: title || `任务: ${task.name}`,
        startTime,
        endTime,
        eventType: eventType || "task",
        taskId: task._id,
        description: description || task.description,
        status: status || "confirmed", // 确认创建时，状态通常是 confirmed
        // 可以从 task 或其他地方获取参与者、地点等信息
      };

      const scheduledEvent = await this.scheduleModel.createEvent(eventData);
      if (!scheduledEvent) {
        return { success: false, error: "创建日程事件失败。" };
      }

      // (可选) 更新任务的 scheduledStartTime 和 scheduledEndTime
      let taskUpdated = false;
      const taskUpdateResult = await this.tasksModel.updateTask(task._id, {
        $set: {
          scheduledStartTime: scheduledEvent.startTime,
          scheduledEndTime: scheduledEvent.endTime,
          status: task.status === "待办" ? "已计划" : task.status, // 如果是待办，可以更新为“已计划”
        },
      });
      if (taskUpdateResult.success) {
        taskUpdated = true;
      } else {
        console.warn(
          `PlanConfirmScheduleSlotTool: 更新任务 ${task._id} 的计划时间失败。`
        );
      }

      // 学习这个成功的调度决策 (与 proposeTaskSchedule 中的学习逻辑类似，但这里是最终确认)
      const learnPattern: MemoryPattern = {
        type: "task_scheduling_confirmation",
        intent: "record_confirmed_schedule",
        entitiesInvolved: [{ type: "task", identifier: task._id.toString() }],
      };
      const learnResult = {
        taskId: task._id.toString(),
        taskName: task.name,
        taskType: task.taskType,
        scheduledEventId: scheduledEvent._id.toString(),
        confirmedStartTime: scheduledEvent.startTime.toISOString(),
        confirmedEndTime: scheduledEvent.endTime.toISOString(),
        schedulingReasoning: schedulingReasoning, // 从LLM决策中获取的理由
      };
      this.reminisceManager
        .learn({
          pattern: learnPattern,
          result: learnResult,
          summary: `任务 "${
            task.name
          }" 已确认安排在 ${scheduledEvent.startTime.toLocaleString()}`,
          entities: [
            { id: task._id, type: "task", name: task.name },
            { id: scheduledEvent._id, type: "schedule_event" },
          ],
          importance: 0.7, // 确认的日程比较重要
          context: {
            userId: userId,
            sourceTool: "PlanConfirmScheduleSlotTool",
          },
        })
        .catch((error) => {
          console.error(
            "PlanConfirmScheduleSlotTool: Error learning scheduling confirmation:",
            error
          );
        });

      return {
        success: true,
        scheduledEvent,
        taskUpdated,
        message: `任务 "${
          task.name
        }" 已成功安排在 ${scheduledEvent.startTime.toLocaleString()} - ${scheduledEvent.endTime.toLocaleString()}.`,
      };
    } catch (error: any) {
      console.error("PlanConfirmScheduleSlotTool: Error in execute():", error);
      return {
        success: false,
        error: `确认日程时段时发生错误: ${error.message || error}`,
      };
    }
  }
}
