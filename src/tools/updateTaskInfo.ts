// src/tools/updateTaskInfo.ts
import { ObjectId, Db } from "mongodb";
import { TasksModel } from "../model/tasks.js";
import { Task, StructuredNote } from "../model/types.js";

// 使用与TasksModel相同的接口定义
interface TaskWithStructuredNotes extends Omit<Task, "notes"> {
  notes: StructuredNote[];
}

/**
 * 任务信息更新工具
 * 用于更新任务的基本信息（状态更新除外）
 */
export class UpdateTaskInfoTool {
  private tasksModel: TasksModel;

  constructor(db: Db) {
    this.tasksModel = new TasksModel(db);
  }

  /**
   * 执行任务信息更新
   * @param params 更新参数
   * @returns 更新结果
   */
  async execute(params: {
    taskId?: string;
    taskName?: string;
    newName?: string;
    newDueDate?: string;
    newPriority?: string;
    newTaskType?: string;
    newDescription?: string;
    newWorkloadLevel?: string;
    newAssignee?: string;
    newTags?: string[];
    note?: string;
  }): Promise<{
    success: boolean;
    task?: Task;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        taskId,
        taskName,
        newName,
        newDueDate,
        newPriority,
        newTaskType,
        newDescription,
        newWorkloadLevel,
        newAssignee,
        newTags,
        note,
      } = params;

      // 验证参数 - 需要提供任务ID或名称
      if (!taskId && !taskName) {
        return {
          success: false,
          message: "必须提供任务ID或名称",
        };
      }

      // 验证参数 - 需要提供至少一个要更新的字段
      if (
        !newName &&
        !newDueDate &&
        !newPriority &&
        !newTaskType &&
        !newDescription &&
        !newWorkloadLevel &&
        !newAssignee &&
        !newTags
      ) {
        return {
          success: false,
          message: "必须提供至少一个要更新的字段",
        };
      }

      // 解析任务ID
      let resolvedTaskId = taskId;
      if (!resolvedTaskId && taskName) {
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
            return {
              success: false,
              message: `未找到名为"${taskName}"的任务`,
            };
          }

          resolvedTaskId = fuzzyTasks[0]._id.toString();
        } else {
          resolvedTaskId = tasks[0]._id.toString();
        }
      }

      // 查询任务当前信息
      const task = await this.tasksModel.getTaskById(
        new ObjectId(resolvedTaskId!)
      );
      if (!task) {
        return {
          success: false,
          message: `未找到ID为"${resolvedTaskId}"的任务`,
        };
      }

      // 构建更新对象
      const updateData: Partial<TaskWithStructuredNotes> = {};

      if (newName) updateData.name = newName;
      if (newPriority) updateData.priority = newPriority;
      if (newTaskType) updateData.taskType = newTaskType;
      if (newDescription) updateData.description = newDescription;
      if (newWorkloadLevel) updateData.workloadLevel = newWorkloadLevel;
      if (newAssignee) updateData.assignee = newAssignee;
      if (newTags) updateData.tags = newTags;

      // 处理截止日期
      if (newDueDate) {
        updateData.dueDate = new Date(newDueDate);

        // 计算是否逾期
        const now = new Date();
        updateData.isOverdue = new Date(newDueDate) < now;
      }

      // 执行更新
      const result = await this.tasksModel.updateTask(
        resolvedTaskId!,
        updateData
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 如果提供了备注，添加结构化备注
      if (note && result.task) {
        const noteObj: StructuredNote = {
          timestamp: new Date().toISOString().split("T")[0],
          content: note,
          metadata: {
            type: "update_info",
            tags: ["update_info"],
            updatedFields: Object.keys(updateData),
          },
        };

        // 在任务模型中没有直接添加备注的方法，需要手动更新
        await this.tasksModel["tasksCollection"].updateOne(
          { _id: new ObjectId(resolvedTaskId) },
          {
            $push: { notes: noteObj },
            $set: {
              updatedAt: new Date(),
              modifiedSinceSync: true,
            },
          }
        );

        // 重新查询任务以获取更新的数据
        const updatedTask = await this.tasksModel.getTaskById(
          new ObjectId(resolvedTaskId!)
        );
        if (updatedTask) {
          result.task = updatedTask;
        }
      }

      // 构建成功消息
      let successMessage = `成功更新任务"${task.name}"的信息`;
      const updatedFields = [];

      if (newName) updatedFields.push(`名称: "${newName}"`);
      if (newDueDate) {
        const date = new Date(newDueDate);
        updatedFields.push(`截止日期: ${date.toLocaleDateString()}`);
      }
      if (newPriority) updatedFields.push(`优先级: "${newPriority}"`);
      if (newTaskType) updatedFields.push(`类型: "${newTaskType}"`);
      if (newAssignee) updatedFields.push(`负责人: "${newAssignee}"`);

      if (updatedFields.length > 0) {
        successMessage += `，更新了: ${updatedFields.join(", ")}`;
      }

      return {
        success: true,
        task: result.task,
        message: successMessage,
      };
    } catch (error) {
      console.error("更新任务信息时出错:", error);
      return {
        success: false,
        message: `更新任务信息时出错: ${error}`,
      };
    }
  }
}
