import { Db, Filter, FindOptions, ObjectId, UpdateFilter } from "mongodb";
import { ReminisceModel } from "../../model/reminisceModel.js";
import {
  EnhancedMemoryUnit,
  MemoryPattern,
  ensureObjectId,
  SyncFields,
  Contact,
  Item,
  Task,
  Location,
  BioData,
} from "../../model/types.js";

// 辅助类型，用于学习时传入的实体信息
export interface EntityReference {
  id: string | ObjectId;
  type: string;
  name?: string;
  role?: string;
}

// 学习方法参数
export interface LearnParams {
  pattern: MemoryPattern;
  result: any;
  summary?: string;
  entities?: EntityReference[];
  relationships?: Array<{
    sourceEntityId: string | ObjectId;
    relationshipType: string;
    targetEntityId: string | ObjectId;
    direction?: "to" | "from" | "bi";
    context?: string;
  }>;
  context?: EnhancedMemoryUnit["context"];
  importance?: number;
  confidence?: number;
  tier?: EnhancedMemoryUnit["tier"];
  tags?: string[];
  expiresAt?: Date;
  relatedMemoryIds?: (string | ObjectId)[];
}

// 回忆方法参数
export interface RecallParams {
  pattern?: MemoryPattern;
  textQuery?: string;
  entities?: EntityReference[];
  context?: EnhancedMemoryUnit["context"];
  options?: FindOptions<EnhancedMemoryUnit>;
  minConfidence?: number;
  requiredTiers?: EnhancedMemoryUnit["tier"][];
}

// 记忆管理操作类型 (这个类型主要在 ReminisceTool 中使用，这里保留或移除均可)
export type MemoryManagementAction =
  | "accessed"
  | "importance_updated"
  | "confidence_updated"
  | "tier_changed";

// 定义返回类型，用于多个管理方法
interface MemoryUpdateResult {
  success: boolean;
  memory?: EnhancedMemoryUnit | null;
  message?: string;
  error?: string;
}

export class ProReminisceManager {
  private db: Db;
  private reminisceModel: ReminisceModel;

  constructor(db: Db) {
    this.db = db;
    this.reminisceModel = new ReminisceModel(db);
  }

  async learn(params: LearnParams): Promise<EnhancedMemoryUnit | null> {
    try {
      const {
        pattern,
        result,
        summary,
        entities: entityRefs,
        relationships: relationshipRefs,
        context,
        importance,
        confidence,
        tier,
        tags,
        expiresAt,
        relatedMemoryIds,
      } = params;

      const processedEntities = entityRefs?.map((ref) => ({
        id: ensureObjectId(ref.id),
        type: ref.type,
        role: ref.role,
      }));

      const processedRelationships = relationshipRefs?.map((ref) => ({
        sourceEntityId: ensureObjectId(ref.sourceEntityId),
        relationshipType: ref.relationshipType,
        targetEntityId: ensureObjectId(ref.targetEntityId),
        direction: ref.direction,
        context: ref.context,
      }));

      const memoryData: Omit<
        EnhancedMemoryUnit,
        "_id" | "createdAt" | "updatedAt" | keyof SyncFields
      > = {
        pattern,
        result,
        summary: summary || this.generateSummaryFromResult(result),
        entities: processedEntities,
        relationships: processedRelationships,
        context: {
          timestamp: new Date(),
          ...context,
        },
        importance:
          importance !== undefined ? Math.max(0, Math.min(1, importance)) : 0.5,
        confidence:
          confidence !== undefined ? Math.max(0, Math.min(1, confidence)) : 0.8,
        tier: tier || "medium",
        accessCount: 0,
        lastAccessed: new Date(),
        tags: tags || [],
        ...(expiresAt && { expiresAt }),
        ...(relatedMemoryIds && {
          relatedMemories: relatedMemoryIds.map((id) => ensureObjectId(id)),
        }),
      };

      const storedMemory = await this.reminisceModel.storeMemory(memoryData);

      if (storedMemory) {
        this.findAndLinkRelatedMemories(storedMemory).catch((err) => {
          console.error(
            "ProReminisceManager: Error in background findAndLinkRelatedMemories:",
            err
          );
        });
        return storedMemory;
      }
      return null;
    } catch (error) {
      console.error("ProReminisceManager: Error in learn():", error);
      return null;
    }
  }

  async recall(params: RecallParams): Promise<EnhancedMemoryUnit[]> {
    try {
      const {
        pattern,
        textQuery,
        entities: entityRefs,
        context,
        options,
        minConfidence,
        requiredTiers,
      } = params;
      const queryFilter: Filter<EnhancedMemoryUnit> = {};

      if (pattern) {
        if (pattern.type) queryFilter["pattern.type"] = pattern.type;
        if (pattern.intent) queryFilter["pattern.intent"] = pattern.intent;
        if (pattern.keywords && pattern.keywords.length > 0)
          queryFilter["pattern.keywords"] = { $all: pattern.keywords };
      }
      if (textQuery)
        console.warn(
          "ProReminisceManager: textQuery processing is not fully implemented yet."
        );
      if (entityRefs && entityRefs.length > 0)
        queryFilter["entities.id"] = {
          $all: entityRefs.map((e) => ensureObjectId(e.id)),
        };
      if (context) {
        if (context.userId) queryFilter["context.userId"] = context.userId;
        if (context.sessionId)
          queryFilter["context.sessionId"] = context.sessionId;
      }
      if (minConfidence !== undefined)
        queryFilter.confidence = { $gte: minConfidence };
      if (requiredTiers && requiredTiers.length > 0)
        queryFilter.tier = { $in: requiredTiers };
      if (
        !queryFilter.tier ||
        (typeof queryFilter.tier === "object" &&
          !(
            "$in" in queryFilter.tier &&
            (queryFilter.tier.$in as any[]).includes("archived")
          ))
      ) {
        queryFilter.tier = {
          ...((queryFilter.tier as object) || {}),
          $ne: "archived",
        };
      }

      const memories = await this.reminisceModel.findMemories(
        queryFilter,
        options
      );

      if (memories.length > 0) {
        const now = new Date();
        memories.forEach((mem) => {
          const updateOps: UpdateFilter<EnhancedMemoryUnit> = {
            $set: { lastAccessed: now },
            $inc: { accessCount: 1 },
          };
          this.reminisceModel.updateMemory(mem._id, updateOps).catch((err) => {
            console.error(
              `ProReminisceManager: Error updating access stats for memory ${mem._id}:`,
              err
            );
          });
        });
      }
      return memories;
    } catch (error) {
      console.error("ProReminisceManager: Error in recall():", error);
      return [];
    }
  }

  private generateSummaryFromResult(result: any): string {
    if (!result) return "";
    if (typeof result === "string")
      return result.substring(0, 100) + (result.length > 100 ? "..." : "");
    if (typeof result === "object" && result !== null) {
      if (result.name) return String(result.name);
      if (result.title) return String(result.title);
      if (result.description)
        return (
          String(result.description).substring(0, 100) +
          (String(result.description).length > 100 ? "..." : "")
        );
      try {
        const jsonSummary = JSON.stringify(result);
        return (
          jsonSummary.substring(0, 100) +
          (jsonSummary.length > 100 ? "..." : "")
        );
      } catch {
        return "[非文本内容]";
      }
    }
    return String(result).substring(0, 100);
  }

  async findAndLinkRelatedMemories(memory: EnhancedMemoryUnit): Promise<void> {
    if (!memory._id) return;
    const potentialLinks: Set<string> = new Set(
      memory.relatedMemories?.map((id) => ensureObjectId(id).toString()) || []
    );
    let newLinksMade = false;

    if (memory.entities && memory.entities.length > 0) {
      for (const entity of memory.entities) {
        const relatedByEntity = await this.reminisceModel.findMemories(
          { "entities.id": entity.id, _id: { $ne: memory._id } },
          { limit: 5, sort: { importance: -1, confidence: -1 } }
        );
        for (const relatedMem of relatedByEntity) {
          const relatedMemIdStr = relatedMem._id.toString();
          if (!potentialLinks.has(relatedMemIdStr)) {
            potentialLinks.add(relatedMemIdStr);
            newLinksMade = true;
            this.linkSingleMemory(relatedMem._id, memory._id).catch(
              console.error
            );
          }
        }
      }
    }

    if (newLinksMade) {
      const updatedRelatedMemories = Array.from(potentialLinks).map(
        (idStr) => new ObjectId(idStr)
      );
      await this.reminisceModel.updateMemory(memory._id, {
        $set: { relatedMemories: updatedRelatedMemories },
      });
      console.log(
        `ProReminisceManager: Updated related memories for ${memory._id}`
      );
    }
  }

  private async linkSingleMemory(
    memoryAId: ObjectId,
    memoryBIdToLink: ObjectId
  ): Promise<void> {
    const memoryA = await this.reminisceModel.getMemoryById(memoryAId);
    if (memoryA) {
      const links = new Set(
        memoryA.relatedMemories?.map((id) => ensureObjectId(id).toString()) ||
          []
      );
      const memoryBIdStr = memoryBIdToLink.toString();
      if (!links.has(memoryBIdStr)) {
        links.add(memoryBIdStr);
        await this.reminisceModel.updateMemory(memoryAId, {
          $set: {
            relatedMemories: Array.from(links).map((s) => new ObjectId(s)),
          },
        });
      }
    }
  }

  /**
   * 更新记忆的重要性评分。
   * @param memoryId 记忆ID
   * @param importance 新的重要性评分 (0-1)
   * @returns MemoryUpdateResult
   */
  async updateMemoryImportance(
    memoryId: ObjectId,
    importance: number
  ): Promise<MemoryUpdateResult> {
    const validatedImportance = Math.max(0, Math.min(1, importance));
    const success = await this.reminisceModel.updateMemory(memoryId, {
      $set: { importance: validatedImportance },
    });
    const updatedMemory = success
      ? await this.reminisceModel.getMemoryById(memoryId)
      : null;
    return {
      success,
      memory: updatedMemory,
      message: success ? "重要性已更新。" : "更新重要性失败。",
    };
  }

  /**
   * 更新记忆的可信度评分。
   * @param memoryId 记忆ID
   * @param confidence 新的可信度评分 (0-1)
   * @returns MemoryUpdateResult
   */
  async updateMemoryConfidence(
    memoryId: ObjectId,
    confidence: number
  ): Promise<MemoryUpdateResult> {
    const validatedConfidence = Math.max(0, Math.min(1, confidence));
    const success = await this.reminisceModel.updateMemory(memoryId, {
      $set: { confidence: validatedConfidence },
    });
    const updatedMemory = success
      ? await this.reminisceModel.getMemoryById(memoryId)
      : null;
    return {
      success,
      memory: updatedMemory,
      message: success ? "可信度已更新。" : "更新可信度失败。",
    };
  }

  /**
   * 更改记忆的层级。
   * @param memoryId 记忆ID
   * @param newTier 新的层级
   * @returns MemoryUpdateResult
   */
  async changeMemoryTier(
    memoryId: ObjectId,
    newTier: string
  ): Promise<MemoryUpdateResult> {
    // TODO: 可能需要验证 newTier 是否为有效值
    const success = await this.reminisceModel.updateMemory(memoryId, {
      $set: { tier: newTier },
    });
    const updatedMemory = success
      ? await this.reminisceModel.getMemoryById(memoryId)
      : null;
    return {
      success,
      memory: updatedMemory,
      message: success ? "记忆层级已更改。" : "更改记忆层级失败。",
    };
  }

  /**
   * 为记忆添加标签。
   * @param memoryId 记忆ID
   * @param tag 要添加的标签
   * @returns MemoryUpdateResult
   */
  async addTagToMemory(
    memoryId: ObjectId,
    tag: string
  ): Promise<MemoryUpdateResult> {
    if (!tag || !tag.trim()) {
      return { success: false, error: "标签不能为空。" };
    }
    const updateOp: UpdateFilter<EnhancedMemoryUnit> = {
      $addToSet: { tags: tag.trim() } as any,
    }; // as any to bypass strict type for $addToSet with string
    const success = await this.reminisceModel.updateMemory(memoryId, updateOp);
    const updatedMemory = success
      ? await this.reminisceModel.getMemoryById(memoryId)
      : null;
    return {
      success,
      memory: updatedMemory,
      message: success ? `标签 "${tag}" 已添加。` : "添加标签失败。",
    };
  }

  /**
   * 从记忆中移除标签。
   * @param memoryId 记忆ID
   * @param tag 要移除的标签
   * @returns MemoryUpdateResult
   */
  async removeTagFromMemory(
    memoryId: ObjectId,
    tag: string
  ): Promise<MemoryUpdateResult> {
    if (!tag || !tag.trim()) {
      return { success: false, error: "标签不能为空。" };
    }
    const updateOp: UpdateFilter<EnhancedMemoryUnit> = {
      $pull: { tags: tag.trim() } as any,
    }; // as any for $pull
    const success = await this.reminisceModel.updateMemory(memoryId, updateOp);
    const updatedMemory = success
      ? await this.reminisceModel.getMemoryById(memoryId)
      : null;
    return {
      success,
      memory: updatedMemory,
      message: success ? `标签 "${tag}" 已移除。` : "移除标签失败。",
    };
  }

  /**
   * 归档一个记忆单元。
   * @param memoryId 记忆ID
   * @returns MemoryUpdateResult
   */
  async archiveMemory(memoryId: ObjectId): Promise<MemoryUpdateResult> {
    const success = await this.reminisceModel.archiveMemory(memoryId); // archiveMemory 内部调用 updateMemory
    const updatedMemory = success
      ? await this.reminisceModel.getMemoryById(memoryId)
      : null;
    return {
      success,
      memory: updatedMemory,
      message: success ? "记忆已归档。" : "归档记忆失败。",
    };
  }

  /**
   * 解档一个记忆单元。
   * @param memoryId 记忆ID
   * @param targetTier 解档后恢复到的层级，默认为 "medium"
   * @returns MemoryUpdateResult
   */
  async unarchiveMemory(
    memoryId: ObjectId,
    targetTier: string = "medium"
  ): Promise<MemoryUpdateResult> {
    const updateOp: UpdateFilter<EnhancedMemoryUnit> = {
      $set: { tier: targetTier },
    };
    const success = await this.reminisceModel.updateMemory(memoryId, updateOp);
    const updatedMemory = success
      ? await this.reminisceModel.getMemoryById(memoryId)
      : null;
    return {
      success,
      memory: updatedMemory,
      message: success
        ? `记忆已解档至 "${targetTier}" 层级。`
        : "解档记忆失败。",
    };
  }

  async manageMemoryMetadata(
    memoryId: ObjectId | string,
    action: MemoryManagementAction, // This type is now mainly for ReminisceTool's switch, not directly used here for method dispatch
    details?: any
  ): Promise<boolean> {
    // This method might be deprecated in favor of specific methods above
    const id = ensureObjectId(memoryId);
    let updateOperations: UpdateFilter<EnhancedMemoryUnit> = {};

    // This switch is somewhat redundant now that we have specific methods,
    // but keeping it for the "accessed" case or if ReminisceTool still uses it.
    switch (action) {
      case "accessed":
        updateOperations = {
          $set: { lastAccessed: new Date() },
          $inc: { accessCount: 1 },
        };
        break;
      // Other cases are now handled by specific methods like updateMemoryImportance, etc.
      // If ReminisceTool calls this method for other actions, those calls need to be updated.
      default:
        console.warn(
          `ProReminisceManager: manageMemoryMetadata called with unhandled action: ${action} or action should be handled by a specific method.`
        );
        return false;
    }

    if (Object.keys(updateOperations).length > 0) {
      return await this.reminisceModel.updateMemory(id, updateOperations);
    }
    return false;
  }

  async performMemoryLifecycleManagement(): Promise<void> {
    console.log(
      "ProReminisceManager: Performing memory lifecycle management..."
    );
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const decayCriteriaShortTerm: Filter<EnhancedMemoryUnit> = {
      tier: "short",
      lastAccessed: { $lt: oneMonthAgo },
      accessCount: { $lt: 3 },
      importance: { $lt: 0.3 },
    };
    const archivedCount = await this.reminisceModel.decayMemories(
      decayCriteriaShortTerm,
      "archive"
    );
    if (archivedCount > 0)
      console.log(
        `ProReminisceManager: Archived ${archivedCount} short-term memories.`
      );

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const deleteCriteriaArchived: Filter<EnhancedMemoryUnit> = {
      tier: "archived",
      updatedAt: { $lt: sixMonthsAgo },
    };
    const deletedCount = await this.reminisceModel.decayMemories(
      deleteCriteriaArchived,
      "delete"
    );
    if (deletedCount > 0)
      console.log(
        `ProReminisceManager: Deleted ${deletedCount} old archived memories.`
      );

    const now = new Date();
    const expiredCriteria: Filter<EnhancedMemoryUnit> = {
      expiresAt: { $lt: now },
      tier: { $ne: "archived" },
    };
    const expiredArchived = await this.reminisceModel.decayMemories(
      expiredCriteria,
      "archive"
    );
    if (expiredArchived > 0)
      console.log(
        `ProReminisceManager: Archived ${expiredArchived} expired memories.`
      );
  }
}
