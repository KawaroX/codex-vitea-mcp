import { Db } from "mongodb";
import { ItemsModel } from "../model/items.js";

/**
 * 物品删除工具
 * 用于删除系统中的物品
 */
export class DeleteItemTool {
  private itemsModel: ItemsModel;

  constructor(db: Db) {
    this.itemsModel = new ItemsModel(db);
  }

  /**
   * 执行物品删除
   * @param params 删除参数
   * @returns 删除结果
   */
  async execute(params: {
    itemId?: string;
    itemName?: string;
    isSoftDelete?: boolean;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const { itemId, itemName, isSoftDelete = true } = params;

      // 验证参数 - 需要提供物品ID或名称
      if (!itemId && !itemName) {
        return {
          success: false,
          message: "必须提供物品ID或名称",
        };
      }

      // 解析物品ID
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

      // 查询物品详情，用于返回消息
      const item = await this.itemsModel.getItemById(resolvedItemId!);
      if (!item) {
        return {
          success: false,
          message: `未找到ID为"${resolvedItemId}"的物品`,
        };
      }

      if (itemName === null) {
        const itemName = item.name;
      }

      // 执行删除
      const result = await this.itemsModel.deleteItem(
        resolvedItemId!,
        isSoftDelete
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      const deleteType = isSoftDelete ? "软删除" : "删除";
      const successMessage = `成功${deleteType}物品"${itemName}"`;

      return {
        success: true,
        message: successMessage,
      };
    } catch (error) {
      console.error("删除物品时出错:", error);
      return {
        success: false,
        message: `删除物品时出错: ${error}`,
      };
    }
  }
}
