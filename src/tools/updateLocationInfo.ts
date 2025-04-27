import { ObjectId, Db } from "mongodb";
import { LocationsModel } from "../model/locations.js";
import { Location } from "../model/types.js";

/**
 * 位置信息更新工具
 * 用于更新位置的基本信息
 */
export class UpdateLocationInfoTool {
  private locationsModel: LocationsModel;

  constructor(db: Db) {
    this.locationsModel = new LocationsModel(db);
  }

  /**
   * 执行位置信息更新
   * @param params 更新参数
   * @returns 更新结果
   */
  async execute(params: {
    locationId?: string;
    locationName?: string;
    newName?: string;
    newType?: string;
    newAddress?: string;
    newOpeningHours?: string;
    newPhone?: string;
    newParentLocationId?: string;
    newParentLocationName?: string;
    newCoordinates?: { latitude: number; longitude: number };
    newNotes?: string;
  }): Promise<{
    success: boolean;
    location?: Location;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        locationId,
        locationName,
        newName,
        newType,
        newAddress,
        newOpeningHours,
        newPhone,
        newParentLocationId,
        newParentLocationName,
        newCoordinates,
        newNotes,
      } = params;

      // 验证参数 - 需要提供位置ID或名称
      if (!locationId && !locationName) {
        return {
          success: false,
          message: "必须提供位置ID或名称",
        };
      }

      // 验证参数 - 需要提供至少一个要更新的字段
      if (
        !newName &&
        !newType &&
        !newAddress &&
        !newOpeningHours &&
        !newPhone &&
        !newParentLocationId &&
        !newParentLocationName &&
        !newCoordinates &&
        !newNotes
      ) {
        return {
          success: false,
          message: "必须提供至少一个要更新的字段",
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

      // 查询位置当前信息
      const location = await this.locationsModel.getLocationById(
        new ObjectId(resolvedLocationId!)
      );
      if (!location) {
        return {
          success: false,
          message: `未找到ID为"${resolvedLocationId}"的位置`,
        };
      }

      // 解析新父位置ID
      let resolvedNewParentLocationId = newParentLocationId;
      if (!resolvedNewParentLocationId && newParentLocationName) {
        const parentLocations = await this.locationsModel.findLocations(
          newParentLocationName
        );
        if (parentLocations.length > 0) {
          resolvedNewParentLocationId = parentLocations[0]._id.toString();
        }
      }

      // 构建更新对象
      const updateData: Partial<Location> = {};

      if (newName) updateData.name = newName;
      if (newType) updateData.type = newType;
      if (newAddress) updateData.address = newAddress;
      if (newOpeningHours) updateData.openingHours = newOpeningHours;
      if (newPhone) updateData.phone = newPhone;
      if (newNotes) updateData.notes = newNotes;
      if (newCoordinates) updateData.coordinates = newCoordinates;

      // 如果提供了新父位置ID，且与当前值不同
      if (
        resolvedNewParentLocationId &&
        (!location.parentLocationId ||
          location.parentLocationId.toString() !== resolvedNewParentLocationId)
      ) {
        // 从原父位置的childLocations中移除
        if (location.parentLocationId) {
          await this.removeFromParentLocation(
            location.parentLocationId.toString(),
            location._id
          );
        }

        // 添加到新父位置的childLocations中
        await this.addToParentLocation(
          resolvedNewParentLocationId,
          location._id
        );

        // 更新位置的parentLocationId
        updateData.parentLocationId = new ObjectId(resolvedNewParentLocationId);
      }

      // 执行更新
      const result = await this.updateLocation(resolvedLocationId!, updateData);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      let successMessage = `成功更新位置"${location.name}"的信息`;
      const updatedFields = [];

      if (newName) updatedFields.push(`名称: "${newName}"`);
      if (newType) updatedFields.push(`类型: "${newType}"`);
      if (newAddress) updatedFields.push(`地址: "${newAddress}"`);
      if (newOpeningHours) updatedFields.push(`开放时间: "${newOpeningHours}"`);
      if (newPhone) updatedFields.push(`电话: "${newPhone}"`);

      if (resolvedNewParentLocationId) {
        const parentName = await this.getLocationName(
          resolvedNewParentLocationId
        );
        updatedFields.push(`父位置: "${parentName}"`);
      }

      if (updatedFields.length > 0) {
        successMessage += `，更新了: ${updatedFields.join(", ")}`;
      }

      return {
        success: true,
        location: result.location,
        message: successMessage,
      };
    } catch (error) {
      console.error("更新位置信息时出错:", error);
      return {
        success: false,
        message: `更新位置信息时出错: ${error}`,
      };
    }
  }

  /**
   * 更新位置信息
   * @param locationId 位置ID
   * @param updateData 更新数据
   * @returns 更新结果
   */
  private async updateLocation(
    locationId: string,
    updateData: Partial<Location>
  ): Promise<{
    success: boolean;
    location?: Location;
    error?: string;
  }> {
    try {
      const id = new ObjectId(locationId);

      // 添加更新时间和同步标记
      const dataToUpdate = {
        ...updateData,
        updatedAt: new Date(),
        modifiedSinceSync: true,
      };

      // 执行更新
      const result = await this.locationsModel["locationsCollection"].updateOne(
        { _id: id },
        { $set: dataToUpdate }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          error: "未找到位置",
        };
      }

      // 查询更新后的位置
      const updatedLocation = await this.locationsModel.getLocationById(id);

      return {
        success: true,
        location: updatedLocation || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `更新位置信息失败: ${error}`,
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
   * 添加到父位置的childLocations中
   * @param parentId 父位置ID
   * @param childId 子位置ID
   */
  private async addToParentLocation(
    parentId: string,
    childId: ObjectId
  ): Promise<void> {
    try {
      await this.locationsModel["locationsCollection"].updateOne(
        { _id: new ObjectId(parentId) },
        {
          $addToSet: { childLocations: childId },
          $set: {
            updatedAt: new Date(),
            modifiedSinceSync: true,
          },
        }
      );
    } catch (error) {
      console.error("添加到父位置时出错:", error);
    }
  }

  /**
   * 获取位置名称
   * @param locationId 位置ID
   * @returns 位置名称
   */
  private async getLocationName(locationId: string): Promise<string> {
    try {
      const location = await this.locationsModel.getLocationById(
        new ObjectId(locationId)
      );
      return location?.name || "未知位置";
    } catch (error) {
      return "未知位置";
    }
  }
}
