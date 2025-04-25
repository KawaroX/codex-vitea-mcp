import { type Collection, ObjectId, type Db } from "mongodb";
import {
  Location,
  BioData,
  ensureObjectId,
  TravelTimeEstimationResponse,
} from "./types.js";

/**
 * 位置数据操作类
 */
export class LocationsModel {
  private locationsCollection: Collection<Location>;
  private bioDataCollection: Collection<BioData>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.locationsCollection = db.collection<Location>("locations");
    this.bioDataCollection = db.collection<BioData>("bioData");
  }

  /**
   * 获取所有位置
   * @returns 位置数组
   */
  async getAllLocations(): Promise<Location[]> {
    return await this.locationsCollection.find({}).toArray();
  }

  /**
   * 根据关键词查找位置
   * @param searchTerm 搜索关键词
   * @returns 匹配的位置列表
   */
  async findLocations(searchTerm: string): Promise<Location[]> {
    const searchRegex = new RegExp(searchTerm, "i");

    const locations = await this.locationsCollection
      .find({
        $or: [
          { name: searchRegex },
          { type: searchRegex },
          { address: searchRegex },
        ],
      })
      .limit(10)
      .toArray();

    return locations;
  }

  /**
   * 根据ID查询单个位置
   * @param locationId 位置ID
   * @returns 位置对象
   */
  async getLocationById(locationId: ObjectId): Promise<Location | null> {
    const id = ensureObjectId(locationId);
    return await this.locationsCollection.findOne({ _id: id });
  }

  /**
   * 获取子位置
   * @param parentId 父位置ID
   * @returns 子位置列表
   */
  async getChildLocations(parentId: string | ObjectId): Promise<Location[]> {
    const id = ensureObjectId(parentId);
    return await this.locationsCollection
      .find({ parentLocationId: id })
      .toArray();
  }

  /**
   * 获取位置层次结构
   * @param locationId 位置ID
   * @returns 包含父子结构的位置信息
   */
  async getLocationHierarchy(locationId: string | ObjectId): Promise<{
    current: Location | null;
    parent: Location | null;
    children: Location[];
  }> {
    const id = ensureObjectId(locationId);
    const current = await this.getLocationById(id);

    if (!current) {
      return { current: null, parent: null, children: [] };
    }

    // 获取父位置
    let parent: Location | null = null;
    if (current.parentLocationId) {
      parent = await this.getLocationById(
        new ObjectId(current.parentLocationId.toString())
      );
    }

    // 获取子位置
    const children = await this.getChildLocations(id);

    return { current, parent, children };
  }

  /**
   * 计算两个位置之间的行走时间
   * @param originId 起点ID或名称
   * @param destinationId 终点ID或名称
   * @returns 预估行走时间
   */
  async estimateTravelTime(
    originId: string | ObjectId,
    destinationId: string | ObjectId
  ): Promise<TravelTimeEstimationResponse | null> {
    // 获取位置信息
    let origin: Location | null = null;
    let destination: Location | null = null;

    // 如果是字符串但不是ObjectId格式，尝试按名称查找
    if (typeof originId === "string" && !/^[0-9a-fA-F]{24}$/.test(originId)) {
      const locations = await this.findLocations(originId);
      if (locations.length > 0) {
        origin = locations[0];
      }
    } else {
      // 按ID查找
      origin = await this.getLocationById(new ObjectId(originId.toString()));
    }

    if (
      typeof destinationId === "string" &&
      !/^[0-9a-fA-F]{24}$/.test(destinationId)
    ) {
      const locations = await this.findLocations(destinationId);
      if (locations.length > 0) {
        destination = locations[0];
      }
    } else {
      destination = await this.getLocationById(
        new ObjectId(destinationId.toString())
      );
    }

    // 如果找不到位置，返回null
    if (!origin || !destination) {
      return null;
    }

    // 尝试查找匹配的行走速度记录
    const walkingSpeedRecords = await this.bioDataCollection
      .find({
        $or: [
          { measurementType: "走路速度" },
          {
            recordName: {
              $regex: new RegExp(
                `${origin.name}.*${destination.name}|${destination.name}.*${origin.name}`,
                "i"
              ),
            },
          },
        ],
      })
      .sort({ measuredAt: -1 })
      .limit(5)
      .toArray();

    // 如果没有行走速度记录，尝试查找任何行走速度记录
    if (walkingSpeedRecords.length === 0) {
      walkingSpeedRecords.push(
        ...(await this.bioDataCollection
          .find({ measurementType: "走路速度" })
          .sort({ measuredAt: -1 })
          .limit(1)
          .toArray())
      );
    }

    // 计算预估时间
    let estimatedTime: number;
    let unit = "分钟";
    let context = "";
    let baseSpeed = 0;
    let speedUnit = "";

    // 如果有特定路线的记录，直接使用
    const specificRoute = walkingSpeedRecords.find((record) => {
      if (!origin || !destination) return false;
      return (
        record.recordName.includes(origin.name) &&
        record.recordName.includes(destination.name)
      );
    });

    if (specificRoute) {
      estimatedTime = specificRoute.value;
      unit = specificRoute.unit || "分钟";
      context = specificRoute.context || "";
      return {
        origin: { name: origin.name, id: origin._id.toString() },
        destination: { name: destination.name, id: destination._id.toString() },
        estimatedTime,
        unit,
        context,
        notes:
          typeof specificRoute.notes === "string"
            ? specificRoute.notes
            : undefined,
      };
    }

    // 否则使用坐标计算（如果有）
    if (
      origin.coordinates &&
      destination.coordinates &&
      origin.coordinates.latitude &&
      origin.coordinates.longitude &&
      destination.coordinates.latitude &&
      destination.coordinates.longitude
    ) {
      // 找最新的行走速度记录
      const latestSpeedRecord = walkingSpeedRecords[0];
      baseSpeed = latestSpeedRecord ? latestSpeedRecord.value : 90; // 默认90米/分钟
      speedUnit = latestSpeedRecord?.unit || "米/分钟";

      // 计算距离（使用哈弗辛公式计算球面距离）
      const distance = this.calculateDistance(
        origin.coordinates.latitude,
        origin.coordinates.longitude,
        destination.coordinates.latitude,
        destination.coordinates.longitude
      );

      // 换算单位为米
      let distanceInMeters = distance;

      // 根据行走速度计算时间
      estimatedTime = distanceInMeters / baseSpeed;

      return {
        origin: { name: origin.name, id: origin._id.toString() },
        destination: { name: destination.name, id: destination._id.toString() },
        estimatedTime: Math.round(estimatedTime * 10) / 10, // 四舍五入到一位小数
        unit: "分钟",
        context: "基于坐标计算",
        baseSpeed,
        speedUnit,
        notes: "使用坐标和平均行走速度估算，实际时间可能受交通、天气等因素影响",
      };
    }

    // 如果没有特定路线记录也没有坐标，返回默认估算
    // 这里简单返回7分钟作为默认值
    return {
      origin: { name: origin.name, id: origin._id.toString() },
      destination: { name: destination.name, id: destination._id.toString() },
      estimatedTime: 7,
      unit: "分钟",
      context: "默认估算",
      notes: "无精确数据，使用默认估计值",
    };
  }

  /**
   * 计算两个坐标点之间的距离（米）
   * @param lat1 起点纬度
   * @param lon1 起点经度
   * @param lat2 终点纬度
   * @param lon2 终点经度
   * @returns 距离（米）
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // 地球半径（米）
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }
}
