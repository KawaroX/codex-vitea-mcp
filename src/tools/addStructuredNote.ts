import { ObjectId, Db } from "mongodb";
import { NotesModel } from "../model/notes.js";
import { StructuredNote } from "../model/types.js";
import { MemoryModel, EntityEvent } from "../model/memory.js";

/**
 * 结构化笔记添加工具
 * 用于为任何实体添加带标签和关联的结构化笔记
 */
export class AddStructuredNoteTool {
  private notesModel: NotesModel;

  constructor(db: Db) {
    this.notesModel = new NotesModel(db);
  }

  /**
   * 执行笔记添加
   * @param params 添加参数
   * @returns 添加结果
   */
  async execute(params: {
    entityType: string;
    entityId?: string;
    entityName?: string;
    content: string;
    tags?: string[];
    relatedEntities?: Array<{
      type: string;
      id?: string;
      name?: string;
    }>;
  }): Promise<{
    success: boolean;
    note?: StructuredNote;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        entityType,
        entityId,
        entityName,
        content,
        tags = [],
        relatedEntities = [],
      } = params;

      // 验证参数 - 需要提供实体类型和内容
      if (!entityType) {
        return {
          success: false,
          message: "必须提供实体类型",
        };
      }

      if (!content) {
        return {
          success: false,
          message: "必须提供笔记内容",
        };
      }

      // 验证参数 - 需要提供实体ID或名称
      if (!entityId && !entityName) {
        return {
          success: false,
          message: "必须提供实体ID或名称",
        };
      }

      // 确定集合名称
      const collectionName = this.getCollectionName(entityType);

      if (!collectionName) {
        return {
          success: false,
          message: `无效的实体类型: "${entityType}"`,
        };
      }

      // 解析实体ID
      let resolvedEntityId = entityId;
      if (!resolvedEntityId && entityName) {
        resolvedEntityId = await this.resolveEntityIdByName(
          collectionName,
          entityName
        );

        if (!resolvedEntityId) {
          return {
            success: false,
            message: `未找到名为"${entityName}"的${entityType}`,
          };
        }
      }

      // 解析关联实体
      const processedRelatedEntities = [];

      for (const relatedEntity of relatedEntities) {
        if (!relatedEntity.type) {
          continue;
        }

        const relatedCollectionName = this.getCollectionName(
          relatedEntity.type
        );

        if (!relatedCollectionName) {
          continue;
        }

        let relatedEntityId = relatedEntity.id;

        if (!relatedEntityId && relatedEntity.name) {
          relatedEntityId = await this.resolveEntityIdByName(
            relatedCollectionName,
            relatedEntity.name
          );

          if (!relatedEntityId) {
            continue;
          }
        }

        if (relatedEntityId) {
          const entityName =
            relatedEntity.name ||
            (await this.notesModel.getEntityName(
              relatedEntity.type,
              relatedEntityId
            ));

          processedRelatedEntities.push({
            type: relatedEntity.type,
            id: relatedEntityId,
            name: entityName || undefined,
          });
        }
      }

      // 添加笔记
      const result = await this.notesModel.addNote(
        collectionName,
        resolvedEntityId!,
        content,
        tags,
        processedRelatedEntities
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 生成笔记添加事件用于更新 Memory
      try {
        const event = {
          entityType: entityType,
          entityId: new ObjectId(resolvedEntityId!),
          eventType: EntityEvent.NOTE_ADDED,
          timestamp: new Date(),
          details: {
            noteContent: content,
            noteTags: tags,
          },
        };

        // 发布事件
        const memoryManager = new MemoryModel(this.notesModel["db"]);
        await memoryManager.processEntityEvent(event);
      } catch (eventError) {
        console.error("处理 Memory 事件失败:", eventError);
        // 事件处理失败不影响主流程
      }

      // 构建成功消息
      const entityTypeName = this.getEntityTypeName(entityType);
      const entityNameStr =
        entityName ||
        (await this.getEntityNameById(collectionName, resolvedEntityId!));

      let successMessage = `已成功为${entityTypeName}"${entityNameStr}"添加笔记`;

      if (tags.length > 0) {
        successMessage += `，标签: ${tags.join(", ")}`;
      }

      if (processedRelatedEntities.length > 0) {
        successMessage += `，关联实体: ${processedRelatedEntities
          .map((e) => `${this.getEntityTypeName(e.type)}"${e.name || e.id}"`)
          .join(", ")}`;
      }

      return {
        success: true,
        note: result.note,
        message: successMessage,
      };
    } catch (error) {
      console.error("添加笔记时出错:", error);
      return {
        success: false,
        message: `添加笔记时出错: ${error}`,
      };
    }
  }

  /**
   * 获取集合名称
   */
  private getCollectionName(entityType: string): string | null {
    switch (entityType.toLowerCase()) {
      case "item":
        return "items";
      case "location":
        return "locations";
      case "contact":
        return "contacts";
      case "task":
        return "tasks";
      case "biodata":
        return "bioData";
      default:
        return null;
    }
  }

  /**
   * 获取实体类型名称
   */
  private getEntityTypeName(entityType: string): string {
    switch (entityType.toLowerCase()) {
      case "item":
        return "物品";
      case "location":
        return "位置";
      case "contact":
        return "联系人";
      case "task":
        return "任务";
      case "biodata":
        return "生物数据";
      default:
        return entityType;
    }
  }

  /**
   * 根据名称解析实体ID
   */
  private async resolveEntityIdByName(
    collectionName: string,
    name: string
  ): Promise<string | null> {
    try {
      const collection = this.notesModel["db"].collection(collectionName);

      // 尝试精确匹配
      const entity = await collection.findOne({
        name: new RegExp(`^${name}$`, "i"),
      });

      if (entity) {
        return entity._id.toString();
      }

      // 尝试模糊匹配
      const fuzzyEntity = await collection.findOne({
        name: new RegExp(name, "i"),
      });

      if (fuzzyEntity) {
        return fuzzyEntity._id.toString();
      }

      return null;
    } catch (error) {
      console.error(`解析实体名称时出错: ${error}`);
      return null;
    }
  }

  /**
   * 根据ID获取实体名称
   */
  private async getEntityNameById(
    collectionName: string,
    id: string
  ): Promise<string> {
    try {
      const collection = this.notesModel["db"].collection(collectionName);
      const entity = await collection.findOne(
        { _id: new ObjectId(id) },
        { projection: { name: 1 } }
      );

      return entity?.name || id;
    } catch (error) {
      return id;
    }
  }
}
