import { ObjectId, Db } from "mongodb";
import { ItemsModel } from "../model/items.js";
import { Item } from "../model/types.js";

/**
 * 物品基本信息更新工具
 * 用于更新物品的名称、类别、状态等基本信息
 */
export class UpdateItemInfoTool {
  private itemsModel: ItemsModel;

  constructor(db: Db) {
    this.itemsModel = new ItemsModel(db);
  }

  /**
   * 执行物品信息更新
   * @param params 更新参数
   * @returns 更新结果
   */
  async execute(params: {
    itemId?: string;
    itemName?: string;
    newName?: string;
    newCategory?: string;
    newStatus?: string;
    newQuantity?: number;
    note?: string;
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
        newName,
        newCategory,
        newStatus,
        newQuantity,
        note,
      } = params;

      // 验证参数 - 需要提供物品ID或名称
      if (!itemId && !itemName) {
        return {
          success: false,
          message: "必须提供物品ID或名称",
        };
      }

      // 验证参数 - 需要提供至少一个要更新的字段
      if (!newName && !newCategory && !newStatus && newQuantity === undefined) {
        return {
          success: false,
          message: "必须提供至少一个要更新的字段",
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

      // 查询物品当前信息
      const item = await this.itemsModel.getItemById(resolvedItemId!);
      if (!item) {
        return {
          success: false,
          message: `未找到ID为"${resolvedItemId}"的物品`,
        };
      }

      // 构建更新对象
      const updateData: Partial<Item> = {};

      if (newName) updateData.name = newName;
      if (newCategory) updateData.category = newCategory;
      if (newStatus) updateData.status = newStatus;
      if (newQuantity !== undefined) updateData.quantity = newQuantity;

      // 在model中添加更新物品的方法
      const updateResult = await this.updateItem(resolvedItemId!, updateData);

      if (!updateResult.success) {
        return {
          success: false,
          error: updateResult.error,
        };
      }

      // 如果提供了备注，添加结构化备注
      if (note && updateResult.item) {
        const noteObj = {
          timestamp: new Date().toISOString().split("T")[0],
          content: note,
          metadata: {
            tags: ["update_info"],
            updatedFields: Object.keys(updateData),
          },
        };

        await this.itemsModel["itemsCollection"].updateOne(
          { _id: new ObjectId(resolvedItemId) },
          { $push: { notes: noteObj } }
        );

        // 重新查询物品以获取更新的数据
        const updatedItem = await this.itemsModel.getItemById(resolvedItemId!);
        if (updatedItem) {
          updateResult.item = updatedItem;
        }
      }

      // 构建成功消息
      let successMessage = `成功更新物品"${item.name}"的信息`;
      const updatedFields = [];

      if (newName) updatedFields.push(`名称: "${newName}"`);
      if (newCategory) updatedFields.push(`类别: "${newCategory}"`);
      if (newStatus) updatedFields.push(`状态: "${newStatus}"`);
      if (newQuantity !== undefined) updatedFields.push(`数量: ${newQuantity}`);

      if (updatedFields.length > 0) {
        successMessage += `，更新了: ${updatedFields.join(", ")}`;
      }

      return {
        success: true,
        item: updateResult.item,
        message: successMessage,
      };
    } catch (error) {
      console.error("更新物品信息时出错:", error);
      return {
        success: false,
        message: `更新物品信息时出错: ${error}`,
      };
    }
  }

  /**
   * 更新物品信息
   * @param itemId 物品ID
   * @param updateData 更新数据
   * @returns 更新结果
   */
  private async updateItem(
    itemId: string,
    updateData: Partial<Item>
  ): Promise<{
    success: boolean;
    item?: Item;
    error?: string;
  }> {
    try {
      const id = new ObjectId(itemId);

      // 添加更新时间和同步标记
      const dataToUpdate = {
        ...updateData,
        updatedAt: new Date(),
        modifiedSinceSync: true,
      };

      // 执行更新
      const result = await this.itemsModel["itemsCollection"].updateOne(
        { _id: id },
        { $set: dataToUpdate }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          error: "未找到物品",
        };
      }

      // 查询更新后的物品
      const updatedItem = await this.itemsModel.getItemById(itemId);

      return {
        success: true,
        item: updatedItem || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `更新物品信息失败: ${error}`,
      };
    }
  }
}
