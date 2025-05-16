import { Db, ObjectId, Filter, UpdateFilter, FindOptions } from "mongodb";
import { TasksModel } from "../../model/tasks.js";
import {
  ScheduleModel,
  NewScheduledEventData,
} from "../../model/scheduleModel.js";
import {
  ProReminisceManager,
  RecallParams,
  LearnParams,
} from "../reminisce/proReminisceManager.js";
import { BioDataModel } from "../../model/bioData.js";
import {
  Task,
  ScheduledEvent,
  ensureObjectId,
  RequiredResource,
  BaseDocument,
  BioData,
  UserTaskPerformanceMemoryResult,
  UserSchedulingPreferenceMemoryResult,
  EnhancedMemoryUnit, // Ensure EnhancedMemoryUnit is imported
  MemoryPattern,
} from "../../model/types.js";

// --- 辅助类型定义 ---

export interface SchedulingConstraints {
  notBefore?: Date;
  mustFinishBy?: Date;
  preferredTimeOfDay?: Task["preferredTimeOfDay"];
  preferredDaysOfWeek?: number[];
  requiredLocationId?: ObjectId | string;
  minEnergyLevel?: Task["energyLevelRequired"];
  matchUserEnergyCycle?: boolean;
  allowSplitting?: boolean;
  preferredBlockDurationHours?: number;
  userId?: string;
  currentUserContext?: Partial<CurrentUserContext>;
  workingHours?: {
    startHour: number;
    endHour: number;
    daysOfWeek?: number[];
    lunchBreakHours?: { start: number; end: number };
  };
  minGapMinutes?: number;
}

export interface ScoredTimeSlot extends TimeSlot {
  scoreDetails: SlotScoreComponents;
  // score is now part of scoreDetails.finalScore, but can be duplicated here for convenience if needed
  // score: number;
  reasoning: string[];
  conflictsWith?: ScheduledEvent[];
}

export interface ScheduleProposal {
  success: boolean;
  taskId: string | ObjectId;
  taskName: string;
  effortMinutes: number;
  candidateSlots?: ScoredTimeSlot[];
  reasoning?: string[];
  alternativeSuggestions?: string[];
  error?: string;
}

export interface CurrentUserContext {
  currentTime: Date;
  currentLocationId?: ObjectId | string;
  currentLocationTags?: string[];
  currentEnergyLevel?: BioData["value"] | Task["energyLevelRequired"];
  predictedEnergyForSlot?: Task["energyLevelRequired"];
  recentTaskPerformance?: UserTaskPerformanceMemoryResult[];
  upcomingEvents?: ScheduledEvent[];
  userFocus?: string | string[];
  dailyHealthSummary?: {
    sleepHours?: number;
    stressLevel?: "low" | "medium" | "high";
    overallFeeling?: string;
  };
  schedulingPreferences?: UserSchedulingPreferenceMemoryResult[];
  userId?: string;
}

export interface SuggestedTask {
  taskId: ObjectId;
  taskName: string;
  reasoning: string[];
  scoreDetails?: TaskScoreComponents;
  estimatedEffortHours?: number;
  dueDate?: Date;
  priority?: Task["priority"];
}

export interface DailyAgenda {
  date: Date;
  scheduledEvents: ScheduledEvent[];
  suggestedTasksFromBacklog?: Task[];
  notes?: string[];
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
}

export interface TaskScoreComponents {
  baseScore: number;
  urgencyScore: number;
  energyMatchScore: number;
  focusMatchScore: number;
  preferenceScore: number;
  dependencyScore: number;
  resourceScore: number;
  antiProcrastinationScore: number;
  historicalPerformanceAdjustScore: number;
  finalScore: number;
  reasoning: string[];
}

interface SlotScoreComponents {
  timeOfDayPreferenceScore: number;
  proximityToDeadlineScore: number;
  historicalEfficiencyScore: number;
  energyMatchScore: number;
  continuityScore: number;
  finalScore: number; // finalScore is part of SlotScoreComponents
  reasoning: string[];
}

// 新接口：用于 _calculateSlotScore 的第三个参数，替代复杂的 Pick 类型
interface SlotCalculationSpecificConstraints {
  preferredTimeOfDay?: Task["preferredTimeOfDay"];
  preferredDaysOfWeek?: number[];
  matchUserEnergyCycle?: boolean; // 确保此属性存在
  workingHours?: {
    startHour: number;
    endHour: number;
    daysOfWeek?: number[];
    lunchBreakHours?: { start: number; end: number };
  };
  minGapMinutes?: number;
}

export class IntelligentPlanner {
  private db: Db;
  private tasksModel: TasksModel;
  private scheduleModel: ScheduleModel;
  private reminisceManager: ProReminisceManager;
  private bioDataModel: BioDataModel;

  constructor(db: Db) {
    this.db = db;
    this.tasksModel = new TasksModel(db);
    this.scheduleModel = new ScheduleModel(db);
    this.reminisceManager = new ProReminisceManager(db);
    this.bioDataModel = new BioDataModel(db);
  }

  async learnUserSchedulingPreference(
    params: LearnParams
  ): Promise<EnhancedMemoryUnit | null> {
    return this.reminisceManager.learn(params);
  }

  private async _predictEnergyForSlot(
    time: Date,
    userId?: string,
    dailyHealth?: CurrentUserContext["dailyHealthSummary"],
    schedulingPreferences?: UserSchedulingPreferenceMemoryResult[]
  ): Promise<Task["energyLevelRequired"]> {
    const hour = time.getHours();
    const dayOfWeek = time.getDay();
    let baseEnergy: Task["energyLevelRequired"] = "medium";

    if (schedulingPreferences) {
      for (const pref of schedulingPreferences) {
        if (
          pref.isActive !== false &&
          pref.preferenceType === "energy_pattern_by_time" &&
          pref.details
        ) {
          const details = pref.details as {
            dayOfWeek?: number | number[];
            hourStart?: number;
            hourEnd?: number;
            energyLevel: Task["energyLevelRequired"];
          };
          let dayMatch = true;
          if (details.dayOfWeek !== undefined) {
            dayMatch = Array.isArray(details.dayOfWeek)
              ? details.dayOfWeek.includes(dayOfWeek)
              : details.dayOfWeek === dayOfWeek;
          }
          let hourMatch = true;
          if (
            details.hourStart !== undefined &&
            details.hourEnd !== undefined
          ) {
            hourMatch = hour >= details.hourStart && hour < details.hourEnd;
          } else if (details.hourStart !== undefined) {
            hourMatch = hour >= details.hourStart;
          } else if (details.hourEnd !== undefined) {
            hourMatch = hour < details.hourEnd;
          }
          if (dayMatch && hourMatch) baseEnergy = details.energyLevel;
        }
      }
    }

    if (baseEnergy === "medium") {
      if (hour >= 7 && hour < 12) baseEnergy = "high";
      else if (hour >= 14 && hour < 17) baseEnergy = "medium";
      else if (hour >= 21 || hour < 6) baseEnergy = "low";
    }

    if (userId) {
      const recentEnergyBioData = await this.bioDataModel.getLatestMeasurement(
        "精力自我评估"
      );
      if (recentEnergyBioData) {
        if (recentEnergyBioData.value <= 2) baseEnergy = "low";
        else if (recentEnergyBioData.value === 3 && baseEnergy === "high")
          baseEnergy = "medium";
        else if (recentEnergyBioData.value >= 4) baseEnergy = "high";
      }
    }

    if (dailyHealth?.sleepHours !== undefined) {
      if (dailyHealth.sleepHours < 6 && baseEnergy === "high")
        baseEnergy = "medium";
      if (dailyHealth.sleepHours < 5 && baseEnergy !== "low")
        baseEnergy = "low";
    }
    if (dailyHealth?.stressLevel === "high" && baseEnergy === "high")
      baseEnergy = "medium";
    if (dailyHealth?.stressLevel === "high" && baseEnergy === "medium")
      baseEnergy = "low";

    return baseEnergy;
  }

  async proposeTaskSchedule(
    taskId: ObjectId | string,
    constraintsInput?: SchedulingConstraints
  ): Promise<ScheduleProposal> {
    const id = ensureObjectId(taskId);
    const task = await this.tasksModel.getTaskById(id);
    const reasoningLog: string[] = [];

    if (!task)
      return {
        success: false,
        taskId: id,
        taskName: "Unknown",
        effortMinutes: 0,
        error: "任务未找到。",
        reasoning: ["任务ID无效或不存在。"],
      };
    if (task.status === "已完成" || task.status === "已取消") {
      return {
        success: false,
        taskId: task._id,
        taskName: task.name,
        effortMinutes: 0,
        error: `任务 "${task.name}" 已是 "${task.status}" 状态，无需调度。`,
        reasoning: [`任务状态为 "${task.status}"。`],
      };
    }

    reasoningLog.push(
      `开始为任务 "${task.name}" (ID: ${id.toString()}) 提议日程。`
    );

    let effortMinutes = (task.estimatedEffortHours || 1) * 60;
    reasoningLog.push(`初始预估工时: ${(effortMinutes / 60).toFixed(1)}h。`);

    const currentTime = new Date();
    let currentContext: CurrentUserContext = {
      currentTime: currentTime,
      userId: constraintsInput?.userId,
      ...(constraintsInput?.currentUserContext || {}),
    };

    if (
      task.taskType &&
      (!currentContext.recentTaskPerformance ||
        currentContext.recentTaskPerformance.length === 0)
    ) {
      const recallContextForPerf: EnhancedMemoryUnit["context"] = {};
      if (currentContext.userId)
        recallContextForPerf.userId = currentContext.userId;

      const performanceRecallParams: RecallParams = {
        pattern: {
          type: "task_performance_insight",
          intent: "get_average_duration",
          entitiesInvolved: [{ type: "task_type", identifier: task.taskType }],
        },
        options: { limit: 5, sort: { createdAt: -1 } },
        context: recallContextForPerf,
      };
      const performanceMemory = await this.reminisceManager.recall(
        performanceRecallParams
      ); // 单个参数
      if (performanceMemory.length > 0) {
        let totalActualHours = 0;
        let count = 0;
        performanceMemory.forEach((mem) => {
          const result = mem.result as UserTaskPerformanceMemoryResult;
          if (result && result.actualEffortHours) {
            totalActualHours += result.actualEffortHours;
            count++;
          }
        });
        if (count > 0) {
          const avgActualHours = totalActualHours / count;
          reasoningLog.push(
            `历史平均耗时(${task.taskType}): ${avgActualHours.toFixed(
              1
            )}h (基于 ${count} 条记录).`
          );
          if (
            Math.abs(avgActualHours - (task.estimatedEffortHours || 1)) >
            Math.max(0.5, (task.estimatedEffortHours || 1) * 0.25)
          ) {
            effortMinutes = avgActualHours * 60;
            reasoningLog.push(
              `根据历史表现调整预估时长为: ${avgActualHours.toFixed(1)}h.`
            );
          }
        }
        currentContext.recentTaskPerformance = performanceMemory.map(
          (mem) => mem.result as UserTaskPerformanceMemoryResult
        );
      } else {
        reasoningLog.push(`未找到类型 "${task.taskType}" 任务的历史表现记录。`);
      }
    }

    const searchRangeStart = constraintsInput?.notBefore || currentTime;
    const searchRangeEnd =
      constraintsInput?.mustFinishBy ||
      (task.dueDate && task.deadlineType === "hard"
        ? new Date(task.dueDate)
        : new Date(searchRangeStart.getTime() + 14 * 24 * 60 * 60 * 1000));
    reasoningLog.push(
      `日程查找范围: ${searchRangeStart.toLocaleString()} 到 ${searchRangeEnd.toLocaleString()}.`
    );

    if (!currentContext.schedulingPreferences) {
      const recallContextForPref: EnhancedMemoryUnit["context"] = {};
      if (currentContext.userId)
        recallContextForPref.userId = currentContext.userId;

      const preferenceRecallParams: RecallParams = {
        pattern: { type: "user_scheduling_preference" },
        context: recallContextForPref,
      };
      const recalledPreferencesMemories = await this.reminisceManager.recall(
        preferenceRecallParams
      ); // 单个参数
      currentContext.schedulingPreferences = recalledPreferencesMemories.map(
        (mem) => mem.result as UserSchedulingPreferenceMemoryResult
      );
      reasoningLog.push(
        `已从记忆系统获取 ${currentContext.schedulingPreferences.length} 条日程偏好。`
      );
    }

    const activeWorkingHours = constraintsInput?.workingHours || {
      startHour: 9,
      endHour: 18,
      daysOfWeek: [1, 2, 3, 4, 5],
      lunchBreakHours: { start: 12, end: 13 },
    };
    currentContext.schedulingPreferences?.forEach((pref) => {
      if (
        pref.isActive !== false &&
        pref.preferenceType === "working_hours" &&
        pref.details
      ) {
        Object.assign(activeWorkingHours, pref.details);
        reasoningLog.push(
          `已应用用户自定义的工作时间偏好: ${JSON.stringify(pref.details)}。`
        );
      }
    });

    // 构造传递给 findAvailableTimeSlots 和 _calculateSlotScore 的约束对象
    const slotFindingAndScoringConstraints: SlotCalculationSpecificConstraints =
      {
        workingHours: activeWorkingHours,
        preferredTimeOfDay:
          task.preferredTimeOfDay || constraintsInput?.preferredTimeOfDay,
        preferredDaysOfWeek: constraintsInput?.preferredDaysOfWeek,
        minGapMinutes: constraintsInput?.minGapMinutes || 15,
        matchUserEnergyCycle: constraintsInput?.matchUserEnergyCycle, // 从 SchedulingConstraints 传递
      };

    reasoningLog.push(
      `查找时长为 ${(effortMinutes / 60).toFixed(
        1
      )}h 的可用时间段，约束: ${JSON.stringify(
        slotFindingAndScoringConstraints
      )}`
    );
    let availableSlots = await this.findAvailableTimeSlots(
      effortMinutes,
      { start: searchRangeStart, end: searchRangeEnd },
      slotFindingAndScoringConstraints
    );

    if (availableSlots.length === 0) {
      reasoningLog.push("未找到符合基本时长和工作时间的初步空闲时间段。");
      return {
        success: false,
        taskId: task._id,
        taskName: task.name,
        effortMinutes,
        error: "未找到符合基本时长和工作时间的初步空闲时间段。",
        reasoning: reasoningLog,
      };
    }
    reasoningLog.push(`找到 ${availableSlots.length} 个初步可用时间段。`);

    let earliestPossibleStartTimeAfterDeps = new Date(0);
    if (task.dependencies && task.dependencies.length > 0) {
      reasoningLog.push(
        `任务有 ${task.dependencies.length} 个前置依赖，开始检查其完成情况。`
      );
      for (const depId of task.dependencies) {
        const depTask = await this.tasksModel.getTaskById(depId);
        if (!depTask) {
          reasoningLog.push(`警告：依赖任务ID ${depId} 未找到，假设其不阻塞。`);
          continue;
        }
        if (depTask.status !== "已完成") {
          reasoningLog.push(
            `依赖任务 "${depTask.name}" 状态为 "${depTask.status}"。`
          );
          let depCompletionTargetTime: Date | undefined = undefined;
          const depScheduledEvents = await this.scheduleModel.getEventsByTaskId(
            depTask._id
          );
          if (depScheduledEvents.length > 0) {
            depScheduledEvents.sort(
              (a, b) => b.endTime.getTime() - a.endTime.getTime()
            );
            depCompletionTargetTime = depScheduledEvents[0].endTime;
            reasoningLog.push(
              `依赖任务 "${
                depTask.name
              }" 已安排，预计完成于: ${depCompletionTargetTime.toLocaleString()}`
            );
          } else if (depTask.dueDate) {
            depCompletionTargetTime = new Date(depTask.dueDate);
            depCompletionTargetTime.setHours(23, 59, 59, 999);
            reasoningLog.push(
              `依赖任务 "${
                depTask.name
              }" 未安排日程，但截止于: ${depCompletionTargetTime.toLocaleString()}`
            );
          } else {
            reasoningLog.push(
              `关键阻塞：依赖任务 "${depTask.name}" 未完成，无明确日程或截止日期。`
            );
            return {
              success: false,
              taskId: task._id,
              taskName: task.name,
              effortMinutes,
              error: `前置依赖任务 "${depTask.name}" 未完成且无明确结束时间，无法安排当前任务。`,
              reasoning: reasoningLog,
              alternativeSuggestions: [
                `请先为任务 "${depTask.name}" 安排日程或设置截止日期。`,
              ],
            };
          }
          if (
            depCompletionTargetTime &&
            depCompletionTargetTime > earliestPossibleStartTimeAfterDeps
          ) {
            earliestPossibleStartTimeAfterDeps = depCompletionTargetTime;
          }
        } else {
          reasoningLog.push(`依赖任务 "${depTask.name}" 已完成。`);
        }
      }
      if (earliestPossibleStartTimeAfterDeps > new Date(0)) {
        reasoningLog.push(
          `所有依赖项要求当前任务最早可于 ${earliestPossibleStartTimeAfterDeps.toLocaleString()} 之后开始。`
        );
        availableSlots = availableSlots.filter(
          (slot) => slot.startTime >= earliestPossibleStartTimeAfterDeps
        );
        if (availableSlots.length === 0) {
          reasoningLog.push("错误：所有可用时间段均早于前置依赖的完成时间。");
          return {
            success: false,
            taskId: task._id,
            taskName: task.name,
            effortMinutes,
            error: "没有可用的时间段能满足前置依赖任务的完成时间。",
            reasoning: reasoningLog,
          };
        }
        reasoningLog.push(
          `根据依赖过滤后，剩余 ${availableSlots.length} 个可用时间段。`
        );
      }
    }

    if (availableSlots.length === 0) {
      reasoningLog.push("在依赖检查后，没有可用的时间段了。");
      return {
        success: false,
        taskId: task._id,
        taskName: task.name,
        effortMinutes,
        error: "满足依赖条件后，没有可用的时间段。",
        reasoning: reasoningLog,
      };
    }

    const scoredCandidateSlots: ScoredTimeSlot[] = [];
    for (const slot of availableSlots) {
      let slotSpecificContext = { ...currentContext };
      if (slotFindingAndScoringConstraints?.matchUserEnergyCycle) {
        slotSpecificContext.predictedEnergyForSlot =
          await this._predictEnergyForSlot(
            slot.startTime,
            currentContext.userId,
            currentContext.dailyHealthSummary,
            currentContext.schedulingPreferences
          );
      }
      // 使用 slotFindingAndScoringConstraints 作为第三个参数
      const scoreInfo = await this._calculateSlotScore(
        slot,
        task,
        slotFindingAndScoringConstraints,
        slotSpecificContext
      );

      scoredCandidateSlots.push({
        ...slot,
        scoreDetails: scoreInfo,
        reasoning: scoreInfo.reasoning,
      });
    }

    scoredCandidateSlots.sort(
      (a, b) => b.scoreDetails.finalScore - a.scoreDetails.finalScore
    );
    reasoningLog.push(
      `对 ${scoredCandidateSlots.length} 个候选时段完成评分和排序。`
    );

    if (scoredCandidateSlots.length === 0) {
      return {
        success: false,
        taskId: task._id,
        taskName: task.name,
        effortMinutes,
        error: "没有合适的候选时间段。",
        reasoning: reasoningLog,
      };
    }

    return {
      success: true,
      taskId: task._id,
      taskName: task.name,
      effortMinutes: effortMinutes,
      candidateSlots: scoredCandidateSlots.slice(0, 5),
      reasoning: reasoningLog,
    };
  }

  async suggestNextTask(
    context: CurrentUserContext
  ): Promise<SuggestedTask | null> {
    console.log(
      "IntelligentPlanner: Suggesting next task based on context:",
      JSON.stringify(context, null, 2)
    );
    const allPendingTasks = await this.tasksModel.getPendingTasks(100);

    const candidateTasks: Task[] = [];
    for (const task of allPendingTasks) {
      let depsMet = true;
      if (task.dependencies && task.dependencies.length > 0) {
        for (const depId of task.dependencies) {
          const depTask = await this.tasksModel.getTaskById(depId);
          if (depTask && depTask.status !== "已完成") {
            depsMet = false;
            break;
          }
        }
      }
      if (depsMet) candidateTasks.push(task);
    }

    if (candidateTasks.length === 0) {
      return {
        taskId: new ObjectId(),
        taskName: "没有可执行的待办任务",
        reasoning: ["所有待办任务的前置依赖可能尚未完成，或者任务列表为空。"],
      } as SuggestedTask;
    }

    if (!context.schedulingPreferences || !context.recentTaskPerformance) {
      const recallContext: EnhancedMemoryUnit["context"] = {};
      if (context.userId) recallContext.userId = context.userId;

      const preferenceRecallPattern: MemoryPattern = {
        type: "user_scheduling_preference",
      };
      const performanceRecallPattern: MemoryPattern = {
        type: "task_performance_insight",
      };

      const userPreferencesMemories = await this.reminisceManager.recall({
        pattern: preferenceRecallPattern,
        context: recallContext,
      });
      const taskPerformanceHistoryMemories = await this.reminisceManager.recall(
        { pattern: performanceRecallPattern, context: recallContext }
      );

      context.schedulingPreferences = userPreferencesMemories.map(
        (mem) => mem.result as UserSchedulingPreferenceMemoryResult
      );
      context.recentTaskPerformance = taskPerformanceHistoryMemories.map(
        (mem) => mem.result as UserTaskPerformanceMemoryResult
      );
    }

    const scoredTasks: Array<{ task: Task; scoreInfo: TaskScoreComponents }> =
      [];
    for (const task of candidateTasks) {
      scoredTasks.push({
        task,
        scoreInfo: await this._calculateTaskScore(task, context),
      });
    }

    scoredTasks.sort((a, b) => b.scoreInfo.finalScore - a.scoreInfo.finalScore);

    if (
      scoredTasks.length > 0 &&
      scoredTasks[0].scoreInfo.finalScore > -Infinity
    ) {
      const bestScoredTask = scoredTasks[0];
      return {
        taskId: bestScoredTask.task._id,
        taskName: bestScoredTask.task.name,
        reasoning: bestScoredTask.scoreInfo.reasoning,
        scoreDetails: bestScoredTask.scoreInfo,
        estimatedEffortHours: bestScoredTask.task.estimatedEffortHours,
        dueDate: bestScoredTask.task.dueDate,
        priority: bestScoredTask.task.priority,
      };
    }
    return null;
  }

  async generateDailyAgenda(date: Date, userId?: string): Promise<DailyAgenda> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const filter: Filter<ScheduledEvent> = {};
    const scheduledEvents = await this.scheduleModel.findEventsInTimeRange(
      startOfDay,
      endOfDay,
      filter
    );
    const pendingTasks = await this.tasksModel.getPendingTasks(50);
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const suggestedTasksFromBacklog = pendingTasks
      .filter((task) => {
        if (task.dueDate) {
          const dueDateOnly = new Date(
            task.dueDate.getFullYear(),
            task.dueDate.getMonth(),
            task.dueDate.getDate()
          );
          if (dueDateOnly.getTime() === today.getTime()) return true;
        }
        return false;
      })
      .slice(0, 5);

    return {
      date: startOfDay,
      scheduledEvents: scheduledEvents.sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      ),
      suggestedTasksFromBacklog,
      notes: ["这是今天的初步议程。请根据实际情况调整。"],
    };
  }

  async rescheduleEvent(
    eventOrTaskId: ObjectId | string,
    newTime?: { startTime: Date; endTime: Date },
    reason?: string
  ): Promise<boolean> {
    const id = ensureObjectId(eventOrTaskId);
    let eventToReschedule = await this.scheduleModel.getEventById(id);
    if (!eventToReschedule) {
      const eventsForTask = await this.scheduleModel.getEventsByTaskId(id);
      if (eventsForTask.length > 0) eventToReschedule = eventsForTask[0];
      else {
        console.error(
          `IntelligentPlanner: Event or Task with ID ${id.toString()} not found for rescheduling.`
        );
        return false;
      }
    }
    if (!newTime) {
      console.warn(
        "IntelligentPlanner: Reschedule called without new time, auto-reschedule not yet implemented."
      );
      return false;
    }
    const hasConflict = await this.scheduleModel.hasTimeConflict(
      newTime.startTime,
      newTime.endTime,
      eventToReschedule._id
    );
    if (hasConflict) {
      console.error(
        `IntelligentPlanner: New time for event ${eventToReschedule.title} conflicts with existing events.`
      );
      return false;
    }
    const updateFilter: UpdateFilter<ScheduledEvent> = {
      $set: {
        startTime: newTime.startTime,
        endTime: newTime.endTime,
        status: "confirmed",
      },
    };
    if (reason && updateFilter.$set) {
      (updateFilter.$set as Partial<ScheduledEvent>).description = `${
        eventToReschedule.description || ""
      }\n(重排原因: ${reason})`.trim();
    }
    return await this.scheduleModel.updateEvent(
      eventToReschedule._id,
      updateFilter
    );
  }

  async findAvailableTimeSlots(
    durationMinutes: number,
    dateRange?: { start: Date; end: Date },
    // 参数名与 SlotCalculationSpecificConstraints 保持一致，以便清晰
    slotFindingConstraints?: SlotCalculationSpecificConstraints
  ): Promise<TimeSlot[]> {
    if (durationMinutes <= 0) return [];
    const searchStart = dateRange?.start || new Date();
    searchStart.setSeconds(0, 0);
    const searchEnd =
      dateRange?.end ||
      new Date(searchStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const existingEvents = await this.scheduleModel.findEventsInTimeRange(
      searchStart,
      searchEnd
    );
    existingEvents.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
    const availableSlots: TimeSlot[] = [];
    let currentTimePointer = new Date(searchStart);

    const activeWorkingHours = slotFindingConstraints?.workingHours || {
      startHour: 9,
      endHour: 18,
      daysOfWeek: [1, 2, 3, 4, 5],
      lunchBreakHours: { start: 12, end: 13 },
    };
    const minGapMinutes = slotFindingConstraints?.minGapMinutes || 15;

    while (currentTimePointer < searchEnd) {
      const dayOfWeek = currentTimePointer.getDay();
      const currentHour = currentTimePointer.getHours();

      let dayStartHour = activeWorkingHours.startHour;
      let dayEndHour = activeWorkingHours.endHour;
      let lunchStartHour = activeWorkingHours.lunchBreakHours?.start;
      let lunchEndHour = activeWorkingHours.lunchBreakHours?.end;

      if (
        activeWorkingHours.daysOfWeek &&
        !activeWorkingHours.daysOfWeek.includes(dayOfWeek)
      ) {
        currentTimePointer.setDate(currentTimePointer.getDate() + 1);
        currentTimePointer.setHours(dayStartHour, 0, 0, 0);
        continue;
      }
      if (currentHour < dayStartHour) {
        currentTimePointer.setHours(dayStartHour, 0, 0, 0);
        if (
          currentTimePointer.getDay() !== dayOfWeek &&
          activeWorkingHours.daysOfWeek &&
          !activeWorkingHours.daysOfWeek.includes(currentTimePointer.getDay())
        ) {
          continue;
        }
      }
      if (currentHour >= dayEndHour) {
        currentTimePointer.setDate(currentTimePointer.getDate() + 1);
        currentTimePointer.setHours(dayStartHour, 0, 0, 0);
        continue;
      }

      if (lunchStartHour !== undefined && lunchEndHour !== undefined) {
        if (currentHour >= lunchStartHour && currentHour < lunchEndHour) {
          currentTimePointer.setHours(lunchEndHour, 0, 0, 0);
          if (currentTimePointer.getHours() >= dayEndHour) {
            currentTimePointer.setDate(currentTimePointer.getDate() + 1);
            currentTimePointer.setHours(dayStartHour, 0, 0, 0);
            continue;
          }
        }
      }

      if (
        slotFindingConstraints?.preferredTimeOfDay &&
        slotFindingConstraints.preferredTimeOfDay !== "any"
      ) {
        const morningEnd = lunchStartHour !== undefined ? lunchStartHour : 12;
        const afternoonStart = lunchEndHour !== undefined ? lunchEndHour : 13;

        let skipToNextValidBlock = false;
        if (
          slotFindingConstraints.preferredTimeOfDay === "morning" &&
          (currentHour < dayStartHour || currentHour >= morningEnd)
        ) {
          if (currentHour < dayStartHour)
            currentTimePointer.setHours(dayStartHour, 0, 0, 0);
          else skipToNextValidBlock = true;
        } else if (
          slotFindingConstraints.preferredTimeOfDay === "afternoon" &&
          (currentHour < afternoonStart || currentHour >= dayEndHour)
        ) {
          if (currentHour < afternoonStart)
            currentTimePointer.setHours(afternoonStart, 0, 0, 0);
          else skipToNextValidBlock = true;
        }

        if (skipToNextValidBlock) {
          currentTimePointer.setDate(currentTimePointer.getDate() + 1);
          currentTimePointer.setHours(dayStartHour, 0, 0, 0);
          continue;
        }
      }

      const nextEvent = existingEvents.find(
        (event) => event.endTime > currentTimePointer
      );
      let slotEndBoundary: Date;

      const dayWorkEndTime = new Date(currentTimePointer);
      dayWorkEndTime.setHours(dayEndHour, 0, 0, 0);

      if (
        lunchStartHour !== undefined &&
        lunchEndHour !== undefined &&
        currentTimePointer.getHours() < lunchStartHour &&
        lunchStartHour < dayEndHour
      ) {
        const lunchStartTimeToday = new Date(currentTimePointer);
        lunchStartTimeToday.setHours(lunchStartHour, 0, 0, 0);
        slotEndBoundary = new Date(
          Math.min(dayWorkEndTime.getTime(), lunchStartTimeToday.getTime())
        );
      } else {
        slotEndBoundary = dayWorkEndTime;
      }

      let actualSlotEnd: Date;
      if (nextEvent && nextEvent.startTime < slotEndBoundary) {
        actualSlotEnd = new Date(nextEvent.startTime);
      } else {
        actualSlotEnd = new Date(slotEndBoundary);
      }

      const slotDurationMinutes =
        (actualSlotEnd.getTime() - currentTimePointer.getTime()) / (1000 * 60);

      if (slotDurationMinutes >= durationMinutes) {
        availableSlots.push({
          startTime: new Date(currentTimePointer),
          endTime: new Date(
            currentTimePointer.getTime() + durationMinutes * 60 * 1000
          ),
          durationMinutes: durationMinutes,
        });
        currentTimePointer = new Date(
          currentTimePointer.getTime() +
            durationMinutes * 60 * 1000 +
            minGapMinutes * 60 * 1000
        );
      } else {
        if (nextEvent && nextEvent.startTime < slotEndBoundary) {
          currentTimePointer = new Date(
            nextEvent.endTime.getTime() + minGapMinutes * 60 * 1000
          );
        } else {
          currentTimePointer = new Date(
            actualSlotEnd.getTime() + minGapMinutes * 60 * 1000
          );
        }
      }
      const currentPointerHour = currentTimePointer.getHours();
      if (
        currentPointerHour >= dayEndHour ||
        (lunchStartHour !== undefined &&
          lunchEndHour !== undefined &&
          currentPointerHour >= lunchStartHour &&
          currentPointerHour < lunchEndHour)
      ) {
        if (currentPointerHour >= dayEndHour) {
          currentTimePointer.setDate(currentTimePointer.getDate() + 1);
          currentTimePointer.setHours(dayStartHour, 0, 0, 0);
        } else {
          currentTimePointer.setHours(lunchEndHour, 0, 0, 0);
        }
      }
    }
    return availableSlots;
  }

  private async _calculateSlotScore(
    slot: TimeSlot,
    task: Task,
    activeSlotCalcConstraints?: SlotCalculationSpecificConstraints, // 使用新定义的接口
    context?: CurrentUserContext
  ): Promise<SlotScoreComponents> {
    const reasoning: string[] = [];
    let timeOfDayPreferenceScore = 0;
    let proximityToDeadlineScore = 0;
    let historicalEfficiencyScore = 0;
    let energyMatchScore = 0;
    let continuityScore = 0;

    const slotStartHour = slot.startTime.getHours();
    const slotDayOfWeek = slot.startTime.getDay();

    // 1. 匹配任务自身的偏好时间 (task.preferredTimeOfDay)
    if (task.preferredTimeOfDay && task.preferredTimeOfDay !== "any") {
      let match = false;
      const wh = activeSlotCalcConstraints?.workingHours || {
        startHour: 9,
        lunchBreakHours: { start: 12, end: 13 },
        endHour: 18,
      };
      const morningEnd = wh.lunchBreakHours?.start || 12;
      const afternoonStart = wh.lunchBreakHours?.end || 13;

      if (
        task.preferredTimeOfDay === "morning" &&
        slotStartHour >= wh.startHour &&
        slotStartHour < morningEnd
      )
        match = true;
      else if (
        task.preferredTimeOfDay === "afternoon" &&
        slotStartHour >= afternoonStart &&
        slotStartHour < wh.endHour
      )
        match = true;
      else if (
        task.preferredTimeOfDay === "evening" &&
        slotStartHour >= 18 &&
        slotStartHour < 22
      )
        match = true;

      if (match) {
        timeOfDayPreferenceScore += 30;
        reasoning.push(
          `符合任务指定的偏好时段 (${task.preferredTimeOfDay}): +30`
        );
      } else {
        timeOfDayPreferenceScore -= 15;
        reasoning.push(
          `不符合任务指定的偏好时段 (${task.preferredTimeOfDay}): -15`
        );
      }
    }

    // 2. 匹配用户全局的日程偏好 (来自 context.schedulingPreferences)
    if (context?.schedulingPreferences) {
      for (const pref of context.schedulingPreferences) {
        if (pref.isActive === false) continue;
        if (pref.preferenceType === "timing" && pref.details) {
          let taskTypeMatch =
            !pref.details.taskType || pref.details.taskType === task.taskType;
          if (taskTypeMatch) {
            const preferredTime = pref.details
              .preferredTimeOfDay as Task["preferredTimeOfDay"];
            const prefStartHour = pref.details.startHour;
            const prefEndHour = pref.details.endHour;
            let timeMatch = false;

            if (preferredTime) {
              if (
                preferredTime === "morning" &&
                slotStartHour >= (prefStartHour || 8) &&
                slotStartHour < (prefEndHour || 12)
              )
                timeMatch = true;
              else if (
                preferredTime === "afternoon" &&
                slotStartHour >= (prefStartHour || 13) &&
                slotStartHour < (prefEndHour || 17)
              )
                timeMatch = true;
              else if (
                preferredTime === "evening" &&
                slotStartHour >= (prefStartHour || 18) &&
                slotStartHour < (prefEndHour || 22)
              )
                timeMatch = true;
            } else if (
              prefStartHour !== undefined &&
              prefEndHour !== undefined
            ) {
              if (slotStartHour >= prefStartHour && slotStartHour < prefEndHour)
                timeMatch = true;
            }

            if (timeMatch) {
              const boost = 30 * (pref.importance || 0.6);
              timeOfDayPreferenceScore += boost;
              reasoning.push(
                `符合用户日程偏好 (${pref.description.substring(
                  0,
                  20
                )}...): +${boost.toFixed(0)}`
              );
            }
          }
          if (
            pref.details.avoidDaysOfWeek?.includes(slotDayOfWeek) &&
            taskTypeMatch
          ) {
            const penalty = 60 * (pref.importance || 0.6);
            timeOfDayPreferenceScore -= penalty;
            reasoning.push(
              `避免用户不偏好的星期几 (${pref.description.substring(
                0,
                20
              )}...): -${penalty.toFixed(0)}`
            );
          }
        }
        if (
          pref.preferenceType === "no_meeting_time" &&
          task.taskType?.toLowerCase().includes("meeting")
        ) {
          if (
            pref.details?.dayOfWeek === slotDayOfWeek &&
            slotStartHour >= pref.details.startHour &&
            slotStartHour < pref.details.endHour
          ) {
            timeOfDayPreferenceScore -= 100;
            reasoning.push(`符合“此时间不开会”的用户偏好: -100`);
          }
        }
      }
    }

    // 3. 离截止日期的远近
    if (task.dueDate) {
      const daysToDue =
        (new Date(task.dueDate).getTime() - slot.startTime.getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysToDue < 0) {
        proximityToDeadlineScore = -500;
        reasoning.push(
          `提议时间已过截止日期 ${Math.abs(daysToDue).toFixed(
            1
          )} 天: ${proximityToDeadlineScore}`
        );
      } else if (daysToDue < 0.5) {
        proximityToDeadlineScore = 60;
        reasoning.push(`半天内到期: +60`);
      } else if (daysToDue < 1.5) {
        proximityToDeadlineScore = 40;
        reasoning.push(`一天半内到期: +40`);
      } else if (daysToDue < 3.5) {
        proximityToDeadlineScore = 20;
        reasoning.push(`三天半内到期: +20`);
      } else {
        proximityToDeadlineScore = Math.max(-30, 5 - Math.floor(daysToDue / 3));
        if (proximityToDeadlineScore !== 0)
          reasoning.push(
            `离截止日期较远 (${daysToDue.toFixed(
              1
            )}天): 得分 ${proximityToDeadlineScore.toFixed(0)}`
          );
      }
      if (task.deadlineType === "hard" && daysToDue < 1) {
        proximityToDeadlineScore += 50;
        reasoning.push(`硬截止日期临近: +50`);
      }
    } else {
      proximityToDeadlineScore = -10;
      reasoning.push(`无截止日期: -10`);
    }

    // 4. 历史效率 (基于 context.recentTaskPerformance)
    if (context?.recentTaskPerformance && task.taskType) {
      const performances = context.recentTaskPerformance.filter(
        (p) =>
          p.taskType === task.taskType && p.timeOfDayCompleted !== undefined
      );
      const efficienciesInSlot = performances.filter((p) => {
        const completionHour = p.timeOfDayCompleted!;
        const wh = activeSlotCalcConstraints?.workingHours || {
          startHour: 9,
          lunchBreakHours: { start: 12, end: 13 },
          endHour: 18,
        };
        const morningEnd = wh.lunchBreakHours?.start || 12;
        const afternoonStart = wh.lunchBreakHours?.end || 13;

        if (slotStartHour >= wh.startHour && slotStartHour < morningEnd) {
          if (completionHour >= wh.startHour && completionHour < morningEnd)
            return true;
        } else if (
          slotStartHour >= afternoonStart &&
          slotStartHour < wh.endHour
        ) {
          if (completionHour >= afternoonStart && completionHour < wh.endHour)
            return true;
        } else if (slotStartHour >= 18 && slotStartHour < 22) {
          if (completionHour >= 18 && completionHour < 22) return true;
        }
        return false;
      });

      if (efficienciesInSlot.length > 0) {
        const avgDeviation =
          efficienciesInSlot.reduce(
            (sum, p) => sum + (p.deviationFromEstimateHours || 0),
            0
          ) / efficienciesInSlot.length;
        reasoning.push(
          `历史表现(${task.taskType}, ${
            efficienciesInSlot.length
          }条记录): 平均偏差 ${avgDeviation.toFixed(2)}h.`
        );
        if (avgDeviation < -0.25) {
          historicalEfficiencyScore = 25;
          reasoning.push(
            `调整：通常提前完成此类任务: +${historicalEfficiencyScore}`
          );
        } else if (avgDeviation > 0.5) {
          historicalEfficiencyScore = -30;
          reasoning.push(
            `调整：通常超时完成此类任务: ${historicalEfficiencyScore}`
          );
        } else if (avgDeviation > 0.25) {
          historicalEfficiencyScore = -15;
          reasoning.push(`调整：通常略微超时: ${historicalEfficiencyScore}`);
        } else {
          historicalEfficiencyScore = 10;
          reasoning.push(
            `调整：通常按时或略提前: +${historicalEfficiencyScore}`
          );
        }
      } else {
        reasoning.push(
          `无特定时段 (${task.taskType}) 的历史效率数据可供参考。`
        );
      }
    }

    // 5. 精力匹配 (基于 context.predictedEnergyForSlot)
    if (
      task.energyLevelRequired &&
      context?.predictedEnergyForSlot &&
      activeSlotCalcConstraints &&
      activeSlotCalcConstraints.matchUserEnergyCycle
    ) {
      const energyMap = { low: 1, medium: 2, high: 3 };
      const requiredEnergyVal =
        energyMap[task.energyLevelRequired as keyof typeof energyMap];
      const predictedSlotEnergyVal =
        energyMap[context.predictedEnergyForSlot as keyof typeof energyMap] ||
        energyMap["medium"];
      if (requiredEnergyVal) {
        if (predictedSlotEnergyVal < requiredEnergyVal) {
          energyMatchScore = -50;
          reasoning.push(
            `精力不匹配 (任务需 ${task.energyLevelRequired}, 时段精力预计 ${context.predictedEnergyForSlot}): ${energyMatchScore}`
          );
        } else if (predictedSlotEnergyVal === requiredEnergyVal) {
          energyMatchScore = 30;
          reasoning.push(
            `精力匹配 (任务需 ${task.energyLevelRequired}, 时段精力预计 ${context.predictedEnergyForSlot}): +${energyMatchScore}`
          );
        } else {
          energyMatchScore = 15;
          reasoning.push(
            `精力充沛处理低消耗任务 (时段精力预计 ${context.predictedEnergyForSlot}): +${energyMatchScore}`
          );
        }
      }
    }

    // 6. 日程连续性/避免碎片化 (continuityScore)
    if (context?.upcomingEvents) {
      const slotEndTimeMs = slot.endTime.getTime();
      const slotStartTimeMs = slot.startTime.getTime();
      const gapThresholdMs =
        (activeSlotCalcConstraints?.minGapMinutes || 15) * 60 * 1000;
      let connectedToPrevious = false;
      let connectedToNext = false;
      for (const event of context.upcomingEvents) {
        const eventStartTimeMs = new Date(event.startTime).getTime();
        const eventEndTimeMs = new Date(event.endTime).getTime();

        if (Math.abs(eventStartTimeMs - slotEndTimeMs) <= gapThresholdMs) {
          continuityScore += 15;
          reasoning.push(`可与后续日程 "${event.title}" 良好衔接: +15`);
          connectedToNext = true;
        }
        if (Math.abs(eventEndTimeMs - slotStartTimeMs) <= gapThresholdMs) {
          continuityScore += 15;
          reasoning.push(`可与先前日程 "${event.title}" 良好衔接: +15`);
          connectedToPrevious = true;
        }
        if (connectedToNext && connectedToPrevious) break;
      }
      if (
        !connectedToNext &&
        !connectedToPrevious &&
        context.upcomingEvents.length > 0
      ) {
        continuityScore -= 10;
        reasoning.push(`时段较为孤立，可能打断工作流: -10`);
      } else if (context.upcomingEvents.length === 0) {
        continuityScore += 5;
        reasoning.push(`开启一天/一段连续工作时间: +5`);
      }
    }

    const finalScore =
      timeOfDayPreferenceScore +
      proximityToDeadlineScore +
      historicalEfficiencyScore +
      energyMatchScore +
      continuityScore;
    return {
      timeOfDayPreferenceScore,
      proximityToDeadlineScore,
      historicalEfficiencyScore,
      energyMatchScore,
      continuityScore,
      finalScore,
      reasoning,
    };
  }

  private async _calculateTaskScore(
    task: Task,
    context: CurrentUserContext
  ): Promise<TaskScoreComponents> {
    const reasoning: string[] = [];
    let baseScore = 0;
    let urgencyScore = 0;
    let energyMatchScore = 0;
    let focusMatchScore = 0;
    let preferenceScore = 0;
    let dependencyScore = 0;
    let resourceScore = 0;
    let antiProcrastinationScore = 0;
    let historicalPerformanceAdjustScore = 0;

    const priorityMap = { 最高: 100, 高: 75, 中: 50, 低: 25, 未指定: 10 };
    const taskPriority = task.priority || "未指定";
    baseScore += priorityMap[taskPriority as keyof typeof priorityMap] || 10;
    reasoning.push(
      `优先级"${taskPriority}": +${
        priorityMap[taskPriority as keyof typeof priorityMap] || 10
      }`
    );
    baseScore += task.importanceScore || 0;
    if (task.importanceScore)
      reasoning.push(`重要性: +${task.importanceScore}`);

    if (task.dueDate) {
      const daysUntilDue =
        (new Date(task.dueDate).getTime() - context.currentTime.getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysUntilDue < 0) {
        urgencyScore = 200 + Math.abs(Math.floor(daysUntilDue)) * 10;
        reasoning.push(
          `已逾期 ${Math.abs(Math.floor(daysUntilDue))} 天: +${urgencyScore}`
        );
      } else if (daysUntilDue < 1) {
        urgencyScore = 150;
        reasoning.push(`今天到期: +${urgencyScore}`);
      } else if (daysUntilDue < 3) {
        urgencyScore = 100;
        reasoning.push(`3天内到期: +${urgencyScore}`);
      } else if (daysUntilDue < 7) {
        urgencyScore = 50;
        reasoning.push(`7天内到期: +${urgencyScore}`);
      } else {
        urgencyScore = Math.max(0, 20 - Math.floor(daysUntilDue / 7) * 5);
        if (urgencyScore > 0)
          reasoning.push(
            `未来 (${Math.floor(daysUntilDue)}天)到期: +${urgencyScore}`
          );
      }
    } else {
      urgencyScore = -20;
      reasoning.push(`无截止日期: ${urgencyScore}`);
    }
    if (task.urgencyScore) {
      urgencyScore += task.urgencyScore;
      reasoning.push(`用户定义紧急性: +${task.urgencyScore}`);
    }

    if (task.energyLevelRequired && context.currentEnergyLevel) {
      const energyMap = { low: 1, medium: 2, high: 3 };
      const requiredEnergyVal =
        energyMap[task.energyLevelRequired as keyof typeof energyMap];
      let currentEnergyVal: number;
      if (
        typeof context.currentEnergyLevel === "string" &&
        energyMap[context.currentEnergyLevel as keyof typeof energyMap]
      ) {
        currentEnergyVal =
          energyMap[context.currentEnergyLevel as keyof typeof energyMap];
      } else if (typeof context.currentEnergyLevel === "number") {
        currentEnergyVal = context.currentEnergyLevel;
      } else {
        currentEnergyVal = energyMap["medium"];
      }
      if (requiredEnergyVal) {
        if (currentEnergyVal < requiredEnergyVal) {
          energyMatchScore = -75;
          reasoning.push(
            `精力不足 (需${task.energyLevelRequired}/现${context.currentEnergyLevel}): ${energyMatchScore}`
          );
        } else if (currentEnergyVal === requiredEnergyVal) {
          energyMatchScore = 20;
          reasoning.push(
            `精力匹配 (需${task.energyLevelRequired}/现${context.currentEnergyLevel}): +${energyMatchScore}`
          );
        } else {
          energyMatchScore = 10;
          reasoning.push(`精力充沛处理低消耗任务: +${energyMatchScore}`);
        }
      }
    }

    if (context.userFocus) {
      const focusAreas = Array.isArray(context.userFocus)
        ? context.userFocus
        : [context.userFocus];
      let matchFound = false;
      for (const focus of focusAreas) {
        if (
          task.name.toLowerCase().includes(focus.toLowerCase()) ||
          (task.description &&
            task.description.toLowerCase().includes(focus.toLowerCase())) ||
          (task.tags &&
            task.tags.some((tag) =>
              tag.toLowerCase().includes(focus.toLowerCase())
            )) ||
          (task.projectId && task.projectId.toString() === focus)
        ) {
          focusMatchScore = 80;
          reasoning.push(`匹配当前关注点 "${focus}": +${focusMatchScore}`);
          matchFound = true;
          break;
        }
      }
      if (!matchFound && focusAreas.length > 0) {
        focusMatchScore = -30;
        reasoning.push(`不匹配当前关注点: ${focusMatchScore}`);
      }
    }

    if (context.schedulingPreferences) {
      for (const pref of context.schedulingPreferences) {
        if (
          pref.preferenceType === "timing" &&
          pref.details?.taskType === task.taskType
        ) {
          const preferredTime = pref.details
            .preferredTimeOfDay as Task["preferredTimeOfDay"];
          const currentHour = context.currentTime.getHours();
          let timeMatch = false;
          if (
            preferredTime === "morning" &&
            currentHour >= (pref.details.startHour || 8) &&
            currentHour < (pref.details.endHour || 12)
          )
            timeMatch = true;
          if (
            preferredTime === "afternoon" &&
            currentHour >= (pref.details.startHour || 13) &&
            currentHour < (pref.details.endHour || 17)
          )
            timeMatch = true;
          if (
            preferredTime === "evening" &&
            currentHour >= (pref.details.startHour || 19) &&
            currentHour < (pref.details.endHour || 22)
          )
            timeMatch = true;
          if (timeMatch) {
            const preferenceBoost = 30 * (pref.importance || 0.5);
            preferenceScore += preferenceBoost;
            reasoning.push(
              `符合偏好 (${pref.description.substring(
                0,
                20
              )}...): +${preferenceBoost.toFixed(0)}`
            );
          }
        }
      }
    }
    if (task.preferredTimeOfDay && task.preferredTimeOfDay !== "any") {
      const currentHour = context.currentTime.getHours();
      let timeMatch = false;
      if (
        task.preferredTimeOfDay === "morning" &&
        currentHour >= 8 &&
        currentHour < 12
      )
        timeMatch = true;
      if (
        task.preferredTimeOfDay === "afternoon" &&
        currentHour >= 13 &&
        currentHour < 17
      )
        timeMatch = true;
      if (
        task.preferredTimeOfDay === "evening" &&
        currentHour >= 19 &&
        currentHour < 22
      )
        timeMatch = true;
      if (timeMatch) {
        preferenceScore += 15;
        reasoning.push(`符合任务偏好时间 (${task.preferredTimeOfDay}): +15`);
      } else {
        preferenceScore -= 10;
        reasoning.push(`不符合任务偏好时间 (${task.preferredTimeOfDay}): -10`);
      }
    }

    if (task.requiredResources) {
      const locationResource = task.requiredResources.find(
        (r) => r.type === "location" && r.resourceId
      );
      if (locationResource && context.currentLocationId) {
        if (
          ensureObjectId(locationResource.resourceId!).toString() !==
          ensureObjectId(context.currentLocationId).toString()
        ) {
          resourceScore = -60;
          reasoning.push(
            `地点不匹配 (需在${
              locationResource.name || locationResource.resourceId
            }, 当前在别处): ${resourceScore}`
          );
        } else {
          resourceScore = 10;
          reasoning.push(`地点匹配: +${resourceScore}`);
        }
      }
    }

    if (
      (task.importanceScore || 0) >= 70 &&
      (!task.dueDate ||
        (new Date(task.dueDate).getTime() - context.currentTime.getTime()) /
          (1000 * 60 * 60 * 24) >
          7)
    ) {
      const daysSinceCreation =
        (context.currentTime.getTime() - new Date(task.createdAt).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSinceCreation > 7) {
        antiProcrastinationScore = Math.min(
          50,
          Math.floor(daysSinceCreation / 3) * 5
        );
        reasoning.push(
          `防止拖延 (重要任务创建${Math.floor(
            daysSinceCreation
          )}天): +${antiProcrastinationScore}`
        );
      }
    }

    if (context.recentTaskPerformance && task.taskType) {
      const performancesForType = context.recentTaskPerformance.filter(
        (p) => p.taskType === task.taskType
      );
      if (performancesForType.length > 0) {
        let totalDeviationRatio = 0;
        let count = 0;
        for (const perf of performancesForType) {
          if (
            perf.actualEffortHours &&
            perf.estimatedEffortHours &&
            perf.estimatedEffortHours > 0
          ) {
            totalDeviationRatio +=
              perf.actualEffortHours / perf.estimatedEffortHours;
            count++;
          }
        }
        if (count > 0) {
          const avgDeviationRatio = totalDeviationRatio / count;
          reasoning.push(
            `历史表现: 平均实际/预估工时比率 ${avgDeviationRatio.toFixed(
              2
            )} (针对类型 ${task.taskType})`
          );
          if (avgDeviationRatio > 1.2) {
            historicalPerformanceAdjustScore = -20;
            reasoning.push(
              `调整：可能比预估耗时更长: ${historicalPerformanceAdjustScore}`
            );
          } else if (avgDeviationRatio < 0.8) {
            historicalPerformanceAdjustScore = 10;
            reasoning.push(
              `调整：可能比预估耗时更短: +${historicalPerformanceAdjustScore}`
            );
          }
        }
      }
    }

    const finalScore =
      baseScore +
      urgencyScore +
      energyMatchScore +
      focusMatchScore +
      preferenceScore +
      dependencyScore +
      resourceScore +
      antiProcrastinationScore +
      historicalPerformanceAdjustScore;
    return {
      baseScore,
      urgencyScore,
      energyMatchScore,
      focusMatchScore,
      preferenceScore,
      dependencyScore,
      resourceScore,
      antiProcrastinationScore,
      historicalPerformanceAdjustScore,
      finalScore: Math.max(0, finalScore),
      reasoning,
    };
  }
}
