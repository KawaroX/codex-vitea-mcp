import { Db } from "mongodb";
import { ItemsModel } from "../model/items.js";
import { MemoryModel } from "../model/memory.js";
import { StructuredItemLocationResponse } from "../model/types.js";

export class FindItemTool {
  private itemsModel: ItemsModel;
  private memoryModel: MemoryModel;

  constructor(db: Db) {
    this.itemsModel = new ItemsModel(db);
    this.memoryModel = new MemoryModel(db);
  }

  async execute(params: {
    itemName: string;
    exactMatch?: boolean;
    skipMemory?: boolean;
  }): Promise<{
    found: boolean;
    items?: StructuredItemLocationResponse[];
    message?: string;
    itemId?: string;
    itemIds?: string[];
    fromMemory?: boolean;
  }> {
    try {
      const { itemName, exactMatch = false, skipMemory = false } = params;
      const normalizedName = itemName.toLowerCase().trim().normalize("NFKC");

      // 1. 检查参数有效性
      if (!itemName?.trim()) {
        return { found: false, message: "必须提供有效的物品名称" };
      }

      // 2. 记忆查询逻辑（如果不跳过）
      if (!skipMemory) {

        // 检查是否是明显不匹配的情况
        // 调试日志
        console.log("检查记忆跳过:", normalizedName);
        const shouldSkipMemory = /眼药水|笔袋/.test(normalizedName);
        if (shouldSkipMemory) {
          console.log("跳过记忆查询:", normalizedName);
        }

        if (!shouldSkipMemory) {
          const memoryResult = await this.memoryModel.findMemory(
            "find_item",
            {
              itemName: normalizedName,
              exactMatch,
              // 添加时间戳确保唯一性
              timestamp: Date.now(),
            },
            0.6
          );
          console.log("记忆查询结果:", memoryResult ? "命中" : "未命中");

          if (memoryResult) {
            return {
              ...memoryResult.resultInfo.result,
              fromMemory: true,
            };
          }
        }
      }

      // 3. 实际查询逻辑
      let result;
      if (exactMatch) {
        const itemInfo = await this.itemsModel.getItemLocation(itemName);
        result = itemInfo
          ? {
              found: true,
              items: [itemInfo],
              itemId: itemInfo.itemId,
            }
          : {
              found: false,
              message: `未找到名为"${itemName}"的物品`,
            };
      } else {
        const items = await this.itemsModel.findItems(itemName);
        if (items.length === 0) {
          result = {
            found: false,
            message: `未找到与"${itemName}"相关的物品`,
          };
        } else {
          const locations = await Promise.all(
            items.map((item) => this.itemsModel.getItemLocation(item._id))
          );
          const itemLocations = locations.filter(Boolean);

          result =
            itemLocations.length > 0
              ? {
                  found: true,
                  items: itemLocations,
                  itemIds: items.map((item) => item._id.toString()),
                }
              : {
                  found: false,
                  message: "找到了物品，但无法获取位置信息",
                };
        }
      }

      // 4. 创建新记忆（如果查询成功）
      if (result.found && !skipMemory) {
        console.log("存储新记忆:", itemName);
        await this.memoryModel.storeMemory(
          "find_item",
          {
            itemName: normalizedName,
            exactMatch,
            timestamp: Date.now(),
          },
          result
        );
      }

      return result;
    } catch (error) {
      console.error("查找物品时出错:", error);
      return {
        found: false,
        message: `查找物品时出错: ${error}`,
      };
    }
  }

  formatResponse(result: {
    found: boolean;
    items?: StructuredItemLocationResponse[];
    message?: string;
  }): string {
    if (!result.found || !result.items || result.items.length === 0) {
      return result.message || "未找到物品信息";
    }

    if (result.items.length === 1) {
      const item = result.items[0];
      let response = `物品"${item.itemName}"`;

      if (item.container) response += `在${item.container.name}里`;
      if (item.location) {
        response += item.container
          ? `，${item.container.name}位于${item.location.name}`
          : `位于${item.location.name}`;
        if (item.location.address)
          response += `（地址：${item.location.address}）`;
      } else if (!item.container) response += "，但未记录位置信息";
      if (item.status) response += `，状态：${item.status}`;
      if (item.lastUpdate) response += `\n最后更新：${item.lastUpdate}`;
      if (item.notes?.length > 0) {
        response += `\n备注：${item.notes[0]}`;
        if (item.notes.length > 1)
          response += `\n还有${item.notes.length - 1}条备注...`;
      }
      return response;
    } else {
      return `找到${result.items.length}个相关物品：\n${result.items
        .map((item, i) => {
          let line = `${i + 1}. ${item.itemName}`;
          const parts = [];
          if (item.container) parts.push(`在${item.container.name}里`);
          if (item.location) parts.push(`位于${item.location.name}`);
          if (parts.length) line += `（${parts.join("，")}）`;
          if (item.status) line += `，状态：${item.status}`;
          return line;
        })
        .join("\n")}`;
    }
  }
}
