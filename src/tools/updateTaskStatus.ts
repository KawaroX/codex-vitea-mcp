import { Db } from "mongodb";
import { TasksModel } from "../model/tasks.js";
import { Task } from "../model/types.js";

/**
 * 任务状态流转工具
 * 用于更新任务状态并记录状态变更历史
 */
export class UpdateTaskStatusTool {
  private tasksModel: TasksModel;

  constructor(db: Db) {
    this.tasksModel = new TasksModel(db);
  }

  /**
   * 执行任务状态更新
   * @param params 更新参数
   * @returns 更新结果
   */
  async execute(params: {
    taskId?: string;
    taskName?: string;
    newStatus: string;
    comment?: string;
  }): Promise<{
    success: boolean;
    task?: Task;
    message?: string;
    error?: string;
  }> {
    try {
      const { taskId, taskName, newStatus, comment } = params;

      // 验证参数 - 需要提供任务ID或名称
      if (!taskId && !taskName) {
        return {
          success: false,
          message: "必须提供任务ID或名称",
        };
      }

      // 验证参数 - 需要提供新状态
      if (!newStatus) {
        return {
          success: false,
          message: "必须提供新状态",
        };
      }

      // 验证状态有效性
      const validStatuses = await this.tasksModel.getValidTaskStatuses();
      if (!validStatuses.includes(newStatus)) {
        return {
          success: false,
          message: `无效的任务状态: "${newStatus}"。有效状态包括: ${validStatuses.join(
            ", "
          )}`,
        };
      }

      // 解析任务ID
      let resolvedTaskId = taskId;
      if (!resolvedTaskId && taskName) {
        resolvedTaskId = await this.resolveTaskIdByName(taskName);

        if (!resolvedTaskId) {
          return {
            success: false,
            message: `未找到名为"${taskName}"的任务`,
          };
        }
      }

      // 执行状态更新
      const result = await this.tasksModel.updateTaskStatus(
        resolvedTaskId!,
        newStatus,
        comment || null
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      const task = result.task!;
      let successMessage = `成功将任务"${task.name}"的状态更新为"${newStatus}"`;

      // 添加任务信息
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        successMessage += `，截止日期: ${dueDate.toLocaleDateString()}`;
      }

      if (task.priority) {
        successMessage += `，优先级: ${task.priority}`;
      }

      return {
        success: true,
        task: result.task,
        message: successMessage,
      };
    } catch (error) {
      console.error("更新任务状态时出错:", error);
      return {
        success: false,
        message: `更新任务状态时出错: ${error}`,
      };
    }
  }

  /**
   * 根据名称解析任务ID
   */
  private async resolveTaskIdByName(taskName: string): Promise<string | null> {
    try {
      const tasks = await this.tasksModel.getAllTasks(
        { name: { $regex: `^${taskName}$`, $options: "i" } },
        1
      );

      if (tasks.length === 0) {
        // 尝试模糊搜索
        const fuzzyTasks = await this.tasksModel.getAllTasks(
          { name: { $regex: taskName, $options: "i" } },
          1
        );

        if (fuzzyTasks.length === 0) {
          return null;
        }

        return fuzzyTasks[0]._id.toString();
      }

      return tasks[0]._id.toString();
    } catch (error) {
      console.error("解析任务名称时出错:", error);
      return null;
    }
  }
}
