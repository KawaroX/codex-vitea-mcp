import { type Collection, ObjectId, type Db } from "mongodb";
import {
  Item,
  Location,
  StructuredItemLocationResponse,
  ensureObjectId,
} from "./types.js";
import { MemoryModel, EntityEvent } from "./memory.js";

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
    if (
      typeof itemId.toString() === "string" &&
      /^[0-9a-fA-F]{24}$/.test(itemId.toString())
    ) {
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

  /**
   * 物品转移功能 - 将物品从一个位置/容器转移到另一个位置/容器
   * @param itemId 物品ID
   * @param targetLocationId 目标位置ID (如果需要更改位置)
   * @param targetContainerId 目标容器ID (如果需要放入容器)
   * @param note 用户提供的备注
   * @param removeFromCurrentContainer 是否从当前容器中移除
   * @returns 更新结果
   */
  // 修改 transferItem 方法
  async transferItem(
    itemId: string | ObjectId,
    targetLocationId: string | ObjectId | null = null,
    targetContainerId: string | ObjectId | null = null,
    note: string | null = null,
    removeFromCurrentContainer: boolean = true
  ): Promise<{
    success: boolean;
    item?: Item;
    error?: string;
  }> {
    try {
      // 确保 itemId 是 ObjectId 类型
      const id = ensureObjectId(itemId);

      // 查询物品当前信息
      const item = await this.getItemById(id);

      if (!item) {
        return { success: false, error: "未找到物品" };
      }

      // 记录转移前的状态，用于生成备注
      const previousState = {
        locationId: item.locationId,
        containerId: item.containerId,
      };

      // 准备更新对象
      const updateObj: any = {
        updatedAt: new Date(),
        modifiedSinceSync: true, // 设置 Notion 同步标记
      };

      // 如果提供了目标位置，更新位置ID
      if (targetLocationId) {
        updateObj.locationId = ensureObjectId(targetLocationId);
      }

      // 如果提供了目标容器，更新容器ID
      if (targetContainerId) {
        updateObj.containerId = ensureObjectId(targetContainerId);
      } else if (removeFromCurrentContainer && item.containerId) {
        // 如果未提供新容器但需要从当前容器移除
        updateObj.containerId = null;
      }

      // 创建结构化备注
      const timestamp = new Date().toISOString().split("T")[0]; // 格式为 YYYY-MM-DD
      const noteContent =
        note ||
        `物品「${item.name}」${previousState.containerId ? "从容器中" : ""}${
          previousState.locationId
            ? `从位置「${await this.getLocationName(
                previousState.locationId
              )}」`
            : ""
        } 
    转移到${
      targetContainerId
        ? `容器「${await this.getContainerName(targetContainerId)}」中`
        : ""
    }${
          targetLocationId
            ? `位置「${await this.getLocationName(targetLocationId)}」`
            : ""
        }`;

      const noteObj = {
        timestamp: timestamp,
        content: noteContent,
        metadata: {
          locationId: targetLocationId
            ? ensureObjectId(targetLocationId)
            : undefined,
          containerId: targetContainerId
            ? ensureObjectId(targetContainerId)
            : undefined,
          tags: [
            "transfer",
            previousState.locationId ? "from_location" : "",
            previousState.containerId ? "from_container" : "",
            targetLocationId ? "to_location" : "",
            targetContainerId ? "to_container" : "",
          ].filter((tag) => tag !== ""), // 过滤掉空字符串
        },
      };

      // 添加结构化备注
      await this.itemsCollection.updateOne(
        { _id: id },
        {
          $push: { notes: noteObj },
          $set: updateObj,
        }
      );

      // 如果从一个容器移到另一个容器，更新容器的 containedItems
      if (previousState.containerId && removeFromCurrentContainer) {
        // 从旧容器移除
        await this.itemsCollection.updateOne(
          { _id: ensureObjectId(previousState.containerId) },
          {
            $pull: { containedItems: id },
            $set: {
              updatedAt: new Date(),
              modifiedSinceSync: true,
            },
          }
        );
      }

      if (targetContainerId) {
        // 添加到新容器
        await this.itemsCollection.updateOne(
          { _id: ensureObjectId(targetContainerId) },
          {
            $addToSet: { containedItems: id },
            $set: {
              updatedAt: new Date(),
              modifiedSinceSync: true,
            },
          }
        );
      }

      // 查询更新后的物品
      const updatedItem = await this.getItemById(id);

      const result = {
        success: true,
        item: updatedItem || undefined,
      };

      // 生成物品转移事件用于更新 Memory
      try {
        const event = {
          entityType: "item",
          entityId: id,
          eventType: EntityEvent.TRANSFERRED,
          timestamp: new Date(),
          details: {
            previousLocationId: previousState.locationId,
            previousContainerId: previousState.containerId,
            newLocationId: targetLocationId,
            newContainerId: targetContainerId,
          },
        };

        // 发布事件
        const memoryManager = new MemoryModel(this.db);
        await memoryManager.processEntityEvent(event);
      } catch (eventError) {
        console.error("处理 Memory 事件失败:", eventError);
        // 事件处理失败不影响主流程
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `转移物品失败: ${error}`,
      };
    }
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

      // 获取物品原始状态
      const originalItem = await this.getItemById(id);
      if (!originalItem) {
        return { success: false, error: "未找到物品" };
      }

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
      const updatedItem = await this.getItemById(id);

      const updateResult = {
        success: true,
        item: updatedItem || undefined,
      };

      // 生成物品更新事件用于更新 Memory
      try {
        const event = {
          entityType: "item",
          entityId: id,
          eventType: EntityEvent.UPDATED,
          timestamp: new Date(),
          details: {
            previousLocationId: originalItem.locationId,
            previousContainerId: originalItem.containerId,
            newLocationId: locationId,
            newContainerId: containerId,
          },
        };

        // 发布事件
        const memoryManager = new MemoryModel(this.db);
        await memoryManager.processEntityEvent(event);
      } catch (eventError) {
        console.error("处理 Memory 事件失败:", eventError);
        // 事件处理失败不影响主流程
      }

      return updateResult;
    } catch (error) {
      return {
        success: false,
        error: `更新物品位置失败: ${error}`,
      };
    }
  }

  /**
   * 获取位置名称
   * @param locationId 位置ID
   * @returns 位置名称
   */
  private async getLocationName(
    locationId: string | ObjectId
  ): Promise<string> {
    try {
      const id = ensureObjectId(locationId);
      const location = await this.locationsCollection.findOne(
        { _id: id },
        { projection: { name: 1 } }
      );
      return location?.name || "未知位置";
    } catch (error) {
      return "未知位置";
    }
  }

  /**
   * 获取容器名称
   * @param containerId 容器ID
   * @returns 容器名称
   */
  private async getContainerName(
    containerId: string | ObjectId
  ): Promise<string> {
    try {
      const id = ensureObjectId(containerId);
      const container = await this.itemsCollection.findOne(
        { _id: id },
        { projection: { name: 1 } }
      );
      return container?.name || "未知容器";
    } catch (error) {
      return "未知容器";
    }
  }
}
