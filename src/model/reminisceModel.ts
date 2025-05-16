import {
  Collection,
  Db,
  ObjectId,
  Filter,
  FindOptions,
  UpdateFilter,
} from "mongodb";
import {
  EnhancedMemoryUnit,
  MemoryPattern,
  ensureObjectId,
  isObjectId,
  SyncFields,
} from "./types.js"; // 确保从您的 types.ts 导入

export class ReminisceModel {
  private memoriesCollection: Collection<EnhancedMemoryUnit>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.memoriesCollection = db.collection<EnhancedMemoryUnit>("memories");
    this._ensureIndexes();
  }

  private async _ensureIndexes(): Promise<void> {
    try {
      await this.memoriesCollection.createIndex(
        { "pattern.type": 1, "pattern.intent": 1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { "pattern.keywords": 1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { "entities.id": 1, "entities.type": 1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { tier: 1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { importance: -1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { confidence: -1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { lastAccessed: -1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { accessCount: -1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { createdAt: -1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { expiresAt: 1 },
        { background: true, sparse: true }
      );
      await this.memoriesCollection.createIndex(
        { relatedMemories: 1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { tags: 1 },
        { background: true }
      );
      await this.memoriesCollection.createIndex(
        { "context.userId": 1 },
        { background: true, sparse: true }
      );
      await this.memoriesCollection.createIndex(
        { "context.conversationId": 1 },
        { background: true, sparse: true }
      );
      await this.memoriesCollection.createIndex(
        { "context.sourceTool": 1 },
        { background: true }
      );
      console.log("ReminisceModel: Indexes for 'memories' collection ensured.");
    } catch (error) {
      console.error(
        "ReminisceModel: Error ensuring indexes for 'memories' collection:",
        error
      );
    }
  }

  async storeMemory(
    memoryData: Omit<
      EnhancedMemoryUnit,
      "_id" | "createdAt" | "updatedAt" | keyof SyncFields
    >
  ): Promise<EnhancedMemoryUnit | null> {
    try {
      const now = new Date();
      const documentToInsert: Omit<EnhancedMemoryUnit, "_id"> = {
        ...memoryData,
        entities: memoryData.entities?.map((e) => ({
          ...e,
          id: ensureObjectId(e.id),
        })),
        relationships: memoryData.relationships?.map((r) => ({
          ...r,
          sourceEntityId: ensureObjectId(r.sourceEntityId),
          targetEntityId: ensureObjectId(r.targetEntityId),
        })),
        relatedMemories: memoryData.relatedMemories?.map((id) =>
          ensureObjectId(id)
        ),
        createdAt: now,
        updatedAt: now,
        syncedToNotion: false,
        lastSync: null,
        modifiedSinceSync: true,
        ...(memoryData.customFields && {
          customFields: memoryData.customFields,
        }),
      };

      const result = await this.memoriesCollection.insertOne(
        documentToInsert as EnhancedMemoryUnit
      );
      if (result.insertedId) {
        return await this.getMemoryById(result.insertedId);
      }
      return null;
    } catch (error) {
      console.error("ReminisceModel: Error storing memory:", error);
      return null;
    }
  }

  async getMemoryById(
    memoryId: ObjectId | string
  ): Promise<EnhancedMemoryUnit | null> {
    try {
      const id = ensureObjectId(memoryId);
      return await this.memoriesCollection.findOne({ _id: id });
    } catch (error) {
      console.error("ReminisceModel: Error getting memory by ID:", error);
      return null;
    }
  }

  async findMemories(
    query: Filter<EnhancedMemoryUnit>,
    options?: FindOptions<EnhancedMemoryUnit>
  ): Promise<EnhancedMemoryUnit[]> {
    try {
      const defaultOptions: FindOptions<EnhancedMemoryUnit> = {
        sort: {
          importance: -1,
          confidence: -1,
          lastAccessed: -1,
          createdAt: -1,
        },
        limit: 10,
        ...options,
      };
      return await this.memoriesCollection
        .find(query, defaultOptions)
        .toArray();
    } catch (error) {
      console.error("ReminisceModel: Error finding memories:", error);
      return [];
    }
  }

  /**
   * 更新一个已存在的记忆单元。
   * @param memoryId 要更新的记忆单元的 ObjectId。
   * @param updateFilter 一个 MongoDB UpdateFilter 对象，可以包含 $set, $inc, $push 等操作符。
   * @returns 更新成功返回 true，否则返回 false。
   */
  async updateMemory(
    memoryId: ObjectId | string,
    updateFilter: UpdateFilter<EnhancedMemoryUnit>
  ): Promise<boolean> {
    try {
      const id = ensureObjectId(memoryId);

      // 准备最终的更新操作对象
      // 我们需要确保 updatedAt 和 modifiedSinceSync 总是被更新
      const finalUpdateFilter: UpdateFilter<EnhancedMemoryUnit> = {
        ...updateFilter,
      };

      // 确保 $set 操作存在，并添加 updatedAt 和 modifiedSinceSync
      if (!finalUpdateFilter.$set) {
        finalUpdateFilter.$set = {};
      }
      // 类型断言，因为我们知道 $set 肯定存在了
      (finalUpdateFilter.$set as Partial<EnhancedMemoryUnit>).updatedAt =
        new Date();
      (
        finalUpdateFilter.$set as Partial<EnhancedMemoryUnit>
      ).modifiedSinceSync = true;

      // 如果传入的 updateFilter.$set 中有 entities, relationships, relatedMemories，确保其内部ID是ObjectId
      if (
        finalUpdateFilter.$set &&
        typeof finalUpdateFilter.$set === "object"
      ) {
        const setPayload =
          finalUpdateFilter.$set as Partial<EnhancedMemoryUnit>;
        if (setPayload.entities) {
          setPayload.entities = setPayload.entities.map((e) => ({
            ...e,
            id: ensureObjectId(e.id),
          }));
        }
        if (setPayload.relationships) {
          setPayload.relationships = setPayload.relationships.map((r) => ({
            ...r,
            sourceEntityId: ensureObjectId(r.sourceEntityId),
            targetEntityId: ensureObjectId(r.targetEntityId),
          }));
        }
        if (setPayload.relatedMemories) {
          setPayload.relatedMemories = setPayload.relatedMemories.map((rmId) =>
            ensureObjectId(rmId)
          );
        }
      }

      const result = await this.memoriesCollection.updateOne(
        { _id: id },
        finalUpdateFilter
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("ReminisceModel: Error updating memory:", error);
      return false;
    }
  }

  async deleteMemory(memoryId: ObjectId | string): Promise<boolean> {
    try {
      const id = ensureObjectId(memoryId);
      const result = await this.memoriesCollection.deleteOne({ _id: id });
      return result.deletedCount > 0;
    } catch (error) {
      console.error("ReminisceModel: Error deleting memory:", error);
      return false;
    }
  }

  async archiveMemory(memoryId: ObjectId | string): Promise<boolean> {
    try {
      // 使用 UpdateFilter 来设置 tier 和其他可能的归档标记
      const updateOps: UpdateFilter<EnhancedMemoryUnit> = {
        $set: {
          tier: "archived",
          // 如果 EnhancedMemoryUnit 有 customFields 并且你想用它来标记归档:
          // customFields: { isArchived: true } // 这会覆盖已有的 customFields，可能需要 $set: { "customFields.isArchived": true }
        },
      };
      return await this.updateMemory(memoryId, updateOps);
    } catch (error) {
      console.error("ReminisceModel: Error archiving memory:", error);
      return false;
    }
  }

  async findRelatedMemories(
    memoryId: ObjectId | string,
    depth: number = 1,
    options?: FindOptions<EnhancedMemoryUnit>
  ): Promise<EnhancedMemoryUnit[]> {
    try {
      const id = ensureObjectId(memoryId);
      const memory = await this.getMemoryById(id);
      if (
        !memory ||
        !memory.relatedMemories ||
        memory.relatedMemories.length === 0
      ) {
        return [];
      }
      const relatedIds = memory.relatedMemories.map((relId) =>
        ensureObjectId(relId)
      );
      return await this.findMemories({ _id: { $in: relatedIds } }, options);
    } catch (error) {
      console.error("ReminisceModel: Error finding related memories:", error);
      return [];
    }
  }

  async updateMemoryTiers(
    memoryIds: (ObjectId | string)[],
    newTier: string
  ): Promise<number> {
    try {
      const ids = memoryIds.map((id) => ensureObjectId(id));
      const updateOps: UpdateFilter<EnhancedMemoryUnit> = {
        $set: { tier: newTier },
      };
      // updateMemory 会自动添加 updatedAt 和 modifiedSinceSync
      const result = await this.memoriesCollection.updateMany(
        { _id: { $in: ids } },
        // 直接调用 updateMany 时，需要手动添加 updatedAt 和 modifiedSinceSync
        // 或者我们可以改造 updateMemoryTiers 来逐个调用 updateMemory，但效率较低
        // 这里我们选择直接调用 updateMany 并手动添加
        {
          $set: {
            tier: newTier,
            updatedAt: new Date(),
            modifiedSinceSync: true,
          },
        }
      );
      return result.modifiedCount;
    } catch (error) {
      console.error("ReminisceModel: Error updating memory tiers:", error);
      return 0;
    }
  }

  async decayMemories(
    criteria: Filter<EnhancedMemoryUnit>,
    action: "delete" | "archive" = "archive"
  ): Promise<number> {
    let processedCount = 0;
    try {
      const memoriesToDecay = await this.memoriesCollection
        .find(criteria)
        .project({ _id: 1 })
        .toArray();
      if (memoriesToDecay.length === 0) {
        return 0;
      }

      for (const mem of memoriesToDecay) {
        let success = false;
        if (action === "delete") {
          success = await this.deleteMemory(mem._id);
        } else {
          success = await this.archiveMemory(mem._id);
        }
        if (success) {
          processedCount++;
        }
      }
      console.log(
        `ReminisceModel: Decayed ${processedCount} memories with action '${action}'.`
      );
      return processedCount;
    } catch (error) {
      console.error("ReminisceModel: Error decaying memories:", error);
      return processedCount;
    }
  }
}
