import { ObjectId, Db } from "mongodb";
import { NotesModel } from "../model/notes.js";

/**
 * 笔记搜索工具
 * 用于查询带有特定标签的笔记或实体的笔记
 */
export class SearchNotesTool {
  private notesModel: NotesModel;

  constructor(db: Db) {
    this.notesModel = new NotesModel(db);
  }

  /**
   * 执行笔记搜索
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async execute(params: {
    tag?: string;
    entityType?: string;
    entityId?: string;
    entityName?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    results?: any[];
    message?: string;
    error?: string;
  }> {
    try {
      const { tag, entityType, entityId, limit = 20 } = params;
      let { entityName } = params;

      // 验证参数 - 需要提供标签或实体信息
      if (!tag && !entityType) {
        return {
          success: false,
          message: "必须提供标签或实体类型",
        };
      }

      // 如果提供了标签，查询带有该标签的所有笔记
      if (tag) {
        const result = await this.notesModel.searchNotesByTag(tag, limit);

        if (!result.success) {
          return {
            success: false,
            error: result.error,
          };
        }

        // 如果没有结果
        if (!result.results || result.results.length === 0) {
          return {
            success: true,
            results: [],
            message: `未找到标签为"${tag}"的笔记`,
          };
        }

        return {
          success: true,
          results: result.results,
          message: `找到${result.results.length}条标签为"${tag}"的笔记`,
        };
      }

      // 如果提供了实体信息，查询该实体的笔记
      if (entityType) {
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

        if (!resolvedEntityId) {
          return {
            success: false,
            message: "必须提供实体ID或名称",
          };
        }

        const result = await this.notesModel.getNotes(
          collectionName,
          resolvedEntityId,
          undefined,
          limit
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error,
          };
        }

        // 如果没有笔记
        if (!result.notes || result.notes.length === 0) {
          entityName = await this.getEntityNameById(
            collectionName,
            resolvedEntityId
          );
          return {
            success: true,
            results: [],
            message: `${this.getEntityTypeName(
              entityType
            )}"${entityName}"没有笔记`,
          };
        }

        entityName = await this.getEntityNameById(
          collectionName,
          resolvedEntityId
        );
        return {
          success: true,
          results: result.notes,
          message: `找到${this.getEntityTypeName(entityType)}"${entityName}"的${
            result.notes.length
          }条笔记`,
        };
      }

      return {
        success: false,
        message: "无效的查询参数",
      };
    } catch (error) {
      console.error("搜索笔记时出错:", error);
      return {
        success: false,
        message: `搜索笔记时出错: ${error}`,
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
