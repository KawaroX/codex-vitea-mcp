import { ObjectId, Db } from "mongodb";
import { ItemsModel } from "../model/items.js";
import { Item } from "../model/types.js";

/**
 * 物品创建工具
 * 用于添加新物品到系统
 */
export class CreateItemTool {
  private itemsModel: ItemsModel;

  constructor(db: Db) {
    this.itemsModel = new ItemsModel(db);
  }

  /**
   * 执行物品创建
   * @param params 创建参数
   * @returns 创建结果
   */
  async execute(params: {
    name: string;
    category?: string;
    status?: string;
    quantity?: number;
    isContainer?: boolean;
    locationId?: string;
    locationName?: string;
    containerId?: string;
    containerName?: string;
    note?: string;
  }): Promise<{
    success: boolean;
    item?: Item;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        name,
        category,
        status,
        quantity,
        isContainer = false,
        locationId,
        locationName,
        containerId,
        containerName,
        note,
      } = params;

      // 验证参数
      if (!name) {
        return {
          success: false,
          message: "必须提供物品名称",
        };
      }

      // 解析位置ID
      let resolvedLocationId = locationId;
      if (!resolvedLocationId && locationName) {
        const location = await this.resolveLocationByName(locationName);
        if (location) {
          resolvedLocationId = location._id.toString();
        }
      }

      // 解析容器ID
      let resolvedContainerId = containerId;
      if (!resolvedContainerId && containerName) {
        const container = await this.resolveContainerByName(containerName);
        if (container) {
          resolvedContainerId = container._id.toString();
        }
      }

      // 准备物品数据
      const itemData: Partial<Item> = {
        name,
        category,
        status,
        quantity,
        isContainer,
        locationId: resolvedLocationId,
        containerId: resolvedContainerId,
      };

      // 创建物品
      const result = await this.itemsModel.createItem(itemData);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 如果提供了备注，添加结构化备注
      if (note && result.item) {
        const noteObj = {
          timestamp: new Date().toISOString().split("T")[0],
          content: note,
          metadata: {
            tags: ["creation"],
          },
        };

        await this.itemsModel["itemsCollection"].updateOne(
          { _id: result.item._id },
          { $push: { notes: noteObj } }
        );

        // 重新查询物品以获取更新的数据
        const updatedItem = await this.itemsModel.getItemById(result.item._id);
        if (updatedItem) {
          result.item = updatedItem;
        }
      }

      // 构建成功消息
      let successMessage = `成功创建物品"${result.item?.name}"`;

      if (resolvedLocationId) {
        const locationName = await this.getLocationName(resolvedLocationId);
        successMessage += `，位置: "${locationName}"`;
      }

      if (resolvedContainerId) {
        const containerName = await this.getContainerName(resolvedContainerId);
        successMessage += `，容器: "${containerName}"`;
      }

      return {
        success: true,
        item: result.item,
        message: successMessage,
      };
    } catch (error) {
      console.error("创建物品时出错:", error);
      return {
        success: false,
        message: `创建物品时出错: ${error}`,
      };
    }
  }

  /**
   * 根据名称解析位置
   */
  private async resolveLocationByName(locationName: string) {
    try {
      const db = this.itemsModel["db"];
      const locationsCollection = db.collection("locations");
      return await locationsCollection.findOne({
        name: new RegExp(`^${locationName}$`, "i"),
      });
    } catch (error) {
      console.error("解析位置名称时出错:", error);
      return null;
    }
  }

  /**
   * 根据名称解析容器
   */
  private async resolveContainerByName(containerName: string) {
    try {
      const items = await this.itemsModel.findItems(containerName);
      // 过滤出isContainer为true的项
      return items.find((item) => item.isContainer === true) || null;
    } catch (error) {
      console.error("解析容器名称时出错:", error);
      return null;
    }
  }

  /**
   * 获取位置名称
   */
  private async getLocationName(locationId: string) {
    const db = this.itemsModel["db"];
    const locationsCollection = db.collection("locations");
    const location = await locationsCollection.findOne(
      { _id: new ObjectId(locationId) },
      { projection: { name: 1 } }
    );
    return location?.name || "未知位置";
  }

  /**
   * 获取容器名称
   */
  private async getContainerName(containerId: string) {
    const container = await this.itemsModel.getItemById(containerId);
    return container?.name || "未知容器";
  }
}
