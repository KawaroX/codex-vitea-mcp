// src/tools/updateTaskInfo.ts
import { ObjectId, Db, UpdateFilter } from "mongodb"; // Added UpdateFilter
import { ensureObjectId } from "../model/types.js";
import { TasksModel } from "../model/tasks.js";
import { Task, StructuredNote } from "../model/types.js"; // Task is the enhanced interface

// TaskWithStructuredNotes was an internal helper in TasksModel,
// for this tool, we should work with the main Task interface or its partials.
// The `updateData` will be Partial of what can be updated in a Task.
type UpdateTaskInfoData = Partial<
  Omit<
    Task,
    | "_id"
    | "createdAt"
    | "updatedAt"
    | "syncedToNotion"
    | "lastSync"
    | "modifiedSinceSync"
    | "notes"
    | "status"
    | "isOverdue"
    | "completionDate"
    | "actualEffortHours"
  >
>;

/**
 * 任务信息更新工具
 * 用于更新任务的基本信息（状态更新除外）
 */
export class UpdateTaskInfoTool {
  private tasksModel: TasksModel;
  private db: Db; // Keep db if tasksModel needs it for direct collection access, though ideally not.

  constructor(db: Db) {
    this.db = db; // Storing db if direct collection access is needed, though tasksModel should encapsulate it.
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
    newDueDate?: string; // Expect string, convert to Date in model or here
    newPriority?: string;
    newTaskType?: string;
    newDescription?: string;
    newWorkloadLevel?: string;
    newAssigneeId?: string; // Changed from newAssignee to newAssigneeId
    newAssigneeName?: string; // Added for clarity
    newTags?: string[];
    // New fields from enhanced Task interface
    newDeadlineType?: Task["deadlineType"];
    newScheduledStartTime?: string;
    newScheduledEndTime?: string;
    newEstimatedEffortHours?: number;
    newPreferredTimeOfDay?: Task["preferredTimeOfDay"];
    newContextualTags?: string[];
    newImportanceScore?: number;
    newUrgencyScore?: number;
    newProjectId?: string;
    newDependencies?: string[]; // Array of ObjectId strings
    newSubTasks?: string[]; // Array of ObjectId strings
    newRequiredResources?: Task["requiredResources"];
    newDifficulty?: Task["difficulty"];
    newEnergyLevelRequired?: Task["energyLevelRequired"];
    newDelegatedTo?: string;
    newIsRecurring?: boolean;
    newRecurrenceRule?: string;
    newNextRecurrenceDate?: string;
    note?: string; // For adding a new note related to this update
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
        newAssigneeId, // Use newAssigneeId
        newAssigneeName,
        newTags,
        newDeadlineType,
        newScheduledStartTime,
        newScheduledEndTime,
        newEstimatedEffortHours,
        newPreferredTimeOfDay,
        newContextualTags,
        newImportanceScore,
        newUrgencyScore,
        newProjectId,
        newDependencies,
        newSubTasks,
        newRequiredResources,
        newDifficulty,
        newEnergyLevelRequired,
        newDelegatedTo,
        newIsRecurring,
        newRecurrenceRule,
        newNextRecurrenceDate,
        note,
      } = params;

      if (!taskId && !taskName) {
        return { success: false, message: "必须提供任务ID或名称" };
      }

      // Check if at least one field to update is provided
      const updatableFields = [
        newName,
        newDueDate,
        newPriority,
        newTaskType,
        newDescription,
        newWorkloadLevel,
        newAssigneeId,
        newAssigneeName,
        newTags,
        newDeadlineType,
        newScheduledStartTime,
        newScheduledEndTime,
        newEstimatedEffortHours,
        newPreferredTimeOfDay,
        newContextualTags,
        newImportanceScore,
        newUrgencyScore,
        newProjectId,
        newDependencies,
        newSubTasks,
        newRequiredResources,
        newDifficulty,
        newEnergyLevelRequired,
        newDelegatedTo,
        newIsRecurring,
        newRecurrenceRule,
        newNextRecurrenceDate,
      ];
      if (
        updatableFields.every(
          (field) =>
            field === undefined || (Array.isArray(field) && field.length === 0)
        )
      ) {
        if (!note) {
          // If there's a note, we still proceed to add it.
          return {
            success: false,
            message: "必须提供至少一个要更新的字段或备注",
          };
        }
      }

      let resolvedTaskId = taskId;
      if (!resolvedTaskId && taskName) {
        // Simplified: Assume exact match for now, or use a more robust findByName method from TasksModel if available
        const tasks = await this.tasksModel.getAllTasks({ name: taskName }, 1);
        if (tasks.length === 0) {
          return { success: false, message: `未找到名为"${taskName}"的任务` };
        }
        resolvedTaskId = tasks[0]._id.toString();
      }
      if (!resolvedTaskId) {
        // Should not happen if taskName logic is robust
        return { success: false, message: "无法解析任务ID" };
      }

      const currentTask = await this.tasksModel.getTaskById(resolvedTaskId);
      if (!currentTask) {
        return {
          success: false,
          message: `未找到ID为"${resolvedTaskId}"的任务`,
        };
      }

      // Build the $set part of the update operation
      const setFields: Partial<Task> = {};
      if (newName !== undefined) setFields.name = newName;
      if (newDueDate !== undefined) setFields.dueDate = new Date(newDueDate);
      if (newPriority !== undefined) setFields.priority = newPriority;
      if (newTaskType !== undefined) setFields.taskType = newTaskType;
      if (newDescription !== undefined) setFields.description = newDescription;
      if (newWorkloadLevel !== undefined)
        setFields.workloadLevel = newWorkloadLevel;
      if (newAssigneeId !== undefined)
        setFields.assigneeId = ensureObjectId(newAssigneeId);
      if (newAssigneeName !== undefined)
        setFields.assigneeName = newAssigneeName;
      if (newTags !== undefined) setFields.tags = newTags;
      if (newDeadlineType !== undefined)
        setFields.deadlineType = newDeadlineType;
      if (newScheduledStartTime !== undefined)
        setFields.scheduledStartTime = new Date(newScheduledStartTime);
      if (newScheduledEndTime !== undefined)
        setFields.scheduledEndTime = new Date(newScheduledEndTime);
      if (newEstimatedEffortHours !== undefined)
        setFields.estimatedEffortHours = newEstimatedEffortHours;
      if (newPreferredTimeOfDay !== undefined)
        setFields.preferredTimeOfDay = newPreferredTimeOfDay;
      if (newContextualTags !== undefined)
        setFields.contextualTags = newContextualTags;
      if (newImportanceScore !== undefined)
        setFields.importanceScore = newImportanceScore;
      if (newUrgencyScore !== undefined)
        setFields.urgencyScore = newUrgencyScore;
      if (newProjectId !== undefined)
        setFields.projectId = ensureObjectId(newProjectId);
      if (newDependencies !== undefined)
        setFields.dependencies = newDependencies.map((id) =>
          ensureObjectId(id)
        );
      if (newSubTasks !== undefined)
        setFields.subTasks = newSubTasks.map((id) => ensureObjectId(id));
      if (newRequiredResources !== undefined)
        setFields.requiredResources = newRequiredResources.map((r) => ({
          ...r,
          resourceId: r.resourceId ? ensureObjectId(r.resourceId) : undefined,
        }));
      if (newDifficulty !== undefined) setFields.difficulty = newDifficulty;
      if (newEnergyLevelRequired !== undefined)
        setFields.energyLevelRequired = newEnergyLevelRequired;
      if (newDelegatedTo !== undefined)
        setFields.delegatedTo = ensureObjectId(newDelegatedTo);
      if (newIsRecurring !== undefined) setFields.isRecurring = newIsRecurring;
      if (newRecurrenceRule !== undefined)
        setFields.recurrenceRule = newRecurrenceRule;
      if (newNextRecurrenceDate !== undefined)
        setFields.nextRecurrenceDate = new Date(newNextRecurrenceDate);

      let updateOperation: UpdateFilter<Task> = {};
      if (Object.keys(setFields).length > 0) {
        updateOperation.$set = setFields;
      }

      let noteObj: StructuredNote | null = null;
      if (note) {
        noteObj = {
          timestamp: new Date().toISOString().split("T")[0],
          content: note,
          metadata: {
            type: "update_info",
            tags: ["update_info"],
            updatedFields: Object.keys(setFields), // Record which fields were part of this update
          },
        };
        // Handle pushing the note
        if (currentTask.notes && typeof currentTask.notes === "string") {
          if (!updateOperation.$set) updateOperation.$set = {};
          (updateOperation.$set as Partial<Task>).notes = [
            {
              timestamp: currentTask.createdAt.toISOString().split("T")[0],
              content: currentTask.notes,
              metadata: { migrated_from_string: true },
            },
            noteObj,
          ];
        } else {
          updateOperation.$push = { notes: noteObj as any };
        }
      }

      // Ensure there's at least one update operation
      if (!updateOperation.$set && !updateOperation.$push) {
        return {
          success: true,
          task: currentTask,
          message: "没有提供更新字段，任务未更改。",
        };
      }

      // Call the TasksModel.updateTask method
      const result = await this.tasksModel.updateTask(
        resolvedTaskId,
        updateOperation
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      let successMessage = `成功更新任务"${currentTask.name}"的信息`;
      const updatedFieldNames = Object.keys(setFields);
      if (updatedFieldNames.length > 0) {
        successMessage += `，更新了: ${updatedFieldNames.join(", ")}`;
      }
      if (note) {
        successMessage += `，并添加了备注。`;
      }

      return {
        success: true,
        task: result.task,
        message: successMessage,
      };
    } catch (error: any) {
      console.error("UpdateTaskInfoTool: 更新任务信息时出错:", error);
      return {
        success: false,
        message: `更新任务信息时出错: ${error.message || error}`,
      };
    }
  }
}
