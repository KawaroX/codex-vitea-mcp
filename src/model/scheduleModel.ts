import {
  Collection,
  Db,
  ObjectId,
  Filter,
  FindOptions,
  UpdateFilter,
} from "mongodb";
// 确保从您的 types.ts 导入 ScheduledEvent, BaseDocument, SyncFields, ensureObjectId
import { ScheduledEvent, ensureObjectId, SyncFields } from "./types.js";

// 用于创建新日程事件时的数据类型，排除了自动管理的字段
export type NewScheduledEventData = Partial<
  Omit<ScheduledEvent, "_id" | "createdAt" | "updatedAt" | keyof SyncFields>
>;

/**
 * ScheduleModel 类
 * 负责与 MongoDB 中的 'scheduledEvents' 集合进行交互，管理 ScheduledEvent 文档。
 */
export class ScheduleModel {
  private scheduledEventsCollection: Collection<ScheduledEvent>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.scheduledEventsCollection =
      db.collection<ScheduledEvent>("scheduledEvents");
    this._ensureIndexes();
  }

  /**
   * 确保为 scheduledEvents 集合创建必要的索引。
   */
  private async _ensureIndexes(): Promise<void> {
    try {
      await this.scheduledEventsCollection.createIndex(
        { startTime: 1, endTime: 1 },
        { background: true }
      );
      await this.scheduledEventsCollection.createIndex(
        { userId: 1, startTime: 1 },
        { background: true, sparse: true }
      ); // 如果支持多用户
      await this.scheduledEventsCollection.createIndex(
        { eventType: 1 },
        { background: true }
      );
      await this.scheduledEventsCollection.createIndex(
        { taskId: 1 },
        { background: true, sparse: true }
      );
      await this.scheduledEventsCollection.createIndex(
        { "participants.contactId": 1 },
        { background: true, sparse: true }
      );
      await this.scheduledEventsCollection.createIndex(
        { status: 1 },
        { background: true, sparse: true }
      );
      console.log(
        "ScheduleModel: Indexes for 'scheduledEvents' collection ensured."
      );
    } catch (error) {
      console.error(
        "ScheduleModel: Error ensuring indexes for 'scheduledEvents' collection:",
        error
      );
    }
  }

  /**
   * 创建一个新的日程事件。
   * @param eventData 要创建的日程事件数据。
   * @returns 成功创建的 ScheduledEvent 对象，如果失败则返回 null。
   */
  async createEvent(
    eventData: NewScheduledEventData
  ): Promise<ScheduledEvent | null> {
    try {
      if (!eventData.title || !eventData.startTime || !eventData.endTime) {
        throw new Error(
          "创建日程事件时，'title', 'startTime', 和 'endTime' 是必需的。"
        );
      }

      const now = new Date();
      const documentToInsert: Omit<ScheduledEvent, "_id"> = {
        // --- 必需字段 ---
        title: eventData.title,
        startTime: new Date(eventData.startTime), // 确保是 Date 对象
        endTime: new Date(eventData.endTime), // 确保是 Date 对象
        eventType: eventData.eventType || "personal_block", // 默认事件类型

        // --- BaseDocument 和 SyncFields 的默认值 ---
        createdAt: now,
        updatedAt: now,
        syncedToNotion: false,
        lastSync: null,
        modifiedSinceSync: true,

        // --- 从 eventData 赋值 ---
        isAllDay: eventData.isAllDay || false,
        description: eventData.description,
        taskId: eventData.taskId ? ensureObjectId(eventData.taskId) : undefined,
        locationId: eventData.locationId
          ? ensureObjectId(eventData.locationId)
          : undefined,
        locationDescription: eventData.locationDescription,
        participants:
          eventData.participants?.map((p) => ({
            ...p,
            contactId: p.contactId ? ensureObjectId(p.contactId) : undefined,
          })) || [],
        status: eventData.status || "confirmed",
        isRecurringInstance: eventData.isRecurringInstance || false,
        recurringEventId: eventData.recurringEventId
          ? ensureObjectId(eventData.recurringEventId)
          : undefined,
        originalStartTime: eventData.originalStartTime
          ? new Date(eventData.originalStartTime)
          : undefined,
        reminders: eventData.reminders || [],
        color: eventData.color,
        customFields: eventData.customFields,
      };

      const result = await this.scheduledEventsCollection.insertOne(
        documentToInsert as ScheduledEvent
      );
      if (result.insertedId) {
        return await this.getEventById(result.insertedId);
      }
      return null;
    } catch (error: any) {
      console.error("ScheduleModel: Error creating event:", error);
      throw error; // 或者返回 { success: false, error: error.message }
    }
  }

  /**
   * 根据 ObjectId 检索一个日程事件。
   * @param eventId 日程事件的 ObjectId。
   * @returns ScheduledEvent 对象，如果未找到则返回 null。
   */
  async getEventById(
    eventId: ObjectId | string
  ): Promise<ScheduledEvent | null> {
    try {
      const id = ensureObjectId(eventId);
      return await this.scheduledEventsCollection.findOne({ _id: id });
    } catch (error) {
      console.error("ScheduleModel: Error getting event by ID:", error);
      return null;
    }
  }

  /**
   * 根据特定条件查找日程事件。
   * @param filter MongoDB 查询过滤器。
   * @param options MongoDB 查询选项。
   * @returns 符合条件的 ScheduledEvent 对象数组。
   */
  async findEvents(
    filter: Filter<ScheduledEvent>,
    options?: FindOptions<ScheduledEvent>
  ): Promise<ScheduledEvent[]> {
    try {
      // 默认按开始时间升序排序
      const defaultOptions: FindOptions<ScheduledEvent> = {
        sort: { startTime: 1 },
        ...options,
      };
      return await this.scheduledEventsCollection
        .find(filter, defaultOptions)
        .toArray();
    } catch (error) {
      console.error("ScheduleModel: Error finding events:", error);
      return [];
    }
  }

  /**
   * 查找指定时间范围内的日程事件。
   * @param rangeStartTime 时间范围开始。
   * @param rangeEndTime 时间范围结束。
   * @param additionalFilter (可选) 额外的过滤条件。
   * @returns 在该时间范围内重叠的 ScheduledEvent 对象数组。
   */
  async findEventsInTimeRange(
    rangeStartTime: Date,
    rangeEndTime: Date,
    additionalFilter: Filter<ScheduledEvent> = {}
  ): Promise<ScheduledEvent[]> {
    try {
      // 查询与给定范围有重叠的事件：
      // 1. 事件在范围内开始: event.startTime >= rangeStartTime && event.startTime < rangeEndTime
      // 2. 事件在范围内结束: event.endTime > rangeStartTime && event.endTime <= rangeEndTime
      // 3. 事件包含整个范围: event.startTime < rangeStartTime && event.endTime > rangeEndTime
      // 4. 事件被范围包含: event.startTime >= rangeStartTime && event.endTime <= rangeEndTime (这个被1和2覆盖)
      // 简化为: event.startTime < rangeEndTime AND event.endTime > rangeStartTime
      const query: Filter<ScheduledEvent> = {
        ...additionalFilter,
        startTime: { $lt: rangeEndTime },
        endTime: { $gt: rangeStartTime },
      };
      return await this.findEvents(query);
    } catch (error) {
      console.error(
        "ScheduleModel: Error finding events in time range:",
        error
      );
      return [];
    }
  }

  /**
   * 更新一个已存在的日程事件。
   * @param eventId 要更新的日程事件的 ObjectId。
   * @param updateFilter 一个 MongoDB UpdateFilter 对象。
   * @returns 更新成功返回 true，否则返回 false。
   */
  async updateEvent(
    eventId: ObjectId | string,
    updateFilter: UpdateFilter<ScheduledEvent>
  ): Promise<boolean> {
    try {
      const id = ensureObjectId(eventId);
      const finalUpdateFilter: UpdateFilter<ScheduledEvent> = {
        ...updateFilter,
      };

      if (!finalUpdateFilter.$set) {
        finalUpdateFilter.$set = {};
      }
      (finalUpdateFilter.$set as Partial<ScheduledEvent>).updatedAt =
        new Date();
      (finalUpdateFilter.$set as Partial<ScheduledEvent>).modifiedSinceSync =
        true;

      // 确保 $set 中的 ObjectId 和 Date 字段是正确的类型
      if (finalUpdateFilter.$set) {
        const setPayload = finalUpdateFilter.$set as Partial<ScheduledEvent>;
        if (setPayload.taskId)
          setPayload.taskId = ensureObjectId(setPayload.taskId);
        if (setPayload.locationId)
          setPayload.locationId = ensureObjectId(setPayload.locationId);
        if (setPayload.recurringEventId)
          setPayload.recurringEventId = ensureObjectId(
            setPayload.recurringEventId
          );
        if (setPayload.startTime)
          setPayload.startTime = new Date(setPayload.startTime);
        if (setPayload.endTime)
          setPayload.endTime = new Date(setPayload.endTime);
        if (setPayload.originalStartTime)
          setPayload.originalStartTime = new Date(setPayload.originalStartTime);
        if (setPayload.participants) {
          setPayload.participants = setPayload.participants.map((p) => ({
            ...p,
            contactId: p.contactId ? ensureObjectId(p.contactId) : undefined,
          }));
        }
      }

      const result = await this.scheduledEventsCollection.updateOne(
        { _id: id },
        finalUpdateFilter
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("ScheduleModel: Error updating event:", error);
      return false;
    }
  }

  /**
   * 删除一个日程事件。
   * @param eventId 要删除的日程事件的 ObjectId。
   * @returns 删除成功返回 true，否则返回 false。
   */
  async deleteEvent(eventId: ObjectId | string): Promise<boolean> {
    try {
      const id = ensureObjectId(eventId);
      const result = await this.scheduledEventsCollection.deleteOne({
        _id: id,
      });
      return result.deletedCount > 0;
    } catch (error) {
      console.error("ScheduleModel: Error deleting event:", error);
      return false;
    }
  }

  /**
   * 检查指定时间段内是否有任何事件（用于检测时间冲突）。
   * @param startTime 开始时间。
   * @param endTime 结束时间。
   * @param excludeEventId (可选) 检查冲突时要排除的事件ID (例如，更新现有事件时)。
   * @returns 如果有冲突则返回 true，否则返回 false。
   */
  async hasTimeConflict(
    startTime: Date,
    endTime: Date,
    excludeEventId?: ObjectId | string
  ): Promise<boolean> {
    try {
      const query: Filter<ScheduledEvent> = {
        startTime: { $lt: endTime }, // 事件开始时间在查询结束时间之前
        endTime: { $gt: startTime }, // 事件结束时间在查询开始时间之后
      };
      if (excludeEventId) {
        query._id = { $ne: ensureObjectId(excludeEventId) };
      }
      const conflictingEvent = await this.scheduledEventsCollection.findOne(
        query
      );
      return !!conflictingEvent; // 如果找到任何一个，则表示有冲突
    } catch (error) {
      console.error("ScheduleModel: Error checking for time conflict:", error);
      return true; // 出错时，保守地认为有冲突
    }
  }

  /**
   * 获取与特定任务ID关联的所有日程事件。
   * @param taskId 任务ID
   */
  async getEventsByTaskId(
    taskId: ObjectId | string
  ): Promise<ScheduledEvent[]> {
    try {
      return await this.findEvents({ taskId: ensureObjectId(taskId) });
    } catch (error) {
      console.error("ScheduleModel: Error getting events by task ID:", error);
      return [];
    }
  }
}
