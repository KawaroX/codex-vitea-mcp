import { ObjectId, Db } from "mongodb";
import { LocationsModel } from "../model/locations.js";
import { Location } from "../model/types.js";

/**
 * 位置创建工具
 * 用于添加新位置到系统
 */
export class CreateLocationTool {
  private locationsModel: LocationsModel;

  constructor(db: Db) {
    this.locationsModel = new LocationsModel(db);
  }

  /**
   * 执行位置创建
   * @param params 创建参数
   * @returns 创建结果
   */
  async execute(params: {
    name: string;
    type?: string;
    address?: string;
    openingHours?: string;
    phone?: string;
    parentLocationId?: string;
    parentLocationName?: string;
    coordinates?: { latitude: number; longitude: number };
    notes?: string;
  }): Promise<{
    success: boolean;
    location?: Location;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        name,
        type,
        address,
        openingHours,
        phone,
        parentLocationId,
        parentLocationName,
        coordinates,
        notes,
      } = params;

      // 验证参数
      if (!name) {
        return {
          success: false,
          message: "必须提供位置名称",
        };
      }

      // 解析父位置ID
      let resolvedParentLocationId = parentLocationId;
      if (!resolvedParentLocationId && parentLocationName) {
        const locations = await this.locationsModel.findLocations(
          parentLocationName
        );
        if (locations.length > 0) {
          resolvedParentLocationId = locations[0]._id.toString();
        }
      }

      // 准备位置数据
      const locationData: Partial<Location> = {
        name,
        type,
        address,
        openingHours,
        phone,
        notes,
        coordinates,
      };

      if (resolvedParentLocationId) {
        locationData.parentLocationId = new ObjectId(resolvedParentLocationId);
      }

      // 创建位置
      const result = await this.createLocation(locationData);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 如果有父位置，更新父位置的childLocations数组
      if (resolvedParentLocationId && result.location) {
        await this.updateParentLocation(
          resolvedParentLocationId,
          result.location._id
        );
      }

      // 构建成功消息
      let successMessage = `成功创建位置"${result.location?.name}"`;

      if (type) {
        successMessage += `，类型: "${type}"`;
      }

      if (resolvedParentLocationId) {
        const parentName = await this.getLocationName(resolvedParentLocationId);
        successMessage += `，父位置: "${parentName}"`;
      }

      if (address) {
        successMessage += `，地址: "${address}"`;
      }

      return {
        success: true,
        location: result.location,
        message: successMessage,
      };
    } catch (error) {
      console.error("创建位置时出错:", error);
      return {
        success: false,
        message: `创建位置时出错: ${error}`,
      };
    }
  }

  /**
   * 创建位置
   * @param locationData 位置数据
   * @returns 创建结果
   */
  private async createLocation(locationData: Partial<Location>): Promise<{
    success: boolean;
    location?: Location;
    error?: string;
  }> {
    try {
      // 添加通用字段
      const newLocation: Partial<Location> = {
        ...locationData,
        childLocations: [],
        syncedToNotion: false,
        modifiedSinceSync: true,
        lastSync: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 插入位置
      const result = await this.locationsModel["locationsCollection"].insertOne(
        newLocation as any
      );

      if (!result.acknowledged) {
        return {
          success: false,
          error: "插入位置失败",
        };
      }

      // 查询插入的位置
      const location = await this.locationsModel.getLocationById(
        result.insertedId
      );

      return {
        success: true,
        location: location || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `创建位置失败: ${error}`,
      };
    }
  }

  /**
   * 更新父位置的childLocations数组
   * @param parentId 父位置ID
   * @param childId 子位置ID
   */
  private async updateParentLocation(
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
      console.error("更新父位置时出错:", error);
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
