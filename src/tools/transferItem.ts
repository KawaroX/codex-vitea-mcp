import { ObjectId, type Db } from "mongodb";
import { ItemsModel } from "../model/items.js";
import { Item } from "../model/types.js";

/**
 * 物品转移工具
 * 用于将物品从一个位置/容器转移到另一个位置/容器
 */
export class TransferItemTool {
  private itemsModel: ItemsModel;

  constructor(db: Db) {
    this.itemsModel = new ItemsModel(db);
  }

  /**
   * 执行物品转移
   * @param params 转移参数
   * @returns 转移结果
   */
  async execute(params: {
    itemId?: string;
    itemName?: string;
    targetLocationId?: string;
    targetLocationName?: string;
    targetContainerId?: string;
    targetContainerName?: string;
    note?: string;
    removeFromCurrentContainer?: boolean;
  }): Promise<{
    success: boolean;
    item?: Item;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        itemId,
        itemName,
        targetLocationId,
        targetLocationName,
        targetContainerId,
        targetContainerName,
        note,
        removeFromCurrentContainer = true,
      } = params;

      // 验证参数 - 需要提供物品ID或名称
      if (!itemId && !itemName) {
        return {
          success: false,
          message: "必须提供物品ID或名称",
        };
      }

      // 验证参数 - 需要提供目标位置或容器
      if (
        !targetLocationId &&
        !targetLocationName &&
        !targetContainerId &&
        !targetContainerName
      ) {
        return {
          success: false,
          message: "必须提供目标位置或容器",
        };
      }

      // 步骤1: 如果提供了itemName，查找对应的itemId
      let resolvedItemId = itemId;
      if (!resolvedItemId && itemName) {
        const items = await this.itemsModel.findItems(itemName);
        if (items.length === 0) {
          return {
            success: false,
            message: `未找到名为"${itemName}"的物品`,
          };
        }
        // 使用第一个匹配项
        resolvedItemId = items[0]._id.toString();
      }

      // 步骤2: 如果提供了位置名称，查找对应的位置ID
      let resolvedLocationId = targetLocationId;
      if (!resolvedLocationId && targetLocationName) {
        const location = await this.resolveLocationByName(targetLocationName);
        if (location) {
          resolvedLocationId = location._id.toString();
        }
      }

      // 步骤3: 如果提供了容器名称，查找对应的容器ID
      let resolvedContainerId = targetContainerId;
      if (!resolvedContainerId && targetContainerName) {
        const container = await this.resolveContainerByName(
          targetContainerName
        );
        if (container) {
          resolvedContainerId = container._id.toString();
        }
      }

      // 执行转移
      const result = await this.itemsModel.transferItem(
        resolvedItemId!,
        resolvedLocationId || null,
        resolvedContainerId || null,
        note,
        removeFromCurrentContainer
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      const item = result.item!;
      let successMessage = `成功将物品"${item.name}"`;

      if (resolvedLocationId) {
        const locationName =
          targetLocationName ||
          (await this.getLocationName(resolvedLocationId));
        successMessage += `转移到位置"${locationName}"`;
      }

      if (resolvedContainerId) {
        const containerName =
          targetContainerName ||
          (await this.getContainerName(resolvedContainerId));
        if (resolvedLocationId) {
          successMessage += `的`;
        } else {
          successMessage += `转移到`;
        }
        successMessage += `容器"${containerName}"中`;
      }

      return {
        success: true,
        item: result.item,
        message: successMessage,
      };
    } catch (error) {
      console.error("转移物品时出错:", error);
      return {
        success: false,
        message: `转移物品时出错: ${error}`,
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
