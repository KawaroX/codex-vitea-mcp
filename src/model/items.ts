import { type Collection, ObjectId, type Db } from "mongodb";
import {
  Item,
  Location,
  StructuredItemLocationResponse,
  ensureObjectId,
} from "./types.js";

/**
 * 物品数据操作类
 */
export class ItemsModel {
  private itemsCollection: Collection<Item>;
  private locationsCollection: Collection<Location>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.itemsCollection = db.collection<Item>("items");
    this.locationsCollection = db.collection<Location>("locations");
  }

  /**
   * 根据关键词查找物品
   * @param searchTerm 搜索关键词
   * @returns 匹配的物品列表
   */
  async findItems(searchTerm: string): Promise<Item[]> {
    const searchRegex = new RegExp(searchTerm, "i");

    const items = await this.itemsCollection
      .find({
        $or: [
          { name: searchRegex },
          { category: searchRegex },
          { status: searchRegex },
        ],
      })
      .limit(10)
      .toArray();

    return items;
  }

  /**
   * 根据ID查询单个物品
   * @param itemId 物品ID
   * @returns 物品对象
   */
  async getItemById(itemId: string | ObjectId): Promise<Item | null> {
    const id = ensureObjectId(itemId);
    return await this.itemsCollection.findOne({ _id: id });
  }

  /**
   * 获取物品位置的结构化信息
   * @param itemId 物品ID或物品名称
   * @returns 结构化的物品位置信息
   */
  async getItemLocation(
    itemId: string | ObjectId | string
  ): Promise<StructuredItemLocationResponse | null> {
    let item: Item | null = null;

    // 如果输入看起来像一个ObjectId，则通过ID查询
    if (typeof itemId === "string" && /^[0-9a-fA-F]{24}$/.test(itemId)) {
      item = await this.getItemById(new ObjectId(itemId.toString()));
    }
    // 否则尝试按名称查询
    else if (typeof itemId === "string") {
      item = await this.itemsCollection.findOne({
        name: new RegExp(`^${itemId}$`, "i"),
      });

      // 如果没找到精确匹配，尝试模糊查询
      if (!item) {
        const items = await this.findItems(itemId);
        if (items.length > 0) {
          item = items[0]; //
        }
      }
    } else if (typeof itemId === "string" && /^[0-9a-fA-F]{24}$/.test(itemId)) {
      item = await this.getItemById(itemId);
    }

    // 如果找不到物品，返回null
    if (!item) {
      return null;
    }

    // 开始构建响应
    const response: StructuredItemLocationResponse = {
      itemName: item.name,
      itemId: item._id.toString(),
      status: item.status,
    };

    // 查找笔记并添加
    if (item.notes && Array.isArray(item.notes) && item.notes.length > 0) {
      // 按时间戳排序，最新的优先
      const sortedNotes = [...item.notes].sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return (
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        }
        return 0;
      });

      response.notes = sortedNotes.map((note) => note.content);
      response.lastUpdate = sortedNotes[0]?.timestamp;
    }

    // 如果物品有位置信息，查询位置详情
    if (item.locationId) {
      try {
        const locationId =
          typeof item.locationId === "string"
            ? new ObjectId(item.locationId)
            : item.locationId;

        const location = await this.locationsCollection.findOne({
          _id: locationId,
        });

        if (location) {
          response.location = {
            name: location.name,
            id: location._id.toString(),
            address: location.address,
          };
        }
      } catch (error) {
        console.error(`获取位置信息失败: ${error}`);
      }
    }

    // 如果物品在容器内，查询容器详情
    if (item.containerId) {
      try {
        const containerId =
          typeof item.containerId === "string"
            ? new ObjectId(item.containerId)
            : item.containerId;

        const container = await this.itemsCollection.findOne({
          _id: containerId,
        });

        if (container) {
          response.container = {
            name: container.name,
            id: container._id.toString(),
            isContainer: container.isContainer,
          };
        }
      } catch (error) {
        console.error(`获取容器信息失败: ${error}`);
      }
    }

    return response;
  }

  /**
   * 获取容器内的所有物品
   * @param containerId 容器ID
   * @returns 容器内的物品列表
   */
  async getItemsInContainer(containerId: string | ObjectId): Promise<Item[]> {
    const id = ensureObjectId(containerId);
    return await this.itemsCollection.find({ containerId: id }).toArray();
  }

  /**
   * 更新物品位置
   * @param itemId 物品ID
   * @param locationId 新位置ID
   * @param containerId 新容器ID（可选）
   * @param note 备注（可选）
   * @returns 更新结果
   */
  async updateItemLocation(
    itemId: string | ObjectId,
    locationId: string | ObjectId | null,
    containerId: string | ObjectId | null = null,
    note: string | null = null
  ): Promise<{ success: boolean; item?: Item; error?: string }> {
    try {
      const id = ensureObjectId(itemId);

      // 构建更新对象
      const updateObj: any = {
        updatedAt: new Date(),
        modifiedSinceSync: true,
      };

      if (locationId) {
        updateObj.locationId =
          typeof locationId === "string"
            ? new ObjectId(locationId)
            : locationId;
      }

      if (containerId) {
        updateObj.containerId =
          typeof containerId === "string"
            ? new ObjectId(containerId)
            : containerId;
      }

      // 如果有备注，添加到notes数组
      if (note) {
        const noteObj: {
          timestamp: string;
          content: string;
          metadata: {
            locationId?: string;
            containerId?: string;
          };
        } = {
          timestamp: new Date().toISOString().split("T")[0], // 格式为YYYY-MM-DD
          content: note,
          metadata: {},
        };

        if (locationId) {
          noteObj.metadata.locationId =
            typeof locationId === "string" ? locationId : locationId.toString();
        }

        if (containerId) {
          noteObj.metadata.containerId =
            typeof containerId === "string"
              ? containerId
              : containerId.toString();
        }

        // 使用$push操作符将新备注添加到数组
        await this.itemsCollection.updateOne(
          { _id: id },
          { $push: { notes: noteObj } }
        );
      }

      // 执行更新
      const result = await this.itemsCollection.updateOne(
        { _id: id },
        { $set: updateObj }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: "未找到物品" };
      }

      // 查询更新后的物品
      const updatedItem = await this.getItemById(new ObjectId(id.toString()));

      return {
        success: true,
        item: updatedItem || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `更新物品位置失败: ${error}`,
      };
    }
  }

  /**
   * 查找丢失的物品
   * @param query 可选的查询参数
   * @returns 最近丢失的物品列表
   */
  async findMissingItems(query: any = {}): Promise<Item[]> {
    const missingItems = await this.itemsCollection
      .find({
        status: "丢失",
        ...query,
      })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray();

    return missingItems;
  }
}
