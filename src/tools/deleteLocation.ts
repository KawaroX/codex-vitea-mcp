import { ObjectId, Db } from "mongodb";
import { LocationsModel } from "../model/locations.js";

/**
 * 位置删除工具
 * 用于删除系统中的位置
 */
export class DeleteLocationTool {
  private locationsModel: LocationsModel;

  constructor(db: Db) {
    this.locationsModel = new LocationsModel(db);
  }

  /**
   * 执行位置删除
   * @param params 删除参数
   * @returns 删除结果
   */
  async execute(params: {
    locationId?: string;
    locationName?: string;
    force?: boolean;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const { locationId, locationName, force = false } = params;

      // 验证参数 - 需要提供位置ID或名称
      if (!locationId && !locationName) {
        return {
          success: false,
          message: "必须提供位置ID或名称",
        };
      }

      // 解析位置ID
      let resolvedLocationId = locationId;
      if (!resolvedLocationId && locationName) {
        const locations = await this.locationsModel.findLocations(locationName);
        if (locations.length === 0) {
          return {
            success: false,
            message: `未找到名为"${locationName}"的位置`,
          };
        }
        // 使用第一个匹配项
        resolvedLocationId = locations[0]._id.toString();
      }

      // 查询位置详情
      const location = await this.locationsModel.getLocationById(
        new ObjectId(resolvedLocationId!)
      );
      if (!location) {
        return {
          success: false,
          message: `未找到ID为"${resolvedLocationId}"的位置`,
        };
      }

      // 检查是否有子位置
      if (
        location.childLocations &&
        location.childLocations.length > 0 &&
        !force
      ) {
        return {
          success: false,
          message: `位置"${location.name}"包含${location.childLocations.length}个子位置，无法删除。使用force=true参数强制删除，但会导致子位置的层次关系断开。`,
        };
      }

      // 检查位置是否被物品引用
      const itemsCount = await this.countItemsReferencingLocation(
        resolvedLocationId!
      );
      if (itemsCount > 0 && !force) {
        return {
          success: false,
          message: `位置"${location.name}"被${itemsCount}个物品引用，无法删除。使用force=true参数强制删除，但会导致这些物品的位置信息丢失。`,
        };
      }

      // 如果有父位置，从父位置的childLocations中移除
      if (location.parentLocationId) {
        await this.removeFromParentLocation(
          location.parentLocationId.toString(),
          location._id
        );
      }

      // 执行删除
      const result = await this.locationsModel["locationsCollection"].deleteOne(
        {
          _id: new ObjectId(resolvedLocationId),
        }
      );

      if (result.deletedCount === 0) {
        return {
          success: false,
          message: "删除位置失败",
        };
      }

      // 如果强制删除，需要处理子位置和引用
      if (force) {
        // 更新子位置，移除父位置引用
        if (location.childLocations && location.childLocations.length > 0) {
          await this.locationsModel["locationsCollection"].updateMany(
            { parentLocationId: new ObjectId(resolvedLocationId) },
            {
              $set: {
                parentLocationId: null,
                updatedAt: new Date(),
                modifiedSinceSync: true,
              },
            }
          );
        }

        // 更新引用的物品，移除位置引用
        if (itemsCount > 0) {
          await this.locationsModel["db"].collection("items").updateMany(
            { locationId: new ObjectId(resolvedLocationId) },
            {
              $set: {
                locationId: null,
                updatedAt: new Date(),
                modifiedSinceSync: true,
              },
            }
          );
        }
      }

      // 构建成功消息
      let successMessage = `成功删除位置"${location.name}"`;

      if (force && (location.childLocations?.length > 0 || itemsCount > 0)) {
        const updates = [];
        if (location.childLocations?.length > 0) {
          updates.push(
            `${location.childLocations.length}个子位置的父位置引用已清除`
          );
        }
        if (itemsCount > 0) {
          updates.push(`${itemsCount}个物品的位置引用已清除`);
        }
        if (updates.length > 0) {
          successMessage += `，${updates.join("，")}`;
        }
      }

      return {
        success: true,
        message: successMessage,
      };
    } catch (error) {
      console.error("删除位置时出错:", error);
      return {
        success: false,
        message: `删除位置时出错: ${error}`,
      };
    }
  }

  /**
   * 从父位置的childLocations中移除
   * @param parentId 父位置ID
   * @param childId 子位置ID
   */
  private async removeFromParentLocation(
    parentId: string,
    childId: ObjectId
  ): Promise<void> {
    try {
      await this.locationsModel["locationsCollection"].updateOne(
        { _id: new ObjectId(parentId) },
        {
          $pull: { childLocations: childId },
          $set: {
            updatedAt: new Date(),
            modifiedSinceSync: true,
          },
        }
      );
    } catch (error) {
      console.error("从父位置移除时出错:", error);
    }
  }

  /**
   * 统计引用位置的物品数量
   * @param locationId 位置ID
   * @returns 物品数量
   */
  private async countItemsReferencingLocation(
    locationId: string
  ): Promise<number> {
    try {
      return await this.locationsModel["db"]
        .collection("items")
        .countDocuments({
          locationId: new ObjectId(locationId),
        });
    } catch (error) {
      console.error("统计引用位置的物品数量时出错:", error);
      return 0;
    }
  }
}
