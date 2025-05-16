import {
  type Collection,
  ObjectId,
  type Db,
  Filter,
  UpdateFilter,
} from "mongodb";
import {
  Task,
  StructuredNote,
  ensureObjectId,
  RequiredResource,
  SyncFields,
  MemoryPattern,
} from "./types.js";
import {
  ProReminisceManager,
  LearnParams,
} from "../features/reminisce/proReminisceManager.js"; // Ensure this path is correct

export type NewTaskData = Partial<
  Omit<Task, "_id" | "createdAt" | "updatedAt" | keyof SyncFields>
>;

export class TasksModel {
  private tasksCollection: Collection<Task>;
  private db: Db;
  private reminisceManager: ProReminisceManager;

  constructor(db: Db) {
    this.db = db;
    this.tasksCollection = db.collection<Task>("tasks");
    this.reminisceManager = new ProReminisceManager(db); // Initialize here
    this._ensureIndexes();
  }

  private async _ensureIndexes(): Promise<void> {
    try {
      await this.tasksCollection.createIndex({
        status: 1,
        dueDate: 1,
        priority: -1,
      });
      await this.tasksCollection.createIndex({ tags: 1 });
      await this.tasksCollection.createIndex({ taskType: 1 });
      await this.tasksCollection.createIndex(
        { projectId: 1 },
        { sparse: true }
      );
      await this.tasksCollection.createIndex(
        { assigneeId: 1 },
        { sparse: true }
      );
      await this.tasksCollection.createIndex(
        { dependencies: 1 },
        { sparse: true }
      );
      await this.tasksCollection.createIndex(
        { importanceScore: -1 },
        { sparse: true }
      );
      await this.tasksCollection.createIndex(
        { urgencyScore: -1 },
        { sparse: true }
      );
      await this.tasksCollection.createIndex(
        { scheduledStartTime: 1 },
        { sparse: true }
      );
      console.log("TasksModel: Indexes for 'tasks' collection ensured.");
    } catch (error) {
      console.error(
        "TasksModel: Error ensuring indexes for 'tasks' collection:",
        error
      );
    }
  }

  async getAllTasks(
    query: Filter<Task> = {},
    limit: number = 20
  ): Promise<Task[]> {
    return await this.tasksCollection
      .find(query)
      .sort({ dueDate: 1, priority: -1 })
      .limit(limit)
      .toArray();
  }

  async getPendingTasks(limit: number = 10): Promise<Task[]> {
    return await this.tasksCollection
      .find({ status: { $nin: ["已完成", "已取消"] } })
      .sort({ urgencyScore: -1, importanceScore: -1, dueDate: 1, priority: -1 })
      .limit(limit)
      .toArray();
  }

  async getUpcomingTasks(daysThreshold: number = 7): Promise<Task[]> {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + daysThreshold);
    return await this.tasksCollection
      .find({
        status: { $nin: ["已完成", "已取消"] },
        dueDate: { $gte: now, $lte: thresholdDate },
      })
      .sort({ dueDate: 1, urgencyScore: -1, importanceScore: -1 })
      .toArray();
  }

  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    return await this.tasksCollection
      .find({
        status: { $nin: ["已完成", "已取消"] },
        dueDate: { $lt: now },
        completionDate: { $exists: false },
      })
      .sort({ dueDate: 1, urgencyScore: -1, importanceScore: -1 })
      .toArray();
  }

  async getTaskById(taskId: ObjectId | string): Promise<Task | null> {
    const id = ensureObjectId(taskId);
    return await this.tasksCollection.findOne({ _id: id });
  }

  async getTasksByTag(tag: string): Promise<Task[]> {
    return await this.tasksCollection
      .find({ tags: tag })
      .sort({ dueDate: 1, priority: -1 })
      .toArray();
  }

  async getTasksByType(taskType: string): Promise<Task[]> {
    return await this.tasksCollection
      .find({ taskType: { $regex: taskType, $options: "i" } })
      .sort({ dueDate: 1, priority: -1 })
      .toArray();
  }

  async addTask(taskData: NewTaskData): Promise<{
    success: boolean;
    task?: Task;
    error?: string;
  }> {
    try {
      const now = new Date();
      let processedNotes: StructuredNote[] = [];
      if (typeof taskData.notes === "string") {
        processedNotes.push({
          timestamp: now.toISOString().split("T")[0],
          content: taskData.notes,
        });
      } else if (Array.isArray(taskData.notes)) {
        processedNotes = taskData.notes as StructuredNote[];
      }

      const newTaskDocument: Omit<Task, "_id"> = {
        name: taskData.name || "未命名任务",
        status: taskData.status || "待办",
        createdAt: now,
        updatedAt: now,
        syncedToNotion: false,
        lastSync: null,
        modifiedSinceSync: true,
        description: taskData.description,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
        deadlineType: taskData.deadlineType || "soft",
        scheduledStartTime: taskData.scheduledStartTime
          ? new Date(taskData.scheduledStartTime)
          : undefined,
        scheduledEndTime: taskData.scheduledEndTime
          ? new Date(taskData.scheduledEndTime)
          : undefined,
        estimatedEffortHours: taskData.estimatedEffortHours,
        actualEffortHours: taskData.actualEffortHours,
        completionDate: taskData.completionDate,
        preferredTimeOfDay: taskData.preferredTimeOfDay || "any",
        contextualTags: taskData.contextualTags || [],
        priority: taskData.priority || "中",
        importanceScore: taskData.importanceScore,
        urgencyScore: taskData.urgencyScore,
        taskType: taskData.taskType,
        projectId: taskData.projectId
          ? ensureObjectId(taskData.projectId)
          : undefined,
        dependencies:
          taskData.dependencies?.map((depId) => ensureObjectId(depId)) || [],
        subTasks:
          taskData.subTasks?.map((subId) => ensureObjectId(subId)) || [],
        requiredResources:
          taskData.requiredResources?.map((res) => ({
            ...res,
            resourceId: res.resourceId
              ? ensureObjectId(res.resourceId)
              : undefined,
          })) || [],
        difficulty: taskData.difficulty || "medium",
        energyLevelRequired: taskData.energyLevelRequired || "medium",
        assigneeId: taskData.assigneeId
          ? ensureObjectId(taskData.assigneeId)
          : undefined,
        assigneeName: taskData.assigneeName,
        delegatedTo: taskData.delegatedTo
          ? ensureObjectId(taskData.delegatedTo)
          : undefined,
        isRecurring: taskData.isRecurring || false,
        recurrenceRule: taskData.recurrenceRule,
        nextRecurrenceDate: taskData.nextRecurrenceDate
          ? new Date(taskData.nextRecurrenceDate)
          : undefined,
        isOverdue: false,
        workloadLevel: taskData.workloadLevel,
        tags: taskData.tags || [],
        notes: processedNotes,
        customFields: taskData.customFields,
      };

      if (
        newTaskDocument.dueDate &&
        newTaskDocument.status !== "已完成" &&
        newTaskDocument.status !== "已取消"
      ) {
        newTaskDocument.isOverdue = new Date(newTaskDocument.dueDate) < now;
      } else {
        newTaskDocument.isOverdue = false;
      }

      const result = await this.tasksCollection.insertOne(
        newTaskDocument as Task
      );
      if (!result.insertedId)
        return { success: false, error: "添加任务失败，数据库未返回ID。" };
      const insertedTask = await this.getTaskById(result.insertedId);
      return { success: true, task: insertedTask || undefined };
    } catch (error: any) {
      console.error("TasksModel: Error in addTask():", error);
      return {
        success: false,
        error: `添加任务失败: ${error.message || error}`,
      };
    }
  }

  async updateTaskStatus(
    taskId: string | ObjectId,
    newStatus: string,
    comment: string | null = null
  ): Promise<{
    success: boolean;
    task?: Task;
    error?: string;
    message?: string;
  }> {
    try {
      const id = ensureObjectId(taskId);
      let task = await this.getTaskById(id);

      if (!task) return { success: false, error: "未找到任务" };

      const oldStatus = task.status;
      if (oldStatus === newStatus)
        return { success: true, task, message: "任务状态未变化" };

      const updateSetFields: Partial<Task> = { status: newStatus };
      const now = new Date();

      if (newStatus === "已完成") {
        updateSetFields.completionDate = now;
        updateSetFields.actualEffortHours =
          task.actualEffortHours || task.estimatedEffortHours || undefined;
        updateSetFields.isOverdue = task.dueDate
          ? new Date(task.dueDate) < now
          : false;
      } else if (newStatus !== "已取消" && task.dueDate) {
        updateSetFields.isOverdue = new Date(task.dueDate) < now;
      }

      const noteContent =
        comment || `任务状态由 "${oldStatus}" 变更为 "${newStatus}"`;
      const statusChangeNote: StructuredNote = {
        timestamp: now.toISOString().split("T")[0],
        content: noteContent,
        metadata: {
          type: "status_change",
          previousStatus: oldStatus,
          newStatus: newStatus,
          tags: ["status_change", `from:${oldStatus}`, `to:${newStatus}`],
        },
      };

      let finalUpdateOperation: UpdateFilter<Task> = { $set: updateSetFields };

      if (task.notes && typeof task.notes === "string") {
        if (!finalUpdateOperation.$set) finalUpdateOperation.$set = {};
        (finalUpdateOperation.$set as Partial<Task>).notes = [
          {
            timestamp: task.createdAt.toISOString().split("T")[0],
            content: task.notes,
            metadata: { migrated_from_string: true },
          },
          statusChangeNote,
        ];
      } else {
        // If notes is undefined or already an array, $push is appropriate.
        // Use 'as any' to bypass strict TypeScript checking for $push on a union type field.
        finalUpdateOperation.$push = { notes: statusChangeNote };
      }

      const updateResult = await this.updateTask(id, finalUpdateOperation);

      if (updateResult.success && updateResult.task) {
        if (newStatus === "已完成") {
          const completedTask = updateResult.task;
          const learnPattern: MemoryPattern = {
            type: "task_performance_insight",
            intent: "record_completion_details",
            entitiesInvolved: [
              {
                type: "task_type",
                identifier: completedTask.taskType || "unknown_type",
              },
              {
                type: "user",
                identifier: (
                  completedTask.assigneeId || "default_user"
                ).toString(),
                role: "assignee",
              },
            ],
            customData: {
              difficulty: completedTask.difficulty,
              priority: completedTask.priority,
            },
          };
          const learnResult = {
            taskId: completedTask._id.toString(),
            taskName: completedTask.name,
            taskType: completedTask.taskType,
            estimatedEffortHours: completedTask.estimatedEffortHours,
            actualEffortHours: completedTask.actualEffortHours,
            completionDate: completedTask.completionDate,
            timeOfDayCompleted: completedTask.completionDate?.getHours(),
            dayOfWeekCompleted: completedTask.completionDate?.getDay(),
            contextualTagsAtCompletion: completedTask.contextualTags,
            deviationFromEstimateHours:
              completedTask.actualEffortHours &&
              completedTask.estimatedEffortHours
                ? completedTask.actualEffortHours -
                  completedTask.estimatedEffortHours
                : undefined,
            completedOnTime:
              completedTask.dueDate && completedTask.completionDate
                ? completedTask.completionDate <=
                  new Date(completedTask.dueDate)
                : true,
            difficulty: completedTask.difficulty,
            energyLevelRequired: completedTask.energyLevelRequired,
          };
          const learnParams: LearnParams = {
            pattern: learnPattern,
            result: learnResult,
            summary: `任务 "${completedTask.name}" (${
              completedTask.taskType || "无类型"
            }) 已完成。预估 ${
              completedTask.estimatedEffortHours || "N/A"
            }h, 实际 ${completedTask.actualEffortHours || "N/A"}h.`,
            entities: [
              { id: completedTask._id, type: "task", name: completedTask.name },
            ],
            importance: 0.5,
            confidence: 1.0,
            tier: "long",
            context: {
              sourceTool: "TasksModel.updateTaskStatus",
              sourceEvent: "task_completed",
              userId: (completedTask.assigneeId || "system_user").toString(),
            },
          };
          this.reminisceManager
            .learn(learnParams)
            .then((learnedMemory) => {
              if (learnedMemory)
                console.log(
                  `TasksModel: Successfully learned task completion insight for task ID ${completedTask._id.toString()}. Memory ID: ${learnedMemory._id.toString()}`
                );
              else
                console.warn(
                  `TasksModel: Failed to learn task completion insight for task ID ${completedTask._id.toString()}.`
                );
            })
            .catch((error) =>
              console.error(
                `TasksModel: Error learning task completion insight for ${completedTask._id.toString()}:`,
                error
              )
            );
        }
      }
      return {
        success: updateResult.success,
        task: updateResult.task,
        error: updateResult.error,
      };
    } catch (error: any) {
      console.error("TasksModel: Error in updateTaskStatus():", error);
      return {
        success: false,
        error: `更新任务状态失败: ${error.message || error}`,
      };
    }
  }

  async getValidTaskStatuses(): Promise<string[]> {
    return ["待办", "进行中", "已完成", "已取消", "已暂停", "待审核", "已委派"];
  }

  async updateTask(
    taskId: string | ObjectId,
    updateDataOrFilter:
      | Partial<
          Omit<Task, "_id" | "createdAt" | "updatedAt" | keyof SyncFields>
        >
      | UpdateFilter<Task>
  ): Promise<{
    success: boolean;
    task?: Task;
    error?: string;
  }> {
    try {
      const id = ensureObjectId(taskId);
      let finalUpdateFilter: UpdateFilter<Task>;

      if (
        "$set" in updateDataOrFilter ||
        "$inc" in updateDataOrFilter ||
        "$push" in updateDataOrFilter ||
        "$pull" in updateDataOrFilter
      ) {
        finalUpdateFilter = updateDataOrFilter as UpdateFilter<Task>;
      } else {
        finalUpdateFilter = { $set: updateDataOrFilter as Partial<Task> };
      }

      if (!finalUpdateFilter.$set) finalUpdateFilter.$set = {};
      (finalUpdateFilter.$set as Partial<Task>).updatedAt = new Date();
      (finalUpdateFilter.$set as Partial<Task>).modifiedSinceSync = true;

      const setPayload = finalUpdateFilter.$set as Partial<Task>;
      if (setPayload.dueDate) {
        const currentTaskData = await this.getTaskById(id);
        if (
          currentTaskData &&
          currentTaskData.status !== "已完成" &&
          currentTaskData.status !== "已取消"
        ) {
          setPayload.isOverdue = new Date(setPayload.dueDate) < new Date();
        }
      }
      if (setPayload.projectId)
        setPayload.projectId = ensureObjectId(setPayload.projectId);
      if (setPayload.assigneeId)
        setPayload.assigneeId = ensureObjectId(setPayload.assigneeId);
      if (setPayload.delegatedTo)
        setPayload.delegatedTo = ensureObjectId(setPayload.delegatedTo);
      if (setPayload.dependencies)
        setPayload.dependencies = setPayload.dependencies.map((depId) =>
          ensureObjectId(depId)
        );
      if (setPayload.subTasks)
        setPayload.subTasks = setPayload.subTasks.map((subId) =>
          ensureObjectId(subId)
        );
      if (setPayload.requiredResources) {
        setPayload.requiredResources = setPayload.requiredResources.map(
          (res) => ({
            ...res,
            resourceId: res.resourceId
              ? ensureObjectId(res.resourceId)
              : undefined,
          })
        );
      }
      if (setPayload.notes && typeof setPayload.notes === "string") {
        setPayload.notes = [
          {
            timestamp: new Date().toISOString().split("T")[0],
            content: setPayload.notes,
          },
        ];
      }

      const result = await this.tasksCollection.updateOne(
        { _id: id },
        finalUpdateFilter
      );
      if (result.matchedCount === 0)
        return { success: false, error: "未找到任务" };
      const updatedTask = await this.getTaskById(id);
      return { success: true, task: updatedTask || undefined };
    } catch (error: any) {
      console.error("TasksModel: Error in updateTask():", error);
      return {
        success: false,
        error: `更新任务失败: ${error.message || error}`,
      };
    }
  }

  async deleteTask(
    taskId: string | ObjectId
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const id = ensureObjectId(taskId);
      const result = await this.tasksCollection.deleteOne({ _id: id });
      if (result.deletedCount === 0)
        return { success: false, error: "未找到任务" };
      return { success: true };
    } catch (error: any) {
      console.error("TasksModel: Error in deleteTask():", error);
      return {
        success: false,
        error: `删除任务失败: ${error.message || error}`,
      };
    }
  }

  async getAllTaskTags(): Promise<string[]> {
    const result = await this.tasksCollection.distinct("tags", {
      tags: { $exists: true, $ne: null, $not: { $size: 0 } },
    });
    return result.sort();
  }

  async getAllTaskTypes(): Promise<string[]> {
    const result = await this.tasksCollection.distinct("taskType", {
      taskType: { $nin: [null, ""] },
    });
    return result.sort();
  }

  async getTasksByProjectId(projectId: string | ObjectId): Promise<Task[]> {
    return await this.tasksCollection
      .find({ projectId: ensureObjectId(projectId) })
      .toArray();
  }

  async getTasksByAssignee(assigneeId: string | ObjectId): Promise<Task[]> {
    return await this.tasksCollection
      .find({ assigneeId: ensureObjectId(assigneeId) })
      .toArray();
  }

  async getTasksDependingOn(dependencyId: string | ObjectId): Promise<Task[]> {
    return await this.tasksCollection
      .find({ dependencies: ensureObjectId(dependencyId) })
      .toArray();
  }
}
