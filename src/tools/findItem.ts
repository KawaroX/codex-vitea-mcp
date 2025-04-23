import { Db } from "mongodb";
import { ItemsModel } from "../model/items.js";
import { StructuredItemLocationResponse } from "../model/types.js";

/**
 * 物品查找工具
 * 用于查找物品位置和容器信息
 */
export class FindItemTool {
  private itemsModel: ItemsModel;

  constructor(db: Db) {
    this.itemsModel = new ItemsModel(db);
  }

  /**
   * 执行物品查找
   * @param params 查询参数
   * @returns 查找结果
   */
  async execute(params: { itemName: string; exactMatch?: boolean }): Promise<{
    found: boolean;
    items?: StructuredItemLocationResponse[];
    message?: string;
  }> {
    try {
      const { itemName, exactMatch = false } = params;

      // 验证参数
      if (!itemName || typeof itemName !== "string") {
        return {
          found: false,
          message: "必须提供有效的物品名称",
        };
      }

      // 查找物品
      if (exactMatch) {
        // 精确匹配模式
        const itemInfo = await this.itemsModel.getItemLocation(itemName);

        if (itemInfo) {
          return {
            found: true,
            items: [itemInfo],
          };
        } else {
          return {
            found: false,
            message: `未找到名为"${itemName}"的物品`,
          };
        }
      } else {
        // 模糊匹配模式
        const items = await this.itemsModel.findItems(itemName);

        if (items.length === 0) {
          return {
            found: false,
            message: `未找到与"${itemName}"相关的物品`,
          };
        }

        // 获取每个物品的位置信息
        const itemLocations: StructuredItemLocationResponse[] = [];

        for (const item of items) {
          const locationInfo = await this.itemsModel.getItemLocation(item._id);
          if (locationInfo) {
            itemLocations.push(locationInfo);
          }
        }

        if (itemLocations.length > 0) {
          return {
            found: true,
            items: itemLocations,
          };
        } else {
          return {
            found: false,
            message: "找到了物品，但无法获取位置信息",
          };
        }
      }
    } catch (error) {
      console.error("查找物品时出错:", error);
      return {
        found: false,
        message: `查找物品时出错: ${error}`,
      };
    }
  }

  /**
   * 格式化响应为易读文本
   * @param result 查找结果
   * @returns 易读格式的结果描述
   */
  formatResponse(result: {
    found: boolean;
    items?: StructuredItemLocationResponse[];
    message?: string;
  }): string {
    if (!result.found || !result.items || result.items.length === 0) {
      return result.message || "未找到物品信息";
    }

    if (result.items.length === 1) {
      // 单个物品的详细描述
      const item = result.items[0];
      let response = `物品"${item.itemName}"`;

      if (item.container) {
        response += `在${item.container.name}里`;
      }

      if (item.location) {
        if (item.container) {
          response += `，${item.container.name}位于${item.location.name}`;
        } else {
          response += `位于${item.location.name}`;
        }

        if (item.location.address) {
          response += `（地址：${item.location.address}）`;
        }
      } else if (!item.container) {
        response += "，但未记录位置信息";
      }

      if (item.status) {
        response += `，状态：${item.status}`;
      }

      if (item.lastUpdate) {
        response += `\n最后更新：${item.lastUpdate}`;
      }

      if (item.notes && item.notes.length > 0) {
        response += `\n备注：${item.notes[0]}`;

        if (item.notes.length > 1) {
          response += `\n还有${item.notes.length - 1}条备注...`;
        }
      }

      return response;
    } else {
      // 多个物品的列表
      let response = `找到${result.items.length}个相关物品：\n`;

      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];
        response += `${i + 1}. ${item.itemName}`;

        const locationParts = [];

        if (item.container) {
          locationParts.push(`在${item.container.name}里`);
        }

        if (item.location) {
          locationParts.push(`位于${item.location.name}`);
        }

        if (locationParts.length > 0) {
          response += `（${locationParts.join("，")}）`;
        }

        if (item.status) {
          response += `，状态：${item.status}`;
        }

        if (i < result.items.length - 1) {
          response += "\n";
        }
      }

      return response;
    }
  }
}
