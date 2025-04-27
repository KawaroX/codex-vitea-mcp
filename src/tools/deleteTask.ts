import { ObjectId, Db } from "mongodb";
import { TasksModel } from "../model/tasks.js";

/**
 * 任务删除工具
 * 用于删除系统中的任务
 */
export class DeleteTaskTool {
  private tasksModel: TasksModel;

  constructor(db: Db) {
    this.tasksModel = new TasksModel(db);
  }

  /**
   * 执行任务删除
   * @param params 删除参数
   * @returns 删除结果
   */
  async execute(params: { taskId?: string; taskName?: string }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const { taskId, taskName } = params;

      // 验证参数 - 需要提供任务ID或名称
      if (!taskId && !taskName) {
        return {
          success: false,
          message: "必须提供任务ID或名称",
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

      // 查询任务详情，用于返回消息
      const task = await this.tasksModel.getTaskById(
        new ObjectId(resolvedTaskId!)
      );
      if (!task) {
        return {
          success: false,
          message: `未找到ID为"${resolvedTaskId}"的任务`,
        };
      }

      // 执行删除
      const result = await this.tasksModel.deleteTask(resolvedTaskId!);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      const successMessage = `成功删除任务"${task.name}"`;

      return {
        success: true,
        message: successMessage,
      };
    } catch (error) {
      console.error("删除任务时出错:", error);
      return {
        success: false,
        message: `删除任务时出错: ${error}`,
      };
    }
  }

  /**
   * 根据名称解析任务ID
   * @param taskName 任务名称
   * @returns 任务ID
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
