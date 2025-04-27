import { Db } from "mongodb";
import { TasksModel } from "../model/tasks.js";
import { Task } from "../model/types.js";

/**
 * 任务创建工具
 * 用于添加新任务到系统
 */
export class CreateTaskTool {
  private tasksModel: TasksModel;

  constructor(db: Db) {
    this.tasksModel = new TasksModel(db);
  }

  /**
   * 执行任务创建
   * @param params 创建参数
   * @returns 创建结果
   */
  async execute(params: {
    name: string;
    status?: string;
    dueDate?: string;
    priority?: string;
    taskType?: string;
    description?: string;
    workloadLevel?: string;
    assignee?: string;
    tags?: string[];
    note?: string;
  }): Promise<{
    success: boolean;
    task?: Task;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        name,
        status = "未开始",
        dueDate,
        priority,
        taskType,
        description,
        workloadLevel,
        assignee,
        tags = [],
        note,
      } = params;

      // 验证参数
      if (!name) {
        return {
          success: false,
          message: "必须提供任务名称",
        };
      }

      // 验证状态有效性
      const validStatuses = await this.tasksModel.getValidTaskStatuses();
      if (!validStatuses.includes(status)) {
        return {
          success: false,
          message: `无效的任务状态: "${status}"。有效状态包括: ${validStatuses.join(
            ", "
          )}`,
        };
      }

      // 准备任务数据
      const taskData: Partial<Task> = {
        name,
        status,
        priority,
        taskType,
        description,
        workloadLevel,
        assignee,
        tags,
      };

      // 处理截止日期
      if (dueDate) {
        taskData.dueDate = new Date(dueDate);

        // 计算是否逾期
        const now = new Date();
        taskData.isOverdue = new Date(dueDate) < now;
      }

      // 添加结构化注释
      let structuredNotes;
      if (note) {
        structuredNotes = [
          {
            timestamp: new Date().toISOString().split("T")[0],
            content: note,
            metadata: {
              type: "creation",
              tags: ["creation"],
            },
          },
        ];
      } else {
        structuredNotes = [];
      }

      // 创建任务
      const result = await this.tasksModel.addTask({
        ...taskData,
        notes: structuredNotes,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      let successMessage = `成功创建任务"${result.task?.name}"`;

      const details = [];
      if (status && status !== "未开始") {
        details.push(`状态: "${status}"`);
      }

      if (dueDate) {
        const date = new Date(dueDate);
        details.push(`截止日期: ${date.toLocaleDateString()}`);
      }

      if (priority) {
        details.push(`优先级: "${priority}"`);
      }

      if (taskType) {
        details.push(`类型: "${taskType}"`);
      }

      if (details.length > 0) {
        successMessage += `，${details.join("，")}`;
      }

      return {
        success: true,
        task: result.task,
        message: successMessage,
      };
    } catch (error) {
      console.error("创建任务时出错:", error);
      return {
        success: false,
        message: `创建任务时出错: ${error}`,
      };
    }
  }
}
