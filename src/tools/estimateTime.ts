// src/tools/estimateTime.ts
import { ObjectId, Db } from "mongodb";
import { LocationsModel } from "../model/locations.js";
import { ContactsModel } from "../model/contacts.js";
import { BioDataModel } from "../model/bioData.js";
import { TravelTimeEstimationResponse, Location } from "../model/types.js";
import axios from "axios";

/**
 * 出行时间估算工具
 * 结合个人生物数据和高德地图API进行更精确的时间估算
 */
export class EstimateTimeTool {
  private locationsModel: LocationsModel;
  private contactsModel: ContactsModel;
  private bioDataModel: BioDataModel;
  private amapKey: string;
  private db: Db;

  constructor(db: Db) {
    this.locationsModel = new LocationsModel(db);
    this.contactsModel = new ContactsModel(db);
    this.bioDataModel = new BioDataModel(db);
    this.db = db;

    // 从环境变量获取高德地图API密钥
    this.amapKey = process.env.AMAP_API_KEY || "";
    if (!this.amapKey) {
      console.warn("警告: 未配置高德地图API密钥，将使用本地估算");
    }
  }

  /**
   * 执行时间估算
   * @param params 估算参数
   * @returns 估算结果
   */
  async execute(params: {
    origin: string;
    destination: string;
    contactName?: string;
    transportation?: string;
  }): Promise<{
    success: boolean;
    estimation?: TravelTimeEstimationResponse;
    message?: string;
  }> {
    try {
      const {
        origin,
        destination,
        contactName,
        transportation = "walking",
      } = params;

      // 验证参数
      if (!origin || !destination) {
        return {
          success: false,
          message: "必须提供起点和终点",
        };
      }

      // 1. 解析起点和终点（可能是位置名称、位置ID、或关键词）
      const originInfo = await this.resolveLocation(origin, true);
      let destinationInfo = await this.resolveLocation(destination, true);

      // 2. 如果提供了联系人名称，检查目的地是否需要关联到联系人
      if (contactName && !destinationInfo.success) {
        const contactInfo = await this.resolveContactLocation(
          contactName,
          destination
        );
        if (contactInfo.success) {
          destinationInfo = contactInfo;
        }
      }

      // 3. 如果无法解析起点或终点，尝试使用高德地图地理编码API获取坐标
      if (!originInfo.success) {
        const geocodedOrigin = await this.geocodeLocation(origin);
        if (geocodedOrigin.success) {
          // 创建新位置并保存到数据库（异步，不等待完成）
          this.saveLocationToDatabase(origin, geocodedOrigin.coordinates);
          originInfo.success = true;
          originInfo.location = {
            name: origin,
            _id: new ObjectId(), // 临时ID
            coordinates: geocodedOrigin.coordinates,
          };
          originInfo.coordinates = geocodedOrigin.coordinates;
        } else {
          return {
            success: false,
            message: `无法解析起点"${origin}"的位置信息`,
          };
        }
      }

      if (!destinationInfo.success) {
        const geocodedDestination = await this.geocodeLocation(destination);
        if (geocodedDestination.success) {
          // 创建新位置并保存到数据库（异步，不等待完成）
          this.saveLocationToDatabase(
            destination,
            geocodedDestination.coordinates
          );
          destinationInfo.success = true;
          destinationInfo.location = {
            name: destination,
            _id: new ObjectId(), // 临时ID
            coordinates: geocodedDestination.coordinates,
          };
          destinationInfo.coordinates = geocodedDestination.coordinates;
        } else {
          return {
            success: false,
            message: `无法解析终点"${destination}"的位置信息`,
          };
        }
      }

      // 4. 检查是否有室内路径计算需求（如主楼内的位置）
      const originIndoorTime = await this.calculateIndoorTime(
        originInfo.location
      );
      const destinationIndoorTime = await this.calculateIndoorTime(
        destinationInfo.location
      );

      // 5. 获取个人行走速度
      const walkingSpeed = await this.getPersonalWalkingSpeed();

      // 6. 使用高德地图API计算路径（如果配置了密钥）
      let routeResult: any = null;
      let distance = 0;
      let duration = 0;

      if (this.amapKey) {
        // 如果有坐标信息，使用坐标进行路径规划
        if (originInfo.coordinates && destinationInfo.coordinates) {
          routeResult = await this.callAmapRouteAPI(
            originInfo.coordinates,
            destinationInfo.coordinates,
            transportation
          );
        }
        // 否则使用地名直接进行路径规划（高德API支持地名）
        else {
          routeResult = await this.callAmapRouteAPIByName(
            originInfo.location.name,
            destinationInfo.location.name,
            transportation
          );
        }

        if (routeResult.success) {
          distance = routeResult.distance;
          duration = routeResult.duration;
        }
      }

      // 7. 如果高德API调用失败或未配置，使用本地估算
      if (!routeResult || !routeResult.success) {
        // 尝试使用数据库中已有的信息估算
        const localEstimation = await this.locationsModel.estimateTravelTime(
          originInfo.location._id,
          destinationInfo.location._id
        );

        if (localEstimation) {
          distance = localEstimation.baseSpeed || 0; // 这里使用了不太合适的字段存储距离，应调整模型
          duration = localEstimation.estimatedTime || 0;
        } else {
          // 如果数据库中没有特定路径的信息，使用坐标计算估算
          if (originInfo.coordinates && destinationInfo.coordinates) {
            distance = this.calculateDistance(
              originInfo.coordinates.latitude,
              originInfo.coordinates.longitude,
              destinationInfo.coordinates.latitude,
              destinationInfo.coordinates.longitude
            );

            // 根据个人行走速度计算时间
            duration = walkingSpeed ? distance / walkingSpeed : distance / 80; // 默认80米/分钟
          } else {
            // 如果没有坐标信息，返回默认值
            distance = 0;
            duration = 15; // 默认15分钟
          }
        }
      }

      // 8. 调整时间估算以考虑个人行走速度和室内时间
      let adjustedDuration = duration;

      // 如果是步行方式且有个人行走速度数据，调整时间估算
      if (transportation === "walking" && walkingSpeed && walkingSpeed > 0) {
        // 高德API返回的步行速度约为80米/分钟
        const defaultSpeed = 80; // 米/分钟
        const speedRatio = defaultSpeed / walkingSpeed;
        adjustedDuration = duration * speedRatio;
      }

      // 加上室内时间
      adjustedDuration += originIndoorTime + destinationIndoorTime;

      // 9. 构建返回结果
      const result: TravelTimeEstimationResponse = {
        origin: {
          name: originInfo.location.name,
          id: originInfo.location._id.toString(),
        },
        destination: {
          name: destinationInfo.location.name,
          id: destinationInfo.location._id.toString(),
        },
        estimatedTime: Math.round(adjustedDuration * 10) / 10, // 保留一位小数
        unit: "分钟",
        context: this.amapKey
          ? "基于高德地图API和个人行走速度计算"
          : "基于坐标和个人行走速度估算",
        baseSpeed: walkingSpeed || 0,
        speedUnit: "米/分钟",
        notes: `总距离约${Math.round(distance)}米，室内行走时间约${
          originIndoorTime + destinationIndoorTime
        }分钟`,
      };

      if (routeResult && routeResult.route) {
        result.route = routeResult.route;
      }

      return {
        success: true,
        estimation: result,
      };
    } catch (error) {
      console.error("估算时间时出错:", error);
      return {
        success: false,
        message: `估算时间时出错: ${error}`,
      };
    }
  }

  /**
   * 高德地图地理编码API - 将地址转换为坐标
   * @param address 地址或地名
   * @returns 坐标信息
   */
  private async geocodeLocation(address: string): Promise<{
    success: boolean;
    coordinates?: { latitude: number; longitude: number };
    message?: string;
    formattedAddress?: string;
  }> {
    try {
      if (!this.amapKey) {
        return {
          success: false,
          message: "未配置高德地图API密钥，无法进行地理编码",
        };
      }

      // 调用高德地图地理编码API
      const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(
        address
      )}&key=${this.amapKey}`;
      const response = await axios.get(url);
      const data = response.data;

      // 验证响应
      if (data.status !== "1" || !data.geocodes || data.geocodes.length === 0) {
        return {
          success: false,
          message: data.info || `无法找到"${address}"的坐标信息`,
        };
      }

      // 获取第一个匹配结果
      const geocode = data.geocodes[0];
      const location = geocode.location.split(",");

      return {
        success: true,
        coordinates: {
          longitude: parseFloat(location[0]),
          latitude: parseFloat(location[1]),
        },
        formattedAddress: geocode.formatted_address,
      };
    } catch (error) {
      console.error(`地理编码时出错: ${error}`);
      return {
        success: false,
        message: `地理编码时出错: ${error}`,
      };
    }
  }

  /**
   * 将位置信息保存到数据库（异步操作）
   * @param locationName 位置名称
   * @param coordinates 坐标信息
   */
  private async saveLocationToDatabase(
    locationName: string,
    coordinates: { latitude: number; longitude: number }
  ): Promise<void> {
    try {
      // 检查位置是否已存在
      const existingLocations = await this.locationsModel.findLocations(
        locationName
      );

      if (existingLocations && existingLocations.length > 0) {
        // 如果位置已存在但没有坐标，更新坐标信息
        const location = existingLocations[0];
        if (!location.coordinates) {
          await this.locationsModel["locationsCollection"].updateOne(
            { _id: location._id },
            {
              $set: {
                coordinates,
                updatedAt: new Date(),
                modifiedSinceSync: true,
              },
            }
          );
          console.log(`已更新位置"${locationName}"的坐标信息`);
        }
      } else {
        // 创建新位置
        const locationData: Partial<Location> = {
          name: locationName,
          coordinates,
          type: "place", // 默认类型
          syncedToNotion: false,
          modifiedSinceSync: true,
          lastSync: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // 插入新位置
        await this.locationsModel["locationsCollection"].insertOne(
          locationData as any
        );
        console.log(`已创建新位置"${locationName}"`);
      }
    } catch (error) {
      console.error(`保存位置信息到数据库时出错: ${error}`);
      // 不抛出异常，因为这是异步操作，不影响主流程
    }
  }

  /**
   * 使用位置名称调用高德地图路径规划API
   * @param originName 起点名称
   * @param destinationName 终点名称
   * @param mode 交通方式
   * @returns API响应结果
   */
  private async callAmapRouteAPIByName(
    originName: string,
    destinationName: string,
    mode: string = "walking"
  ): Promise<{
    success: boolean;
    distance?: number;
    duration?: number;
    route?: any;
    message?: string;
  }> {
    try {
      // 确保有API密钥
      if (!this.amapKey) {
        return {
          success: false,
          message: "未配置高德地图API密钥",
        };
      }

      // 首先进行地理编码，获取起终点坐标
      const originGeocode = await this.geocodeLocation(originName);
      const destinationGeocode = await this.geocodeLocation(destinationName);

      if (!originGeocode.success || !destinationGeocode.success) {
        return {
          success: false,
          message: "无法获取起点或终点的地理编码",
        };
      }

      // 使用坐标进行路径规划
      return await this.callAmapRouteAPI(
        originGeocode.coordinates!,
        destinationGeocode.coordinates!,
        mode
      );
    } catch (error) {
      console.error(`使用位置名称调用高德地图API时出错: ${error}`);
      return {
        success: false,
        message: `使用位置名称调用高德地图API时出错: ${error}`,
      };
    }
  }

  /**
   * 解析位置信息
   * @param locationNameOrId 位置名称或ID
   * @param allowPartialMatch 是否允许部分匹配
   * @returns 位置信息
   */
  private async resolveLocation(
    locationNameOrId: string,
    allowPartialMatch: boolean = false
  ): Promise<{
    success: boolean;
    location?: any;
    coordinates?: { latitude: number; longitude: number };
    message?: string;
  }> {
    try {
      // 1. 尝试作为ID查询
      if (locationNameOrId.match(/^[0-9a-fA-F]{24}$/)) {
        const location = await this.locationsModel.getLocationById(
          new ObjectId(locationNameOrId)
        );
        if (location) {
          return {
            success: true,
            location,
            coordinates: location.coordinates
              ? {
                  latitude: location.coordinates.latitude,
                  longitude: location.coordinates.longitude,
                }
              : undefined,
          };
        }
      }

      // 2. 尝试精确名称匹配
      const locations = await this.locationsModel.findLocations(
        locationNameOrId
      );
      if (locations && locations.length > 0) {
        // 使用第一个匹配项
        return {
          success: true,
          location: locations[0],
            coordinates: locations[0].coordinates ? {
              latitude: locations[0].coordinates.latitude,
              longitude: locations[0].coordinates.longitude
            } : undefined,
        };
      }

      // 3. 如果允许部分匹配，尝试模糊匹配
      if (allowPartialMatch) {
        const fuzzyLocations = await this.locationsModel["locationsCollection"]
          .find({
            name: { $regex: locationNameOrId, $options: "i" },
          })
          .toArray();

        if (fuzzyLocations && fuzzyLocations.length > 0) {
          return {
            success: true,
            location: fuzzyLocations[0],
            coordinates: fuzzyLocations[0].coordinates ? {
              latitude: fuzzyLocations[0].coordinates.latitude,
              longitude: fuzzyLocations[0].coordinates.longitude
            } : undefined,
          };
        }

        // 4. 如果是像"主楼323"这样的位置，尝试拆分查询
        if (locationNameOrId.match(/^(.+?)(\d+)$/)) {
          const matches = locationNameOrId.match(/^(.+?)(\d+)$/);
          if (matches && matches.length === 3) {
            const buildingName = matches[1].trim();
            const roomNumber = matches[2];

            // 查找建筑物
            const buildings = await this.locationsModel.findLocations(
              buildingName
            );
            if (buildings && buildings.length > 0) {
              // 找到建筑，创建一个虚拟的房间位置
              const building = buildings[0];
              return {
                success: true,
                location: {
                  _id: building._id, // 使用建筑物ID
                  name: `${building.name}${roomNumber}`, // 完整名称，如"主楼323"
                  parentLocationId: building._id, // 父位置为建筑物
                  coordinates: building.coordinates, // 使用建筑物坐标
                  roomNumber, // 额外添加房间号信息
                },
                coordinates: building.coordinates ? {
              latitude: building.coordinates.latitude,
              longitude: building.coordinates.longitude
            } : undefined,
              };
            }
          }
        }
      }

      return {
        success: false,
        message: `未找到位置: ${locationNameOrId}`,
      };
    } catch (error) {
      console.error(`解析位置信息时出错: ${error}`);
      return {
        success: false,
        message: `解析位置信息时出错: ${error}`,
      };
    }
  }

  /**
   * 解析联系人相关位置
   * @param contactName 联系人名称
   * @param locationHint 位置提示（如"学校"、"家"等）
   * @returns 位置信息
   */
  private async resolveContactLocation(
    contactName: string,
    locationHint: string
  ): Promise<{
    success: boolean;
    location?: any;
    coordinates?: { latitude: number; longitude: number };
    message?: string;
  }> {
    try {
      // 查找联系人
      const contacts = await this.contactsModel.findContacts(contactName);
      if (!contacts || contacts.length === 0) {
        return {
          success: false,
          message: `未找到联系人: ${contactName}`,
        };
      }

      const contact = contacts[0];
      let locationField = "";

      // 根据位置提示确定使用哪个地址字段
      if (locationHint.includes("学校")) {
        locationField = "school";
      } else if (locationHint.includes("家") || locationHint.includes("住")) {
        locationField = "residence";
      } else if (
        locationHint.includes("公司") ||
        locationHint.includes("工作")
      ) {
        locationField = "workAddress";
      } else {
        // 默认使用学校
        locationField = "school";
      }

      if (!contact[locationField]) {
        return {
          success: false,
          message: `联系人${contact.name}未提供${locationField}信息`,
        };
      }

      // 使用联系人地址查找位置
      return await this.resolveLocation(contact[locationField], true);
    } catch (error) {
      console.error(`解析联系人位置时出错: ${error}`);
      return {
        success: false,
        message: `解析联系人位置时出错: ${error}`,
      };
    }
  }

  /**
   * 计算建筑物内部行走时间
   * @param location 位置信息
   * @returns 室内行走时间（分钟）
   */
  private async calculateIndoorTime(location: any): Promise<number> {
    // 如果是房间（有roomNumber字段），需要计算室内时间
    if (location && location.roomNumber) {
      // 查询是否有特定的室内行走记录
      const indoorRecords = await this.bioDataModel["bioDataCollection"]
        .find({
          recordName: { $regex: location.name, $options: "i" },
          measurementType: "室内行走时间",
        })
        .toArray();

      if (indoorRecords && indoorRecords.length > 0) {
        // 返回匹配记录的时间
        return indoorRecords[0].value || 2; // 默认2分钟
      }

      // 根据楼层估算时间
      // 假设教室号的第一位数字表示楼层
      const floorMatch = location.roomNumber.match(/^(\d)/);
      if (floorMatch && floorMatch.length > 1) {
        const floor = parseInt(floorMatch[1]);
        // 每层楼假设需要1分钟，地面为0层
        return floor * 1;
      }
    }

    // 默认返回0（不是室内位置或无法计算）
    return 0;
  }

  /**
   * 获取个人行走速度
   * @returns 行走速度（米/分钟）
   */
  private async getPersonalWalkingSpeed(): Promise<number | null> {
    try {
      // 获取最新的行走速度记录
      const speedRecord = await this.bioDataModel.getLatestMeasurement(
        "走路速度"
      );

      if (speedRecord) {
        return speedRecord.value;
      }

      // 如果没有具体的"走路速度"记录，查询其他可能的记录
      const walkRecords = await this.bioDataModel["bioDataCollection"]
        .find({
          $or: [
            { measurementType: "步行速度" },
            { measurementType: "行走速度" },
            { measurementType: "步速" },
          ],
        })
        .sort({ measuredAt: -1 })
        .limit(1)
        .toArray();

      if (walkRecords && walkRecords.length > 0) {
        return walkRecords[0].value;
      }

      return null; // 未找到速度记录
    } catch (error) {
      console.error(`获取行走速度时出错: ${error}`);
      return null;
    }
  }

  /**
   * 调用高德地图路径规划API
   * @param origin 起点坐标
   * @param destination 终点坐标
   * @param mode 交通方式
   * @returns API响应结果
   */
  private async callAmapRouteAPI(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    mode: string = "walking"
  ): Promise<{
    success: boolean;
    distance?: number;
    duration?: number;
    route?: any;
    message?: string;
  }> {
    try {
      // 确保有API密钥
      if (!this.amapKey) {
        return {
          success: false,
          message: "未配置高德地图API密钥",
        };
      }

      // 准备API参数
      const originStr = `${origin.longitude},${origin.latitude}`;
      const destinationStr = `${destination.longitude},${destination.latitude}`;

      // 选择合适的API端点
      let endpoint = "";
      switch (mode) {
        case "walking":
          endpoint = "https://restapi.amap.com/v5/direction/walking";
          break;
        case "bicycling":
          endpoint = "https://restapi.amap.com/v5/direction/bicycling";
          break;
        case "driving":
          endpoint = "https://restapi.amap.com/v5/direction/driving";
          break;
        case "transit":
          endpoint = "https://restapi.amap.com/v5/direction/transit/integrated";
          break;
        default:
          endpoint = "https://restapi.amap.com/v5/direction/walking";
      }

      // 构建请求URL
      let url = `${endpoint}?key=${this.amapKey}&origin=${originStr}&destination=${destinationStr}`;

      // 如果是公交方式，需要额外参数
      if (mode === "transit") {
        url += "&city1=010&city2=010"; // 默认北京市编码
      }

      // 调用API
      const response = await axios.get(url);
      const data = response.data;

      // 验证响应
      if (data.status !== "1") {
        return {
          success: false,
          message: data.info || "API调用失败",
        };
      }

      // 解析结果
      let distance = 0;
      let duration = 0;

      // 根据不同的交通方式解析结果
      if (mode === "transit") {
        // 公交规划
        if (
          data.route &&
          data.route.transits &&
          data.route.transits.length > 0
        ) {
          const transit = data.route.transits[0];
          distance = parseInt(transit.distance) || 0;

          // 公交API没有直接返回duration，需要计算
          for (const segment of transit.segments) {
            if (segment.walking && segment.walking.duration) {
              duration += parseInt(segment.walking.duration) || 0;
            }
            if (segment.bus && segment.bus.duration) {
              duration += parseInt(segment.bus.duration) || 0;
            }
            if (segment.railway && segment.railway.duration) {
              duration += parseInt(segment.railway.duration) || 0;
            }
          }

          // 转换为分钟
          duration = duration / 60;
        }
      } else {
        // 步行、骑行或驾车规划
        if (data.route && data.route.paths && data.route.paths.length > 0) {
          const path = data.route.paths[0];
          distance = parseInt(path.distance) || 0;

          // 如果返回了duration
          if (path.duration) {
            duration = parseInt(path.duration) || 0;
            // 转换为分钟
            duration = duration / 60;
          } else {
            // 使用默认速度计算
            const speeds = {
              walking: 80, // 米/分钟
              bicycling: 250, // 米/分钟
              driving: 500, // 米/分钟
            };
            duration = distance / (speeds[mode] || 80);
          }
        }
      }

      return {
        success: true,
        distance,
        duration,
        route: data.route,
      };
    } catch (error) {
      console.error(`调用高德地图API时出错: ${error}`);
      return {
        success: false,
        message: `调用高德地图API时出错: ${error}`,
      };
    }
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

  /**
   * 格式化响应为易读文本
   * @param result 估算结果
   * @returns 易读格式的结果描述
   */
  formatResponse(result: {
    success: boolean;
    estimation?: TravelTimeEstimationResponse;
    message?: string;
  }): string {
    if (!result.success || !result.estimation) {
      return result.message || "无法估算时间";
    }

    const { estimation } = result;
    let response = `从${estimation.origin.name}到${estimation.destination.name}`;

    if (estimation.context) {
      response += `（${estimation.context}）`;
    }

    response += `预计需要约${estimation.estimatedTime}${estimation.unit}`;

    if (estimation.notes) {
      response += `\n${estimation.notes}`;
    }

    if (estimation.baseSpeed && estimation.speedUnit) {
      response += `\n基于行走速度：${estimation.baseSpeed}${estimation.speedUnit}`;
    }

    return response;
  }
}
