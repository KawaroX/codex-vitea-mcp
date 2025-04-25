import { type Collection, ObjectId, type Db } from "mongodb";
import { Task, StructuredNote, ensureObjectId } from "./types.js";
import { MemoryModel, EntityEvent } from "./memory.js";

interface TaskWithStructuredNotes extends Omit<Task, "notes"> {
  notes: StructuredNote[];
}

/**
 * 任务数据操作类
 */
export class TasksModel {
  private tasksCollection: Collection<TaskWithStructuredNotes>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.tasksCollection = db.collection<TaskWithStructuredNotes>("tasks");
  }

  /**
   * 获取所有任务
   * @param query 可选的查询条件
   * @param limit 限制返回任务数量
   * @returns 任务列表
   */
  async getAllTasks(
    query: Record<string, any> = {},
    limit: number = 20
  ): Promise<TaskWithStructuredNotes[]> {
    return await this.tasksCollection
      .find(query)
      .sort({ dueDate: 1, priority: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * 获取待办任务
   * @param limit 限制返回任务数量
   * @returns 待办任务列表
   */
  async getPendingTasks(
    limit: number = 10
  ): Promise<TaskWithStructuredNotes[]> {
    return await this.tasksCollection
      .find({ status: { $ne: "已完成" } })
      .sort({ dueDate: 1, priority: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * 获取即将到期的任务
   * @param daysThreshold 到期天数阈值
   * @returns 即将到期的任务列表
   */
  async getUpcomingTasks(
    daysThreshold: number = 7
  ): Promise<TaskWithStructuredNotes[]> {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + daysThreshold);

    return await this.tasksCollection
      .find({
        status: { $ne: "已完成" },
        dueDate: {
          $gte: now,
          $lte: thresholdDate,
        },
      })
      .sort({ dueDate: 1, priority: -1 })
      .toArray();
  }

  /**
   * 获取逾期任务
   * @returns 逾期任务列表
   */
  async getOverdueTasks(): Promise<TaskWithStructuredNotes[]> {
    const now = new Date();

    return await this.tasksCollection
      .find({
        status: { $ne: "已完成" },
        dueDate: { $lt: now },
      })
      .sort({ dueDate: 1, priority: -1 })
      .toArray();
  }

  /**
   * 根据ID获取任务
   * @param taskId 任务ID
   * @returns 任务对象
   */
  async getTaskById(taskId: ObjectId): Promise<TaskWithStructuredNotes | null> {
    const id = ensureObjectId(taskId);
    return await this.tasksCollection.findOne({ _id: id });
  }

  /**
   * 根据标签查找任务
   * @param tag 标签
   * @returns 匹配的任务列表
   */
  async getTasksByTag(tag: string): Promise<TaskWithStructuredNotes[]> {
    return await this.tasksCollection
      .find({ tags: tag })
      .sort({ dueDate: 1, priority: -1 })
      .toArray();
  }

  /**
   * 根据任务类型查找任务
   * @param taskType 任务类型
   * @returns 匹配的任务列表
   */
  async getTasksByType(taskType: string): Promise<TaskWithStructuredNotes[]> {
    return await this.tasksCollection
      .find({ taskType: { $regex: taskType, $options: "i" } })
      .sort({ dueDate: 1, priority: -1 })
      .toArray();
  }

  /**
   * 添加新任务
   * @param taskData 任务数据
   * @returns 操作结果
   */
  async addTask(taskData: Partial<TaskWithStructuredNotes>): Promise<{
    success: boolean;
    task?: TaskWithStructuredNotes;
    error?: string;
  }> {
    try {
      // 检查是否有截止日期并计算是否逾期
      if (taskData.dueDate) {
        const dueDate = new Date(taskData.dueDate);
        const now = new Date();
        taskData.isOverdue = dueDate < now;
      }

      // 添加通用字段
      const newTask: Partial<TaskWithStructuredNotes> = {
        ...taskData,
        status: taskData.status || "未开始",
        syncedToNotion: false,
        modifiedSinceSync: true,
        lastSync: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 插入新任务
      const result = await this.tasksCollection.insertOne(newTask as any);

      if (!result.acknowledged) {
        return { success: false, error: "添加任务失败" };
      }

      // 查询插入的任务
      const insertedTask = await this.tasksCollection.findOne({
        _id: result.insertedId,
      });

      return {
        success: true,
        task: insertedTask || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `添加任务失败: ${error}`,
      };
    }
  }

  /**
   * 更新任务状态
   * @param taskId 任务ID
   * @param newStatus 新状态
   * @param comment 可选备注
   * @returns 更新结果
   */
  async updateTaskStatus(
    taskId: string | ObjectId,
    newStatus: string,
    comment: string | null = null
  ): Promise<{
    success: boolean;
    task?: TaskWithStructuredNotes;
    error?: string;
  }> {
    try {
      const id = ensureObjectId(taskId);

      // 查询任务
      const task = await this.getTaskById(id);

      if (!task) {
        return { success: false, error: "未找到任务" };
      }

      const oldStatus = task.status;

      // 如果状态没有变化，则直接返回
      if (oldStatus === newStatus) {
        return {
          success: true,
          task,
          error: "任务状态未变化",
        };
      }

      // 创建更新对象
      const updateObj: any = {
        status: newStatus,
        updatedAt: new Date(),
        modifiedSinceSync: true,
      };

      // 如果标记为完成，更新完成时间和逾期状态
      if (newStatus === "已完成") {
        const now = new Date();
        updateObj.completedAt = now;

        // 检查是否逾期
        if (task.dueDate && new Date(task.dueDate) < now) {
          updateObj.isOverdue = true;
        } else {
          updateObj.isOverdue = false;
        }
      }

      // 创建状态变更备注
      const timestamp = new Date().toISOString().split("T")[0]; // 格式为 YYYY-MM-DD
      const noteContent =
        comment || `任务状态由"${oldStatus}"变更为"${newStatus}"`;

      const noteObj = {
        timestamp: timestamp,
        content: noteContent,
        metadata: {
          type: "status_change",
          previousStatus: oldStatus,
          newStatus: newStatus,
          tags: ["status_change"],
        },
      };

      // 确保notes数组存在且类型正确
      if (!task.notes || typeof task.notes === "string") {
        await this.tasksCollection.updateOne(
          { _id: id },
          { $set: { notes: [] } }
        );
      }

      // 添加备注并更新状态
      await this.tasksCollection.updateOne(
        { _id: id },
        {
          $push: { notes: noteObj },
          $set: updateObj,
        }
      );

      // 查询更新后的任务
      const updatedTask = await this.getTaskById(id);

      const result = {
        success: true,
        task: updatedTask || undefined,
      };

      // 生成任务状态更新事件用于更新 Memory
      try {
        const event = {
          entityType: "task",
          entityId: id,
          eventType: EntityEvent.STATUS_CHANGED,
          timestamp: new Date(),
          details: {
            previousStatus: oldStatus,
            newStatus: newStatus,
          },
        };

        // 发布事件
        const memoryManager = new MemoryModel(this.db);
        await memoryManager.processEntityEvent(event);
      } catch (eventError) {
        console.error("处理 Memory 事件失败:", eventError);
        // 事件处理失败不影响主流程
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `更新任务状态失败: ${error}`,
      };
    }
  }

  /**
   * 更新任务
   * @param taskId 任务ID
   * @param updateData 要更新的字段
   * @returns 更新结果
   */
  async updateTask(
    taskId: string | ObjectId,
    updateData: Partial<TaskWithStructuredNotes>
  ): Promise<{
    success: boolean;
    task?: TaskWithStructuredNotes;
    error?: string;
  }> {
    try {
      const id = ensureObjectId(taskId);

      // 获取原始任务
      const originalTask = await this.getTaskById(id);
      if (!originalTask) {
        return { success: false, error: "未找到任务" };
      }

      // 删除不应该直接更新的字段
      const { _id, createdAt, ...safeUpdateData } = updateData as any;

      // 检查是否更新了截止日期并重新计算是否逾期
      if (safeUpdateData.dueDate) {
        const dueDate = new Date(safeUpdateData.dueDate);
        const now = new Date();
        safeUpdateData.isOverdue = dueDate < now;
      }

      // 添加更新时间和同步标记
      const dataToUpdate = {
        ...safeUpdateData,
        updatedAt: new Date(),
        modifiedSinceSync: true,
      };

      // 执行更新
      const result = await this.tasksCollection.updateOne(
        { _id: id },
        { $set: dataToUpdate }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: "未找到任务" };
      }

      // 查询更新后的任务
      const updatedTask = await this.getTaskById(id);

      const updateResult = {
        success: true,
        task: updatedTask || undefined,
      };

      // 生成任务更新事件用于更新 Memory
      try {
        const event = {
          entityType: "task",
          entityId: id,
          eventType: EntityEvent.UPDATED,
          timestamp: new Date(),
          details: {
            previousTask: {
              name: originalTask.name,
              status: originalTask.status,
              dueDate: originalTask.dueDate,
              priority: originalTask.priority,
            },
            updatedFields: Object.keys(safeUpdateData),
          },
        };

        // 发布事件
        const memoryManager = new MemoryModel(this.db);
        await memoryManager.processEntityEvent(event);
      } catch (eventError) {
        console.error("处理 Memory 事件失败:", eventError);
        // 事件处理失败不影响主流程
      }

      return updateResult;
    } catch (error) {
      return {
        success: false,
        error: `更新任务失败: ${error}`,
      };
    }
  }

  /**
   * 获取有效的任务状态列表
   * @returns 状态列表
   */
  async getValidTaskStatuses(): Promise<string[]> {
    return ["未开始", "进行中", "已完成", "已取消", "已暂停", "待审核"];
  }

  /**
   * 删除任务
   * @param taskId 任务ID
   * @returns 操作结果
   */
  async deleteTask(taskId: string | ObjectId): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const id = ensureObjectId(taskId);

      // 删除任务
      const result = await this.tasksCollection.deleteOne({ _id: id });

      if (result.deletedCount === 0) {
        return { success: false, error: "未找到任务" };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `删除任务失败: ${error}`,
      };
    }
  }

  /**
   * 获取所有任务标签
   * @returns 任务标签列表
   */
  async getAllTaskTags(): Promise<string[]> {
    const result = await this.tasksCollection
      .aggregate([
        { $unwind: "$tags" },
        { $group: { _id: "$tags" } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return result.map((item) => item._id);
  }

  /**
   * 获取所有任务类型
   * @returns 任务类型列表
   */
  async getAllTaskTypes(): Promise<string[]> {
    const result = await this.tasksCollection
      .aggregate([
        { $group: { _id: "$taskType" } },
        { $match: { _id: { $ne: null } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return result.map((item) => item._id);
  }
}
