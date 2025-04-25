import { type Collection, ObjectId, type Db } from "mongodb";
import { StructuredNote, ensureObjectId } from "./types.js";

/**
 * 结构化笔记管理类
 * 用于管理各类实体的结构化笔记
 */
export class NotesModel {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * 添加结构化笔记到实体
   * @param collectionName 集合名称(items, locations, contacts, tasks等)
   * @param entityId 实体ID
   * @param content 笔记内容
   * @param tags 标签数组
   * @param relatedEntities 相关实体
   * @returns 添加结果
   */
  async addNote(
    collectionName: string,
    entityId: string | ObjectId,
    content: string,
    tags: string[] = [],
    relatedEntities: {
      type: string; // 实体类型(item, location, contact, task等)
      id: string | ObjectId; // 实体ID
      name?: string; // 实体名称(可选)
    }[] = []
  ): Promise<{
    success: boolean;
    note?: StructuredNote;
    error?: string;
  }> {
    try {
      const id = ensureObjectId(entityId);
      const collection = this.db.collection<{ notes?: StructuredNote[] }>(collectionName);

      // 检查实体是否存在
      const entity = await collection.findOne({ _id: id });

      if (!entity) {
        return {
          success: false,
          error: `在集合 ${collectionName} 中未找到ID为 ${entityId} 的实体`,
        };
      }

      // 转换相关实体ID为ObjectId
      const processedRelatedEntities = relatedEntities.map((entity) => ({
        type: entity.type,
        id: ensureObjectId(entity.id),
        name: entity.name,
      }));

      // 创建结构化笔记
      const timestamp = new Date().toISOString().split("T")[0]; // 格式为 YYYY-MM-DD
      const note: StructuredNote = {
        timestamp,
        content,
        metadata: {
          tags,
          relatedEntities:
            processedRelatedEntities.length > 0
              ? processedRelatedEntities.map((e) => ({
                  type: e.type,
                  id: e.id,
                  name: e.name,
                }))
              : undefined,
        },
      };

      // 初始化notes数组(如果不存在)
      if (!entity.notes) {
        await collection.updateOne({ _id: id }, { $set: { notes: [] } });
      }

      // 添加笔记并更新Notion同步标记
      await collection.updateOne(
        { _id: id },
        {
          $push: {
            notes: {
              $each: [note],
              $position: 0,
            },
          },
          $set: {
            updatedAt: new Date(),
            modifiedSinceSync: true,
          },
        }
      );

      return {
        success: true,
        note,
      };
    } catch (error) {
      return {
        success: false,
        error: `添加笔记失败: ${error}`,
      };
    }
  }

  /**
   * 查询实体的笔记
   * @param collectionName 集合名称
   * @param entityId 实体ID
   * @param tag 可选的标签筛选
   * @param limit 限制返回笔记数量
   * @returns 笔记列表
   */
  async getNotes(
    collectionName: string,
    entityId: string | ObjectId,
    tag?: string,
    limit: number = 10
  ): Promise<{
    success: boolean;
    notes?: StructuredNote[];
    error?: string;
  }> {
    try {
      const id = ensureObjectId(entityId);
      const collection = this.db.collection(collectionName);

      // 查询实体
      const entity = await collection.findOne({ _id: id });

      if (!entity) {
        return {
          success: false,
          error: `在集合 ${collectionName} 中未找到ID为 ${entityId} 的实体`,
        };
      }

      // 如果没有笔记属性或笔记为空
      if (
        !entity.notes ||
        !Array.isArray(entity.notes) ||
        entity.notes.length === 0
      ) {
        return {
          success: true,
          notes: [],
        };
      }

      // 过滤笔记(如果指定了标签)
      let filteredNotes = entity.notes;

      if (tag) {
        filteredNotes = entity.notes.filter(
          (note) =>
            note.metadata &&
            note.metadata.tags &&
            Array.isArray(note.metadata.tags) &&
            note.metadata.tags.includes(tag)
        );
      }

      // 按时间戳排序(最新的优先)
      filteredNotes.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return (
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        }
        return 0;
      });

      // 限制返回数量
      const limitedNotes = filteredNotes.slice(0, limit);

      return {
        success: true,
        notes: limitedNotes,
      };
    } catch (error) {
      return {
        success: false,
        error: `查询笔记失败: ${error}`,
      };
    }
  }

  /**
   * 获取所有标签
   * @param collectionName 集合名称(可选，不指定则查询所有集合)
   * @returns 标签列表
   */
  async getAllTags(collectionName?: string): Promise<string[]> {
    try {
      const collections = collectionName
        ? [this.db.collection(collectionName)]
        : [
            this.db.collection("items"),
            this.db.collection("locations"),
            this.db.collection("contacts"),
            this.db.collection("tasks"),
            this.db.collection("bioData"),
          ];

      const allTags = new Set<string>();

      for (const collection of collections) {
        // 查询所有文档中的notes.metadata.tags
        const documents = await collection
          .find({ "notes.metadata.tags": { $exists: true } })
          .toArray();

        // 提取所有标签
        documents.forEach((doc) => {
          if (doc.notes && Array.isArray(doc.notes)) {
            doc.notes.forEach((note) => {
              if (
                note.metadata &&
                note.metadata.tags &&
                Array.isArray(note.metadata.tags)
              ) {
                note.metadata.tags.forEach((tag) => {
                  if (tag && typeof tag === "string") {
                    allTags.add(tag);
                  }
                });
              }
            });
          }
        });
      }

      return [...allTags].sort();
    } catch (error) {
      console.error(`获取标签失败: ${error}`);
      return [];
    }
  }

  /**
   * 根据实体类型和ID获取实体名称
   * @param entityType 实体类型
   * @param entityId 实体ID
   * @returns 实体名称
   */
  async getEntityName(
    entityType: string,
    entityId: string | ObjectId
  ): Promise<string | null> {
    try {
      const id = ensureObjectId(entityId);
      let collectionName;

      // 根据实体类型确定集合名称
      switch (entityType.toLowerCase()) {
        case "item":
          collectionName = "items";
          break;
        case "location":
          collectionName = "locations";
          break;
        case "contact":
          collectionName = "contacts";
          break;
        case "task":
          collectionName = "tasks";
          break;
        case "biodata":
          collectionName = "bioData";
          break;
        default:
          return null;
      }

      const collection = this.db.collection(collectionName);
      const entity = await collection.findOne(
        { _id: id },
        { projection: { name: 1 } }
      );

      return entity?.name || null;
    } catch (error) {
      console.error(`获取实体名称失败: ${error}`);
      return null;
    }
  }

  /**
   * 查询带有特定标签的笔记
   * @param tag 标签
   * @param limit 限制返回笔记数量
   * @returns 笔记列表(带实体信息)
   */
  async searchNotesByTag(
    tag: string,
    limit: number = 20
  ): Promise<{
    success: boolean;
    results?: Array<{
      collectionName: string;
      entityId: string;
      entityName: string;
      note: StructuredNote;
    }>;
    error?: string;
  }> {
    try {
      const collections = [
        { name: "items", type: "item" },
        { name: "locations", type: "location" },
        { name: "contacts", type: "contact" },
        { name: "tasks", type: "task" },
        { name: "bioData", type: "biodata" },
      ];

      const results = [];

      for (const { name: collectionName, type: entityType } of collections) {
        const collection = this.db.collection(collectionName);

        // 查询包含指定标签的文档
        const documents = await collection
          .find({
            "notes.metadata.tags": tag,
          })
          .toArray();

        // 提取笔记
        for (const doc of documents) {
          if (doc.notes && Array.isArray(doc.notes)) {
            const matchingNotes = doc.notes.filter(
              (note) =>
                note.metadata &&
                note.metadata.tags &&
                Array.isArray(note.metadata.tags) &&
                note.metadata.tags.includes(tag)
            );

            matchingNotes.forEach((note) => {
              results.push({
                collectionName,
                entityId: doc._id.toString(),
                entityName: doc.name || `未命名${entityType}`,
                note,
              });
            });
          }
        }
      }

      // 按时间戳排序(最新的优先)
      results.sort((a, b) => {
        if (a.note.timestamp && b.note.timestamp) {
          return (
            new Date(b.note.timestamp).getTime() -
            new Date(a.note.timestamp).getTime()
          );
        }
        return 0;
      });

      // 限制返回数量
      const limitedResults = results.slice(0, limit);

      return {
        success: true,
        results: limitedResults,
      };
    } catch (error) {
      return {
        success: false,
        error: `查询标签笔记失败: ${error}`,
      };
    }
  }
}
